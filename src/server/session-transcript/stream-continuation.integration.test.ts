import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Options, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AnthropicRequest } from '../openai-bridge/types/anthropic';
import type { TurnTerminalOutcome } from '../session-core/turn-queue';
import { NO_CHANNEL_DELIVERY } from '../session-core/channel-delivery';

const state = vi.hoisted(() => ({
  home: '', query: vi.fn(), sdkRead: vi.fn(), events: [] as [string, unknown][],
  inputs: [] as SDKUserMessage[], sources: [] as unknown[], owners: [] as unknown[],
  gateway: vi.fn<(input: SDKUserMessage, turn: number, options: Options) => Promise<void>>(),
  faults: [] as unknown[], delay: 20,
}));
vi.mock('os', async original => ({ ...await original<typeof import('os')>(), homedir: () => state.home }));
vi.mock('@anthropic-ai/claude-agent-sdk', async original => ({
  ...await original<typeof import('@anthropic-ai/claude-agent-sdk')>(),
  query: (...args: unknown[]) => state.query(...args),
  getSessionMessages: (...args: unknown[]) => state.sdkRead(...args),
}));
vi.mock('../runtimes/builtin-media-attachments', () => ({ buildBuiltinMediaAttachments: async () => [] }));
vi.mock('../sse', async original => ({
  ...await original<typeof import('../sse')>(),
  broadcast: (event: string, data: unknown) => { state.events.push([event, data]); },
  broadcastLive: (event: string, data: unknown) => { state.events.push([event, data]); },
}));

let agent: typeof import('../agent-session');
let store: typeof import('../SessionStore');
let turnState: typeof import('../builtin-session/turn');
let upstream: Server;
let upstreamBaseUrl: string;
let upstreamRequests: number;
let failure: 'eof' | 'permanent' | 'half-frame' | 'malformed' | 'cancel';

const sse = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const start = (id: string) => ({ type: 'message_start', message: { id, type: 'message', role: 'assistant',
  model: 'fixture-model', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 4, output_tokens: 0 } } });

async function startUpstream() {
  upstreamRequests = 0;
  failure = 'eof';
  upstream = createServer((req, res) => {
    // Drain only: no request body, credentials or business data are retained.
    req.resume();
    req.on('end', () => {
      const interrupted = ++upstreamRequests % 2 === 1;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(sse(start(`response-${upstreamRequests}`)));
      res.write(sse({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }));
      res.write(sse({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta',
        text: interrupted ? 'preserved partial text' : 'continued final text' } }));
      if (!interrupted) {
        res.end(sse({ type: 'content_block_stop', index: 0 })
          + sse({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } })
          + sse({ type: 'message_stop' }));
      } else if (failure === 'permanent') {
        res.end(sse({ type: 'error', error: { type: 'authentication_error', message: 'fixture rejection' } }));
      } else if (failure === 'half-frame') {
        res.end('data: {"type":"content_block_delta"');
      } else if (failure === 'malformed') {
        res.end('data: {not-json\n\n');
      } else if (failure === 'cancel') {
        // The downstream reader explicitly cancels; teardown closes the socket.
        res.flushHeaders();
      } else {
        // Complete legal frames followed by EOF before the protocol terminal.
        res.end();
      }
    });
  });
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const address = upstream.address();
  if (!address || typeof address === 'string') throw new Error('fixture did not bind');
  upstreamBaseUrl = `http://127.0.0.1:${address.port}`;
}

// This fixture owns only the SDK protocol and a temporary loopback provider.
// The production handler, registry, controllers, original-turn generator and
// SessionStore run unchanged, including their internal trusted-cause wiring.
function fakeQuery(args: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) {
  const prompt = args.prompt[Symbol.asyncIterator]();
  let close!: () => void;
  const closed = new Promise<void>(resolve => { close = resolve; });
  const pull = () => prompt.next().then(value => {
    if (!value.done) {
      state.inputs.push(value.value);
      state.sources.push(turnState.getCurrentTurnSourceItem());
      state.owners.push(turnState.peekPendingOutputOwner());
    }
    return value;
  });
  const sessionId = args.options.sessionId ?? args.options.resume!;
  const output = async function* () {
    let next = pull();
    let turn = 0;
    try {
      for (;;) {
        const input = await Promise.race([next, closed.then(() => ({ done: true as const, value: undefined }))]);
        if (input.done) return;
        // Native stdin consumes independently of output; the original generator
        // is already waiting when the result owner schedules its continuation.
        next = pull();
        turn++;
        const interrupted = turn % 2 === 1;
        const envelope = { session_id: sessionId, parent_tool_use_id: null, uuid: randomUUID() };
        const frame = (event: unknown) => ({ ...envelope, type: 'stream_event', event });
        const text = interrupted ? 'preserved partial text' : 'continued final text';
        yield { ...envelope, type: 'system', subtype: 'init', model: 'fixture-model', tools: [], mcp_servers: [] };
        yield frame(start(`response-${turn}`));
        yield frame({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
        yield frame({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } });
        yield { ...envelope, type: 'assistant', message: { id: `response-${turn}`, role: 'assistant',
          model: 'fixture-model', content: [{ type: 'text', text }], usage: { input_tokens: 4, output_tokens: 5 } } };
        yield frame({ type: 'content_block_stop', index: 0 });
        await state.gateway(input.value, turn, args.options);
        yield { ...envelope, type: 'result', subtype: interrupted ? 'error_during_execution' : 'success',
          is_error: interrupted, result: interrupted ? 'automatic_replay_blocked: interrupted stream' : text,
          ...(interrupted ? { errors: ['automatic_replay_blocked: interrupted stream'] } : {}),
          terminal_reason: interrupted ? 'error_during_execution' : 'completed', duration_ms: 1,
          duration_api_ms: 1, num_turns: 1, total_cost_usd: 0, permission_denials: [],
          usage: { input_tokens: 4, output_tokens: 5 },
          modelUsage: { 'fixture-model': { inputTokens: turn * 4, outputTokens: turn * 5 } },
        };
      }
    } catch (error) { state.faults.push(error); throw error; }
  };
  const iterator = output();
  return Object.assign(iterator, {
    initializationResult: async () => ({ commands: [] }), interrupt: async () => { close(); }, close,
    mcpServerStatus: async () => [], setModel: async () => {}, setPermissionMode: async () => {}, setMcpServers: async () => {},
  });
}

beforeEach(async () => {
  state.home = await mkdtemp(join(tmpdir(), 'moxbots-stream-turn-'));
  vi.stubEnv('HOME', state.home);
  state.events.length = state.inputs.length = state.sources.length = state.owners.length = state.faults.length = 0;
  state.delay = 20;
  state.query.mockReset().mockImplementation(fakeQuery);
  state.sdkRead.mockReset().mockResolvedValue([]);
  state.gateway.mockReset();
  await startUpstream();
  vi.resetModules();
  store = await import('../SessionStore');
  agent = await import('../agent-session');
  turnState = await import('../builtin-session/turn');
  vi.spyOn(await import('../../shared/modelRecovery'), 'modelRecoveryDelay').mockImplementation(() => state.delay);
  state.sdkRead.mockImplementation(async () => agent.getMessages().filter(row => row.sdkUuid)
    .map(row => ({ type: row.role, uuid: row.sdkUuid })));
  const bridge = await import('../openai-bridge/bridge-registry');
  const { createBridgeHandler } = await import('../openai-bridge/handler');
  const handler = createBridgeHandler({ logger: null, getUpstreamConfig: async request => {
    const token = new URL(request.url).pathname.split('/').at(-3)!;
    const config = await bridge.lookupBridge(token, request);
    if (!config?.contextRecovery || !config.modelFailover) throw new Error('Missing production bridge recovery owners');
    return config;
  } });
  state.gateway.mockImplementation(async (input, turn, options) => {
    const base = options.env!.ANTHROPIC_BASE_URL!;
    const interrupted = turn % 2 === 1;
    const root = state.inputs[interrupted ? turn - 1 : turn - 2];
    const rootText = root.message.content as string;
    const body: AnthropicRequest = { model: 'fixture-model', max_tokens: 128, stream: true,
      messages: interrupted ? [{ role: 'user', content: rootText }]
        : [{ role: 'user', content: rootText },
          { role: 'assistant', content: 'preserved partial text' },
          { role: 'user', content: input.message.content as string }] };
    const request = new Request(`${base}/v1/messages`, { method: 'POST', body: JSON.stringify(body) });
    const response = await handler(request);
    if (interrupted && failure === 'cancel') {
      const reader = response.body!.getReader();
      expect((await reader.read()).done).toBe(false);
      await reader.cancel();
      return;
    }
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).toContain(interrupted ? 'automatic_replay_blocked' : 'message_stop');
  });
});

afterEach(async () => {
  const lifecycle = await import('../builtin-session/lifecycle');
  lifecycle.setPreWarmDisabled(true); lifecycle.clearPreWarmTimer();
  await agent.resetSession();
  agent.setSidecarPort(0);
  await store.drainSessionTranscripts();
  upstream.closeAllConnections();
  await new Promise<void>(resolve => upstream.close(() => resolve()));
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  await rm(state.home, { recursive: true, force: true });
});

async function initialize() {
  const workspace = join(state.home, 'workspace');
  await mkdir(workspace);
  const providers = join(state.home, '.myagents', 'providers');
  await mkdir(providers, { recursive: true });
  await writeFile(join(providers, 'stream-fixture.json'), JSON.stringify({ id: 'stream-fixture', name: 'fixture',
    type: 'api', models: [{ model: 'fixture-model' }] }));
  agent.setSidecarPort(15432);
  await agent.initializeAgent(workspace, null, undefined, { preWarmDisabled: true });
  await agent.setSessionProviderEnv({ providerId: 'stream-fixture', baseUrl: upstreamBaseUrl,
    apiProtocol: 'anthropic', apiKey: 'synthetic-fixture' });
  await agent.setSessionModel('fixture-model');
}

describe('production original-turn stream continuation with synthetic SDK protocol', () => {
  it.each(['permanent', 'half-frame', 'malformed', 'cancel'] as const)(
    'does not continue a native root after an unproven handler interruption (%s)', async cause => {
      failure = cause;
      await initialize();
      const terminal = vi.fn<(outcome: TurnTerminalOutcome) => void>();
      await agent.enqueueUserMessage('Original bounded task', undefined, undefined, undefined,
        undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        { channelDelivery: NO_CHANNEL_DELIVERY, fromDesktopChatSend: true, onTerminal: terminal });
      await vi.waitFor(() => { expect(state.faults).toEqual([]); expect(terminal).toHaveBeenCalledTimes(1); });
      expect(terminal.mock.calls[0][0]).toMatchObject({ status: 'error', code: 'automatic_replay_blocked' });
      expect(state.inputs).toHaveLength(1);
      expect(upstreamRequests).toBe(1);
      expect(store.getBuiltinModelRecovery(agent.getSessionId()!)?.status).not.toBe('waiting');
    },
  );

  it('keeps public Stop terminal and durable quality after a delayed recovery-failure pause acknowledgement', async () => {
    state.delay = 150;
    await initialize();
    const recovery = (await import('../builtin-session/model-recovery')).SessionModelRecovery;
    const pause = recovery.prototype.pause;
    let release!: () => void;
    let reached!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const blocked = new Promise<void>(resolve => { reached = resolve; });
    vi.spyOn(recovery.prototype, 'pause').mockImplementation(function (this: import('../builtin-session/model-recovery').SessionModelRecovery, ...args) {
      const outcome = pause.apply(this, args);
      if (!args[0].includes('lost exclusive action authority')) return outcome;
      reached();
      return outcome.then(async value => { await gate; return value; });
    });
    try {
      const terminal = vi.fn<(outcome: TurnTerminalOutcome) => void>();
      await agent.enqueueUserMessage('Original bounded task', undefined, undefined, undefined,
        undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        { channelDelivery: NO_CHANNEL_DELIVERY, fromDesktopChatSend: true, onTerminal: terminal });
      const sessionId = agent.getSessionId()!;
      await vi.waitFor(() => expect(store.getBuiltinModelRecovery(sessionId)?.kind).toBe('stream'));
      const lifecycle = await import('../builtin-session/lifecycle');
      expect(lifecycle.recordQueryBackgroundTask(state.query.mock.results[0].value, 'new-background-agent', {})).toBe(true);
      await blocked;
      await agent.interruptCurrentResponse();
      await vi.waitFor(() => expect(terminal).toHaveBeenCalledTimes(1));
      expect(terminal.mock.calls[0][0].status).toBe('stopped');
      release();
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(terminal).toHaveBeenCalledTimes(1);
      expect(state.inputs).toHaveLength(1);
      expect(await store.getActiveSessionTranscript(sessionId)!.writer.flush()).toBe(true);
      const { readTranscriptFile } = await import('./file');
      const { transcriptMessages } = await import('../../shared/sessionTranscript');
      const decoded = await readTranscriptFile(join(state.home, '.myagents', 'sessions-v2', `${sessionId}.jsonl`), sessionId);
      expect(transcriptMessages(decoded.projection).findLast(row => row.role === 'assistant')?.streamRecovery)
        .toMatchObject({ interruptions: 1, continuations: 0, status: 'stopped', reason: 'stopped' });
    } finally { release(); }
  });

  it('settles a safe recovery pause when background work makes the retained root ineligible during backoff', async () => {
    state.delay = 150;
    await initialize();
    const terminal = vi.fn<(outcome: TurnTerminalOutcome) => void>();
    await agent.enqueueUserMessage('Original bounded task', undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      { channelDelivery: NO_CHANNEL_DELIVERY, fromDesktopChatSend: true, onTerminal: terminal });
    const sessionId = agent.getSessionId()!;
    await vi.waitFor(() => expect(store.getBuiltinModelRecovery(sessionId)?.kind).toBe('stream'));
    const lifecycle = await import('../builtin-session/lifecycle');
    expect(lifecycle.recordQueryBackgroundTask(state.query.mock.results[0].value, 'new-background-agent', {})).toBe(true);
    expect(agent.hasBuiltinBackgroundWork()).toBe(true);
    await vi.waitFor(() => expect(terminal).toHaveBeenCalledTimes(1), { timeout: 1_000 });
    expect(terminal.mock.calls[0][0]).toMatchObject({ status: 'error', code: 'automatic_replay_blocked' });
    expect(state.inputs).toHaveLength(1);
    expect(store.getBuiltinModelRecovery(sessionId)?.status).toBe('paused');
  });

  it('settles the original turn when sleep exhausts its durable deadline before the continuation timer fires', async () => {
    state.delay = 150;
    await initialize();
    const terminal = vi.fn<(outcome: TurnTerminalOutcome) => void>();
    const { SameTurnStreamContinuation } = await import('../builtin-session/stream-continuation');
    const schedule = SameTurnStreamContinuation.prototype.schedule;
    const now = Date.now.bind(Date);
    let slept = false;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now() + (slept ? 31 * 60_000 : 0));
    // A persisted stream checkpoint can precede the gateway response. Jump
    // only after the native result arms its timer, so the fixture cannot turn
    // the still-active first HTTP response into an unrelated local 499.
    vi.spyOn(SameTurnStreamContinuation.prototype, 'schedule').mockImplementation(function (
      this: import('../builtin-session/stream-continuation').SameTurnStreamContinuation,
    ) {
      const armed = schedule.call(this);
      if (armed) slept = true;
      return armed;
    });
    try {
      await agent.enqueueUserMessage('Original bounded task', undefined, undefined, undefined,
        undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        { channelDelivery: NO_CHANNEL_DELIVERY, fromDesktopChatSend: true, onTerminal: terminal });
      const sessionId = agent.getSessionId()!;
      await vi.waitFor(() => expect(terminal).toHaveBeenCalledTimes(1), { timeout: 1_000 });
      expect(slept).toBe(true);
      expect(state.faults).toEqual([]);
      expect(terminal.mock.calls[0][0]).toMatchObject({ status: 'error', code: 'automatic_replay_blocked' });
      expect(state.inputs).toHaveLength(1);
      expect(upstreamRequests).toBe(1);
      expect(store.getBuiltinModelRecovery(sessionId)?.status).toBe('paused');
    } finally { clock.mockRestore(); }
  });

  it('does not publish a successful Product/Goal terminal when the recovery completion cannot commit', async () => {
    await initialize();
    vi.spyOn((await import('../builtin-session/model-recovery')).SessionModelRecovery.prototype, 'finishStreamTurn')
      .mockResolvedValue(false);
    const terminal = vi.fn<(outcome: TurnTerminalOutcome) => void>();
    await agent.enqueueUserMessage('Original bounded task', undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      { channelDelivery: NO_CHANNEL_DELIVERY, fromDesktopChatSend: true,
        turnOwner: { kind: 'goal', id: 'goal-original' }, onTerminal: terminal });
    await vi.waitFor(() => { expect(state.faults).toEqual([]); expect(terminal).toHaveBeenCalledTimes(1); });
    expect(terminal.mock.calls[0][0]).toMatchObject({ status: 'error', code: 'automatic_replay_blocked' });
    expect(store.getBuiltinModelRecovery(agent.getSessionId()!)?.status).toBe('paused');
  });

  it('starts fresh recovery observations for the next independent task in the same Query', async () => {
    await initialize();
    const terminal = vi.fn<(outcome: TurnTerminalOutcome) => void>();
    for (const [index, text] of ['Original bounded task', 'Second bounded task'].entries()) {
      await agent.enqueueUserMessage(text, undefined, undefined, undefined,
        undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        { channelDelivery: NO_CHANNEL_DELIVERY, fromDesktopChatSend: true, onTerminal: terminal });
      await vi.waitFor(() => { expect(state.faults).toEqual([]); expect(terminal).toHaveBeenCalledTimes(index + 1); });
      const last = (await store.getSessionData(agent.getSessionId()!))!.messages.findLast(row => row.role === 'assistant');
      expect(last?.streamRecovery).toMatchObject({ interruptions: 1, continuations: 1, status: 'completed' });
    }
    expect(state.query).toHaveBeenCalledTimes(1);
    expect(state.inputs).toHaveLength(4);
    expect(upstreamRequests).toBe(4);
  });

  it.each([undefined, 'goal-original'])('retains the original ordinary/Goal turn (%s) through bridge partial and persisted completion', async goalId => {
    await initialize();
    const claim = vi.fn(async () => ({ accepted: true }));
    const terminal = vi.fn<(outcome: TurnTerminalOutcome) => void>();
    const accepted = await agent.enqueueUserMessage('Original bounded task', undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      { channelDelivery: NO_CHANNEL_DELIVERY, fromDesktopChatSend: true, beforeDispatch: claim,
        ...(goalId ? { turnOwner: { kind: 'goal' as const, id: goalId } } : {}), onTerminal: terminal });
    expect(accepted.error).toBeUndefined();
    await vi.waitFor(() => { expect(state.faults).toEqual([]); expect(terminal).toHaveBeenCalledTimes(1); }, { timeout: 4_000 });
    expect(terminal.mock.calls[0][0]).toMatchObject({ status: 'complete', usage: { inputTokens: 8, outputTokens: 10 } });
    expect(state.query).toHaveBeenCalledTimes(1);
    expect(state.inputs).toHaveLength(2);
    expect(upstreamRequests).toBe(2);
    expect(state.inputs[1]).toMatchObject({ isSynthetic: true });
    expect(state.inputs[1].message.content).toContain('mox-stream-continuation:');
    expect(state.inputs[1].message.content).not.toContain('Original bounded task');
    expect(state.sources[1]).toBe(state.sources[0]);
    expect(state.owners[1]).toBe(state.owners[0]);
    expect(claim).toHaveBeenCalledTimes(1);
    expect(state.events.filter(([event]) => event === 'chat:message-complete')).toHaveLength(1);
    const sessionId = agent.getSessionId()!;
    expect(await store.getActiveSessionTranscript(sessionId)!.writer.flush()).toBe(true);
    // Read a fresh decoder from the actual file: getSessionData alone may
    // return the active in-memory projection and cannot prove durability.
    const { readTranscriptFile } = await import('./file');
    const { transcriptMessages } = await import('../../shared/sessionTranscript');
    const decoded = await readTranscriptFile(join(state.home, '.myagents', 'sessions-v2', `${sessionId}.jsonl`), sessionId);
    const messages = transcriptMessages(decoded.projection);
    expect(messages.filter(row => row.role === 'user').map(row => row.content)).toEqual(['Original bounded task']);
    const assistants = messages.filter(row => row.role === 'assistant');
    expect(JSON.stringify(assistants)).toContain('preserved partial text');
    expect(JSON.stringify(assistants)).toContain('continued final text');
    expect(assistants.at(-1)?.streamRecovery).toMatchObject({ version: 1, interruptions: 1,
      continuations: 1, protectedActions: 0, status: 'completed' });
    expect(store.getBuiltinModelRecovery(sessionId)).toBeUndefined();
  });

  it('Stop during durable backoff revokes its timer and persists stopped evidence without another input', async () => {
    state.delay = 150;
    await initialize();
    // Wait for the real durable recovery owner to arm its timer. Polling the
    // checkpoint with a 150ms wall-clock window can observe it only after a
    // busy CI event loop has already admitted the next input.
    const continuation = (await import('../builtin-session/stream-continuation')).SameTurnStreamContinuation;
    const schedule = continuation.prototype.schedule;
    let reached!: () => void;
    const armed = new Promise<void>(resolve => { reached = resolve; });
    vi.spyOn(continuation.prototype, 'schedule').mockImplementation(function (this: import('../builtin-session/stream-continuation').SameTurnStreamContinuation) {
      const scheduled = schedule.call(this);
      if (scheduled) reached();
      return scheduled;
    });
    const terminal = vi.fn<(outcome: TurnTerminalOutcome) => void>();
    await agent.enqueueUserMessage('Original bounded task', undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      { channelDelivery: NO_CHANNEL_DELIVERY, fromDesktopChatSend: true, onTerminal: terminal });
    const sessionId = agent.getSessionId()!;
    await armed;
    expect(store.getBuiltinModelRecovery(sessionId)?.kind).toBe('stream');
    await agent.interruptCurrentResponse();
    await vi.waitFor(() => expect(terminal).toHaveBeenCalledTimes(1));
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(state.inputs).toHaveLength(1);
    expect(state.gateway).toHaveBeenCalledTimes(1);
    expect(store.getBuiltinModelRecovery(sessionId)?.status).toBe('paused');
    expect((await store.getSessionData(sessionId))?.messages.findLast(row => row.role === 'assistant')?.streamRecovery)
      .toMatchObject({ interruptions: 1, continuations: 0, status: 'stopped' });
  });
});
