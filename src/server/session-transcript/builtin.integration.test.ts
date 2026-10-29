import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_CHANNEL_DELIVERY } from '../session-core/channel-delivery';
import type { TurnTerminalOutcome } from '../session-core/turn-queue';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { ContextRecoveryController } from '../openai-bridge/context-recovery';
import type { ModelFailoverController } from '../openai-bridge/model-failover';

const state = vi.hoisted(() => ({ home: '', failProductIo: false, publicationGate: null as Promise<void> | null, publicationBlocked: false, queryExitGate: null as Promise<void> | null, queryInputEnded: 0, backgroundTask: false, backgroundTaskGate: null as Promise<void> | null, independentInputPump: false, sdkInputs: [] as unknown[], resultMode: 'success' as 'success' | 'error', rejectedResumeAt: null as string | null, sdkCumulativeBase: null as { input: number; output: number } | null, compactAtTurn: null as number | null, resetAtTurn: null as number | null, sdkCommands: [] as unknown[], interruptCloses: false, throwAfterInputEnd: false, beforeTurn: vi.fn(), query: vi.fn(), sdkRead: vi.fn(), sdkFork: vi.fn(), sdkDelete: vi.fn(), rewindFiles: vi.fn(), beforeResult: vi.fn(), sdkResultHandled: vi.fn(), events: [] as [string, unknown][], queuedFollowup: false, exitWithoutResult: false, toolFrames: false, childFrames: false, protocolFrames: [] as Record<string, unknown>[], beforeFrame: vi.fn(), media: vi.fn() }));
vi.mock('os', async original => ({ ...await original<typeof import('os')>(), homedir: () => state.home }));
vi.mock('../utils/platform', async original => {
  const actual = await original<typeof import('../utils/platform')>();
  return { ...actual, getHomeDir: () => state.home, getHomeDirOrNull: () => state.home,
    getCrossPlatformEnv: () => ({ ...actual.getCrossPlatformEnv(), home: state.home }) };
});
vi.mock('../utils/fs-utils', async original => {
  const actual = await original<typeof import('../utils/fs-utils')>();
  return { ...actual, ensureDirSync: (...args: Parameters<typeof actual.ensureDirSync>) => {
    if (state.failProductIo && String(args[0]).endsWith(join('.myagents', 'sessions'))) {
      throw Object.assign(new Error('product directory denied'), { code: 'EACCES' });
    }
    return actual.ensureDirSync(...args);
  } };
});
vi.mock('node:fs/promises', async original => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, mkdir: async (...args: Parameters<typeof actual.mkdir>) => {
    if (state.publicationGate && String(args[0]).endsWith(join('.myagents', 'sessions-v2'))) {
      state.publicationBlocked = true;
      await state.publicationGate;
    }
    if (state.failProductIo && String(args[0]).endsWith(join('.myagents', 'sessions-v2'))) {
      return Promise.reject(Object.assign(new Error('product directory denied'), { code: 'EACCES' }));
    }
    return actual.mkdir(...args);
  } };
});
vi.mock('../utils/managed-proxy-binding', async original => {
  const actual = await original<typeof import('../utils/managed-proxy-binding')>();
  return { ...actual, prepareProviderBinding: async (...args: Parameters<typeof actual.prepareProviderBinding>) => {
    const prepared = await actual.prepareProviderBinding(...args);
    return { ...prepared, beforeTurn: async () => { await state.beforeTurn(); await prepared.beforeTurn(); } };
  } };
});
vi.mock('@anthropic-ai/claude-agent-sdk', async original => ({
  ...await original<typeof import('@anthropic-ai/claude-agent-sdk')>(), query: (...args: unknown[]) => state.query(...args),
  getSessionMessages: (...args: unknown[]) => state.sdkRead(...args),
  forkSession: (...args: unknown[]) => state.sdkFork(...args),
  deleteSession: (...args: unknown[]) => state.sdkDelete(...args),
}));
vi.mock('../runtimes/builtin-media-attachments', () => ({ buildBuiltinMediaAttachments: (...args: unknown[]) => state.media(...args) }));
vi.mock('../sse', async original => ({
  ...await original<typeof import('../sse')>(),
  broadcast: (event: string, data: unknown) => { state.events.push([event, data]); },
  broadcastLive: (event: string, data: unknown) => { state.events.push([event, data]); },
}));

let agent: typeof import('../agent-session');
let store: typeof import('../SessionStore');
let releaseWrite: (() => void) | undefined;
let notificationReceipts = false;
let rejectAnchorAfterAdmission = false;

function fakeQuery(args: { prompt: AsyncIterable<unknown>; options: { sessionId?: string; resume?: string; resumeSessionAt?: string } }) {
  const prompt = args.prompt[Symbol.asyncIterator]();
  const pullInput = () => prompt.next().then(next => {
    if (!next.done) state.sdkInputs.push(next.value);
    return next;
  });
  let prefetchedInput = state.independentInputPump ? pullInput() : null;
  let close!: () => void;
  const closed = new Promise<void>(resolve => { close = resolve; });
  const pending: unknown[] = [];
  let turn = 0;
  let rejectedResume = false;
  let backgroundTaskPending = false;
  const sessionId = args.options.sessionId ?? args.options.resume;
  if (!sessionId) throw new Error('SDK test transport requires a new or resumed Session identity');
  const iterator = {
    async next(): Promise<IteratorResult<unknown>> {
      if (args.options.resumeSessionAt === state.rejectedResumeAt) {
        if (rejectedResume) return { done: true, value: undefined };
        rejectedResume = true;
        // The native transport can consume stdin (and Product can commit its
        // turn) before the resume loader rejects the inferred history anchor.
        if (rejectAnchorAfterAdmission) await (prefetchedInput ?? pullInput());
        return { done: false, value: {
          type: 'result', subtype: 'error_during_execution', is_error: true,
          result: `No message found with message.uuid of: ${state.rejectedResumeAt}`,
          errors: [`No message found with message.uuid of: ${state.rejectedResumeAt}`],
          terminal_reason: 'error', session_id: sessionId, uuid: randomUUID(),
          duration_ms: 1, duration_api_ms: 0, num_turns: 0, total_cost_usd: 0,
          usage: { input_tokens: 0, output_tokens: 0 }, permission_denials: [],
        } };
      }
      if (pending.length) {
        const value = pending.shift();
        await state.beforeFrame(value);
        if ((value as { type?: string })?.type === 'result') {
          const consumeFollowup = await state.beforeResult(value);
          if (consumeFollowup === true && prefetchedInput) {
            const input = await prefetchedInput;
            if (input.done) throw new Error('Synthetic queued input ended before consumption');
            prefetchedInput = pullInput();
            pending.unshift(value);
            const message = input.value as { uuid: string; message: unknown };
            return { done: false, value: { type: 'user', isReplay: true, uuid: message.uuid,
              session_id: sessionId, parent_tool_use_id: null, message: message.message } };
          }
        }
        return { done: false, value };
      }
      if (backgroundTaskPending) {
        const outcome = await Promise.race([
          Promise.resolve(state.backgroundTaskGate).then(() => 'complete' as const),
          closed.then(() => 'closed' as const),
        ]);
        if (outcome === 'closed') return { done: true, value: undefined };
        backgroundTaskPending = false;
        pending.push({ type: 'system', subtype: 'task_notification', task_id: `background-${turn}`,
          status: 'completed', summary: 'done', output_file: '' });
        return { done: false, value: { type: 'system', subtype: 'background_tasks_changed', tasks: [] } };
      }
      if (state.exitWithoutResult && turn > 0) {
        if (state.throwAfterInputEnd) throw new Error('Claude Code process exited with code 1. stderr: [claude-code:unrecognized_model]');
        return { done: true, value: undefined };
      }
      const followup = state.queuedFollowup && turn === 1;
      if (followup) {
        const queue = await import('../builtin-session/queue');
        queue.setInFlightQueueItem('queued-followup', { messageText: 'queued question', channelDelivery: NO_CHANNEL_DELIVERY });
        queue.queueState.awaitingAssistantStartAckQueueId = 'queued-followup';
      }
      const next = followup ? { done: false, value: undefined }
        : await Promise.race([prefetchedInput ?? pullInput(), closed.then(() => ({ done: true as const, value: undefined }))]);
      if (next.done) {
        state.queryInputEnded++;
        await state.queryExitGate;
        if (state.throwAfterInputEnd) throw new Error('synthetic query exit failure');
        return { done: true, value: undefined };
      }
      if (state.independentInputPump) prefetchedInput = pullInput();
      turn++;
      const responseId = `response-${turn}`;
      const envelope = { session_id: sessionId, parent_tool_use_id: null };
      const stream = (event: unknown) => ({ ...envelope, type: 'stream_event', uuid: randomUUID(), event });
      const assistant = (content: unknown[], uuid: string) => ({ ...envelope, type: 'assistant', uuid,
        message: { id: responseId, role: 'assistant', model: 'test-model', content, usage: { input_tokens: 4, output_tokens: 5 } },
      });
      pending.push(
        { type: 'system', subtype: 'init', session_id: sessionId, uuid: randomUUID(), model: 'test-model', tools: [], mcp_servers: [] },
        stream({ type: 'message_start', message: { id: responseId } }),
        stream({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
        stream({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: `answer ${turn}` } }),
        assistant([{ type: 'text', text: `answer ${turn}` }], `text-frame-${turn}`),
        stream({ type: 'content_block_stop', index: 0 }),
        assistant([{ type: 'text', text: ' full-only tail' }], `tail-frame-${turn}`),
        { type: 'result', subtype: 'success', is_error: false, result: `answer ${turn} full-only tail`,
          session_id: sessionId, uuid: randomUUID(), duration_ms: 1, duration_api_ms: 1, num_turns: 1,
          total_cost_usd: 0, usage: { input_tokens: 4, output_tokens: 5 }, permission_denials: [],
          ...(state.sdkCumulativeBase === null ? {} : { modelUsage: { 'test-model': {
            inputTokens: state.sdkCumulativeBase.input + turn * 4,
            outputTokens: state.sdkCumulativeBase.output + turn * 5,
          } } }),
        },
      );
      if (state.compactAtTurn === turn) {
        pending.splice(1);
        pending.push(
          { ...envelope, type: 'system', subtype: 'compact_boundary', uuid: randomUUID() },
          { ...envelope, type: 'result', subtype: 'success', is_error: false, result: '',
            uuid: randomUUID(), terminal_reason: 'completed', duration_ms: 1, duration_api_ms: 1,
            num_turns: 1, total_cost_usd: 0, usage: { input_tokens: 4, output_tokens: 0 }, permission_denials: [],
            modelUsage: { 'test-model': {
              inputTokens: (state.sdkCumulativeBase?.input ?? 0) + turn * 4,
              outputTokens: (state.sdkCumulativeBase?.output ?? 0) + (turn - 1) * 5,
            } },
          },
        );
      }
      if (state.resetAtTurn === turn) {
        pending.splice(1);
        pending.push(
          { ...envelope, type: 'conversation_reset', new_conversation_id: randomUUID(), uuid: randomUUID(), trigger: 'clear' },
          { ...envelope, type: 'result', subtype: 'success', is_error: false, result: '',
            uuid: randomUUID(), terminal_reason: 'completed', duration_ms: 1, duration_api_ms: 1,
            num_turns: 0, total_cost_usd: 0, usage: { input_tokens: 0, output_tokens: 0 }, permission_denials: [],
            modelUsage: {},
          },
        );
      }
      if (state.resultMode === 'error') {
        Object.assign(pending[pending.length - 1] as object, {
          subtype: 'error_during_execution',
          is_error: true,
          result: 'synthetic provider failure',
          errors: ['synthetic provider failure'],
          terminal_reason: 'error_during_execution',
        });
      }
      pending.splice(1, 0, ...state.protocolFrames.map(frame => ({ ...envelope, uuid: randomUUID(), ...frame })));
      if (state.toolFrames) {
        pending.splice(1, 0,
          assistant([{ type: 'tool_use', id: `tool-${turn}`, name: 'Read', input: { file_path: '/synthetic' } }], `tool-frame-${turn}`),
          { ...envelope, type: 'user', uuid: randomUUID(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `tool-${turn}`, content: 'tool result' }] } },
        );
      }
      if (state.childFrames) {
        const childEnvelope = { ...envelope, parent_tool_use_id: `parent-${turn}` };
        const childStream = (event: unknown) => ({ ...childEnvelope, type: 'stream_event', uuid: randomUUID(), event });
        const childFull = { ...childEnvelope, type: 'assistant', uuid: `child-frame-${turn}`, message: {
          id: `child-response-${turn}`, role: 'assistant', model: 'test-model', content: [{ type: 'text', text: 'child corrected' }],
          usage: { input_tokens: 1, output_tokens: 2 },
        } };
        pending.splice(1, 0,
          assistant([{ type: 'tool_use', id: `parent-${turn}`, name: 'Task', input: { prompt: 'child' } }], `parent-frame-${turn}`),
          childStream({ type: 'message_start', message: { id: `child-response-${turn}` } }),
          childStream({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
          childStream({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'child partial' } }),
          childFull, childFull,
          childStream({ type: 'content_block_stop', index: 0 }),
        );
      }
      if (state.backgroundTask) {
        pending.splice(pending.length - 1, 0, {
          type: 'system', subtype: 'task_started', task_id: `background-${turn}`,
          tool_use_id: `background-tool-${turn}`, description: 'background test task', task_type: 'agent',
        }, { type: 'system', subtype: 'background_tasks_changed', tasks: [
          { task_id: `background-${turn}`, task_type: 'local_agent', description: 'background test task' },
        ] });
        backgroundTaskPending = true;
      }
      if (state.exitWithoutResult) pending.pop();
      if (notificationReceipts) {
        // Receipts can precede output, or arrive after output but before its
        // real result. Neither may settle the product turn or clear usage.
        const receipt = () => ({ type: 'result', subtype: 'success', is_error: false,
          origin: { kind: 'task-notification' }, num_turns: 0, result: '',
          session_id: sessionId, uuid: randomUUID(), usage: { output_tokens: 0 }, modelUsage: {} });
        pending.unshift(receipt());
        pending.splice(pending.length - 1, 0, receipt());
      }
      return { done: false, value: pending.shift() };
    },
    [Symbol.asyncIterator]() { return this; },
    initializationResult: async () => ({ commands: state.sdkCommands }),
    interrupt: async () => { if (state.interruptCloses) close(); },
    close,
    rewindFiles: state.rewindFiles,
    mcpServerStatus: async () => [],
    setModel: async () => undefined,
    setPermissionMode: async () => undefined,
    setMcpServers: async () => undefined,
  };
  return iterator;
}

beforeEach(async () => {
  rejectAnchorAfterAdmission = false;
  notificationReceipts = false;
  state.home = await mkdtemp(join(tmpdir(), 'myagents-builtin-v2-'));
  state.events.length = 0;
  state.failProductIo = false;
  state.publicationGate = null;
  state.publicationBlocked = false;
  state.queryExitGate = null;
  state.queryInputEnded = 0;
  state.backgroundTask = false;
  state.backgroundTaskGate = null;
  state.independentInputPump = false;
  state.sdkInputs.length = 0;
  state.resultMode = 'success';
  state.rejectedResumeAt = null;
  state.sdkCumulativeBase = null;
  state.compactAtTurn = null;
  state.resetAtTurn = null;
  state.sdkCommands = [];
  state.interruptCloses = false;
  state.throwAfterInputEnd = false;
  state.queuedFollowup = false;
  state.exitWithoutResult = false;
  state.toolFrames = false;
  state.childFrames = false;
  state.protocolFrames = [];
  state.beforeFrame.mockReset();
  state.beforeResult.mockReset();
  state.sdkResultHandled.mockReset();
  state.beforeTurn.mockReset().mockResolvedValue(undefined);
  state.media.mockReset().mockResolvedValue([]);
  state.query.mockReset().mockImplementation(fakeQuery);
  state.sdkRead.mockReset().mockResolvedValue([]);
  state.sdkFork.mockReset();
  state.rewindFiles.mockReset().mockResolvedValue({ canRewind: true });
  state.sdkDelete.mockReset().mockResolvedValue(undefined);
  releaseWrite = undefined;
  vi.resetModules();
  store = await import('../SessionStore');
  agent = await import('../agent-session');
  // The fake Query does not write a real Claude transcript. Unless a test
  // overrides sdkRead to model branching/missing history, mirror the Product
  // rows as the synthetic native current chain.
  state.sdkRead.mockImplementation(async () => agent.getMessages()
    .filter(message => Boolean(message.sdkUuid))
    .map(message => ({ type: message.role, uuid: message.sdkUuid })));
});

afterEach(async () => {
  state.failProductIo = false;
  releaseWrite?.();
  vi.restoreAllMocks();
  const lifecycle = await import('../builtin-session/lifecycle');
  lifecycle.setPreWarmDisabled(true);
  lifecycle.clearPreWarmTimer();
  await agent.resetSession();
  await store.drainSessionTranscripts();
  await rm(state.home, { recursive: true, force: true });
});

describe('first desktop execution intent utility', () => {
  it.each([undefined, 'auto', 'manual'] as const)('honors the product default for modelMode=%s before the first turn', async modelMode => {
    const workspace = join(state.home, 'first-intent');
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, {
      runtime: 'builtin', ...(modelMode ? { modelMode } : {}),
    });
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
    const config = await import('../builtin-session/config');
    config.setModel(undefined);
    config.setProviderEnv(undefined);
    const router = await import('../auto-route/router');
    const catalog = router.buildAutoRouteCatalog();
    const classifier = { providerId: 'synthetic-provider', model: 'synthetic-classifier' };
    vi.spyOn(router, 'buildAutoRouteCatalog').mockReturnValue({
      ...catalog, settings: { classifier },
    });
    const intent = JSON.stringify({ kind: 'execute', objective: 'Create a local page', scope: 'This workspace', acceptanceCriteria: ['Page exists'], steps: ['Create the page', 'Verify the page'], continuationOf: null });
    const transport = vi.fn(async () => intent);
    vi.spyOn(router, 'getAutoRouteTransport').mockResolvedValue(transport);
    const engine = (await import('../session-engine/builtin-adapter')).createBuiltinSessionEngine();
    const { classifySessionExecutionIntent } = await import('../session-engine/session-execution');
    const result = await classifySessionExecutionIntent(engine, {
      sessionId: metadata.id, workspacePath: workspace,
      scenario: { type: 'desktop' }, text: 'Create and verify a local page.',
    }, new AbortController().signal);
    if (modelMode === 'manual') {
      expect(result).toBeUndefined();
      expect(transport).not.toHaveBeenCalled();
    } else {
      expect(result?.kind).toBe('execute');
      expect(result?.continuationOf).toBeNull();
      expect(result?.steps).toEqual(['Create the page', 'Verify the page']);
      expect(transport).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ classifier }));
    }
    expect(state.query).not.toHaveBeenCalled();
    expect(agent.getMessages()).toHaveLength(0);
    expect(store.getSessionMetadata(metadata.id)?.taskOrchestration?.execution).toBeUndefined();
  });
});

describe('Goal continuation Session configuration admission', () => {
  async function warmGoal() {
    const workspace = join(state.home, 'goal-config');
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, {
      runtime: 'builtin', model: 'old-model', providerId: 'old-provider', configSnapshotAt: 'original-config',
    });
    const env = (providerId: string) => ({ providerId, baseUrl: `https://${providerId}.invalid`, apiKey: 'synthetic-only' });
    vi.spyOn(await import('../utils/admin-config'), 'resolveWorkspaceConfig').mockImplementation((_path, meta) => ({
      model: meta?.model, providerEnv: meta?.providerId ? env(meta.providerId) : undefined,
      providerRoute: undefined, mcpServers: [], enabledOfficialToolIds: [],
      permissionMode: 'auto', reasoningEffort: meta?.reasoningEffort,
    }));
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
    const config = await import('../builtin-session/config');
    config.setModel('old-model'); config.setProviderEnv(env('old-provider'));
    await agent.enqueueUserMessage('Previously completed business action', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
    await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
    expect(state.sdkInputs).toHaveLength(1);
    const engine = (await import('../session-engine/builtin-adapter')).createBuiltinSessionEngine();
    const request = {
      prompt: 'Continue the same Goal', sessionId: metadata.id, workspacePath: workspace,
      scenario: { type: 'desktop' as const }, permissionMode: 'fullAgency',
      assistantChannelDelivery: 'caller-owned' as const, timeoutMs: 5000, pollMs: 1,
      queueId: randomUUID(), turnOwner: { kind: 'goal' as const, id: 'same-goal' },
      beforeDispatch: Object.assign(vi.fn(async () => ({ accepted: true as const })), { cancel: vi.fn() }),
    };
    return { workspace, metadata, config, engine, request };
  }

  it.each(['provider', 'model', 'both'] as const)('uses the latest saved %s in the warm Goal without replaying the previous action', async edit => {
    const { metadata, engine, request } = await warmGoal();
    const providerId = edit === 'model' ? 'old-provider' : 'new-provider';
    const model = edit === 'provider' ? 'old-model' : 'new-model';
    await store.updateSessionMetadata(metadata.id, { providerId, model, reasoningEffort: 'high', configSnapshotAt: 'edited-config' });
    expect(await engine.runInjectedTurn(request)).toMatchObject({ success: true });
    expect(agent.getSessionProviderId()).toBe(providerId);
    expect(agent.getSessionModel()).toBe(model);
    expect(agent.getSessionReasoningEffort()).toBe('high');
    expect(state.query.mock.calls.at(-1)![0].options).toMatchObject({ model, resume: metadata.id });
    expect(state.query).toHaveBeenCalledTimes(2);
    expect(agent.getSessionId()).toBe(metadata.id);
    expect(state.sdkInputs).toHaveLength(2);
    expect(agent.getMessages().filter(message => message.role === 'user' && message.content === 'Previously completed business action')).toHaveLength(1);
  });

  it('rejects an incompatible provider history switch without resetting native identity or dispatching', async () => {
    const { metadata, engine, request, config } = await warmGoal();
    config.setProviderEnv(undefined); // Existing native Anthropic subscription history.
    await store.updateSessionMetadata(metadata.id, { providerId: 'new-provider', model: 'new-model', configSnapshotAt: 'edited-config' });
    expect(await engine.runInjectedTurn(request)).toMatchObject({ success: false, enqueued: false, error: expect.stringContaining('new Session') });
    expect(agent.getSessionId()).toBe(metadata.id);
    expect(state.sdkInputs).toHaveLength(1);
    expect(request.beforeDispatch).not.toHaveBeenCalled();
  });

  it('materializes the saved canonical route with the real resolver instead of a stale frozen environment', async () => {
    const { metadata, engine, request } = await warmGoal();
    vi.mocked((await import('../utils/admin-config')).resolveWorkspaceConfig).mockRestore();
    const dir = join(state.home, '.myagents');
    await mkdir(join(dir, 'providers'), { recursive: true });
    await writeFile(join(dir, 'providers', 'new-provider.json'), JSON.stringify({
      id: 'new-provider', name: 'Synthetic provider', type: 'api', enabled: true,
      config: { baseUrl: 'https://new-provider.invalid' }, models: [{ model: 'new-model' }],
    }));
    await writeFile(join(dir, 'config.json'), JSON.stringify({ providerApiKeys: { 'new-provider': 'synthetic-only' } }));
    await store.updateSessionMetadata(metadata.id, {
      providerId: 'new-provider', model: 'new-model', configSnapshotAt: 'edited-config',
      providerRoute: { kind: 'provider', providerId: 'new-provider', model: 'new-model' },
      providerEnvJson: JSON.stringify({ providerId: 'old-provider', baseUrl: 'https://old-provider.invalid', apiKey: 'synthetic-stale' }),
    });
    expect(await engine.runInjectedTurn(request)).toMatchObject({ success: true });
    expect(agent.getSessionProviderEnv()).toMatchObject({ providerId: 'new-provider', baseUrl: 'https://new-provider.invalid', apiKey: 'synthetic-only' });
    expect(state.query.mock.calls.at(-1)![0].options).toMatchObject({ model: 'new-model', resume: metadata.id });
    expect(state.sdkInputs).toHaveLength(2);
  });

  it('keeps ordinary injected turns on their explicit provider instead of adopting Goal-only snapshot policy', async () => {
    const { metadata, engine, request } = await warmGoal();
    await store.updateSessionMetadata(metadata.id, { providerId: 'new-provider', model: 'new-model', configSnapshotAt: 'edited-config' });
    expect(await engine.runInjectedTurn({ ...request, turnOwner: undefined })).toMatchObject({ success: true });
    expect(agent.getSessionProviderId()).toBe('old-provider');
    expect(agent.getSessionModel()).toBe('old-model');
  });

  it('rejects another Session identity before preparing a Goal continuation', async () => {
    const { engine, request } = await warmGoal();
    expect(await engine.runInjectedTurn({ ...request, sessionId: randomUUID() }))
      .toMatchObject({ success: false, enqueued: false, status: 409 });
    expect(state.sdkInputs).toHaveLength(1);
    expect(request.beforeDispatch).not.toHaveBeenCalled();
  });

  it('reuses an unchanged warm Query and does not interpret bookkeeping as a configuration conflict', async () => {
    const { metadata, engine, request } = await warmGoal();
    request.beforeDispatch.mockImplementationOnce(async () => {
      await store.updateSessionMetadata(metadata.id, { lastActiveAt: new Date().toISOString(), stats: { messageCount: 99, totalInputTokens: 1, totalOutputTokens: 2 } });
      return { accepted: true };
    });
    const count = state.query.mock.calls.length;
    expect(await engine.runInjectedTurn(request)).toMatchObject({ success: true });
    expect(state.query).toHaveBeenCalledTimes(count);
    expect(state.sdkInputs).toHaveLength(2);
  });

  it('clears an old reasoning override when the Session snapshot uses the default', async () => {
    const { engine, request, config } = await warmGoal();
    config.setReasoningEffort('high');
    expect(await engine.runInjectedTurn(request)).toMatchObject({ success: true });
    expect(agent.getSessionReasoningEffort()).toBeUndefined();
    expect(agent.getSessionPermissionMode()).toBe('fullAgency');
  });

  it.each([true, false])('preserves the original recovery checkpoint when provider admission is valid=%s', async valid => {
    const { metadata, engine, request } = await warmGoal();
    const recovery = { version: 1 as const, id: randomUUID(), status: 'paused' as const,
      sdkSessionId: metadata.id, routeIdentity: 'original-route', turnId: 'original-progress', goalId: 'same-goal',
      attempt: 2, startedAt: Date.now() - 1000, nextRetryAt: Date.now(), deadlineAt: Date.now() + 30_000, lastStatus: 503 };
    await store.updateSessionMetadata(metadata.id, { providerId: 'new-provider', model: 'new-model',
      configSnapshotAt: 'edited-config', modelRecovery: recovery });
    if (!valid) vi.mocked((await import('../utils/admin-config')).resolveWorkspaceConfig).mockReturnValue({
      model: 'new-model', providerEnv: undefined, providerRoute: { kind: 'provider', providerId: 'new-provider', model: 'new-model' },
      mcpServers: [], enabledOfficialToolIds: [], permissionMode: 'auto', reasoningEffort: undefined,
    });
    expect(await engine.runInjectedTurn(request)).toMatchObject({ success: valid });
    expect(agent.getSessionId()).toBe(metadata.id);
    expect(state.sdkInputs).toHaveLength(valid ? 2 : 1);
    expect(store.getSessionMetadata(metadata.id)?.modelRecovery).toEqual(valid ? undefined : recovery);
  });

  it.each(['missing-model', 'unavailable-provider', 'unavailable-managed-subscription', 'changed-runtime'] as const)('refuses %s instead of using the old Query configuration', async failure => {
    const { metadata, engine, request } = await warmGoal();
    if (failure === 'changed-runtime') {
      await store.updateSessionMetadata(metadata.id, { runtimeBinding: { family: 'external', id: 'codex' } });
    } else {
      vi.mocked((await import('../utils/admin-config')).resolveWorkspaceConfig).mockReturnValue({
        model: failure === 'missing-model' ? undefined : 'new-model', providerEnv: undefined,
        providerRoute: failure === 'missing-model'
          ? { kind: 'unknown-legacy', reason: 'missing-model' }
          : failure === 'unavailable-managed-subscription'
            ? { kind: 'subscription', providerId: 'antigravity-sub', model: 'new-model' }
            : { kind: 'provider', providerId: 'unavailable', model: 'new-model' },
        mcpServers: [], enabledOfficialToolIds: [], permissionMode: 'auto', reasoningEffort: undefined,
      });
    }
    expect(await engine.runInjectedTurn(request)).toMatchObject({ success: false, enqueued: false });
    expect(agent.getSessionModel()).toBe('old-model');
    expect(state.sdkInputs).toHaveLength(1);
    expect(request.beforeDispatch).not.toHaveBeenCalled();
  });

  it('does not replace the original Query while its background task is still running', async () => {
    const { metadata, engine, request } = await warmGoal();
    const lifecycle = await import('../builtin-session/lifecycle');
    lifecycle.recordQueryBackgroundTask(lifecycle.getQuerySession()!, 'original-background', {
      agentType: 'local_bash', description: 'synthetic existing work',
    });
    await store.updateSessionMetadata(metadata.id, { providerId: 'new-provider', model: 'new-model', configSnapshotAt: 'edited-config' });
    expect(await engine.runInjectedTurn(request)).toMatchObject({ success: false, enqueued: false, error: expect.stringContaining('background work') });
    expect(state.query).toHaveBeenCalledTimes(1);
    expect(state.sdkInputs).toHaveLength(1);
    expect(request.beforeDispatch).not.toHaveBeenCalled();
  });

  it('rolls back the original Goal claim when configuration changes across its await', async () => {
    const { metadata, engine, request } = await warmGoal();
    request.beforeDispatch.mockImplementationOnce(async () => {
      await store.updateSessionMetadata(metadata.id, { model: 'concurrent-model' });
      return { accepted: true };
    });
    expect(await engine.runInjectedTurn(request)).toMatchObject({ success: false });
    expect(request.beforeDispatch.cancel).toHaveBeenCalled();
    expect(state.sdkInputs).toHaveLength(1);
  });

  it('rechecks the Session configuration at the final commit after awaited materialization', async () => {
    const { metadata, engine, request } = await warmGoal();
    const claim = store.claimPreparedSessionForTurnAdmission;
    vi.spyOn(store, 'claimPreparedSessionForTurnAdmission').mockImplementationOnce(async (...args) => {
      const result = await claim(...args);
      await store.updateSessionMetadata(metadata.id, { model: 'late-config-edit' });
      return result;
    });
    expect(await engine.runInjectedTurn(request)).toMatchObject({ success: false });
    expect(request.beforeDispatch.cancel).toHaveBeenCalled();
    expect(state.sdkInputs).toHaveLength(1);
  });

  it.each(['stop', 'config-edit'] as const)('does not dispatch after %s wins during the warm Query termination await', async winner => {
    const { metadata, engine, request } = await warmGoal();
    await store.updateSessionMetadata(metadata.id, { providerId: 'new-provider', model: 'new-model', configSnapshotAt: 'edited-config' });
    state.queryExitGate = new Promise<void>(resolve => { releaseWrite = resolve; });
    const exitingBefore = state.queryInputEnded;
    const continuing = engine.runInjectedTurn(request);
    await vi.waitFor(() => expect(state.queryInputEnded).toBeGreaterThan(exitingBefore));
    const stopping = winner === 'stop' ? agent.interruptCurrentResponse() : undefined;
    if (winner === 'config-edit') await store.updateSessionMetadata(metadata.id, { model: 'concurrent-model' });
    releaseWrite!();
    if (stopping) await stopping;
    expect(await continuing).toMatchObject({ success: false });
    expect(state.sdkInputs).toHaveLength(1);
    expect(request.beforeDispatch).not.toHaveBeenCalled();
    expect(agent.getSessionId()).toBe(metadata.id);
  });

  it('honors Stop before configuration teardown without replacing the old Query', async () => {
    const { metadata, engine, request } = await warmGoal();
    await store.updateSessionMetadata(metadata.id, { providerId: 'new-provider', model: 'new-model', configSnapshotAt: 'edited-config' });
    const resolver = vi.mocked((await import('../utils/admin-config')).resolveWorkspaceConfig);
    const resolve = resolver.getMockImplementation()!;
    let stopping: Promise<boolean> | undefined;
    resolver.mockImplementationOnce((...args) => {
      stopping = agent.interruptCurrentResponse();
      return resolve(...args);
    });
    expect(await engine.runInjectedTurn(request)).toMatchObject({ success: false, enqueued: false });
    await stopping;
    expect(state.sdkInputs).toHaveLength(1);
    expect(state.query).toHaveBeenCalledTimes(1);
    expect(request.beforeDispatch).not.toHaveBeenCalled();
  });

  it('honors Stop after replacement Query creation but before its first model input', async () => {
    const { metadata, engine, request } = await warmGoal();
    await store.updateSessionMetadata(metadata.id, { providerId: 'new-provider', model: 'new-model', configSnapshotAt: 'edited-config' });
    let atGate = false;
    const gate = new Promise<void>(resolve => { releaseWrite = resolve; });
    state.beforeTurn.mockImplementationOnce(async () => { atGate = true; await gate; });
    const continuing = engine.runInjectedTurn(request);
    await vi.waitFor(() => expect(atGate).toBe(true));
    const stopping = agent.interruptCurrentResponse();
    releaseWrite!();
    await stopping;
    expect(await continuing).toMatchObject({ success: false });
    expect(state.sdkInputs).toHaveLength(1);
    expect(request.beforeDispatch).not.toHaveBeenCalled();
  });
});

describe('builtin V2 execution independent of product storage', () => {
  it.each(['user', 'update'] as const)('waits for the active writer before acknowledging durable watchdog %s Stop', async mode => {
    const workspace = join(state.home, `watchdog-durable-${mode}`);
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, { runtime: 'builtin' });
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
    const active = store.getActiveSessionTranscript(metadata.id)!;
    await store.updateSessionMetadata(metadata.id, { pendingContinueAfterAbort: true });
    expect(await active.writer.flushForMutation()).toBe(true);
    const diskFlag = async () => (JSON.parse(await readFile(join(state.home, '.myagents', 'sessions.json'), 'utf8')) as {
      id: string; pendingContinueAfterAbort?: boolean;
    }[]).find(row => row.id === metadata.id)?.pendingContinueAfterAbort;
    expect(await diskFlag()).toBe(true);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    releaseWrite = release;
    let blocked = false;
    const append = active.file.append.bind(active.file);
    vi.spyOn(active.file, 'append').mockImplementation(async (...args) => {
      blocked = true;
      await gate;
      return append(...args);
    });
    let settled = false;
    const stopping = (mode === 'user' ? agent.interruptCurrentResponse() : agent.stopBuiltinSessionForUpdate())
      .then(() => { settled = true; });
    await vi.waitFor(() => expect(blocked).toBe(true));
    expect(settled).toBe(false);
    expect(await diskFlag()).toBe(true);
    release();
    await stopping;
    expect(settled).toBe(true);
    expect(await diskFlag()).toBe(false);
    expect(active.writer.status.durableRevision).toBe(active.writer.status.liveRevision);
  });

  it.each(['user', 'update'] as const)('fails closed when active writer cannot persist watchdog %s Stop', async mode => {
    const workspace = join(state.home, `watchdog-durable-failure-${mode}`);
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, { runtime: 'builtin' });
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
    const active = store.getActiveSessionTranscript(metadata.id)!;
    await store.updateSessionMetadata(metadata.id, { pendingContinueAfterAbort: true });
    expect(await active.writer.flushForMutation()).toBe(true);
    vi.spyOn(active.file, 'append').mockRejectedValue(new Error('synthetic denied metadata commit'));
    const stopping = mode === 'user' ? agent.interruptCurrentResponse() : agent.stopBuiltinSessionForUpdate();
    await expect(stopping).rejects.toThrow('MODEL_RECOVERY_STOP_NOT_DURABLE');
    // A repeated call must not mistake the false in-memory overlay for disk
    // acknowledgement after the first failed publication.
    await expect(mode === 'user' ? agent.interruptCurrentResponse() : agent.stopBuiltinSessionForUpdate())
      .rejects.toThrow('MODEL_RECOVERY_STOP_NOT_DURABLE');
    expect(active.writer.status.durableRevision).toBeLessThan(active.writer.status.liveRevision);
    const disk = JSON.parse(await readFile(join(state.home, '.myagents', 'sessions.json'), 'utf8')) as {
      id: string; pendingContinueAfterAbort?: boolean;
    }[];
    expect(disk.find(row => row.id === metadata.id)?.pendingContinueAfterAbort).toBe(true);
    if (mode === 'user') expect((await import('../builtin-session/lifecycle')).lifecycleState.abortRequested).toBe(true);
    expect(state.sdkInputs).toHaveLength(0);
  });

  it('keeps a delayed watchdog launcher from clearing the Stop fence', async () => {
    const workspace = join(state.home, 'watchdog-delayed-launch');
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, { runtime: 'builtin' });
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
    await store.updateSessionMetadata(metadata.id, { pendingContinueAfterAbort: true });
    const setTimeoutOriginal = globalThis.setTimeout;
    let launch: (() => void) | undefined;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
      if (ms === 0 && String(callback).includes('failed to start watchdog auto-resume session')) {
        launch = () => callback(...args);
        return setTimeoutOriginal(() => undefined, 0);
      }
      return setTimeoutOriginal(callback, ms, ...args);
    }) as typeof setTimeout);
    await agent.enqueueUserMessage('new business', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
    expect(launch).toBeTypeOf('function');
    await agent.interruptCurrentResponse();
    const { lifecycleState } = await import('../builtin-session/lifecycle');
    expect(lifecycleState.abortRequested).toBe(true);
    launch!();
    await new Promise(resolve => setTimeoutOriginal(resolve, 0));
    expect(lifecycleState.abortRequested).toBe(true);
    expect(state.query).not.toHaveBeenCalled();
    expect(state.sdkInputs).toHaveLength(0);
  });

  it('does not dispatch a recursive watchdog reminder when Stop wins during persistence', async () => {
    const workspace = join(state.home, 'watchdog-recursive-stop');
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, { runtime: 'builtin' });
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
    await agent.enqueueUserMessage('initial business', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
    await vi.waitFor(() => expect(state.beforeResult).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(agent.isTurnInFlight()).toBe(false));
    await store.updateSessionMetadata(metadata.id, { pendingContinueAfterAbort: true });
    const persistence = await import('../builtin-session/transcript-persistence');
    const persist = persistence.scheduleTranscriptPersist;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    releaseWrite = release;
    let blocked = false;
    vi.spyOn(persistence, 'scheduleTranscriptPersist').mockImplementation(async options => {
      if (!blocked && agent.getMessages().some(message => typeof message.content === 'string'
        && message.content.includes('previous turn was aborted by the inactivity watchdog'))) {
        blocked = true;
        await gate;
      }
      return persist(options);
    });
    const enqueue = agent.enqueueUserMessage('next business', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
    await vi.waitFor(() => expect(blocked).toBe(true));
    await agent.interruptCurrentResponse();
    release();
    await enqueue;
    await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
    expect(state.sdkInputs.filter(input => JSON.stringify(input).includes('previous turn was aborted by the inactivity watchdog'))).toHaveLength(0);
  });

  it('times out repeated compacting status heartbeats without inventing recovery progress', async () => {
    const workspace = join(state.home, 'watchdog-compaction-status');
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, { runtime: 'builtin' });
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const intervals = vi.spyOn(globalThis, 'setInterval');
    state.protocolFrames = Array.from({ length: 22 }, () => ({ type: 'system', subtype: 'status', status: 'compacting' }));
    state.beforeFrame.mockImplementation(async frame => {
      if (frame.type !== 'system' || frame.subtype !== 'status') return;
      now += 30_000;
      const tick = intervals.mock.calls.find(call => call[1] === 30_000)?.[0] as () => Promise<void>;
      await tick();
    });
    await agent.enqueueUserMessage('business awaiting compaction', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
    await vi.waitFor(() => expect(state.events).toContainEqual(['chat:agent-error',
      expect.objectContaining({ message: expect.stringContaining('响应超时') })]));
    await vi.waitFor(() => expect(agent.isSessionActive()).toBe(false));
    expect(state.sdkInputs).toHaveLength(1);
    expect((await store.getSessionMetadata(metadata.id))?.pendingContinueAfterAbort).not.toBe(true);
  });

  it.each([
    ['new business request', true],
    ['<system-reminder><MEMORY_UPDATE>maintain memory</MEMORY_UPDATE></system-reminder>', false],
    ['<system-reminder>The previous turn was aborted by the inactivity watchdog (10-minute timeout). Resume from existing context and complete the unfinished task.</system-reminder>', false],
  ] as const)('renews watchdog recovery only for a new business input (%s)', async (input, renew) => {
    const workspace = join(state.home, 'watchdog-new-business');
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, { runtime: 'builtin' });
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
    await store.updateSessionMetadata(metadata.id, { pendingContinueAfterAbort: true });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    releaseWrite = release;
    state.beforeResult.mockImplementation(async () => {
      if (state.sdkInputs.length === 2) await gate;
    });
    const intervals = vi.spyOn(globalThis, 'setInterval');
    const { InactivityWatchdog } = await import('../utils/inactivity-watchdog');
    vi.spyOn(InactivityWatchdog.prototype, 'evaluateTick').mockReturnValue({ fire: true, suspendedMs: 0 });
    await agent.enqueueUserMessage(input, [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
    await vi.waitFor(() => expect(state.beforeResult).toHaveBeenCalledTimes(2));
    expect(state.sdkInputs).toHaveLength(2);
    const tick = intervals.mock.calls.find(call => call[1] === 30_000)?.[0] as () => Promise<void>;
    await tick();
    expect((await store.getSessionMetadata(metadata.id))?.pendingContinueAfterAbort).toBe(renew);
    release();
    if (renew) await vi.waitFor(() => expect(state.sdkInputs).toHaveLength(3));
    else await vi.waitFor(() => expect(agent.isSessionActive()).toBe(false));
    await vi.waitFor(() => expect(agent.isTurnInFlight()).toBe(false));
    expect((await store.getSessionMetadata(metadata.id))?.pendingContinueAfterAbort).toBe(false);
  });

  it.each(['user', 'update'] as const)('does not resume a watchdog-aborted turn when %s Stop wins during Query teardown', async mode => {
    const warnings = vi.spyOn(console, 'warn');
    const workspace = join(state.home, 'watchdog-stop');
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, { runtime: 'builtin' });
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    releaseWrite = release;
    state.beforeResult.mockImplementation(() => gate);
    const intervals = vi.spyOn(globalThis, 'setInterval');
    const { InactivityWatchdog } = await import('../utils/inactivity-watchdog');
    vi.spyOn(InactivityWatchdog.prototype, 'evaluateTick').mockReturnValue({ fire: true, suspendedMs: 0 });
    await agent.enqueueUserMessage('finish existing business task', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
    await vi.waitFor(() => expect(state.beforeResult).toHaveBeenCalledOnce());
    const tick = intervals.mock.calls.find(call => call[1] === 30_000)?.[0] as () => Promise<void>;
    await tick();
    const stopping = mode === 'user' ? agent.interruptCurrentResponse() : agent.stopBuiltinSessionForUpdate();
    release();
    await stopping;
    await vi.waitFor(() => expect(agent.isSessionActive()).toBe(false));
    await vi.waitFor(() => expect(warnings).toHaveBeenCalledWith(expect.stringContaining('Watchdog auto-resume skipped')));
    expect(state.sdkInputs).toHaveLength(1);
    expect((await store.getSessionMetadata(metadata.id))?.pendingContinueAfterAbort).toBe(false);
  });

  it('keeps Stop authoritative while the watchdog pending flag write is returning', async () => {
    const workspace = join(state.home, 'watchdog-stop-persist');
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, { runtime: 'builtin' });
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
    let releaseResult!: () => void;
    let releaseFlag!: () => void;
    const resultGate = new Promise<void>(resolve => { releaseResult = resolve; });
    const flagGate = new Promise<void>(resolve => { releaseFlag = resolve; });
    releaseWrite = () => { releaseResult(); releaseFlag(); };
    state.beforeResult.mockImplementation(() => resultGate);
    let flagWritten = false;
    const update = store.updateSessionMetadata;
    vi.spyOn(store, 'updateSessionMetadata').mockImplementation(async (...args) => {
      const result = await update(...args);
      if (args[1].pendingContinueAfterAbort === true) {
        flagWritten = true;
        await flagGate;
      }
      return result;
    });
    const intervals = vi.spyOn(globalThis, 'setInterval');
    const { InactivityWatchdog } = await import('../utils/inactivity-watchdog');
    vi.spyOn(InactivityWatchdog.prototype, 'evaluateTick').mockReturnValue({ fire: true, suspendedMs: 0 });
    await agent.enqueueUserMessage('finish existing business task', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
    await vi.waitFor(() => expect(state.beforeResult).toHaveBeenCalledOnce());
    const tick = intervals.mock.calls.find(call => call[1] === 30_000)?.[0] as () => Promise<void>;
    const firing = tick();
    await vi.waitFor(() => expect(flagWritten).toBe(true));
    const stopping = agent.interruptCurrentResponse();
    releaseResult();
    await stopping;
    releaseFlag();
    await firing;
    await vi.waitFor(() => expect(agent.isTurnInFlight()).toBe(false));
    expect(state.sdkInputs).toHaveLength(1);
    expect((await store.getSessionMetadata(metadata.id))?.pendingContinueAfterAbort).toBe(false);
  });

  it('settles a watchdog-aborted Goal exactly once and preserves progress without unowned replay', async () => {
    const workspace = join(state.home, 'watchdog-goal');
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, { runtime: 'builtin' });
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    releaseWrite = release;
    state.beforeResult.mockImplementation(() => gate);
    const intervals = vi.spyOn(globalThis, 'setInterval');
    const { InactivityWatchdog } = await import('../utils/inactivity-watchdog');
    vi.spyOn(InactivityWatchdog.prototype, 'evaluateTick').mockReturnValue({ fire: true, suspendedMs: 0 });
    const terminal = vi.fn();
    await agent.enqueueUserMessage('finish existing Goal', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, {
        channelDelivery: NO_CHANNEL_DELIVERY, turnOwner: { kind: 'goal', id: 'goal-fixture' }, onTerminal: terminal,
      });
    await vi.waitFor(() => expect(state.beforeResult).toHaveBeenCalledOnce());
    const tick = intervals.mock.calls.find(call => call[1] === 30_000)?.[0] as (() => Promise<void>) | undefined;
    expect(tick).toBeTypeOf('function');
    await tick!();
    await tick!();
    await vi.waitFor(() => expect(terminal).toHaveBeenCalledOnce());
    expect(terminal.mock.calls[0][0]).toMatchObject({ status: 'error', code: 'automatic_replay_blocked' });
    expect(state.events).toContainEqual(['chat:agent-error', expect.objectContaining({ message: expect.stringContaining('进度已保留') })]);
    expect((await store.getSessionMetadata(metadata.id))?.pendingContinueAfterAbort).not.toBe(true);
    release();
    await vi.waitFor(() => expect(agent.isSessionActive()).toBe(false));
    expect(terminal).toHaveBeenCalledOnce();
    expect(state.sdkInputs).toHaveLength(1);
    expect(agent.getMessages().some(message => JSON.stringify(message).includes('answer 1'))).toBe(true);
  });

  it('surfaces a Goal turn conflict without dispatching the rejected user input', async () => {
    const workspace = join(state.home, 'goal-conflict');
    await mkdir(workspace);
    await agent.initializeAgent(workspace, null, undefined, { preWarmDisabled: true });
    const terminal = vi.fn();
    await agent.enqueueUserMessage('continue', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, {
        channelDelivery: NO_CHANNEL_DELIVERY, onTerminal: terminal,
        beforeDispatch: async () => ({ accepted: false, code: 'turn_conflict', error: 'Another Goal turn currently owns this Session' }),
      });
    await vi.waitFor(() => expect(terminal).toHaveBeenCalledOnce());
    expect(state.sdkInputs).toHaveLength(0);
    expect(state.events).toContainEqual(['chat:agent-error', expect.objectContaining({ message: expect.stringContaining('本次消息未执行') })]);
  });

  it.each([true, false])('owns recovery transport and requires durable update Stop acknowledgement (%s)', async durable => {
    vi.stubEnv('HOME', state.home);
    try {
      agent.setSidecarPort(15432);
      const workspace = join(state.home, 'workspace');
      await mkdir(workspace);
      const providers = join(state.home, '.myagents', 'providers');
      await mkdir(providers, { recursive: true });
      await writeFile(join(providers, 'recovery-fixture.json'), JSON.stringify({
        id: 'recovery-fixture', name: 'fixture', type: 'api',
        models: [{ model: 'fixture-model' }],
      }));
      await agent.initializeAgent(workspace, null, undefined, { preWarmDisabled: true });
      const provider = { providerId: 'recovery-fixture', baseUrl: 'http://127.0.0.1:1',
        apiKey: 'synthetic-not-a-secret' };
      expect((await import('../builtin-session/model-failover')).sessionApiFailoverEligible(provider)).toBe(true);
      await agent.setSessionProviderEnv(provider);
      await agent.setSessionModel('fixture-model');
      await agent.enqueueUserMessage('Synthetic recovery transport', undefined, undefined, undefined,
        undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        { fromDesktopChatSend: true, channelDelivery: NO_CHANNEL_DELIVERY });
      await vi.waitFor(() => expect(state.query).toHaveBeenCalled());
      const env = (state.query.mock.calls.at(-1)![0].options as Options).env;
      const transportKeys = ['API_TIMEOUT_MS', 'CLAUDE_CODE_MAX_RETRIES', 'CLAUDE_ENABLE_BYTE_WATCHDOG',
        'CLAUDE_ENABLE_STREAM_WATCHDOG', 'API_FORCE_IDLE_TIMEOUT', 'CLAUDE_CODE_RETRY_WATCHDOG'];
      expect(Object.fromEntries(transportKeys.map(key => [key, env?.[key]])))
        .toEqual({ API_TIMEOUT_MS: '2100000', CLAUDE_CODE_MAX_RETRIES: '0',
        CLAUDE_ENABLE_BYTE_WATCHDOG: '0', CLAUDE_ENABLE_STREAM_WATCHDOG: '0', API_FORCE_IDLE_TIMEOUT: '0',
        CLAUDE_CODE_RETRY_WATCHDOG: '0' });
      const utilityProvider = { ...provider, apiProtocol: 'openai' as const };
      const oneShot = agent.startOneShotBridge(utilityProvider, 'fixture-model', 'Recovery isolation fixture');
      try {
        const utilityEnv = agent.buildClaudeSessionEnv(utilityProvider, 'fixture-model', { bridgeToken: oneShot.token });
        expect(utilityEnv.API_TIMEOUT_MS).not.toBe('2100000');
        expect(utilityEnv.API_FORCE_IDLE_TIMEOUT).not.toBe('0');
      } finally { oneShot.release(); }
      let releaseStop!: (value: boolean) => void;
      const acknowledgement = new Promise<boolean>(resolve => { releaseStop = resolve; });
      const recovery = await import('../builtin-session/model-recovery');
      const pause = vi.spyOn(recovery.SessionModelRecovery.prototype, 'pause').mockReturnValue(acknowledgement);
      const stopping = agent.stopBuiltinSessionForUpdate().then(() => 'stopped', error => String(error));
      try {
        await vi.waitFor(() => expect(pause).toHaveBeenCalled());
        // Storage acknowledgement must not delay the local cancellation.
        const lifecycle = await import('../builtin-session/lifecycle');
        expect(lifecycle.lifecycleState.abortRequested).toBe(true);
      } finally { releaseStop(durable); }
      expect(await stopping).toBe(durable ? 'stopped' : 'Error: UPDATE_ACTIVITY_UNKNOWN: MODEL_RECOVERY_STOP_NOT_DURABLE');
    } finally { agent.setSidecarPort(0); vi.unstubAllEnvs(); }
  });

  it('keeps Stop effective while an explicit recovery resume waits for metadata CAS', async () => {
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    const id = randomUUID();
    await store.saveSessionMetadata({ id, agentDir: workspace, title: 'paused recovery',
      createdAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(), runtime: 'builtin', sdkSessionId: id,
      modelRecovery: { version: 1, id: randomUUID(), status: 'paused', sdkSessionId: id,
        routeIdentity: 'route', turnId: 'old-turn', attempt: 1, startedAt: 1, nextRetryAt: 1, deadlineAt: 100_000, lastStatus: 503 } });
    await agent.initializeAgent(workspace, null, id, { preWarmDisabled: true });
    const original = store.updateSessionMetadata;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    releaseWrite = release;
    let blocked = false;
    vi.spyOn(store, 'updateSessionMetadata').mockImplementation(async (...args) => {
      if ('modelRecovery' in args[1] && args[1].modelRecovery === undefined) {
        blocked = true;
        await gate;
      }
      return original(...args);
    });
    const resumed = agent.enqueueUserMessage('Continue the existing task', undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      { fromDesktopChatSend: true, channelDelivery: NO_CHANNEL_DELIVERY });
    await vi.waitFor(() => expect(blocked).toBe(true));
    expect(await agent.interruptCurrentResponse()).toBe(true);
    release();
    expect((await resumed).error).toContain('stopped or superseded');
    expect(state.query).not.toHaveBeenCalled();
    expect(store.getSessionMetadata(id)?.modelRecovery?.status).toBe('paused');
  });

  it('pauses a cold recovery with missing native history instead of replaying the original task', async () => {
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    const id = randomUUID();
    const now = Date.now();
    await store.saveSessionMetadata({ id, agentDir: workspace, title: 'unverified recovery',
      createdAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(), runtime: 'builtin', sdkSessionId: id,
      modelRecovery: { version: 1, id: randomUUID(), status: 'waiting', sdkSessionId: id,
        routeIdentity: 'unverified-route', turnId: 'old-turn', attempt: 1,
        startedAt: now, nextRetryAt: now + 15_000, deadlineAt: now + 1_800_000, lastStatus: 503 } });
    await agent.initializeAgent(workspace, null, id, { preWarmDisabled: true });
    expect(state.query).not.toHaveBeenCalled();
    expect(store.getBuiltinModelRecovery(id)?.status).toBe('paused');
    expect(agent.getMessages()).toHaveLength(0);
  });

  it('normalizes a question before UI delivery and returns the actual answer through builtin canUseTool', async () => {
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    await agent.initializeAgent(workspace, null, undefined, { preWarmDisabled: true });
    const engine = (await import('../session-engine/builtin-adapter')).createBuiltinSessionEngine();
    await engine.sendDesktopMessage({ text: 'Start synthetic question test', workspacePath: workspace,
      sessionId: agent.getSessionId()!, scenario: { type: 'desktop' } });
    await vi.waitFor(() => expect(state.query).toHaveBeenCalled());
    const canUseTool = (state.query.mock.calls.at(-1)![0].options as Options).canUseTool!;
    const input = { questions: [{ question: 'Which channel?', header: 'Channel',
      options: [{ label: 'Current agent', description: 'Local' }, { label: 'Mori', description: 'Delegate' }] }] };
    const reply = canUseTool('AskUserQuestion', input, { signal: new AbortController().signal, toolUseID: 'ask-fixture', requestId: 'sdk-ask-fixture' });
    await vi.waitFor(() => expect(state.events.some(([name]) => name === 'ask-user-question:request')).toBe(true));
    const request = state.events.find(([name]) => name === 'ask-user-question:request')![1] as { requestId: string; questions: unknown[] };
    expect(request.questions).toEqual([{ ...input.questions[0], multiSelect: false }]);
    expect(agent.handleAskUserQuestionResponse(request.requestId, { '0': 'Current agent' })).toBe(true);
    await expect(reply).resolves.toEqual({ behavior: 'allow', updatedInput: {
      questions: [{ ...input.questions[0], multiSelect: false }],
      answers: { '0': 'Current agent', 'Which channel?': 'Current agent' },
    } });
    const invalid = await canUseTool('AskUserQuestion', { questions: [{ ...input.questions[0], options: [null] }] },
      { signal: new AbortController().signal, toolUseID: 'ask-invalid-fixture', requestId: 'sdk-ask-invalid-fixture' });
    expect(invalid).toEqual({ behavior: 'deny', interrupt: false, message: expect.stringContaining('options[0]') });
    expect(state.events.filter(([name]) => name === 'ask-user-question:request')).toHaveLength(1);
    const cancelled = canUseTool('AskUserQuestion', input, { signal: new AbortController().signal,
      toolUseID: 'ask-cancel-fixture', requestId: 'sdk-ask-cancel-fixture' });
    const cancelRequest = state.events.filter(([name]) => name === 'ask-user-question:request').at(-1)![1] as { requestId: string };
    expect(agent.handleAskUserQuestionResponse(cancelRequest.requestId, null)).toBe(true);
    await expect(cancelled).resolves.toMatchObject({ behavior: 'deny', interrupt: true, message: '用户取消了问答' });
    const abort = new AbortController();
    const aborted = canUseTool('AskUserQuestion', input, { signal: abort.signal,
      toolUseID: 'ask-abort-fixture', requestId: 'sdk-ask-abort-fixture' });
    abort.abort();
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    expect(state.events.some(([name, data]) => name === 'ask-user-question:expired'
      && (data as { reason?: string }).reason === 'aborted')).toBe(true);

  });

  it.each(['dsh', 'claude-code', 'codex'] as const)('does not start SDK prewarm or publish a %s transcript after a stray builtin reload', async runtime => {
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace, { recursive: true });
    vi.stubEnv('MYAGENTS_RUNTIME', runtime);
    try {
      await agent.initializeAgent(workspace);
      const metadata = await store.createSession(workspace, { id: agent.getSessionId(), runtime });
      const active = store.getActiveSessionTranscript(metadata.id)!;
      const { TranscriptPresentation } = await import('./presentation');
      const { ProductTranscriptContent } = await import('./content');
      const publish = vi.fn();
      const presentation = new TranscriptPresentation(new ProductTranscriptContent(active.writer), publish);

      // SDK config helpers used to attach a second publisher to the shared
      // Product writer even though another Runtime owns execution/presentation.
      agent.publishBuiltinTranscriptSaveStatus(active.writer.status);
      state.events.length = 0;
      presentation.record('chat:message-chunk', 'A single delta');
      expect(publish.mock.calls.filter(([op]) => op.kind === 'text-append')).toHaveLength(1);
      expect(state.events.filter(([event]) => event === 'chat:transcript-operation')).toHaveLength(0);

      agent.setMcpServers([]);
      agent.setAgents({});
      agent.forceReloadActiveSession('agents');
      const lifecycle = await import('../builtin-session/lifecycle');
      expect(lifecycle.getPreWarmTimer()).toBeNull();
      expect(state.query).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each(['normal', 'delayed', 'failed'] as const)('desktop reset waits for %s disk publication before exposing success', async mode => {
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace, { recursive: true });
    await agent.initializeAgent(workspace, null, undefined, { preWarmDisabled: true });
    agent.setSessionModel('configured-model');
    agent.setSessionProviderEnv({ providerId: 'configured-provider', baseUrl: 'http://127.0.0.1:1', apiKey: 'synthetic-not-a-secret' });
    const { createBuiltinSessionEngine } = await import('../session-engine/builtin-adapter');
    if (mode === 'failed') state.failProductIo = true;
    if (mode === 'delayed') state.publicationGate = new Promise<void>(resolve => { releaseWrite = resolve; });
    let settled = false;
    const reset = createBuiltinSessionEngine().transitionDesktopSession(workspace, { sourceSessionId: agent.getSessionId(), targetSessionId: '4d2c043d-e1ac-432d-9d3a-7f1619842ac0', channelBound: false }).finally(() => { settled = true; });
    if (mode === 'failed') {
      await expect(reset).rejects.toThrow();
      return;
    }
    if (mode === 'delayed') {
      await vi.waitFor(() => expect(state.publicationBlocked).toBe(true));
      expect(settled).toBe(false);
      releaseWrite!();
    }
    const result = await reset;
    expect(result.success).toBe(true);
    const disk = JSON.parse(await readFile(join(state.home, '.myagents', 'sessions.json'), 'utf8'));
    expect(disk).toContainEqual(expect.objectContaining({ id: result.sessionId, agentDir: workspace, model: 'configured-model', providerId: 'configured-provider', configSnapshotAt: expect.any(String) }));
    expect(agent.getMessages()).toHaveLength(0);
  });

  it.each(['complete', 'stopped'] as const)('consumes builtin Inbox C/D during A before manual B, with %s terminal', async ending => {
    const workspace = join(state.home, 'workspace'); await mkdir(workspace);
    vi.spyOn(await import('../utils/admin-config'), 'loadConfig').mockReturnValue({ chatQueueResponseMode: 'turn' });
    const sessionId = (await store.createSession(workspace, { runtime: 'builtin' })).id;
    await agent.initializeAgent(workspace, null, sessionId, { preWarmDisabled: true });
    const engine = (await import('../session-engine/builtin-adapter')).createBuiltinSessionEngine();
    const delivery = vi.spyOn(await import('../inbox/watch-deliver'), 'deliverSessionWatchEvents').mockResolvedValue(undefined);
    state.independentInputPump = true;
    let release!: () => void;
    releaseWrite = () => release();
    const ready = new Promise<void>(resolve => { release = resolve; });
    let replays = 0;
    state.beforeResult.mockImplementation(async value => {
      if (replays < 2) { await ready; replays++; return true; }
      if (replays === 2) {
        replays++;
        if (ending === 'stopped') value.terminal_reason = 'aborted_streaming';
      }
      return false;
    });
    const a = await engine.sendDesktopMessage({ text: 'A', images: [], sessionId, workspacePath: workspace, scenario: { type: 'desktop' } });
    await a.dispatchAcceptance;
    await vi.waitFor(() => expect(state.beforeResult).toHaveBeenCalledOnce());
    const b = await engine.sendDesktopMessage({ text: 'B', images: [], sessionId, workspacePath: workspace, scenario: { type: 'desktop' } });
    expect(b.deliveryMode).toBe('turn');
    for (const id of ['C', 'D']) await engine.enqueueInboxMessage({ text: id, sessionId, workspacePath: workspace,
      inboxMeta: { fromSessionId: `caller-${id}`, fromLabel: id, originalMessageId: id, originalSnippet: id, replyBack: true } });
    release();
    await b.dispatchAcceptance;
    await expect(engine.waitIdle(2_000, 10)).resolves.toBe(true);
    await vi.waitFor(() => expect(delivery).toHaveBeenCalledWith(sessionId,
      expect.objectContaining({ terminalStatus: ending, requestEventIds: ['C', 'D'], text: expect.stringContaining('answer 1') }),
      expect.arrayContaining([expect.objectContaining({ originalMessageId: 'C' }), expect.objectContaining({ originalMessageId: 'D' })])));
    expect(state.sdkInputs.map(input => (input as { message: { content: { text?: string }[] } }).message.content.find(block => block.text)?.text)).toEqual(['A', 'C', 'D', 'B']);
    expect(delivery.mock.calls.find(call => call[1].text.includes('answer 2'))?.[2]).toEqual([]);
  });

  it.each(['v1', 'v2'] as const)('keeps %s identity across real builtin IM, Inbox and injected-turn adapters', async format => {
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    const sessionId = randomUUID();
    if (format === 'v1') await store.saveSessionMetadata({ id: sessionId, agentDir: workspace, title: 'legacy',
      createdAt: 't', lastActiveAt: 't', runtime: 'builtin' });
    state.failProductIo = format === 'v2';
    state.toolFrames = true;
    await agent.initializeAgent(workspace, null, sessionId, { preWarmDisabled: true });
    const engine = (await import('../session-engine/builtin-adapter')).createBuiltinSessionEngine();
    const im = await engine.enqueueImMessage({ message: 'IM', requestId: 'first-im', sessionId, workspacePath: workspace,
      scenario: { type: 'agent-channel', platform: 'feishu', sourceType: 'private' }, metadataBirthPending: format === 'v2' });
    expect(im.success).toBe(true);
    await expect(engine.waitIdle(2_000, 10)).resolves.toBe(true);
    const inbox = await engine.enqueueInboxMessage({ text: 'Inbox', sessionId, workspacePath: workspace,
      scenario: { type: 'desktop' }, allowLazySessionMaterialization: true });
    expect(inbox.error).toBeUndefined();
    await expect(engine.waitIdle(2_000, 10)).resolves.toBe(true);
    for (const prompt of ['Task', 'Goal', 'Heartbeat']) {
      expect(await engine.runInjectedTurn({ prompt, sessionId, workspacePath: workspace,
        scenario: { type: 'cron', taskId: prompt, intervalMinutes: 15, aiCanExit: false },
        assistantChannelDelivery: 'caller-owned', timeoutMs: 2_000, pollMs: 10 })).toMatchObject({ success: true });
    }
    expect(agent.getSessionId()).toBe(sessionId);
    expect(store.getSessionMetadata(sessionId)?.transcriptFormat).toBe(format === 'v2' ? 2 : undefined);
    expect((await store.getSessionData(sessionId))?.messages.filter(row => row.role === 'assistant')).toHaveLength(5);
    if (format === 'v2') {
      const active = store.getActiveSessionTranscript(sessionId)!;
      expect(await active.writer.flush(50)).toBe(false);
      state.failProductIo = false;
      expect(await active.writer.flush()).toBe(true);
    } else expect(store.getActiveSessionTranscript(sessionId)).toBeUndefined();
  });

  it('keeps an existing V1 identity on the legacy path when an Inbox-style request allows missing metadata', async () => {
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    const id = randomUUID();
    await store.saveSessionMetadata({ id, agentDir: workspace, title: 'legacy', createdAt: 't', lastActiveAt: 't', runtime: 'builtin' });
    await agent.initializeAgent(workspace, null, id, { preWarmDisabled: true });
    let finish!: (outcome: TurnTerminalOutcome) => void;
    const terminal = new Promise<TurnTerminalOutcome>(resolve => { finish = resolve; });
    const admission = await agent.enqueueUserMessage('Inbox query', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined,
      { channelDelivery: NO_CHANNEL_DELIVERY, allowLazySessionMaterialization: true, onTerminal: finish });
    expect(admission.error).toBeUndefined();
    await expect(terminal).resolves.toMatchObject({ status: 'complete' });
    expect(store.getSessionMetadata(id)?.transcriptFormat).toBeUndefined();
    expect(store.getActiveSessionTranscript(id)).toBeUndefined();
    expect((await store.getSessionData(id))?.messages.map(row => row.role)).toEqual(['user', 'assistant']);
  });

  it('refuses a known invalid history before touching SDK file checkpoints', async () => {
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, { runtime: 'builtin' });
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
    await agent.enqueueUserMessage('question', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
    await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toBe('answer 1 full-only tail'));
    await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
    const rows = agent.getMessages();
    store.getActiveSessionTranscript(metadata.id)!.writer.rejectIncompleteSource();
    expect(await agent.rewindSession(rows[0].id)).toMatchObject({ success: false, error: 'Conversation history contains data that cannot be safely rewound.' });
    expect(state.rewindFiles).not.toHaveBeenCalled();
    expect(agent.getMessages().map(row => row.id)).toEqual(rows.map(row => row.id));
  });

  it('does not treat absence from the SDK single-chain projection as an invalid rewind boundary', async () => {
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, { runtime: 'builtin' });
    const rows = [
      { id: 'u1', role: 'user' as const, content: 'first', timestamp: 't', sdkUuid: 'native-u1' },
      { id: 'a1', role: 'assistant' as const, content: 'orphaned answer', timestamp: 't', sdkUuid: 'native-orphan-a1' },
      { id: 'u2', role: 'user' as const, content: 'second', timestamp: 't', sdkUuid: 'native-u2' },
      { id: 'a2', role: 'assistant' as const, content: 'current answer', timestamp: 't', sdkUuid: 'native-current-a2' },
    ];
    const snapshot = await store.loadSessionTranscript(metadata.id);
    expect(await store.appendSessionMessages(metadata.id, snapshot.cursor, rows)).toMatchObject({ ok: true });
    state.sdkRead.mockResolvedValue([
      { type: 'user', uuid: 'native-u1' },
      { type: 'assistant', uuid: 'native-current-a2' },
    ]);
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });

    const result = await agent.rewindSession('u2');

    expect(result).toMatchObject({ success: true });
    expect(state.rewindFiles).not.toHaveBeenCalled();
    expect(agent.getMessages().map(row => row.id)).toEqual(['u1', 'a1']);
    expect(store.getSessionMetadata(metadata.id)?.sdkResumeSessionAt).toBe('native-orphan-a1');
  });

  it('lets native Query adjudicate a persisted boundary absent from the SDK projection', async () => {
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, { runtime: 'builtin' });
    const snapshot = await store.loadSessionTranscript(metadata.id);
    expect(await store.appendSessionMessages(metadata.id, snapshot.cursor, [
      { id: 'u1', role: 'user', content: 'first', timestamp: 't', sdkUuid: 'native-u1' },
      { id: 'a1', role: 'assistant', content: 'orphaned answer', timestamp: 't', sdkUuid: 'native-orphan-a1' },
    ])).toMatchObject({ ok: true });
    await store.updateSessionMetadata(metadata.id, {
      sdkSessionId: metadata.id,
      sdkResumeSessionAt: 'native-orphan-a1',
      unifiedSession: false,
    });
    state.sdkRead.mockResolvedValue([
      { type: 'user', uuid: 'native-u1' },
      { type: 'assistant', uuid: 'native-current-a2' },
    ]);
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });

    await agent.enqueueUserMessage('continue', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });

    await vi.waitFor(() => expect(state.query).toHaveBeenCalled());
    expect(state.query.mock.calls.at(-1)?.[0].options.resumeSessionAt).toBe('native-orphan-a1');
    await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
    expect(store.getSessionMetadata(metadata.id)?.sdkResumeSessionAt).toBeUndefined();
    expect(state.events.some(([name]) => name === 'chat:message-error')).toBe(false);
  });

  it('does not silently drop a persisted boundary when a legacy Product Session has no native identity', async () => {
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    const legacySessionId = 'legacy-non-uuid-session';
    await store.saveSessionMetadata({
      id: legacySessionId,
      agentDir: workspace,
      title: 'legacy',
      createdAt: 't',
      lastActiveAt: 't',
      runtime: 'builtin',
      sdkResumeSessionAt: 'native-boundary',
    });
    const snapshot = await store.loadSessionTranscript(legacySessionId);
    expect(await store.appendSessionMessages(legacySessionId, snapshot.cursor, [
      { id: 'u1', role: 'user', content: 'first', timestamp: 't', sdkUuid: 'native-u1' },
      { id: 'a1', role: 'assistant', content: 'answer', timestamp: 't', sdkUuid: 'native-boundary' },
    ])).toMatchObject({ ok: true });
    await agent.initializeAgent(workspace, null, legacySessionId, { preWarmDisabled: true });

    await agent.enqueueUserMessage('continue', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });

    await vi.waitFor(() => expect(state.events).toContainEqual([
      'chat:message-error',
      expect.stringContaining('no native session identity'),
    ]));
    expect(state.query).not.toHaveBeenCalled();
    expect(store.getSessionMetadata(legacySessionId)?.sdkResumeSessionAt).toBe('native-boundary');
  });

  it('does not silently drop a cold-reload boundary when a legacy Product Session has no native identity', async () => {
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    const legacySessionId = 'legacy-cold-reload-session';
    await store.saveSessionMetadata({
      id: legacySessionId,
      agentDir: workspace,
      title: 'legacy',
      createdAt: 't',
      lastActiveAt: 't',
      runtime: 'builtin',
    });
    const snapshot = await store.loadSessionTranscript(legacySessionId);
    expect(await store.appendSessionMessages(legacySessionId, snapshot.cursor, [
      { id: 'u1', role: 'user', content: 'first', timestamp: 't', sdkUuid: 'native-u1' },
      { id: 'a1', role: 'assistant', content: 'answer', timestamp: 't', sdkUuid: 'native-boundary' },
    ])).toMatchObject({ ok: true });
    await agent.initializeAgent(workspace, null, legacySessionId, { preWarmDisabled: true });

    await agent.enqueueUserMessage('continue', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });

    await vi.waitFor(() => expect(state.events).toContainEqual([
      'chat:message-error',
      expect.stringContaining('no native session identity'),
    ]));
    expect(state.query).not.toHaveBeenCalled();
  });

  it.each([false, true])('executes first/next query with product EACCES before birth (provider boundary=%s)', async providerBoundary => {
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    state.failProductIo = true;
    await agent.initializeAgent(workspace, null, undefined, { preWarmDisabled: true });
    for (const prompt of ['first', 'next']) {
      let finish!: (outcome: TurnTerminalOutcome) => void;
      const terminal = new Promise<TurnTerminalOutcome>(resolve => { finish = resolve; });
      const admission = await agent.enqueueUserMessage(prompt, [], undefined, undefined, providerBoundary
        ? { providerId: 'synthetic-provider', baseUrl: 'https://example.invalid', apiKey: 'synthetic-test-key' } : undefined, undefined,
        undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY, onTerminal: finish });
      expect(admission.error).toBeUndefined();
      await expect(terminal).resolves.toMatchObject({ status: 'complete' });
    }
    const active = store.getActiveSessionTranscript(agent.getSessionId())!;
    expect(active.writer.projection.messages.size).toBe(4);
    expect(await active.writer.flush(100)).toBe(false);
    expect(active.writer.status.state).not.toBe('healthy');
  });

  it('starts a frozen V2 fork without waiting for optional provider route repair', async () => {
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    // Existing fork snapshots can carry a pinned provider/model without the
    // newer concrete route. Execution resolves it before its metadata repair.
    const metadata = await store.createSession(workspace, {
      runtime: 'builtin', model: 'claude-sonnet-4-6', providerId: 'anthropic-sub',
      configSnapshotAt: new Date().toISOString(),
    });
    const active = store.getActiveSessionTranscript(metadata.id)!;
    let appendReleased = false;
    const appendBarrier = new Promise<void>(resolve => {
      releaseWrite = () => { appendReleased = true; resolve(); };
    });
    vi.spyOn(active.file, 'append').mockReturnValue(appendBarrier);
    expect(await active.writer.flush(20)).toBe(false);
    const config = await import('../utils/admin-config');
    expect(config.resolveWorkspaceConfig(workspace, metadata, { includeMcp: false }).providerRoute)
      .toMatchObject({ providerId: 'anthropic-sub', model: 'claude-sonnet-4-6' });
    const originalRepair = store.updateSessionMetadata;
    let pendingRepair: ReturnType<typeof originalRepair> | undefined;
    let repairSettled = false;
    const repair = vi.spyOn(store, 'updateSessionMetadata').mockImplementation((...args) => {
      const result = originalRepair(...args);
      if (args[0] === metadata.id && args[1].providerRoute) {
        pendingRepair = result;
        void result.then(() => { repairSettled = true; }, () => { repairSettled = true; });
      }
      return result;
    });
    // Prove dependency independence while storage stays blocked. A one-second
    // wall-clock race also measured unrelated startup scheduling under load;
    // the unchanged integration-test deadline still bounds a real deadlock.
    try {
      await agent.initializeAgent(workspace, null, metadata.id);
      let finish!: (outcome: TurnTerminalOutcome) => void;
      const terminal = new Promise<TurnTerminalOutcome>(resolve => { finish = resolve; });
      const admission = await agent.enqueueUserMessage('continue fork', [], undefined, undefined, undefined, undefined,
        undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY, onTerminal: finish });
      expect(admission.error).toBeUndefined();
      await expect(terminal).resolves.toMatchObject({ status: 'complete' });
      expect(appendReleased).toBe(false);
      expect(pendingRepair).toBeDefined();
      expect(repairSettled).toBe(false);
      expect(state.query).toHaveBeenCalledWith(expect.objectContaining({
        options: expect.objectContaining({ model: 'claude-sonnet-4-6' }),
      }));
      expect(repair).toHaveBeenCalledWith(metadata.id, expect.objectContaining({ providerRoute: expect.any(Object) }), expect.any(Function));
      expect(await active.writer.flush(20)).toBe(false);
    } finally {
      releaseWrite?.();
      await pendingRepair;
    }
  });

  it('preserves acknowledged queue order and exact materialized fork/rewind boundaries', async () => {
    state.queuedFollowup = true;
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, { runtime: 'builtin' });
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
    await agent.enqueueUserMessage('first question', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
    await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toBe('answer 2 full-only tail'));
    const rows = agent.getMessages();
    expect(rows.map(row => row.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(rows[1].sdkUuid).toBe('tail-frame-1');
    expect(rows[3].sdkUuid).toBe('tail-frame-2');
    expect(JSON.stringify(rows[1].content)).not.toContain('response-2');
    expect(rows[2]).toMatchObject({ content: 'queued question', sdkUuid: undefined });
    const active = store.getActiveSessionTranscript(metadata.id)!;
    expect(await active.writer.flush()).toBe(true);
    expect((await active.file.read()).projection.messages.get(rows[1].id)?.sdkUuid).toBe('tail-frame-1');
    await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
    const newSid = randomUUID();
    const sdkRows = rows.filter(row => row.sdkUuid).map(row => ({ type: row.role, uuid: row.sdkUuid! }));
    const sourcePrefix = sdkRows.slice(0, sdkRows.findIndex(row => row.uuid === 'tail-frame-1') + 1);
    state.sdkRead.mockImplementation(async (id: string) => id === newSid
      ? sourcePrefix.map(row => ({ ...row, uuid: `fork-${row.uuid}` })) : sdkRows);
    state.sdkFork.mockResolvedValue({ sessionId: newSid });
    active.patchMetadata({ configSnapshotAt: 'frozen', reasoningEffort: 'high', enabledPluginIds: ['synthetic-plugin'], enabledOfficialToolIds: ['image-understanding'] });
    const targetId = randomUUID();
    const forked = await agent.forkSession(rows[1].id, targetId);
    expect(forked.newSessionId).toBe(targetId);
    expect(await agent.forkSession(rows[1].id, targetId)).toMatchObject({ success: true, newSessionId: targetId });
    expect(state.sdkFork).toHaveBeenCalledOnce();
    expect(forked.success).toBe(true);
    const target = (await store.getSessionData(forked.newSessionId!))!;
    expect(target.messages.map(row => row.role)).toEqual(['user', 'assistant']);
    expect(state.sdkFork).toHaveBeenCalledWith(metadata.id, expect.objectContaining({ upToMessageId: 'tail-frame-1' }));
    expect(target.messages[1].sdkUuid).toBe('fork-tail-frame-1');
    expect(target.forkFrom).toBeUndefined();
    expect(target).toMatchObject({ reasoningEffort: 'high', enabledPluginIds: ['synthetic-plugin'], enabledOfficialToolIds: ['image-understanding'] });
    state.queuedFollowup = false;
    expect(await agent.rewindSession(rows[2].id)).toMatchObject({ success: true });
    expect(agent.getMessages().map(row => row.id)).toEqual(rows.slice(0, 2).map(row => row.id));
    await agent.enqueueUserMessage('after rewind', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
    await vi.waitFor(() => {
      expect(agent.isSessionBusy()).toBe(false);
      expect(agent.getMessages().at(-1)?.role).toBe('assistant');
    });
    expect(state.query).toHaveBeenCalledTimes(2);
    expect(state.query.mock.calls[1][0].options.resumeSessionAt).toBe('tail-frame-1');
    expect(await active.writer.flush()).toBe(true);
    expect([...((await active.file.read()).projection.messages.keys())]).toEqual(agent.getMessages().map(row => row.id));
  });

  it('keeps partial/full child content under its parent while the root reuses the same stream index', async () => {
    state.childFrames = true;
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, { runtime: 'builtin' });
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
    let finish!: (outcome: TurnTerminalOutcome) => void;
    const terminal = new Promise<TurnTerminalOutcome>(resolve => { finish = resolve; });
    await agent.enqueueUserMessage('question', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined,
      { channelDelivery: NO_CHANNEL_DELIVERY, onTerminal: finish });
    await expect(terminal).resolves.toMatchObject({ status: 'complete' });
    const blocks = agent.getMessages().flatMap(message => typeof message.content === 'string' ? [] : message.content);
    expect(blocks.filter(block => block.type === 'text').map(block => block.text)).toEqual(['answer 1', ' full-only tail']);
    expect(blocks.find(block => block.tool?.id === 'parent-1')?.tool?.subagentCalls).toMatchObject([
      { name: 'AgentMessage', result: 'child corrected', isLoading: false },
    ]);
    expect(blocks.find(block => block.tool?.id === 'parent-1')?.tool?.result).toBeUndefined();
    const active = store.getActiveSessionTranscript(metadata.id)!;
    expect(await active.writer.flush()).toBe(true);
    expect((await active.file.read()).projection.messages).toEqual(active.writer.projection.messages);
  });

  it('reads a local_bash raw receipt output before structured result rendering discards its path', async () => {
    state.protocolFrames = [
      { type: 'system', subtype: 'task_started', task_id: 'background-bash', run_id: 'run-1',
        tool_use_id: 'background-call', task_type: 'local_bash', description: 'isolated background job' },
      { type: 'user', tool_use_result: { stdout: '', stderr: '', backgroundTaskId: 'background-bash' },
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'background-call', content: '' }] } },
      { type: 'system', subtype: 'task_updated', task_id: 'background-bash', run_id: 'run-1', patch: { status: 'completed' } },
    ];
    let inspected = false;
    state.beforeFrame.mockImplementation(async frame => {
      if (frame.type === 'user' && frame.tool_use_result) {
        const output = join(state.home, frame.session_id, 'tasks', 'background-bash.output');
        await mkdir(join(state.home, frame.session_id, 'tasks'), { recursive: true });
        await writeFile(output, '真实隔离日志\n');
        frame.message.content[0].content = `Command running in background with ID: background-bash. Output is being written to: ${output}. You will be notified when it completes. To check interim output, use Read on that file path.`;
      }
      if (frame.subtype === 'task_updated') {
        const detail = await agent.getBuiltinBackgroundTaskDetail('background-call');
        expect(detail).toMatchObject({ success: true, task: { taskId: 'background-bash', status: 'running',
          taskType: 'local_bash', output: '真实隔离日志\n', outputState: 'ready' } });
        expect(JSON.stringify(detail)).not.toContain('.output');
        const progress = JSON.stringify(agent.getBuiltinWorkProgressSnapshot());
        expect(progress).not.toContain('.output');
        expect(progress).not.toContain('outputPath');
        inspected = true;
      }
    });
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, { runtime: 'builtin' });
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
    let finish!: (outcome: TurnTerminalOutcome) => void;
    const terminal = new Promise<TurnTerminalOutcome>(resolve => { finish = resolve; });
    await agent.enqueueUserMessage('question', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined,
      { channelDelivery: NO_CHANNEL_DELIVERY, onTerminal: finish });
    await expect(terminal).resolves.toMatchObject({ status: 'complete' });
    expect(inspected).toBe(true);
    expect(await agent.getBuiltinBackgroundTaskDetail('background-call')).toMatchObject({ success: true,
      task: { status: 'completed', output: '真实隔离日志\n' } });
  });

  it('settles each background execution and rejects the previous run after resume', async () => {
    const start = (run: string) => ({ type: 'system', subtype: 'task_started', task_id: 'agent', run_id: run, tool_use_id: `tool-${run}` });
    const updated = (run: string) => ({ type: 'system', subtype: 'task_updated', task_id: 'agent', run_id: run, patch: { status: 'completed' } });
    const notified = (run: string) => ({ type: 'system', subtype: 'task_notification', task_id: 'agent', run_id: run, status: 'completed', summary: `report ${run}` });
    state.protocolFrames = [start('run-1'), updated('run-1'), notified('run-1'), start('run-2'), notified('run-1'), updated('run-2'), notified('run-2')];
    state.beforeFrame.mockImplementation(frame => {
      if (frame.run_id === 'run-2' && frame.subtype === 'task_updated') {
        return import('../builtin-session/lifecycle').then(lifecycle => expect(lifecycle.hasQueryBackgroundTask(lifecycle.getQuerySession(), 'agent')).toBe(true));
      }
    });
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, { runtime: 'builtin' });
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
    let finish!: (outcome: TurnTerminalOutcome) => void;
    const terminal = new Promise<TurnTerminalOutcome>(resolve => { finish = resolve; });
    await agent.enqueueUserMessage('question', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined,
      { channelDelivery: NO_CHANNEL_DELIVERY, onTerminal: finish });
    await expect(terminal).resolves.toMatchObject({ status: 'complete' });
    const notifications = state.events.filter(([event]) => event === 'chat:task-notification').map(([, payload]) => payload);
    expect(notifications).toEqual([
      expect.objectContaining({ runId: 'run-1', toolUseId: 'tool-run-1', summary: '' }),
      expect.objectContaining({ runId: 'run-1', toolUseId: 'tool-run-1', summary: 'report run-1' }),
      expect.objectContaining({ runId: 'run-2', toolUseId: 'tool-run-2', summary: '' }),
      expect.objectContaining({ runId: 'run-2', toolUseId: 'tool-run-2', summary: 'report run-2' }),
    ]);
    const lifecycle = await import('../builtin-session/lifecycle');
    expect(lifecycle.hasQueryBackgroundTasks()).toBe(false);
  });

  it('projects replace-level background work through the builtin SessionEngine without treating ambient watchers as work', async () => {
    const frames = [
      { type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'agent', task_type: 'local_agent', description: '' }] },
      { type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'watch', task_type: 'monitor', description: '', ambient: true }] },
      { type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'bash', run_id: 'run-1', task_type: 'local_bash', description: '' }] },
      { type: 'system', subtype: 'background_tasks_changed', tasks: [] },
    ];
    state.protocolFrames = frames;
    const { createBuiltinSessionEngine } = await import('../session-engine/builtin-adapter');
    const engine = createBuiltinSessionEngine();
    state.beforeFrame.mockImplementation(frame => {
      const index = frames.indexOf(frame);
      if (index >= 0) {
        const expected = index === 1 || index === 3;
        expect(engine.getLiveSessionState().hasBackgroundWork).toBe(expected);
        // MoXBots recovery/model-switch guards and visible activity also honor
        // the SDK level before any task edge is received.
        expect(agent.hasBuiltinBackgroundWork()).toBe(expected);
        expect(engine.getLiveSessionState().backgroundWorkActive === true).toBe(expected);
        const live = engine.getLiveSessionState();
        // Every unacknowledged task blocks continuation, including a top-level
        // shell; only the shell may be acknowledged explicitly.
        expect(live.backgroundWorkBlocksContinuation).toBe(index === 0 || index === 2);
        expect(live.backgroundWork?.acknowledgeableShells.map(task => task.taskId))
          .toEqual(index === 2 ? ['bash'] : []);
        expect(live.backgroundWork?.active.map(task => task.taskId)).toEqual(
          index === 0 ? ['agent'] : index === 2 ? ['bash'] : [],
        );
      }
    });
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, { runtime: 'builtin' });
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
    let finish!: (outcome: TurnTerminalOutcome) => void;
    const terminal = new Promise<TurnTerminalOutcome>(resolve => { finish = resolve; });
    await agent.enqueueUserMessage('question', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined,
      { channelDelivery: NO_CHANNEL_DELIVERY, onTerminal: finish });
    await expect(terminal).resolves.toMatchObject({ status: 'complete' });
    expect(engine.getLiveSessionState().hasBackgroundWork).toBe(false);
  });

  it.each([
    [null, { structuredContentOmitted: true }],
    ['parent', { structuredContentOmitted: true }],
    [null, { detachedToolCall: true, content: [{ type: 'text', text: 'Readable result' }], structuredContent: { success: true } }],
    ['parent', { detachedToolCall: true, content: [{ type: 'text', text: 'Readable result' }], structuredContent: { success: true } }],
  ] as const)('waits for the actual detached tool result and retains readable text (parent=%s, output=%j)', async (parent, output) => {
    const completionEvent = parent ? 'chat:subagent-tool-result-complete' : 'chat:tool-result-complete';
    state.protocolFrames = [
      { type: 'assistant', parent_tool_use_id: parent, message: { id: 'fetch', role: 'assistant', model: 'test-model', content: [{ type: 'tool_use', id: 'fetch-tool', name: 'WebFetch', input: { url: 'https://example.invalid' } }] } },
      { type: 'user', parent_tool_use_id: parent, tool_use_result: { detachedToolCall: true }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'fetch-tool', content: 'Continuing in background' }] } },
      { type: 'user', parent_tool_use_id: parent, tool_use_result: output, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'fetch-tool', content: 'Readable result' }] } },
    ];
    state.beforeFrame.mockImplementation(frame => {
      if (frame.tool_use_result === output) expect(state.events.filter(([event]) => event === completionEvent)).toEqual([]);
    });
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, { runtime: 'builtin' });
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
    let finish!: (outcome: TurnTerminalOutcome) => void;
    const terminal = new Promise<TurnTerminalOutcome>(resolve => { finish = resolve; });
    await agent.enqueueUserMessage('question', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined,
      { channelDelivery: NO_CHANNEL_DELIVERY, onTerminal: finish });
    await expect(terminal).resolves.toMatchObject({ status: 'complete' });
    expect(state.events.filter(([event]) => event === completionEvent)).toEqual([
      [completionEvent, expect.objectContaining({ toolUseId: 'fetch-tool', content: expect.stringContaining('Readable result') })],
    ]);
  });

  it.each([null, 'parent'] as const)('retains typed native user tool errors in live and cold product history (parent=%s)', async parent => {
    const use = { type: 'tool_use', id: 'denied-tool', name: 'Bash', input: { command: 'synthetic' } };
    state.protocolFrames = [
      ...(parent ? [{ type: 'assistant', parent_tool_use_id: null, message: { id: 'parent-message', role: 'assistant', model: 'test-model', content: [
        { type: 'tool_use', id: parent, name: 'Agent', input: { description: 'synthetic child' } },
      ] } }] : []),
      { type: 'assistant', parent_tool_use_id: parent, message: { id: 'denied-message', role: 'assistant', model: 'test-model', content: [use] } },
      { type: 'user', parent_tool_use_id: parent, message: { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 'denied-tool', is_error: true, content: 'Synthetic hook refusal' },
      ] } },
    ];
    const workspace = join(state.home, 'workspace'); await mkdir(workspace);
    const metadata = await store.createSession(workspace, { runtime: 'builtin' });
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
    let finish!: (outcome: TurnTerminalOutcome) => void;
    const terminal = new Promise<TurnTerminalOutcome>(resolve => { finish = resolve; });
    await agent.enqueueUserMessage('question', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY, onTerminal: finish });
    await terminal;
    const event = parent ? 'chat:subagent-tool-result-complete' : 'chat:tool-result-complete';
    expect(state.events).toContainEqual([event, expect.objectContaining({ toolUseId: 'denied-tool', isError: true })]);
    const active = store.getActiveSessionTranscript(metadata.id)!;
    expect(await active.writer.flushForMutation()).toBe(true);
    const tools = [...active.writer.projection.messages.values()].flatMap(message => Array.isArray(message.content)
      ? message.content.flatMap(block => block.tool && typeof block.tool === 'object' && !Array.isArray(block.tool)
        ? [block.tool, ...(Array.isArray(block.tool.subagentCalls) ? block.tool.subagentCalls : [])] : []) : []);
    expect(tools).toContainEqual(expect.objectContaining({ id: 'denied-tool', isError: true }));
    const physical = await readFile(join(state.home, '.myagents', 'sessions-v2', `${metadata.id}.jsonl`), 'utf8');
    expect(physical).toContain('"isError":true');
  });

  it('publishes full-only tools and completes subsequent turns while attachment archiving is hung', async () => {
    state.toolFrames = true;
    state.media.mockImplementation(() => new Promise(resolve => { releaseWrite = () => resolve([]); }));
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, { runtime: 'builtin' });
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
    for (let turn = 1; turn <= 2; turn++) {
      let finish!: (outcome: TurnTerminalOutcome) => void;
      const terminal = new Promise<TurnTerminalOutcome>(resolve => { finish = resolve; });
      await agent.enqueueUserMessage(`question ${turn}`, [], undefined, undefined, undefined, undefined,
        undefined, undefined, undefined, undefined, undefined,
        { channelDelivery: NO_CHANNEL_DELIVERY, onTerminal: finish });
      await expect(terminal).resolves.toMatchObject({ status: 'complete' });
      expect(state.events).toContainEqual(['chat:tool-use-start', expect.objectContaining({ id: `tool-${turn}`, name: 'Read' })]);
      expect(state.events).toContainEqual(['chat:content-block-stop', expect.objectContaining({ toolId: `tool-${turn}`, input: { file_path: '/synthetic' } })]);
      expect(agent.getMessages().flatMap(message => typeof message.content === 'string' ? [] : message.content)).toContainEqual(expect.objectContaining({ tool: expect.objectContaining({ id: `tool-${turn}`, result: 'tool result' }) }));
    }
    expect(state.media).toHaveBeenCalledTimes(2);
  });

  it('settles an unexpected native exit without waiting for history IO', async () => {
    state.exitWithoutResult = true;
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, { runtime: 'builtin' });
    const active = store.getActiveSessionTranscript(metadata.id)!;
    vi.spyOn(active.file, 'append').mockRejectedValue(new Error('disk full'));
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
    let resolveTerminal!: (outcome: TurnTerminalOutcome) => void;
    const terminal = new Promise<TurnTerminalOutcome>(resolve => { resolveTerminal = resolve; });
    await agent.enqueueUserMessage('question', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined,
      { channelDelivery: NO_CHANNEL_DELIVERY, onTerminal: outcome => { resolveTerminal(outcome); } });
    await expect(terminal).resolves.toMatchObject({ status: 'error', error: 'AI runtime ended before completing this turn' });
    expect([...active.writer.projection.turns.values()]).toMatchObject([{ status: 'error', usage: { inputTokens: 4, outputTokens: 5 } }]);
    expect(agent.getMessages()[1].content).toMatchObject([
      { text: 'answer 1' }, { text: ' full-only tail' },
    ]);
    expect(agent.getMessages()[2]).toMatchObject({ messageKind: 'diagnostic',
      content: 'Error: AI runtime ended before completing this turn' });
  });

  it.each(['hung', 'full'] as const)('completes current and subsequent native turns with %s history IO', async failure => {
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    const metadata = await store.createSession(workspace, { runtime: 'builtin' });
    const active = store.getActiveSessionTranscript(metadata.id)!;
    if (failure === 'hung') vi.spyOn(active.file, 'append').mockImplementation(() => new Promise<void>(resolve => { releaseWrite = resolve; }));
    else vi.spyOn(active.file, 'append').mockRejectedValue(Object.assign(new Error('disk full'), { code: 'ENOSPC' }));
    expect(await active.writer.flush(20)).toBe(false);
    expect(active.file.append).toHaveBeenCalled();
    await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
    for (let turn = 1; turn <= 2; turn++) {
      let resolveTerminal!: (outcome: TurnTerminalOutcome) => void;
      const terminal = new Promise<TurnTerminalOutcome>(resolve => { resolveTerminal = resolve; });
      const result = await agent.enqueueUserMessage(`question ${turn}`, [], undefined, undefined, undefined, undefined,
        undefined, undefined, undefined, undefined, undefined,
        { channelDelivery: NO_CHANNEL_DELIVERY, onTerminal: outcome => { resolveTerminal(outcome); } });
      expect(result.error).toBeUndefined();
      const outcome = await Promise.race([terminal, new Promise<never>((_, reject) => {
        const timeout = setTimeout(() => reject(new Error('native turn waited for product storage')), 2_000);
        void terminal.finally(() => clearTimeout(timeout));
      })]);
      expect(outcome).toMatchObject({ status: 'complete' });
      expect(agent.getLastBuiltinAssistantText()).toBe(`answer ${turn} full-only tail`);
      expect(store.getSessionMetadata(metadata.id)).toMatchObject({ stats: { messageCount: turn, totalInputTokens: 4 * turn, totalOutputTokens: 5 * turn }, lastMessagePreview: `question ${turn}` });
    }
    expect(agent.getMessages().map(message => message.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect([...active.writer.projection.turns.values()].map(turn => turn.status)).toEqual(['complete', 'complete']);
    expect(state.events.some(([event]) => event === 'chat:agent-error')).toBe(false);
  });
});

  it('materializes a fork of an unstarted legacy lazy branch from its real source', async () => {
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    const source = await store.createSession(workspace, { runtime: 'builtin' });
    const { createSessionMetadata } = await import('../types/session');
    await mkdir(join(state.home, '.myagents'), { recursive: true });
    const branch = createSessionMetadata(workspace, { runtime: 'builtin', forkFrom: { sourceSessionId: source.id, messageUuid: 'native-a' } });
    await store.publishForkSession(branch, [
      { id: 'u', role: 'user', content: 'question', timestamp: 't', sdkUuid: 'native-u' },
      { id: 'a', role: 'assistant', content: 'answer', timestamp: 't', sdkUuid: 'native-a' },
    ], source.id);
    await agent.initializeAgent(workspace, null, branch.id, { preWarmDisabled: true });
    const newNative = randomUUID();
    state.sdkFork.mockResolvedValue({ sessionId: newNative });
    state.sdkRead.mockImplementation(async (id: string) => id === branch.id ? [] : [
      { type: 'user', uuid: id === newNative ? 'copy-u' : 'native-u' },
      { type: 'assistant', uuid: id === newNative ? 'copy-a' : 'native-a' },
    ]);
    const forked = await agent.forkSession('a');
    expect(forked.success).toBe(true);
    const target = store.getSessionMetadata(forked.newSessionId!)!;
    expect(target.forkFrom).toBeUndefined();
    expect(target.sdkSessionId).toBe(newNative);
    expect(state.sdkFork).toHaveBeenCalledWith(source.id, expect.objectContaining({ upToMessageId: 'native-a' }));
  });

  it('rewinds an unstarted legacy lazy branch using its real native source chain', async () => {
    const workspace = join(state.home, 'workspace');
    await mkdir(workspace);
    const source = await store.createSession(workspace, { runtime: 'builtin' });
    const { createSessionMetadata } = await import('../types/session');
    await mkdir(join(state.home, '.myagents'), { recursive: true });
    const branch = createSessionMetadata(workspace, {
      runtime: 'builtin',
      forkFrom: { sourceSessionId: source.id, messageUuid: 'native-a2' },
    });
    await store.publishForkSession(branch, [
      { id: 'u1', role: 'user', content: 'first', timestamp: 't', sdkUuid: 'native-u1' },
      { id: 'a1', role: 'assistant', content: 'first answer', timestamp: 't', sdkUuid: 'native-a1' },
      { id: 'u2', role: 'user', content: 'second', timestamp: 't', sdkUuid: 'native-u2' },
      { id: 'a2', role: 'assistant', content: 'second answer', timestamp: 't', sdkUuid: 'native-a2' },
    ], source.id);
    await agent.initializeAgent(workspace, null, branch.id, { preWarmDisabled: true });
    state.sdkRead.mockImplementation(async (id: string) => id === branch.id ? [] : [
      { type: 'user', uuid: 'native-u1' },
      { type: 'assistant', uuid: 'native-a1' },
      { type: 'user', uuid: 'native-u2' },
      { type: 'assistant', uuid: 'native-a2' },
    ]);

    expect(await agent.rewindSession('u2')).toMatchObject({ success: true });

    expect(agent.getMessages().map(message => message.id)).toEqual(['u1', 'a1']);
    expect(store.getSessionMetadata(branch.id)).toMatchObject({
      forkFrom: { sourceSessionId: source.id, messageUuid: 'native-a2' },
      sdkResumeSessionAt: 'native-a1',
    });
  });

it('preserves completed file restoration when later transcript persistence fails', async () => {
  const workspace = join(state.home, 'workspace');
  await mkdir(workspace);
  const metadata = await store.createSession(workspace, { runtime: 'builtin' });
  await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
  await agent.enqueueUserMessage('question', [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
  await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toBe('answer 1 full-only tail'));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  const transcript = await import('../builtin-session/transcript');
  const user = agent.getMessages()[0];
  transcript.bindSdkUuidToMessage(user, 'native-user');
  transcript.addCurrentSessionUuid('native-user');
  expect(await store.getActiveSessionTranscript(metadata.id)!.writer.flush()).toBe(true);
  const persistence = await import('../builtin-session/transcript-persistence');
  vi.spyOn(persistence, 'truncateTranscriptPersistenceForRewind').mockRejectedValue(new Error('injected persistence failure'));
  state.rewindFiles.mockResolvedValue({ canRewind: true, filesChanged: ['synthetic-file'] });
  const response = await agent.rewindSession(user.id);
  expect(state.rewindFiles).toHaveBeenCalledWith('native-user');
  expect(response.success).toBe(false);
  expect(response.fileRewindStatus).toBe('complete');
  expect(response.error).toContain('injected persistence failure');
});

it.each(['v1', 'v2'])('retries %s through the backend mutation owner and ordinary send admission', async format => {
  const workspace = join(state.home, 'workspace');
  await mkdir(workspace);
  const meta = format === 'v2' ? await store.createSession(workspace, { runtime: 'builtin' })
    : { id: randomUUID(), agentDir: workspace, title: 'legacy', createdAt: 't', lastActiveAt: 't', runtime: 'builtin' as const };
  if (format === 'v1') await store.saveSessionMetadata(meta);
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  const engine = (await import('../session-engine/builtin-adapter')).createBuiltinSessionEngine();
  const sent = await engine.sendDesktopMessage({ sessionId: meta.id, workspacePath: workspace, scenario: { type: 'desktop' }, text: 'original question' });
  expect(sent.success).toBe(true);
  await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toContain('answer 1'));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  const original = agent.getMessages().slice();
  const user = original[0];
  expect(await engine.retryUserMessage(user.id)).toMatchObject({ success: true, retryQueued: true, conversationCommitted: true });
  if (format === 'v1') expect(state.events).toContainEqual(['chat:messages-retracted', {
    messageIds: original.map(message => message.id), retractedStreamingTail: true,
  }]);
  await vi.waitFor(() => {
    expect(agent.getMessages()).toHaveLength(2);
    expect(agent.getMessages()[0].id).not.toBe(user.id);
    expect(agent.getMessages()[0].content).toBe('original question');
    expect(agent.isSessionBusy()).toBe(false);
  });
});

it('retains an exact rewind boundary across rejection and cold reopen', async () => {
  const workspace = join(state.home, 'workspace');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  state.queuedFollowup = true;
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  await agent.enqueueUserMessage('original', [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
  await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toBe('answer 2 full-only tail'));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  const target = agent.getMessages()[2].id;
  state.queuedFollowup = false;
  expect(await agent.rewindSession(target)).toMatchObject({ success: true });
  expect(await store.getActiveSessionTranscript(meta.id)!.writer.flushForMutation()).toBe(true);
  expect(store.getSessionMetadata(meta.id)?.sdkResumeSessionAt).toBe('tail-frame-1');
  await agent.resetSession();
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  state.query.mockImplementation(() => { throw new Error('No message found with message.uuid of: tail-frame-1'); });
  await agent.enqueueUserMessage('after reopen', [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
  await vi.waitFor(() => expect(state.query.mock.calls.at(-1)?.[0].options.resumeSessionAt).toBe('tail-frame-1'));
  await vi.waitFor(() => expect(state.events.some(([name]) => name === 'chat:message-error')).toBe(true));
  expect(agent.getMessages().some(message => message.role === 'user' && message.content === 'after reopen')).toBe(true);
  expect(store.getSessionMetadata(meta.id)?.sdkResumeSessionAt).toBe('tail-frame-1');
  expect(state.query.mock.calls.at(-1)?.[0].options.resume).toBe(meta.id);
});

it('does not treat a successful answer quoting a resume diagnostic as a native refusal', async () => {
  const workspace = join(state.home, 'quoted-diagnostic');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  const lifecycle = await import('../builtin-session/lifecycle');
  lifecycle.setPreWarmDisabled(false);
  state.query.mockImplementationOnce((args: Parameters<typeof fakeQuery>[0]) => {
    const query = fakeQuery(args);
    let completed = false;
    return { ...query, async next() {
      if (completed) return { done: true, value: undefined };
      const frame = await query.next();
      if (!frame.done && (frame.value as { type?: string }).type === 'result') {
        completed = true;
        return { done: false, value: { ...(frame.value as object), result: 'Example: No message found with message.uuid of: example-uuid' } };
      }
      return frame;
    } };
  });
  await agent.enqueueUserMessage('explain a diagnostic', [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
  await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toBe('answer 1 full-only tail'));
  await vi.waitFor(() => expect(state.query.mock.calls.length).toBe(2), { timeout: 2500 });
  expect(state.events.some(([name]) => name === 'chat:agent-error')).toBe(false);
});

it('recovers in an independent retained-prefix fork without reviving the discarded native tail', async () => {
  const workspace = join(state.home, 'boundary-fork');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  const snapshot = await store.loadSessionTranscript(meta.id);
  await store.appendSessionMessages(meta.id, snapshot.cursor, [
    { id: 'kept-u', role: 'user', content: 'requirements', timestamp: 't', sdkUuid: 'lost-native-user-stamp' },
    { id: 'kept-a', role: 'assistant', content: 'retained question', timestamp: 't', sdkUuid: 'native-question' },
    { id: 'failed-u', role: 'user', content: 'unsent answer', timestamp: 't' },
  ]);
  await store.updateSessionMetadata(meta.id, { sdkResumeSessionAt: 'native-question' });
  const forkSdkId = randomUUID();
  const nativePrefix = [{ type: 'user', uuid: 'native-u', message: { content: [{ type: 'text', text: 'requirements' }] } }, { type: 'assistant', uuid: 'native-question' }];
  state.sdkRead.mockImplementation(async (id: string) => id === forkSdkId
    ? nativePrefix.map(row => ({ ...row, uuid: `fork-${row.uuid}` }))
    : [...nativePrefix, { type: 'user', uuid: 'discarded-native-user' }]);
  state.sdkFork.mockResolvedValue({ sessionId: forkSdkId });
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  expect(await agent.forkSession('kept-a')).toMatchObject({ success: true, newSessionId: forkSdkId });
  expect(state.sdkFork).toHaveBeenCalledWith(meta.id, { dir: workspace, upToMessageId: 'native-question' });
  expect((await store.getSessionData(meta.id))!.messages.map(message => message.id))
    .toEqual(['kept-u', 'kept-a', 'failed-u']);
  expect(store.getSessionMetadata(forkSdkId)?.sdkResumeSessionAt).toBeUndefined();
  await agent.resetSession();
  await agent.initializeAgent(workspace, null, forkSdkId, { preWarmDisabled: true });
  state.rejectedResumeAt = 'fork-native-question';
  await agent.enqueueUserMessage('continue', [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
  await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toBe('answer 1 full-only tail'));
  expect(state.query.mock.calls.map(([args]) => args.options.resume)).toEqual([forkSdkId, forkSdkId]);
  expect(state.query.mock.calls.map(([args]) => args.options.resumeSessionAt)).toEqual(['fork-native-question', undefined]);
  expect(agent.getMessages().filter(message => message.content === 'continue')).toHaveLength(1);
  expect(agent.getMessages().some(message => message.content === 'unsent answer')).toBe(false);
  expect(store.getSessionMetadata(meta.id)?.sdkResumeSessionAt).toBe('native-question');
});

it.each(['result', 'throw'] as const)('stops automatic pre-warm after an exact native boundary rejection (%s)', async failure => {
  const workspace = join(state.home, 'rejected-boundary');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  await agent.enqueueUserMessage('original', [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
  await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toBe('answer 1 full-only tail'));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  await store.updateSessionMetadata(meta.id, { sdkResumeSessionAt: 'tail-frame-1' });
  await agent.resetSession();
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  const lifecycle = await import('../builtin-session/lifecycle');
  lifecycle.setPreWarmDisabled(false);
  const history = agent.getMessages().map(message => message.id);
  state.query.mockClear();
  if (failure === 'throw') state.query.mockImplementation(() => {
    throw new Error('No message found with message.uuid of: tail-frame-1');
  });
  else state.rejectedResumeAt = 'tail-frame-1';
  await agent.enqueueUserMessage('preserved retry', [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
  await vi.waitFor(() => expect(state.events.some(([name, payload]) =>
    (name === 'chat:agent-error' || name === 'chat:message-error')
      && JSON.stringify(payload).includes('会话恢复点已失效'))).toBe(true));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  // A real timer window proves the 500ms recovery scheduler does not relaunch.
  await new Promise(resolve => setTimeout(resolve, 1100));
  expect(state.query).toHaveBeenCalledTimes(1);
  expect(lifecycle.lifecycleState.preWarmTimer).toBeNull();
  expect(store.getSessionMetadata(meta.id)?.sdkResumeSessionAt).toBe('tail-frame-1');
  expect(agent.getMessages().slice(0, history.length).map(message => message.id)).toEqual(history);
  expect(agent.getMessages().some(message => message.content === 'preserved retry')).toBe(true);
});

it.each([
  ['v1', 'result', false], ['v2', 'result', false], ['v1', 'throw', false], ['v2', 'throw', false],
  ['v1', 'result', true], ['v2', 'throw', true],
] as const)('recovers a rejected derived reload anchor for %s (%s, no-pre-warm=%s) without repeating the user turn', async (format, failure, noPreWarm) => {
  const workspace = join(state.home, 'workspace');
  await mkdir(workspace);
  const id = randomUUID();
  if (format === 'v2') await store.createSession(workspace, { runtime: 'builtin', id });
  else await store.saveSessionMetadata({ id, agentDir: workspace, title: 'legacy', createdAt: 't', lastActiveAt: 't', runtime: 'builtin', sdkSessionId: id });
  const snapshot = await store.loadSessionTranscript(id);
  expect(await store.appendSessionMessages(id, snapshot.cursor, [
    { id: 'u1', role: 'user', content: 'prior', timestamp: 't', sdkUuid: 'native-user' },
    { id: 'a1', role: 'assistant', content: 'prior answer', timestamp: 't', sdkUuid: 'native-tail' },
  ])).toMatchObject({ ok: true });
  state.sdkRead.mockResolvedValue([{ type: 'user', uuid: 'native-user' }, { type: 'assistant', uuid: 'native-tail' }]);
  if (failure === 'result') state.rejectedResumeAt = 'native-tail';
  else state.query.mockImplementation((args: Parameters<typeof fakeQuery>[0]) => {
    if (args.options.resumeSessionAt === 'native-tail') {
      throw new Error('No message found with message.uuid of: native-tail');
    }
    return fakeQuery(args);
  });
  await agent.initializeAgent(workspace, null, id, { preWarmDisabled: true });
  if (!noPreWarm) (await import('../builtin-session/lifecycle')).setPreWarmDisabled(false);

  await agent.enqueueUserMessage('continue once', [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });

  await vi.waitFor(() => expect(state.query.mock.calls.some(([args]) =>
    args.options.resume === id && args.options.resumeSessionAt === undefined)).toBe(true));
  await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toContain('answer 1'));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  expect(state.query.mock.calls[0][0].options.resumeSessionAt).toBe('native-tail');
  expect(state.sdkInputs).toHaveLength(1);
  expect(agent.getMessages().filter(message => message.role === 'user' && message.content === 'continue once')).toHaveLength(1);
  expect(state.events.some(([name]) => name === 'chat:message-error')).toBe(false);
  expect(store.getSessionMetadata(id)?.sdkResumeSessionAt).toBeUndefined();
});

it.each(['complete', 'stop'] as const)('preserves admitted continuation ownership after native anchor rejection (%s)', async outcome => {
  const platform = await import('../utils/platform');
  vi.spyOn(platform, 'getCrossPlatformEnv').mockReturnValue({ home: state.home, user: 'synthetic', temp: tmpdir() });
  vi.spyOn(platform, 'getHomeDir').mockReturnValue(state.home);
  vi.spyOn(platform, 'getHomeDirOrNull').mockReturnValue(state.home);
  const workspace = join(state.home, 'continuation-workspace');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  const snapshot = await store.loadSessionTranscript(meta.id);
  expect(await store.appendSessionMessages(meta.id, snapshot.cursor, [
    { id: 'original-user', role: 'user', content: 'Original task', timestamp: 't', sdkUuid: 'native-user' },
    { id: 'original-assistant', role: 'assistant', content: 'Interrupted work', timestamp: 't', sdkUuid: 'native-tail' },
  ])).toMatchObject({ ok: true });
  state.sdkRead.mockResolvedValue([{ type: 'user', uuid: 'native-user' }, { type: 'assistant', uuid: 'native-tail' }]);
  state.rejectedResumeAt = 'native-tail';
  state.independentInputPump = true;
  rejectAnchorAfterAdmission = true;
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  const active = store.getActiveSessionTranscript(meta.id)!;
  active.writer.observe({ kind: 'turn-update', turn: {
    id: 'old-turn', rootUserMessageId: 'original-user', startedAt: 't', status: 'interrupted',
  } });
  await active.writer.flush();
  let releaseReplacement!: () => void;
  const replacementGate = new Promise<void>(resolve => { releaseReplacement = resolve; });
  releaseWrite = releaseReplacement;
  let replacementBlocked = false;
  if (outcome === 'stop') {
    state.beforeTurn.mockImplementation(async () => {
      if (state.sdkInputs.length === 1) {
        replacementBlocked = true;
        await replacementGate;
      }
    });
  }
  const engine = (await import('../session-engine/selector')).getSessionEngine();
  const request = { text: 'Explicit continuation', continueFromTurnId: 'old-turn', sessionId: meta.id,
    workspacePath: workspace, scenario: { type: 'desktop' as const } };
  expect(await engine.sendDesktopMessage(request)).toMatchObject({ success: true });

  if (outcome === 'stop') {
    await vi.waitFor(() => expect(replacementBlocked).toBe(true));
    const stopping = agent.interruptCurrentResponse();
    releaseReplacement();
    await expect(stopping).resolves.toBe(true);
    await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
    expect(state.sdkInputs).toHaveLength(1);
    expect(agent.getLastBuiltinAssistantText()).toBe('');
    return;
  }
  await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toContain('answer 1'));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  expect(state.query.mock.calls.map(([args]) => args.options.resumeSessionAt)).toEqual(['native-tail', undefined]);
  // The first transport consumed stdin but did no model/tool work. Only the
  // bare-resume transport produced an answer, and Product retains one root.
  expect(state.sdkInputs).toHaveLength(2);
  expect(agent.getMessages().filter(message => message.role === 'user' && message.content === request.text)).toHaveLength(1);
  expect(state.events.some(([name]) => name === 'queue:cancelled' || name === 'chat:message-error')).toBe(false);
  expect(await engine.sendDesktopMessage(request)).toMatchObject({ success: false, code: 'SESSION_CONTINUATION_STALE' });
});

it('pre-warm retries a rejected inferred anchor against the native head', async () => {
  const workspace = join(state.home, 'workspace');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  const snapshot = await store.loadSessionTranscript(meta.id);
  expect(await store.appendSessionMessages(meta.id, snapshot.cursor, [
    { id: 'u1', role: 'user', content: 'prior', timestamp: 't', sdkUuid: 'native-user' },
    { id: 'a1', role: 'assistant', content: 'prior answer', timestamp: 't', sdkUuid: 'native-tail' },
  ])).toMatchObject({ ok: true });
  state.sdkRead.mockResolvedValue([{ type: 'user', uuid: 'native-user' }, { type: 'assistant', uuid: 'native-tail' }]);
  state.rejectedResumeAt = 'native-tail';

  await agent.initializeAgent(workspace, null, meta.id);
  agent.setMcpServers([]);
  await vi.waitFor(() => {
    const calls = state.query.mock.calls.map(([args]) => args.options);
    const rejectedIndex = calls.findIndex(options => options.resume === meta.id && options.resumeSessionAt === 'native-tail');
    expect(rejectedIndex).toBeGreaterThanOrEqual(0);
    expect(calls.slice(rejectedIndex + 1).some(options =>
      options.resume === meta.id && options.resumeSessionAt === undefined)).toBe(true);
  }, { timeout: 3_000 });
  expect(state.events.some(([name]) => name === 'chat:message-error')).toBe(false);

  await agent.enqueueUserMessage('continue', [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
  await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toContain('answer 1'));
  expect(state.sdkInputs).toHaveLength(1);
});

it('preserves an IM turn across rejected inferred-anchor recovery', async () => {
  const workspace = join(state.home, 'workspace');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  const snapshot = await store.loadSessionTranscript(meta.id);
  expect(await store.appendSessionMessages(meta.id, snapshot.cursor, [
    { id: 'u1', role: 'user', content: 'prior', timestamp: 't', sdkUuid: 'native-user' },
    { id: 'a1', role: 'assistant', content: 'prior answer', timestamp: 't', sdkUuid: 'native-tail' },
  ])).toMatchObject({ ok: true });
  state.sdkRead.mockResolvedValue([{ type: 'user', uuid: 'native-user' }, { type: 'assistant', uuid: 'native-tail' }]);
  state.rejectedResumeAt = 'native-tail';
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  (await import('../builtin-session/lifecycle')).setPreWarmDisabled(false);

  const onTerminal = vi.fn<(outcome: TurnTerminalOutcome) => void>();
  const engine = (await import('../session-engine/builtin-adapter')).createBuiltinSessionEngine();
  expect(await engine.enqueueImMessage({ message: 'IM once', requestId: 'im-reload', sessionId: meta.id, workspacePath: workspace,
    scenario: { type: 'agent-channel', platform: 'feishu', sourceType: 'private' }, onTerminal })).toMatchObject({ success: true });

  await vi.waitFor(() => expect(state.query.mock.calls.some(([args]) =>
    args.options.resume === meta.id && args.options.resumeSessionAt === undefined)).toBe(true));
  await vi.waitFor(() => expect(state.sdkInputs).toHaveLength(1));
  await vi.waitFor(() => expect(onTerminal).toHaveBeenCalledTimes(1));
  expect(onTerminal.mock.calls[0][0]).toMatchObject({ status: 'complete' });
});

it('admits the replay before a desktop send arriving during rewind', async () => {
  const workspace = join(state.home, 'workspace');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  const engine = (await import('../session-engine/builtin-adapter')).createBuiltinSessionEngine();
  const request = (text: string) => ({ sessionId: meta.id, workspacePath: workspace, scenario: { type: 'desktop' as const }, text, turnBoundaryOnly: true });
  await engine.sendDesktopMessage(request('original'));
  await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toBe('answer 1 full-only tail'));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  const transcript = await import('../builtin-session/transcript');
  const user = agent.getMessages()[0];
  transcript.bindSdkUuidToMessage(user, 'native-user');
  transcript.addCurrentSessionUuid('native-user');
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  state.rewindFiles.mockImplementation(async () => { entered(); await gate; return { canRewind: true }; });
  const retry = engine.retryUserMessage(user.id);
  await started;
  const competitor = engine.sendDesktopMessage(request('competing send'));
  release();
  expect(await retry).toMatchObject({ success: true, retryQueued: true });
  expect(await competitor).toMatchObject({ success: true });
  await vi.waitFor(() => expect(agent.getMessages().filter(message => message.role === 'user').map(message => message.content)).toEqual(['original', 'competing send']));
});

it('publishes a rewound turn only after the native Query has materialized its selected head', async () => {
  const workspace = join(state.home, 'workspace');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  state.queuedFollowup = true;
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  const send = (text: string) => agent.enqueueUserMessage(text, [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
  await send('original');
  await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toBe('answer 2 full-only tail'));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  state.queuedFollowup = false;
  expect(await agent.rewindSession(agent.getMessages()[2].id)).toMatchObject({ success: true });
  expect(store.getSessionMetadata(meta.id)?.sdkResumeSessionAt).toBe('tail-frame-1');

  state.queryInputEnded = 0;
  state.queryExitGate = new Promise<void>(resolve => { releaseWrite = resolve; });
  const completionsBeforeReplacement = state.events.filter(([event]) => event === 'chat:message-complete').length;
  await send('replacement');
  await vi.waitFor(() => expect(state.queryInputEnded).toBe(1));

  // The native rows and SDK result already exist, but the Query has not yet
  // exited and published its durable branch selector.
  expect(store.getSessionMetadata(meta.id)?.sdkResumeSessionAt).toBe('tail-frame-1');
  expect(state.events.filter(([event]) => event === 'chat:message-complete')).toHaveLength(completionsBeforeReplacement);
  expect(agent.isSessionBusy()).toBe(true);

  releaseWrite!();
  releaseWrite = undefined;
  await vi.waitFor(() => expect(store.getSessionMetadata(meta.id)?.sdkResumeSessionAt).toBeUndefined());
  await vi.waitFor(() => expect(state.events.filter(([event]) => event === 'chat:message-complete'))
    .toHaveLength(completionsBeforeReplacement + 1));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
});

it('waits for rewound Query background tasks before materializing the selected head', async () => {
  const workspace = join(state.home, 'workspace');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  state.queuedFollowup = true;
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  const send = (text: string) => agent.enqueueUserMessage(text, [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
  await send('original');
  await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toBe('answer 2 full-only tail'));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  state.queuedFollowup = false;
  expect(await agent.rewindSession(agent.getMessages()[2].id)).toMatchObject({ success: true });

  state.queryInputEnded = 0;
  state.backgroundTask = true;
  state.independentInputPump = true;
  state.sdkInputs.length = 0;
  state.backgroundTaskGate = new Promise<void>(resolve => { releaseWrite = resolve; });
  const completionsBeforeReplacement = state.events.filter(([event]) => event === 'chat:message-complete').length;
  const resultsBeforeReplacement = state.beforeResult.mock.calls.length;
  await send('replacement');
  await vi.waitFor(() => expect(state.events.some(([event]) => event === 'chat:task-started')).toBe(true));
  await vi.waitFor(() => expect(state.beforeResult).toHaveBeenCalledTimes(resultsBeforeReplacement + 1));
  await vi.waitFor(() => expect(state.sdkInputs).toHaveLength(1));

  expect(state.queryInputEnded).toBe(0);
  expect(store.getSessionMetadata(meta.id)?.sdkResumeSessionAt).toBe('tail-frame-1');
  expect(state.events.filter(([event]) => event === 'chat:message-complete')).toHaveLength(completionsBeforeReplacement);

  const successor = send('successor after replacement');
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(state.sdkInputs).toHaveLength(1);

  state.backgroundTask = false;
  releaseWrite!();
  releaseWrite = undefined;
  await successor;
  await vi.waitFor(() => expect(state.queryInputEnded).toBe(1));
  await vi.waitFor(() => expect(store.getSessionMetadata(meta.id)?.sdkResumeSessionAt).toBeUndefined());
  await vi.waitFor(() => expect(state.events.filter(([event]) => event === 'chat:message-complete'))
    .toHaveLength(completionsBeforeReplacement + 1));
});

it('does not publish deferred rewind success when the Query is explicitly aborted', async () => {
  const workspace = join(state.home, 'workspace');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  state.queuedFollowup = true;
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  const send = (text: string) => agent.enqueueUserMessage(text, [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
  await send('original');
  await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toBe('answer 2 full-only tail'));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  state.queuedFollowup = false;
  expect(await agent.rewindSession(agent.getMessages()[2].id)).toMatchObject({ success: true });

  state.backgroundTask = true;
  state.backgroundTaskGate = new Promise<void>(() => {});
  state.interruptCloses = true;
  const completionsBeforeReplacement = state.events.filter(([event]) => event === 'chat:message-complete').length;
  const resultsBeforeReplacement = state.beforeResult.mock.calls.length;
  await send('replacement');
  await vi.waitFor(() => expect(state.events.some(([event]) => event === 'chat:task-started')).toBe(true));
  await vi.waitFor(() => expect(state.beforeResult).toHaveBeenCalledTimes(resultsBeforeReplacement + 1));

  await agent.resetSession();
  expect(store.getSessionMetadata(meta.id)?.sdkResumeSessionAt).toBe('tail-frame-1');
  expect(state.events.filter(([event]) => event === 'chat:message-complete')).toHaveLength(completionsBeforeReplacement);
});

it('retains the rewind boundary when native Query exit fails after a successful result', async () => {
  const workspace = join(state.home, 'workspace');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  state.queuedFollowup = true;
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  const send = (text: string) => agent.enqueueUserMessage(text, [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
  await send('original');
  await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toBe('answer 2 full-only tail'));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  state.queuedFollowup = false;
  expect(await agent.rewindSession(agent.getMessages()[2].id)).toMatchObject({ success: true });

  state.throwAfterInputEnd = true;
  const completionsBeforeReplacement = state.events.filter(([event]) => event === 'chat:message-complete').length;
  await send('replacement');
  await vi.waitFor(() => expect(state.events.some(([event]) => event === 'chat:message-error')).toBe(true));

  expect(store.getSessionMetadata(meta.id)?.sdkResumeSessionAt).toBe('tail-frame-1');
  expect(state.events.filter(([event]) => event === 'chat:message-complete')).toHaveLength(completionsBeforeReplacement);
});

it('retires a rewound Query after an SDK error result and lets a new Query recover the retained boundary', async () => {
  const workspace = join(state.home, 'workspace');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  state.queuedFollowup = true;
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  const send = (text: string) => agent.enqueueUserMessage(text, [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
  await send('original');
  await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toBe('answer 2 full-only tail'));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  state.queuedFollowup = false;
  expect(await agent.rewindSession(agent.getMessages()[2].id)).toMatchObject({ success: true });

  state.independentInputPump = true;
  state.sdkInputs.length = 0;
  state.queryInputEnded = 0;
  state.resultMode = 'error';
  await send('replacement fails');

  await vi.waitFor(() => expect(state.events.some(([event]) => event === 'chat:agent-error')).toBe(true));
  await vi.waitFor(() => expect(state.queryInputEnded).toBe(1));
  expect(store.getSessionMetadata(meta.id)?.sdkResumeSessionAt).toBe('tail-frame-1');
  expect(state.sdkInputs).toHaveLength(1);

  state.independentInputPump = false;
  state.resultMode = 'success';
  await send('replacement succeeds on a fresh Query');
  await vi.waitFor(() => expect(state.query).toHaveBeenCalledTimes(3));
  expect(state.query.mock.calls.at(-1)?.[0].options.resumeSessionAt).toBe('tail-frame-1');
  await vi.waitFor(() => expect(store.getSessionMetadata(meta.id)?.sdkResumeSessionAt).toBeUndefined());
});

it('settles the rewind boundary before a successful turn triggers a deferred restart', async () => {
  const workspace = join(state.home, 'workspace');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  state.queuedFollowup = true;
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: false });
  const send = (text: string) => agent.enqueueUserMessage(text, [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
  await send('original');
  await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toBe('answer 2 full-only tail'));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  state.queuedFollowup = false;
  expect(await agent.rewindSession(agent.getMessages()[2].id)).toMatchObject({ success: true });
  state.beforeResult.mockImplementationOnce(() => agent.setSessionReasoningEffort('high'));
  await send('replacement');
  await vi.waitFor(() => expect(state.beforeResult).toHaveBeenCalledTimes(3));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  expect(store.getSessionMetadata(meta.id)?.sdkResumeSessionAt).toBeUndefined();
  await vi.waitFor(() => expect(state.query).toHaveBeenCalledTimes(3));
  expect(state.query.mock.calls[2][0].options.resumeSessionAt).toBeUndefined();
  await vi.waitFor(() => expect(agent.getMessages().filter(message => message.role === 'user').map(message => message.content))
    .toEqual(['original', 'replacement']));
});

it.each([false, true])('retries past an independent product diagnostic with cold restore=%s', async coldRestore => {
  const workspace = join(state.home, 'diagnostic-retry');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  const rows = [
    { id: 'u1', role: 'user' as const, content: 'confirmed input', timestamp: 't', sdkUuid: 'native-u1' },
    { id: 'd1', role: 'assistant' as const, content: 'Error: process exited', timestamp: 't', messageKind: 'diagnostic' as const },
    { id: 'u2', role: 'user' as const, content: 'send again', timestamp: 't' },
  ];
  const snapshot = await store.loadSessionTranscript(meta.id);
  expect(await store.appendSessionMessages(meta.id, snapshot.cursor, rows)).toMatchObject({ ok: true });
  if (coldRestore) await store.releaseSessionTranscriptForBinding(meta.id);
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  const replay = vi.fn(async () => {
    expect(agent.getMessages().map(row => row.id)).toEqual(['u1', 'd1']);
    const result = await agent.enqueueUserMessage('send again', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
    return { success: true as const, queued: result.queued };
  });
  expect(await agent.retryBuiltinUserMessage('u2', replay)).toMatchObject({ success: true });
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  expect(replay).toHaveBeenCalledTimes(1);
  expect(state.query.mock.calls.at(-1)?.[0].options.resumeSessionAt).toBe('native-u1');
  expect(agent.getMessages()[1]).toMatchObject({ id: 'd1', messageKind: 'diagnostic' });
});

it('does not promote a queued consumption id into a native rewind anchor', async () => {
  const workspace = join(state.home, 'queue-anchor');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  state.queuedFollowup = true;
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  await agent.enqueueUserMessage('original', [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
  await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toBe('answer 2 full-only tail'));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  expect(agent.getMessages().find(message => message.content === 'queued question')).toMatchObject({ role: 'user', sdkUuid: undefined });
  expect(store.getSessionMetadata(meta.id)?.sdkResumeSessionAt).toBeUndefined();
});

it.each(['unconfirmed-user', 'partial-assistant', 'legacy-error', 'conflicting-diagnostic', 'runtime-anchor'] as const)(
  'refuses retry past %s without truncating history or replaying', async shape => {
    const workspace = join(state.home, shape);
    await mkdir(workspace);
    const meta = await store.createSession(workspace, { runtime: 'builtin' });
    const unknown = shape === 'unconfirmed-user'
      ? { id: 'unknown', role: 'user' as const, content: 'not acknowledged', timestamp: 't' }
      : { id: 'unknown', role: 'assistant' as const, content: shape === 'legacy-error' ? 'Error: old error' : 'partial', timestamp: 't',
        ...(shape === 'conflicting-diagnostic' ? { messageKind: 'diagnostic' as const, sdkUuid: 'conflict' } : {}) };
    if (shape === 'runtime-anchor') Object.assign(unknown, { messageKind: 'diagnostic',
      runtimeTurnAnchor: { turnId: 'native-turn', rootUserMessageId: 'u1' } });
    const rows = [
      { id: 'u1', role: 'user' as const, content: 'confirmed', timestamp: 't', sdkUuid: 'native-u1' },
      unknown,
      { id: 'd1', role: 'assistant' as const, content: 'Error: failed', timestamp: 't', messageKind: 'diagnostic' as const },
      { id: 'u2', role: 'user' as const, content: 'retry me', timestamp: 't' },
    ];
    const snapshot = await store.loadSessionTranscript(meta.id);
    expect(await store.appendSessionMessages(meta.id, snapshot.cursor, rows)).toMatchObject({ ok: true });
    await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
    const replay = vi.fn(async () => ({ success: true as const }));
    const before = agent.getMessages();
    expect(await agent.retryBuiltinUserMessage('u2', replay)).toMatchObject({ success: false,
      error: 'The retained history has no exact native rewind boundary' });
    expect(agent.getMessages()).toEqual(before);
    expect(replay).not.toHaveBeenCalled();
    expect(state.rewindFiles).not.toHaveBeenCalled();
    expect(state.query).not.toHaveBeenCalled();
    expect(store.getSessionMetadata(meta.id)?.sdkResumeSessionAt).toBeUndefined();
  });

it('retains a diagnostic-only product prefix while starting a new native execution', async () => {
  const workspace = join(state.home, 'diagnostic-only');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  const snapshot = await store.loadSessionTranscript(meta.id);
  expect(await store.appendSessionMessages(meta.id, snapshot.cursor, [
    { id: 'd', role: 'assistant', content: 'Error: local diagnostic', timestamp: 't', messageKind: 'diagnostic' },
    { id: 'u', role: 'user', content: 'question', timestamp: 't' },
  ])).toMatchObject({ ok: true });
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  expect(await agent.rewindSession('u')).toMatchObject({ success: true });
  expect(agent.getMessages()).toMatchObject([{ id: 'd', messageKind: 'diagnostic' }]);
  expect(store.getSessionMetadata(meta.id)?.sdkSessionId).not.toBe(meta.id);
  expect(store.getSessionMetadata(meta.id)?.sdkResumeSessionAt).toBeUndefined();
});

it('refuses a diagnostic fork point even if its source contract carries a conflicting native UUID', async () => {
  const workspace = join(state.home, 'diagnostic-fork-conflict');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  const snapshot = await store.loadSessionTranscript(meta.id);
  expect(await store.appendSessionMessages(meta.id, snapshot.cursor, [
    { id: 'd', role: 'assistant', content: 'Error: failed', timestamp: 't', messageKind: 'diagnostic', sdkUuid: 'conflict' },
  ])).toMatchObject({ ok: true });
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  expect(await agent.forkSession('d')).toMatchObject({ success: false, error: 'This message has no exact native fork boundary' });
  expect(state.sdkFork).not.toHaveBeenCalled();
});

it('preserves diagnostics through native fork and cold retry using remapped user UUIDs', async () => {
  const workspace = join(state.home, 'diagnostic-fork');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  const snapshot = await store.loadSessionTranscript(meta.id);
  expect(await store.appendSessionMessages(meta.id, snapshot.cursor, [
    { id: 'u1', role: 'user', content: 'one', timestamp: 't', sdkUuid: 'native-u1' },
    { id: 'd', role: 'assistant', content: 'Error: failed', timestamp: 't', messageKind: 'diagnostic' },
    { id: 'u2', role: 'user', content: 'two', timestamp: 't', sdkUuid: 'native-u2' },
    { id: 'a2', role: 'assistant', content: 'answer', timestamp: 't', sdkUuid: 'native-a2' },
  ])).toMatchObject({ ok: true });
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  expect(await agent.forkSession('d')).toMatchObject({ success: false });
  expect(state.sdkFork).not.toHaveBeenCalled();
  const nativeFork = randomUUID();
  state.sdkRead.mockImplementation(async (id: string) => [
    { type: 'user', uuid: `${id === nativeFork ? 'fork-' : ''}native-u1` },
    { type: 'user', uuid: `${id === nativeFork ? 'fork-' : ''}native-u2` },
    { type: 'assistant', uuid: `${id === nativeFork ? 'fork-' : ''}native-a2` },
  ]);
  state.sdkFork.mockResolvedValue({ sessionId: nativeFork });
  const fork = await agent.forkSession('a2');
  expect(fork).toMatchObject({ success: true });
  const forkData = (await store.getSessionData(fork.newSessionId!))!;
  expect(forkData.messages[1]).toMatchObject({ id: 'd', messageKind: 'diagnostic' });
  expect(forkData.messages[1].sdkUuid).toBeUndefined();
  await agent.resetSession();
  await agent.initializeAgent(workspace, null, fork.newSessionId!, { preWarmDisabled: true });
  expect(await agent.retryBuiltinUserMessage('u2', async () => ({ success: true }))).toMatchObject({ success: true });
  expect(agent.getMessages().map(row => row.id)).toEqual(['u1', 'd']);
  expect(store.getSessionMetadata(fork.newSessionId!)?.sdkResumeSessionAt).toBe('fork-native-u1');
});

it.each(['iterator-close', 'transport-error'] as const)(
  'keeps an unexpected %s separate from output and can send the next query', async exit => {
  state.exitWithoutResult = exit === 'iterator-close';
  if (exit === 'transport-error') state.query.mockImplementationOnce((args: Parameters<typeof fakeQuery>[0]) => {
    const query = fakeQuery(args);
    return { ...query, async next() {
      const frame = await query.next();
      if ((frame.value as { type?: string } | undefined)?.type === 'result') {
        throw new Error('Claude Code process exited with code 1. stderr: [claude-code:unrecognized_model] {"model":"kimi-k3","query_source":"sdk"}');
      }
      return frame;
    } };
  });
  const workspace = join(state.home, 'diagnostic-output');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  const send = async (text: string) => {
    let finish!: (outcome: TurnTerminalOutcome) => void;
    const terminal = new Promise<TurnTerminalOutcome>(resolve => { finish = resolve; });
    await agent.enqueueUserMessage(text, [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY, onTerminal: finish });
    return terminal;
  };
  expect(await send('first')).toMatchObject({ status: 'error' });
  const rows = agent.getMessages();
  expect(rows).toHaveLength(3);
  expect(rows[1]).toMatchObject({ sdkUuid: 'tail-frame-1', usage: { inputTokens: 4, outputTokens: 5 } });
  expect(JSON.stringify(rows[1].content)).not.toContain('Error:');
  expect(rows[2]).toMatchObject({ role: 'assistant', messageKind: 'diagnostic', content: expect.stringContaining('Error:') });
  expect(rows[2].sdkUuid).toBeUndefined();
  expect(rows[2].usage).toBeUndefined();
  expect(rows[2].turnId).toBe(rows[1].turnId);
  state.exitWithoutResult = false;
  await vi.waitFor(() => expect(agent.isSessionActive()).toBe(false));
  expect(await send('second')).toMatchObject({ status: 'complete' });
  expect(agent.getBuiltinSessionCompletionTerminal()?.status).toBe('complete');
  expect(state.query).toHaveBeenCalledTimes(2);
});

it('keeps the native local command assistant UUID as an exact retry boundary', async () => {
  state.query.mockImplementation((args: Parameters<typeof fakeQuery>[0]) => {
    const query = fakeQuery(args);
    return { ...query, async next() {
      const frame = await query.next();
      const value = frame.value as { type?: string } | undefined;
      return value?.type === 'assistant'
        ? { ...frame, value: { ...value, local_command_source: 'context' } } : frame;
    } };
  });
  const workspace = join(state.home, 'native-local-command');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  for (const text of ['/context', 'next question']) {
    let finish!: (outcome: TurnTerminalOutcome) => void;
    const terminal = new Promise<TurnTerminalOutcome>(resolve => { finish = resolve; });
    await agent.enqueueUserMessage(text, [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined,
      { channelDelivery: NO_CHANNEL_DELIVERY, onTerminal: finish });
    await expect(terminal).resolves.toMatchObject({ status: 'complete' });
  }
  const rows = agent.getMessages();
  expect(rows[1]).toMatchObject({ sdkUuid: 'tail-frame-1' });
  expect(rows[1].messageKind).toBeUndefined();
  expect(await agent.retryBuiltinUserMessage(rows[2].id, async () => ({ success: true })))
    .toMatchObject({ success: true });
  expect(store.getSessionMetadata(meta.id)?.sdkResumeSessionAt).toBe('tail-frame-1');
});

it.each([false, true])('keeps the immediate native user boundary with an earlier assistant=%s', async earlierAssistant => {
  const workspace = join(state.home, 'workspace');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  const prefix = earlierAssistant ? [
    { id: 'u1', role: 'user' as const, content: 'one', timestamp: 't', sdkUuid: 'native-u1' },
    { id: 'a1', role: 'assistant' as const, content: 'one answer', timestamp: 't', sdkUuid: 'native-a1' },
  ] : [];
  const rows = [...prefix,
    { id: 'u2', role: 'user' as const, content: 'unanswered retained user', timestamp: 't', sdkUuid: 'native-u2' },
    { id: 'u3', role: 'user' as const, content: 'discard', timestamp: 't', sdkUuid: 'native-u3' },
    { id: 'a3', role: 'assistant' as const, content: 'discard answer', timestamp: 't', sdkUuid: 'native-a3' },
  ];
  const snapshot = await store.loadSessionTranscript(meta.id);
  expect(await store.appendSessionMessages(meta.id, snapshot.cursor, rows)).toMatchObject({ ok: true });
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: true });
  expect(await agent.rewindSession('u3')).toMatchObject({ success: true });
  expect(agent.getMessages().map(row => row.id)).toEqual([...prefix.map(row => row.id), 'u2']);
  expect(store.getSessionMetadata(meta.id)).toMatchObject({ sdkSessionId: meta.id, sdkResumeSessionAt: 'native-u2' });
});

async function startSdkContractSession(): Promise<Options> {
  const workspace = join(state.home, 'sdk-contract');
  await mkdir(workspace);
  const metadata = await store.createSession(workspace, { runtime: 'builtin' });
  await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
  await agent.enqueueUserMessage('contract question', [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
  await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toBe('answer 1 full-only tail'));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  return state.query.mock.calls.findLast(([call]) => call.options.cwd === workspace)![0].options as Options;
}

it.each([
  ['v1', 'late-exit'], ['v1', 'successor-error'],
  ['v2', 'late-exit'], ['v2', 'successor-error'],
  ['v1', 'replacement-startup-error'], ['v2', 'replacement-startup-error'],
] as const)('attributes SDK failures to the current turn after Stop (%s, %s)', async (format, mode) => {
  let releaseResult!: () => void;
  const resultGate = new Promise<void>(resolve => { releaseResult = resolve; });
  releaseWrite = releaseResult;
  let resultWaiting = false;
  state.beforeResult.mockImplementation(async (result: { terminal_reason?: string }) => {
    resultWaiting = true;
    await resultGate;
    result.terminal_reason = 'aborted_streaming';
  });
  const workspace = join(state.home, 'stop-late-exit');
  await mkdir(workspace);
  const metadata = format === 'v2' ? await store.createSession(workspace, { runtime: 'builtin' })
    : { id: randomUUID(), agentDir: workspace, title: 'legacy', createdAt: 't', lastActiveAt: 't', runtime: 'builtin' as const };
  if (format === 'v1') await store.saveSessionMetadata(metadata);
  await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
  const send = (text: string) => agent.enqueueUserMessage(text, [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
  await send('A');
  await vi.waitFor(() => expect(resultWaiting).toBe(true));
  const aSource = (await import('../builtin-session/turn')).getCurrentTurnSourceItem()!;
  const finishQueued = vi.fn();
  if (mode === 'replacement-startup-error') {
    // B is already admitted to the turn-boundary queue. Recovery launches its
    // replacement Query without another enqueue/reset of A's stopped terminal.
    await agent.enqueueUserMessage('B', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined,
      { channelDelivery: NO_CHANNEL_DELIVERY, fromDesktopChatSend: true, queueResponseModeOverride: 'turn', onTerminal: finishQueued });
    state.query.mockImplementation(args => {
      const replacement = fakeQuery(args);
      replacement.next = async () => {
        // One failing recovery launch is sufficient; don't start background
        // pre-warm retries after the assertion's target has ended.
        (await import('../builtin-session/lifecycle')).setPreWarmDisabled(true);
        throw new Error('real replacement startup failure');
      };
      return replacement;
    });
    (await import('../builtin-session/lifecycle')).setPreWarmDisabled(false);
  }
  const stop = agent.interruptCurrentResponse();
  if (mode !== 'successor-error') {
    state.exitWithoutResult = true;
    state.throwAfterInputEnd = true;
  }
  releaseResult();
  await stop;
  if (mode !== 'replacement-startup-error') await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  if (mode !== 'successor-error') {
    const lifecycle = await import('../builtin-session/lifecycle');
    await vi.waitFor(() => expect(lifecycle.getQuerySession()).toBeNull());
    if (mode === 'replacement-startup-error') {
      await vi.waitFor(() => expect(state.events.some(([event, data]) => event === 'chat:message-error'
        && JSON.stringify(data).includes('real replacement startup failure'))).toBe(true));
      const failure = state.events.find(([event, data]) => event === 'chat:message-error'
        && JSON.stringify(data).includes('real replacement startup failure'))![1];
      expect(failure).toBe('real replacement startup failure');
      expect(agent.getBuiltinSessionCompletionTerminal()).toMatchObject({ status: 'stopped', turnId: aSource.id });
      expect(finishQueued).toHaveBeenCalledTimes(1);
      expect(finishQueued.mock.calls[0][0]).toMatchObject({ status: 'stopped' });
    } else {
      expect(state.events.filter(([event]) => event === 'chat:message-error')).toEqual([]);
      expect(agent.getBuiltinSessionCompletionTerminal()?.status).toBe('stopped');
    }
  } else {
    state.beforeResult.mockImplementation(() => { throw new Error('real successor transport failure'); });
    await send('B');
    await vi.waitFor(() => expect(agent.getBuiltinSessionCompletionTerminal()?.status).toBe('error'));
    expect(state.events.some(([event, data]) => event === 'chat:message-error'
      && JSON.stringify(data).includes('real successor transport failure'))).toBe(true);
  }
  const settledTurns = format === 'v2'
    ? [...store.getActiveSessionTranscript(metadata.id)!.writer.projection.turns.values()]
    : null;
  await store.drainSessionTranscripts();
  const restored = await store.loadSessionTranscript(metadata.id);
  expect(JSON.stringify(restored)).not.toContain('unrecognized_model');
  if (mode === 'replacement-startup-error') {
    expect(JSON.stringify(restored)).not.toContain('real replacement startup failure');
    if (format === 'v2') {
      expect(settledTurns)
        .toEqual([expect.objectContaining({ status: 'stopped' })]);
    }
  }
});

it('persists SDK cumulative usage as per-turn deltas across a Query restart', async () => {
  state.sdkCumulativeBase = { input: 0, output: 0 };
  const workspace = join(state.home, 'usage');
  await mkdir(workspace);
  const metadata = await store.createSession(workspace, { runtime: 'builtin' });
  await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
  const send = async (text: string) => {
    await agent.enqueueUserMessage(text, [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
    await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  };

  await send('first');
  await send('second');
  let assistants = agent.getMessages().filter(message => message.role === 'assistant');
  expect(assistants.map(message => message.usage?.inputTokens)).toEqual([4, 4]);
  expect(assistants.map(message => message.usage?.outputTokens)).toEqual([5, 5]);
  expect(assistants[1].usage?.sdkCumulativeModelUsage?.['test-model']).toMatchObject({ inputTokens: 8, outputTokens: 10 });

  await agent.resetSession();
  state.sdkCumulativeBase = { input: 8, output: 10 };
  await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
  await send('after restart');
  assistants = agent.getMessages().filter(message => message.role === 'assistant');
  expect(state.query.mock.calls.at(-1)?.[0].options.resume).toBe(metadata.id);
  expect(assistants.map(message => message.usage?.inputTokens)).toEqual([4, 4, 4]);
  expect(assistants[2].usage?.sdkCumulativeModelUsage?.['test-model']).toMatchObject({ inputTokens: 12, outputTokens: 15 });
});

it('resumes usage from a compact control turn that has no assistant message', async () => {
  state.sdkCumulativeBase = { input: 0, output: 0 };
  state.compactAtTurn = 2;
  const workspace = join(state.home, 'compact-usage');
  await mkdir(workspace);
  const metadata = await store.createSession(workspace, { runtime: 'builtin' });
  await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
  const send = async (text: string) => {
    await agent.enqueueUserMessage(text, [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
    await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  };

  await send('first');
  await send('/compact');
  expect(agent.getMessages().filter(message => message.role === 'assistant')).toHaveLength(1);
  const turns = [...store.getActiveSessionTranscript(metadata.id)!.writer.projection.turns.values()];
  expect(turns.at(-1)?.usage?.sdkCumulativeModelUsage?.['test-model']).toMatchObject({ inputTokens: 8, outputTokens: 5 });
  expect(await store.getActiveSessionTranscript(metadata.id)!.writer.flush()).toBe(true);

  await agent.resetSession();
  state.sdkCumulativeBase = { input: 8, output: 5 };
  state.compactAtTurn = null;
  await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
  expect([...store.getActiveSessionTranscript(metadata.id)!.writer.projection.turns.values()].at(-1)
    ?.usage?.sdkCumulativeModelUsage?.['test-model']).toMatchObject({ inputTokens: 8, outputTokens: 5 });
  await send('after compact');
  const assistants = agent.getMessages().filter(message => message.role === 'assistant');
  expect(assistants.map(message => message.usage?.inputTokens)).toEqual([4, 4]);
  expect(assistants[1].usage?.sdkCumulativeModelUsage?.['test-model']).toMatchObject({ inputTokens: 12, outputTokens: 10 });
});

it('persists an SDK conversation reset baseline through a Query restart', async () => {
  state.sdkCumulativeBase = { input: 0, output: 0 };
  state.resetAtTurn = 2;
  const workspace = join(state.home, 'reset-usage');
  await mkdir(workspace);
  const metadata = await store.createSession(workspace, { runtime: 'builtin' });
  await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
  const send = async (text: string) => {
    await agent.enqueueUserMessage(text, [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
    await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  };

  await send('first');
  await send('/clear');
  const active = store.getActiveSessionTranscript(metadata.id)!;
  expect([...active.writer.projection.turns.values()].at(-1)?.usage?.sdkCumulativeModelUsage).toEqual({});
  expect(await active.writer.flush()).toBe(true);

  await agent.resetSession();
  state.sdkCumulativeBase = { input: 10, output: 10 };
  state.resetAtTurn = null;
  await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
  await send('after reset');
  const assistant = agent.getMessages().filter(message => message.role === 'assistant').at(-1);
  expect(assistant?.usage).toMatchObject({ inputTokens: 14, outputTokens: 15 });
});

it('shows the built-in slash command when the SDK returns a same-name plugin command first', async () => {
  state.sdkCommands = [
    { name: 'compact', description: 'Plugin compact', argumentHint: '', builtin: false },
    { name: 'Compact', description: 'Claude compact', argumentHint: '', builtin: true },
  ];
  await startSdkContractSession();
  const commandEvent = state.events.find(([event, payload]) =>
    event === 'chat:slash-commands' && (payload as { source?: string }).source === 'initialize');
  expect(commandEvent?.[1]).toMatchObject({
    commands: [{ name: 'Compact', description: 'Claude compact', source: 'sdk' }],
  });
});

it('keeps product append fresh and coalesced notification receipts outside product terminal handling', async () => {
  notificationReceipts = true;
  const options = await startSdkContractSession();
  expect(options.systemPrompt).toMatchObject({ type: 'preset', snapshot: false, append: expect.any(String) });
  expect(state.events.filter(([event]) => event === 'chat:message-error')).toEqual([]);
  expect(state.events.filter(([event]) => event === 'chat:message-complete')).toHaveLength(1);
  expect(agent.getMessages().map(message => message.role)).toEqual(['user', 'assistant']);
  expect(agent.getLastBuiltinAssistantText()).toBe('answer 1 full-only tail');
});

it('keeps constrained permissions per request through replay, approval, cascade and abort', async () => {
  const options = await startSdkContractSession();
  (await import('../builtin-session/config')).configState.currentPermissionMode = 'custom';
  const ask = options.canUseTool!;
  const controller = new AbortController();
  const hints = { defaultToNo: true, suppressAlwaysAllowRule: true };
  const first = ask('WebFetch', { url: 'https://example.invalid/first' }, { signal: controller.signal, toolUseID: 'first', requestId: 'first', ...hints });
  const second = ask('WebFetch', { url: 'https://example.invalid/second' }, { signal: controller.signal, toolUseID: 'second', requestId: 'second', ...hints });
  const plain = ask('WebFetch', {}, { signal: controller.signal, toolUseID: 'plain', requestId: 'plain' });
  const pending = () => agent.getPendingInteractiveRequests().filter(row => row.type === 'permission:request')
    .map(row => row.data as { requestId: string; defaultToNo?: boolean; suppressAlwaysAllowRule?: boolean });
  expect(pending()).toHaveLength(3);
  const [p1, p2, p3] = pending();
  expect(p1).toMatchObject(hints);
  expect(state.events.find(([event]) => event === 'permission:request')?.[1]).toMatchObject(hints);
  expect(agent.handlePermissionResponse(p1.requestId, 'always_allow')).toBe(false);
  expect(pending()).toHaveLength(3);
  expect(agent.handlePermissionResponse(p3.requestId, 'always_allow')).toBe(true);
  await expect(plain).resolves.toMatchObject({ behavior: 'allow' });
  expect(pending()).toHaveLength(2); // ordinary grant cannot cascade onto restricted calls
  expect(agent.handlePermissionResponse(p1.requestId, 'allow_once')).toBe(true);
  await expect(first).resolves.toMatchObject({ behavior: 'allow' });
  expect(pending().map(row => row.requestId)).toEqual([p2.requestId]);
  const rejected = expect(second).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await rejected;
  expect(pending()).toHaveLength(0);
  expect(agent.handlePermissionResponse(p2.requestId, 'allow_once')).toBe(false);
  const againController = new AbortController();
  const again = ask('WebFetch', {}, { signal: againController.signal, toolUseID: 'again', requestId: 'again', ...hints });
  expect(pending()).toHaveLength(1); // an existing broad session grant cannot swallow the hints
  const aborted = expect(again).rejects.toMatchObject({ name: 'AbortError' });
  againController.abort();
  await aborted;
});

it('checks context MCP provenance in foreground, bypass hooks and background grants', async () => {
  const options = await startSdkContractSession();
  const { configState } = await import('../builtin-session/config');
  configState.frozenSdkMcpFingerprint = 'im-bridge-tools|';
  configState.currentPermissionMode = 'custom';
  const toolName = 'mcp__im-bridge-tools__send';
  const ask = (source?: string) => options.canUseTool!(toolName, {}, {
    signal: new AbortController().signal, toolUseID: 'mcp-call', requestId: 'mcp-call',
    ...(source ? { mcpServer: { name: 'im-bridge-tools', source } } : {}),
  });
  await expect(ask('sdk')).resolves.toMatchObject({ behavior: 'allow' });
  for (const source of ['plugin', 'project', 'dynamic', 'unknown', undefined]) {
    await expect(ask(source)).resolves.toMatchObject({ behavior: 'deny' });
  }
  const pre = options.hooks!.PreToolUse![0].hooks[0];
  const base = { hook_event_name: 'PreToolUse' as const, session_id: agent.getSessionId(), transcript_path: '', cwd: '',
    tool_name: toolName, tool_input: {}, tool_use_id: 'mcp-call', permission_mode: 'bypassPermissions' };
  expect(await pre({ ...base, mcp_server: { name: 'im-bridge-tools', source: 'plugin' } }, undefined,
    { signal: new AbortController().signal })).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
  configState.frozenSdkMcpFingerprint = '';
  await expect(ask('sdk')).resolves.toMatchObject({ behavior: 'deny' });

  const { recordQueryBackgroundTask } = await import('../builtin-session/lifecycle');
  recordQueryBackgroundTask(state.query.mock.results[state.query.mock.calls.findIndex(([call]) => call.options === options)]!.value, 'background-agent', {});
  configState.currentMcpServers = null;
  const userTool = 'mcp__example__write';
  const grant = options.canUseTool!(userTool, {}, { signal: new AbortController().signal,
    toolUseID: 'grant', requestId: 'grant', mcpServer: { name: 'example', source: 'dynamic' } });
  const request = agent.getPendingInteractiveRequests().find(row => row.type === 'permission:request')!.data as { requestId: string };
  expect(agent.handlePermissionResponse(request.requestId, 'always_allow')).toBe(true);
  await expect(grant).resolves.toMatchObject({ behavior: 'allow' });
  const background = options.hooks!.PermissionRequest![0].hooks[0];
  const checkBackground = (source: string) => background({ hook_event_name: 'PermissionRequest',
    session_id: agent.getSessionId(), transcript_path: '', cwd: '', agent_id: 'background-agent',
    tool_name: userTool, tool_input: {}, mcp_server: { name: 'example', source } }, undefined,
  { signal: new AbortController().signal });
  await expect(checkBackground('dynamic')).resolves.toMatchObject({ hookSpecificOutput: { decision: { behavior: 'allow' } } });
  await expect(checkBackground('plugin')).resolves.toMatchObject({ hookSpecificOutput: { decision: { behavior: 'deny' } } });
  configState.currentMcpServers = [];
  await expect(checkBackground('dynamic')).resolves.toMatchObject({ hookSpecificOutput: { decision: { behavior: 'deny' } } });
});


it.each(['defaultToNo', 'suppressAlwaysAllowRule'] as const)('honors %s on product CLI calls without removing ordinary auto-approval', async hint => {
  const options = await startSdkContractSession();
  (await import('../builtin-session/config')).configState.currentPermissionMode = 'custom';
  const input = { command: "myagents record create 'note'" };
  const base = { signal: new AbortController().signal, toolUseID: 'record', requestId: 'record' };
  await expect(options.canUseTool!('Bash', input, base)).resolves.toMatchObject({ behavior: 'allow' });
  const restricted = options.canUseTool!('Bash', input, { ...base, [hint]: true });
  const pending = agent.getPendingInteractiveRequests().find(row => row.type === 'permission:request')!;
  expect(pending.data).toMatchObject({ [hint]: true });
  expect(agent.handlePermissionResponse((pending.data as { requestId: string }).requestId, 'deny')).toBe(true);
  await expect(restricted).resolves.toMatchObject({ behavior: 'deny' });
});

it('keeps plugin MCP enablement separate from user MCP selection without granting builtin trust', async () => {
  const options = await startSdkContractSession();
  const { configState } = await import('../builtin-session/config');
  configState.currentMcpServers = [];
  configState.currentPermissionMode = 'fullAgency';
  const toolName = 'mcp__plugin_example__write';
  const mcpServer = { name: 'plugin_example', source: 'plugin' };
  const signal = new AbortController().signal;
  const pre = options.hooks!.PreToolUse![0].hooks[0];
  const base = { hook_event_name: 'PreToolUse' as const, session_id: agent.getSessionId(), transcript_path: '', cwd: '',
    tool_name: toolName, tool_input: {}, tool_use_id: 'plugin-call', permission_mode: 'bypassPermissions' };
  expect(await pre({ ...base, mcp_server: mcpServer }, undefined, { signal })).toEqual({});
  const args = { signal, toolUseID: 'plugin-call', requestId: 'plugin-call', mcpServer };
  await expect(options.canUseTool!(toolName, {}, args)).resolves.toMatchObject({ behavior: 'allow' });
  expect(await pre({ ...base, mcp_server: { ...mcpServer, source: 'dynamic' } }, undefined, { signal }))
    .toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
  configState.currentPermissionMode = 'custom';
  const restricted = options.canUseTool!(toolName, {}, args);
  const pending = agent.getPendingInteractiveRequests().find(row => row.type === 'permission:request')!;
  expect(pending).toBeDefined();
  agent.handlePermissionResponse((pending.data as { requestId: string }).requestId, 'deny');
  await expect(restricted).resolves.toMatchObject({ behavior: 'deny' });
  expect(await pre({ ...base, permission_mode: 'plan', mcp_server: mcpServer }, undefined, { signal }))
    .toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
});

it.each(['stop', 'success', 'error'] as const)('keeps successor %s independent of a delayed force-send receipt through the real SDK loop', async nextOutcome => {
  const frames: unknown[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  let resolveClosed!: () => void;
  const closedPromise = new Promise<void>(resolve => { resolveClosed = resolve; });
  const received: unknown[] = [];
  let releaseReceipt!: (receipt: { still_queued: string[] }) => void;
  const delayedReceipt = new Promise<{ still_queued: string[] }>(resolve => { releaseReceipt = resolve; });
  const interrupt = vi.fn(() => delayedReceipt);
  const close = vi.fn(() => { closed = true; resolveClosed(); wake?.(); });
  releaseWrite = () => { releaseReceipt({ still_queued: [] }); close(); };
  const emit = (...messages: unknown[]) => { frames.push(...messages); wake?.(); };
  state.query.mockImplementation((args: { prompt: AsyncIterable<unknown>; options: { sessionId: string } }) => {
    const prompt = args.prompt[Symbol.asyncIterator]();
    // Transport consumes input independently of delivering result/control frames,
    // like the SDK streaming protocol. No external provider or credentials.
    void (async () => {
      while (!closed) {
        const next = await Promise.race([prompt.next(), closedPromise.then(() => ({ done: true as const, value: undefined }))]);
        if (next.done) break;
        received.push(next.value);
      }
    })();
    emit({ type: 'system', subtype: 'init', session_id: args.options.sessionId, uuid: randomUUID(),
      model: 'test-model', tools: [], mcp_servers: [] });
    return {
      async next() {
        while (!closed && !frames.length) await new Promise<void>(resolve => { wake = resolve; });
        return closed ? { done: true, value: undefined } : { done: false, value: frames.shift() };
      },
      [Symbol.asyncIterator]() { return this; },
      initializationResult: async () => ({ commands: [] }), interrupt, close,
      mcpServerStatus: async () => [], setModel: async () => undefined,
      setPermissionMode: async () => undefined, setMcpServers: async () => undefined,
    };
  });
  const workspace = join(state.home, 'workspace');
  await mkdir(workspace);
  const metadata = await store.createSession(workspace, { runtime: 'builtin' });
  await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
  const send = (text: string) => agent.enqueueUserMessage(text, [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined,
    { channelDelivery: NO_CHANNEL_DELIVERY, queueResponseModeOverride: 'realtime' });
  const assistant = (text: string) => ({ type: 'assistant', session_id: metadata.id,
    parent_tool_use_id: null, uuid: randomUUID(), message: { id: randomUUID(), role: 'assistant', model: 'test-model',
      content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 } } });
  const result = (reason: string, error = false) => ({ type: 'result', session_id: metadata.id, uuid: randomUUID(),
    subtype: error ? 'error_during_execution' : 'success', is_error: error, terminal_reason: reason,
    ...(error ? { errors: ['synthetic provider failure'] } : { result: 'answer' }),
    duration_ms: 1, duration_api_ms: 1, num_turns: 1, total_cost_usd: 0,
    usage: { input_tokens: 1, output_tokens: 1 }, permission_denials: [] });
  await send('A');
  await vi.waitFor(() => expect(received).toHaveLength(1));
  emit(assistant('A partial'));
  await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toBe('A partial'));
  const b = await send('B');
  await vi.waitFor(() => expect(received).toHaveLength(2));
  const force = agent.forceExecuteQueueItem(b.queueId!);
  expect(interrupt).toHaveBeenCalledTimes(1);
  emit(result('aborted_streaming'));
  await vi.waitFor(() => expect(state.events.some(([event, data]) => event === 'queue:started'
    && (data as { queueId?: string }).queueId === b.queueId)).toBe(true));
  await force;
  expect(agent.isSessionBusy()).toBe(true);
  const eventsAfterA = state.events.length;
  emit(assistant('B answer'));
  await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toBe('B answer'));
  if (nextOutcome === 'stop') {
    const stop = agent.interruptCurrentResponse();
    expect(interrupt).toHaveBeenCalledTimes(2);
    emit(result('aborted_streaming'));
    await stop;
  } else {
    emit(result(nextOutcome === 'error' ? 'error_during_execution' : 'completed', nextOutcome === 'error'));
  }
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  await store.drainSessionTranscripts();
  const bEvents = state.events.slice(eventsAfterA);
  if (nextOutcome === 'error') {
    expect(bEvents.some(([event]) => event === 'chat:agent-error')).toBe(true);
  }
  if (nextOutcome !== 'stop') {
    expect(bEvents.some(([event]) => event === 'chat:message-stopped')).toBe(false);
  }
  expect(agent.getBuiltinSessionCompletionTerminal()?.status).toBe(nextOutcome === 'stop' ? 'stopped' : nextOutcome === 'error' ? 'error' : 'complete');
  releaseReceipt({ still_queued: [] });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(close).not.toHaveBeenCalled();
});


it('consumes recovered queued input and the next direct input after a capabilities restart (#648)', async () => {
  const platform = await import('../utils/platform');
  vi.spyOn(platform, 'getCrossPlatformEnv').mockReturnValue({ home: state.home, user: 'synthetic', temp: tmpdir() });
  vi.spyOn(platform, 'getHomeDir').mockReturnValue(state.home);
  vi.spyOn(platform, 'getHomeDirOrNull').mockReturnValue(state.home);
  const diagnostic = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const workspace = join(state.home, 'restart-workspace');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  state.independentInputPump = true;
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: false });
  const send = (text: string) => agent.enqueueUserMessage(text, [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY, queueResponseModeOverride: 'turn' });
  state.beforeResult.mockImplementationOnce(async () => {
    const skill = join(workspace, '.claude', 'skills', 'synthetic-restart');
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, 'SKILL.md'), '---\nname: synthetic-restart\ndescription: Isolated restart fixture\n---\nSynthetic instructions.\n');
    agent.syncProjectUserConfig(workspace);
    expect(await send('recovered synthetic input')).toMatchObject({ queued: true });
  });
  await send('initial synthetic input');
  await vi.waitFor(() => expect(state.beforeResult).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  expect(state.query).toHaveBeenCalledTimes(2);
  await send('direct synthetic input');
  await vi.waitFor(() => expect(state.beforeResult).toHaveBeenCalledTimes(3));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  expect(state.query).toHaveBeenCalledTimes(2);
  expect(agent.getMessages().filter(row => row.role === 'user').map(row => row.content))
    .toEqual(['initial synthetic input', 'recovered synthetic input', 'direct synthetic input']);
  const traces = diagnostic.mock.calls.filter(([prefix]) => prefix === '[builtin-input]')
    .map(([, payload]) => JSON.parse(payload as string) as Record<string, unknown>);
  expect(traces.filter(row => row.phase === 'sdk-yield')).toHaveLength(3);
  expect(traces.some(row => row.phase === 'terminal-ready')).toBe(true);
  expect(new Set(traces.filter(row => row.phase === 'sdk-yield').map(row => row.inputGeneration)).size).toBe(2);
  const traceText = JSON.stringify(traces);
  expect(traceText).not.toContain('synthetic input');
  expect(traceText).not.toContain(workspace);
  expect(traces.every(row => Object.values(row).every(value => value === null || ['string', 'number', 'boolean'].includes(typeof value)))).toBe(true);
});


it.each([false, true])('keeps a recovered realtime root running when force races its native acknowledgement (earlyHuman=%s)', async earlyHuman => {
  const platform = await import('../utils/platform');
  vi.spyOn(platform, 'getCrossPlatformEnv').mockReturnValue({ home: state.home, user: 'synthetic', temp: tmpdir() });
  vi.spyOn(platform, 'getHomeDir').mockReturnValue(state.home);
  vi.spyOn(platform, 'getHomeDirOrNull').mockReturnValue(state.home);
  const workspace = join(state.home, 'recovered-realtime-root');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  state.independentInputPump = true;
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: false });
  const send = (text: string) => agent.enqueueUserMessage(text, [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY, queueResponseModeOverride: 'realtime',
      surfaceUserBeforeDispatch: earlyHuman,
      beforeDispatch: earlyHuman ? async () => {
        expect(agent.getMessages().filter(row => row.role === 'user').at(-1)?.content).toBe(text);
        const stored = [...store.getActiveSessionTranscript(meta.id)!.writer.projection.messages.values()];
        expect(stored.filter(row => row.role === 'user').at(-1)?.content).toBe(text);
        return { accepted: true };
      } : undefined });
  let releaseFrame!: () => void;
  const frameGate = new Promise<void>(resolve => { releaseFrame = resolve; });
  let recoveredQueueId: string | undefined;
  let restartAt = 0;
  state.beforeFrame.mockImplementation(async () => {
    if (state.query.mock.calls.length === 2) await frameGate;
  });
  state.beforeResult.mockImplementationOnce(async () => {
    const skill = join(workspace, '.claude', 'skills', 'synthetic-restart');
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, 'SKILL.md'), '---\nname: synthetic-restart\ndescription: Isolated restart fixture\n---\nSynthetic instructions.\n');
    agent.syncProjectUserConfig(workspace);
    const turn = await import('../builtin-session/turn');
    turn.setCurrentTurnStartTime(Date.now() - 60_000);
    restartAt = Date.now();
    const queued = await send('recovered realtime input');
    expect(queued).toMatchObject({ queued: true });
    recoveredQueueId = queued.queueId;
  });
  try {
    await send('initial synthetic input');
    await vi.waitFor(() => expect(state.sdkInputs).toHaveLength(2));
    const turn = await import('../builtin-session/turn');
    const lifecycle = await import('../builtin-session/lifecycle');
    const interrupt = vi.spyOn(lifecycle.getQuerySession()!, 'interrupt');
    expect(turn.peekPendingOutputOwner()?.queueId).toBe(recoveredQueueId);
    expect(agent.getAgentState().sessionState).toBe('running');
    expect(turn.getCurrentTurnStartTime()).toBeGreaterThanOrEqual(restartAt);
    expect(state.events.filter(([event, payload]) => event === 'queue:started'
      && (payload as { queueId?: string }).queueId === recoveredQueueId)).toEqual([
      ['queue:started', expect.objectContaining({ queueId: recoveredQueueId })],
    ]);
    expect(agent.getMessages().filter(row => row.role === 'user').map(row => row.content))
      .toEqual(['initial synthetic input', 'recovered realtime input']);
    await expect(agent.forceExecuteQueueItem(recoveredQueueId!)).resolves.toBe(true);
    await expect(agent.forceExecuteQueueItem(recoveredQueueId!)).resolves.toBe(true);
    expect(interrupt).not.toHaveBeenCalled();
    expect(state.sdkInputs).toHaveLength(2);
  } finally {
    releaseFrame();
  }
  await vi.waitFor(() => expect(state.beforeResult).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  expect(agent.getBuiltinSessionCompletionTerminal()?.status).toBe('complete');
  expect(state.sdkInputs).toHaveLength(2);
  expect(agent.getMessages().filter(row => row.role === 'user')).toHaveLength(2);
  await store.drainSessionTranscripts();
  const { readTranscriptFile } = await import('./file');
  const stored = await readTranscriptFile(join(state.home, '.myagents', 'sessions-v2', `${meta.id}.jsonl`), meta.id);
  expect([...stored.projection.messages.values()].filter(row => row.role === 'user').map(row => row.content))
    .toEqual(['initial synthetic input', 'recovered realtime input']);
});

it.each(['direct', 'queued', 'rejected'] as const)('records human input before its execution guard without persisting runtime context (%s)', async mode => {
  const workspace = join(state.home, 'input-card-order');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  state.independentInputPump = true;
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: false });
  const original = '继续执行';
  const reminder = '<system-reminder><SESSION_EXECUTION>Private execution context</SESSION_EXECUTION></system-reminder>';
  const terminal = vi.fn();
  const guard = vi.fn(async () => {
    const user = agent.getMessages().filter(row => row.role === 'user').at(-1);
    expect(user?.content).toBe(original);
    const stored = [...store.getActiveSessionTranscript(meta.id)!.writer.projection.messages.values()];
    expect(stored.filter(row => row.role === 'user').at(-1)?.content).toBe(original);
    const visibleEvent = state.events.find(([name, data]) =>
      (name === 'chat:message-replay' && (data as { message?: { content?: string } }).message?.content === original)
      || (name === 'queue:started' && (data as { userMessage?: { content?: string } }).userMessage?.content === original));
    expect(visibleEvent).toBeDefined();
    return mode === 'rejected' ? { accepted: false, error: 'fixture-blocked' } : { accepted: true };
  });
  const send = () => agent.enqueueUserMessage(original, [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY,
      beforeDispatch: guard, surfaceUserBeforeDispatch: true, runtimeReminder: reminder,
      queueResponseModeOverride: 'turn', onTerminal: terminal });
  if (mode === 'queued') {
    state.beforeResult.mockImplementationOnce(async () => { expect(await send()).toMatchObject({ queued: true }); });
    await agent.enqueueUserMessage('Previous request', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY });
  } else await send();
  await vi.waitFor(() => expect(terminal).toHaveBeenCalledOnce());
  expect(guard).toHaveBeenCalledOnce();
  expect(agent.getMessages().filter(row => row.role === 'user' && row.content === original)).toHaveLength(1);
  expect(JSON.stringify(agent.getMessages())).not.toContain('Private execution context');
  if (mode === 'rejected') expect(state.sdkInputs).toHaveLength(0);
  else expect(JSON.stringify(state.sdkInputs)).toContain('Private execution context');
});

it('rechecks background work after awaited materialization, before SDK yield', async () => {
  const workspace = join(state.home, 'commit-background-work');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  state.independentInputPump = true;
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: false });
  const lifecycle = await import('../builtin-session/lifecycle');
  const claim = store.claimPreparedSessionForTurnAdmission;
  vi.spyOn(store, 'claimPreparedSessionForTurnAdmission').mockImplementation(async (...args) => {
    const result = await claim(...args);
    lifecycle.replaceQueryBackgroundActivity(lifecycle.getQuerySession()!, [
      { task_id: 'late-background', task_type: 'local_agent', description: 'still working' },
    ]);
    return result;
  });
  const terminal = vi.fn();
  const rollback = vi.fn(async () => {});
  const beforeDispatch = async () => ({ accepted: true, validateAtCommit: () =>
    lifecycle.hasQueryBackgroundWork()
      ? { accepted: false, code: 'goal_work_pending', rollbackBeforeReject: rollback() }
      : { accepted: true },
  });
  await agent.enqueueUserMessage('deferred continuation', [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY, beforeDispatch, onTerminal: terminal });
  await vi.waitFor(() => expect(terminal).toHaveBeenCalledOnce());
  expect(state.sdkInputs).toHaveLength(0);
  expect(rollback).toHaveBeenCalledOnce();
  expect(terminal).toHaveBeenCalledWith(expect.objectContaining({ status: 'stopped' }));
});

it.each((['interrupted', 'error'] as const).flatMap(status => ['success', 'late-completion', 'double-click'].map(mode => ({ status, mode }))))('checks explicit $status continuation at the actual builtin commit boundary ($mode)', async ({ status, mode }) => {
  const platform = await import('../utils/platform');
  vi.spyOn(platform, 'getCrossPlatformEnv').mockReturnValue({ home: state.home, user: 'synthetic', temp: tmpdir() });
  vi.spyOn(platform, 'getHomeDir').mockReturnValue(state.home);
  vi.spyOn(platform, 'getHomeDirOrNull').mockReturnValue(state.home);
  const workspace = join(state.home, 'continuation-workspace');
  await mkdir(workspace, { recursive: true });
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  state.independentInputPump = true;
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: false });
  const active = store.getActiveSessionTranscript(meta.id)!;
  active.writer.observe({ kind: 'message-create', message: { id: 'original-user', role: 'user', content: 'Original task', timestamp: 't' } });
  active.writer.observe({ kind: 'message-create', message: { id: 'partial-result', role: 'assistant', content: 'Saved tool result', timestamp: 't', turnId: 'old-turn', transcriptState: 'interrupted', sdkUuid: 'native-partial' } });
  active.writer.observe({ kind: 'turn-update', turn: { id: 'old-turn', rootUserMessageId: 'original-user', startedAt: 't', status } });
  await active.writer.flush();
  if (mode === 'late-completion') {
    const claim = store.claimPreparedSessionForTurnAdmission;
    vi.spyOn(store, 'claimPreparedSessionForTurnAdmission').mockImplementation(async (...args) => {
      const result = await claim(...args);
      active.writer.observe({ kind: 'turn-update', turn: { id: 'old-turn', rootUserMessageId: 'original-user', startedAt: 't', status: 'complete' } });
      return result;
    });
  }
  const engine = (await import('../session-engine/selector')).getSessionEngine();
  const { SESSION_CONTINUATION_PROMPT } = await import('../../shared/sessionContinuation');
  const send = () => engine.sendDesktopMessage({ text: SESSION_CONTINUATION_PROMPT,
    continueFromTurnId: 'old-turn', sessionId: meta.id, workspacePath: workspace,
    scenario: { type: 'desktop' } });
  const results = await Promise.all(mode === 'double-click' ? [send(), send()] : [send()]);
  const result = results.find(receipt => receipt.success) ?? results[0];
  if (mode === 'late-completion') {
    expect(result).toMatchObject({ success: false, code: 'SESSION_CONTINUATION_STALE' });
    expect(state.sdkInputs).toHaveLength(0);
    expect([...active.writer.projection.messages.values()].filter(message => message.role === 'user').map(message => message.content)).toEqual(['Original task']);
  } else {
    expect(result.success).toBe(true);
    expect(results.filter(receipt => receipt.success)).toHaveLength(1);
    await vi.waitFor(() => expect(state.sdkInputs).toHaveLength(1));
    expect([...active.writer.projection.messages.values()].filter(message => message.role === 'user').map(message => message.content)).toEqual(['Original task', SESSION_CONTINUATION_PROMPT]);
    expect(active.writer.projection.messages.get('partial-result')).toMatchObject({ content: 'Saved tool result', sdkUuid: 'native-partial' });
    expect(JSON.stringify(state.sdkInputs[0])).toContain(SESSION_CONTINUATION_PROMPT);
    const repeated = await engine.sendDesktopMessage({ text: 'Explicit continuation',
      continueFromTurnId: 'old-turn', sessionId: meta.id, workspacePath: workspace,
      scenario: { type: 'desktop' } });
    expect(repeated).toMatchObject({ success: false, code: 'SESSION_CONTINUATION_STALE' });
    expect(state.sdkInputs).toHaveLength(1);
  }
});

it.each([false, true])('acknowledges Stop of promoted local input without yielding it to the SDK (#648; early-human=%s)', async surfaceUserBeforeDispatch => {
  const platform = await import('../utils/platform');
  vi.spyOn(platform, 'getCrossPlatformEnv').mockReturnValue({ home: state.home, user: 'synthetic', temp: tmpdir() });
  vi.spyOn(platform, 'getHomeDir').mockReturnValue(state.home);
  vi.spyOn(platform, 'getHomeDirOrNull').mockReturnValue(state.home);
  const workspace = join(state.home, 'promotion-workspace');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  state.independentInputPump = true;
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: false });
  let release!: (result: { accepted: true }) => void;
  const gate = new Promise<{ accepted: true }>(resolve => { release = resolve; });
  releaseWrite = () => release({ accepted: true });
  const beforeDispatch = Object.assign(vi.fn(() => gate), { cancel: vi.fn(async () => { release({ accepted: true }); }) });
  const terminal = vi.fn();
  const send = agent.enqueueUserMessage('cancelled synthetic input', [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY, beforeDispatch, onTerminal: terminal, surfaceUserBeforeDispatch });
  await vi.waitFor(() => expect(beforeDispatch).toHaveBeenCalledOnce());
  await expect(agent.interruptCurrentResponse()).resolves.toBe(true);
  await send;
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  expect(state.sdkInputs).toHaveLength(0);
  expect(state.beforeResult).not.toHaveBeenCalled();
  expect(state.query).toHaveBeenCalledOnce();
  expect(terminal).toHaveBeenCalledOnce();
  expect(terminal).toHaveBeenCalledWith(expect.objectContaining({ status: 'stopped' }));
  expect(agent.getMessages().filter(row => row.role === 'user' && row.content === 'cancelled synthetic input'))
    .toHaveLength(surfaceUserBeforeDispatch ? 1 : 0);
});


it.each(['capabilities', 'provider-draining'] as const)('does not resurrect cancelled promoted input after %s requeue (#648 review)', async reason => {
  const platform = await import('../utils/platform');
  vi.spyOn(platform, 'getCrossPlatformEnv').mockReturnValue({ home: state.home, user: 'synthetic', temp: tmpdir() });
  vi.spyOn(platform, 'getHomeDir').mockReturnValue(state.home);
  vi.spyOn(platform, 'getHomeDirOrNull').mockReturnValue(state.home);
  const workspace = join(state.home, 'cancel-requeue-workspace'); await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  state.independentInputPump = true;
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: false });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  releaseWrite = release;
  const { ManagedProxyError } = await import('../utils/managed-proxy-binding');
  state.beforeTurn.mockImplementationOnce(async () => {
    await gate;
    if (reason === 'provider-draining') throw new ManagedProxyError('draining', 'Synthetic provider draining');
  });
  const terminal = vi.fn();
  await agent.enqueueUserMessage('cancelled synthetic input', [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY, onTerminal: terminal });
  await vi.waitFor(() => expect(state.beforeTurn).toHaveBeenCalledOnce());
  if (reason === 'capabilities') {
    const skill = join(workspace, '.claude', 'skills', 'synthetic-change');
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, 'SKILL.md'), '---\nname: synthetic-change\ndescription: Isolated cancel fixture\n---\nSynthetic.\n');
    agent.syncProjectUserConfig(workspace);
  }
  await expect(agent.interruptCurrentResponse()).resolves.toBe(true);
  release();
  const lifecycle = await import('../builtin-session/lifecycle');
  await vi.waitFor(() => expect(lifecycle.hasMessageResolver()).toBe(true));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  expect(state.sdkInputs).toHaveLength(0);
  expect(state.beforeResult).not.toHaveBeenCalled();
  expect(terminal).toHaveBeenCalledOnce();
  expect(terminal).toHaveBeenCalledWith(expect.objectContaining({ status: 'stopped' }));
});


it('rejects missing/blank plans through the real SDK callback without empty review or permission change', async () => {
  const options = await startSdkContractSession();
  const { configState } = await import('../builtin-session/config');
  configState.currentPermissionMode = 'plan';
  const args = { signal: new AbortController().signal, toolUseID: 'exit-empty', requestId: 'exit-empty' };
  for (const input of [{}, { plan: '  \n ' }]) {
    await expect(options.canUseTool!('ExitPlanMode', input, args)).resolves.toMatchObject({
      behavior: 'deny', interrupt: false, message: expect.stringContaining('没有可完整展示的方案正文'),
    });
  }
  expect(agent.getPendingInteractiveRequests().filter(row => row.type === 'exit-plan-mode:request')).toHaveLength(0);
  expect(state.events.filter(([event]) => event === 'exit-plan-mode:request')).toHaveLength(0);
  expect(configState.currentPermissionMode).toBe('plan');
});

it('lets the current session write its plan, review it, revise after feedback, and approve that exact content', async () => {
  const options = await startSdkContractSession();
  const { configState } = await import('../builtin-session/config');
  const { getSessionPlansDirectoryPath } = await import('../utils/plan-files');
  configState.currentPermissionMode = 'plan';
  const workspace = options.cwd!;
  const dir = getSessionPlansDirectoryPath(workspace, agent.getSessionId()!);
  const file = join(dir, 'plan.md');
  const signal = new AbortController().signal;
  const args = { signal, toolUseID: 'plan-file', requestId: 'plan-file' };
  const pre = options.hooks!.PreToolUse![0].hooks[0];
  const hook = { hook_event_name: 'PreToolUse' as const, session_id: agent.getSessionId(), transcript_path: '',
    cwd: workspace, tool_name: 'Write', tool_input: { file_path: file, content: '# Plan v1' },
    tool_use_id: 'plan-file', permission_mode: 'plan' };
  expect(await pre(hook, undefined, { signal })).toEqual({});
  await expect(options.canUseTool!('Write', hook.tool_input, args)).resolves.toMatchObject({ behavior: 'allow' });
  expect(await pre({ ...hook, tool_input: { file_path: join(workspace, '.agent-sync/plan.md') } }, undefined, { signal }))
    .toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: expect.stringContaining(dir) } });
  await expect(options.canUseTool!('Write', { file_path: join(workspace, 'source.ts') }, args)).resolves.toMatchObject({ behavior: 'deny' });
  await mkdir(dir, { recursive: true });
  await writeFile(file, '# Plan v1\nInspect, implement, test.');
  const pending = () => agent.getPendingInteractiveRequests().find(row => row.type === 'exit-plan-mode:request')?.data as { requestId: string; plan: string } | undefined;
  const first = options.canUseTool!('ExitPlanMode', {}, args);
  await vi.waitFor(() => expect(pending()?.plan).toContain('# Plan v1'));
  expect(agent.handleExitPlanModeResponse(pending()!.requestId, false, 'Add rollback')).toBe(true);
  await expect(first).resolves.toMatchObject({ behavior: 'deny', interrupt: false, message: expect.stringContaining('Add rollback') });
  expect(configState.currentPermissionMode).toBe('plan');
  await writeFile(file, '# Plan v2\nInspect, implement, test, rollback.');
  const second = options.canUseTool!('ExitPlanMode', {}, args);
  await vi.waitFor(() => expect(pending()?.plan).toContain('# Plan v2'));
  expect(state.events.filter(([event]) => event === 'exit-plan-mode:request').at(-1)?.[1]).toMatchObject({ plan: pending()!.plan });
  expect(agent.handleExitPlanModeResponse(pending()!.requestId, true)).toBe(true);
  await expect(second).resolves.toMatchObject({ behavior: 'allow' });
  expect(configState.currentPermissionMode).toBe('auto');
});

it('refuses a truncated plan instead of approving a partial display', async () => {
  const options = await startSdkContractSession();
  const { getSessionPlansDirectoryPath, MAX_PLAN_BYTES } = await import('../utils/plan-files');
  const dir = getSessionPlansDirectoryPath(options.cwd!, agent.getSessionId()!);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'plan.md'), 'a'.repeat(MAX_PLAN_BYTES + 1));
  await expect(options.canUseTool!('ExitPlanMode', {}, {
    signal: new AbortController().signal, toolUseID: 'big-plan', requestId: 'big-plan',
  })).resolves.toMatchObject({ behavior: 'deny', interrupt: false, message: expect.stringContaining('无法完整展示') });
  expect(agent.getPendingInteractiveRequests().filter(row => row.type === 'exit-plan-mode:request')).toHaveLength(0);
});

it.each([true, false])('retains the original native error result only after settled proof (%s), with durable Stop', async settled => {
  vi.stubEnv('HOME', state.home);
  try {
    agent.setSidecarPort(15432);
    const workspace = join(state.home, 'settled-native'); await mkdir(workspace);
    const providers = join(state.home, '.myagents', 'providers'); await mkdir(providers, { recursive: true });
    await writeFile(join(providers, 'settled-fixture.json'), JSON.stringify({ id: 'settled-fixture', name: 'fixture', type: 'api', models: [{ model: 'fixture' }] }));
    const module = await import('../openai-bridge/context-recovery');
    const contexts: InstanceType<typeof module.ContextRecoveryController>[] = [];
    const bind = module.ContextRecoveryController.prototype.bindNoDispatchOwner;
    vi.spyOn(module.ContextRecoveryController.prototype, 'bindNoDispatchOwner').mockImplementation(function (this: InstanceType<typeof module.ContextRecoveryController>, owner) {
      contexts.push(this); return bind.call(this, owner);
    });
    await agent.initializeAgent(workspace, null, undefined, { preWarmDisabled: true });
    await agent.setSessionProviderEnv({ providerId: 'settled-fixture', baseUrl: 'http://127.0.0.1:1', apiKey: 'fixture-only' });
    await agent.setSessionModel('fixture');
    const lifecycle = await import('../builtin-session/lifecycle');
    const start = { type: 'message_start', message: { id: 'fixture', type: 'message', role: 'assistant', content: [] } };
    const frame = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`;
    state.beforeResult.mockImplementationOnce(async (result: Record<string, unknown>) => {
      const input = { file_path: '/qa/sentinel' };
      const events = [start, { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'native-read', name: 'Read', input: {} } },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
        { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'tool_use' } }, { type: 'message_stop' }];
      const body = (content: string) => ({ model: 'fixture', max_tokens: 16, stream: true, messages: [{ role: 'user' as const, content }] });
      const run = async (content: string, events: unknown[]) => (await contexts.at(-1)!.run(new Request('http://localhost/messages'), body(content), async () =>
        new Response(events.map(frame).join(''), { headers: { 'content-type': 'text/event-stream' } }))).text();
      await run('original inference', events);
      const sdk = state.query.mock.calls.at(-1)![0].options as Options;
      const signal = new AbortController().signal;
      const base = { session_id: agent.getSessionId()!, transcript_path: '', cwd: workspace,
        tool_name: 'Read', tool_input: input, tool_use_id: 'native-read' };
      await sdk.hooks!.PreToolUse![0].hooks[0]({ ...base, hook_event_name: 'PreToolUse' }, undefined, { signal });
      await sdk.hooks!.PostToolUse![0].hooks[0]({ ...base, hook_event_name: 'PostToolUse', tool_response: 'sentinel' }, undefined, { signal });
      const query = lifecycle.lifecycleState.query!;
      lifecycle.recordQueryBackgroundTask(query, 'child', { runId: 'run-1' });
      lifecycle.replaceQueryBackgroundActivity(query, [{ task_id: 'child', run_id: 'run-1', task_type: 'local_agent', description: 'fixture' }]);
      expect(await run('background inference', [start])).toContain('automatic_replay_blocked');
      if (settled) {
        lifecycle.completeQueryBackgroundTask(query, 'child', { runId: 'run-1', status: 'completed', authoritative: true });
        lifecycle.replaceQueryBackgroundActivity(query, []);
      }
      result.subtype = 'error_during_execution'; result.is_error = true; result.result = 'fixture stream interrupted';
      result.terminal_reason = 'api_error';
    });
    await agent.enqueueUserMessage('Continue the same isolated task', undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { fromDesktopChatSend: true, channelDelivery: NO_CHANNEL_DELIVERY });
    const id = agent.getSessionId()!;
    if (!settled) {
      await vi.waitFor(() => expect(agent.getMessages().some(message => typeof message.content === 'string' && message.content.includes('后台任务尚未获得精确终态'))).toBe(true));
      expect(store.getBuiltinModelRecovery(id)).toBeUndefined();
      expect(state.sdkInputs).toHaveLength(1);
      return;
    }
    await vi.waitFor(() => expect(store.getBuiltinModelRecovery(id)).toMatchObject({ version: 2, kind: 'stream', status: 'waiting' }));
    expect(agent.isSessionBusy()).toBe(true);
    expect(state.sdkInputs).toHaveLength(1);
    await agent.stopBuiltinSessionForUpdate();
    expect(store.getBuiltinModelRecovery(id)).toMatchObject({ version: 2, status: 'paused', liveProof: { kind: 'settled-stream' } });
    const disk = JSON.parse(await readFile(join(state.home, '.myagents', 'sessions.json'), 'utf8'));
    expect(disk.find((row: { id: string }) => row.id === id).modelRecovery.status).toBe('paused');
    expect(state.sdkInputs).toHaveLength(1);
  } finally { agent.setSidecarPort(0); vi.unstubAllEnvs(); }
});

it.each([undefined, 'cold-goal'])('cold native restore refuses a v2 live-only receipt before creating any SDK Query (%s)', async goalId => {
  const workspace = join(state.home, 'cold-proof'); await mkdir(workspace);
  const id = randomUUID(); const now = Date.now();
  await store.saveSessionMetadata({ id, agentDir: workspace, title: 'cold proof', createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(), runtime: 'builtin', sdkSessionId: id,
    modelRecovery: { version: 2, kind: 'stream', id: randomUUID(), status: 'waiting', sdkSessionId: id,
      routeIdentity: 'same-route', turnId: 'original-root', goalId, attempt: 1, startedAt: now, nextRetryAt: now + 15_000,
      deadlineAt: now + 1_800_000, lastStatus: 502, liveProof: { kind: 'settled-stream', authority: 'old-engine', receiptId: 'old-proof' } } });
  await agent.initializeAgent(workspace, null, id, { preWarmDisabled: true });
  if (goalId) {
    const engine = (await import('../session-engine/builtin-adapter')).createBuiltinSessionEngine();
    const result = await engine.runInjectedTurn({ prompt: 'Continue original Goal', sessionId: id, workspacePath: workspace,
      scenario: { type: 'desktop' }, permissionMode: 'fullAgency', assistantChannelDelivery: 'caller-owned', timeoutMs: 5000, pollMs: 1,
      queueId: randomUUID(), turnOwner: { kind: 'goal', id: goalId } });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('live Query proof') });
  }
  expect(store.getBuiltinModelRecovery(id)).toMatchObject({ version: 2, status: 'paused' });
  expect(store.getSessionMetadata(id)?.modelRecovery?.reason).toContain('live Query proof');
  expect(state.query).not.toHaveBeenCalled(); expect(state.sdkInputs).toHaveLength(0);
});

it('drops the old native result after a Query replacement across settled-arm await', async () => {
  // Install a transparent observer before this test's engine module loads.
  // A persistent vi.mock factory would retain old turn singletons across resetModules.
  vi.resetModules();
  store = await import('../SessionStore');
  const turnLifecycle = await import('../builtin-session/turn-lifecycle');
  const create = turnLifecycle.createBuiltinTurnLifecycle;
  vi.spyOn(turnLifecycle, 'createBuiltinTurnLifecycle').mockImplementation((...args) => {
    const owner = create(...args);
    return { ...owner, handleSdkResult: (...result) => {
      state.sdkResultHandled(...result); return owner.handleSdkResult(...result);
    } };
  });
  agent = await import('../agent-session');
  vi.stubEnv('HOME', state.home);
  let release!: () => void;
  let fixtureQuery: import('@anthropic-ai/claude-agent-sdk').Query | undefined;
  try {
    agent.setSidecarPort(15432);
    const workspace = join(state.home, 'settled-replaced'); await mkdir(workspace);
    const providers = join(state.home, '.myagents', 'providers'); await mkdir(providers, { recursive: true });
    await writeFile(join(providers, 'replaced-fixture.json'), JSON.stringify({ id: 'replaced-fixture', name: 'fixture', type: 'api', models: [{ model: 'fixture' }] }));
    await agent.initializeAgent(workspace, null, undefined, { preWarmDisabled: true });
    await agent.setSessionProviderEnv({ providerId: 'replaced-fixture', baseUrl: 'http://127.0.0.1:1', apiKey: 'fixture-only' });
    await agent.setSessionModel('fixture');
    const recovery = await import('../builtin-session/model-recovery');
    let blocked = false; let returned = false;
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(recovery.SessionModelRecovery.prototype, 'armSettledInterruption').mockImplementationOnce(async () => {
      blocked = true; await gate; returned = true; return false;
    });
    const pause = vi.spyOn(recovery.SessionModelRecovery.prototype, 'pause');
    const finish = vi.spyOn(recovery.SessionModelRecovery.prototype, 'finishStreamTurn');
    state.beforeResult.mockImplementationOnce(async (result: Record<string, unknown>) => {
      result.is_error = true; result.subtype = 'error_during_execution'; result.terminal_reason = 'api_error';
    });
    await agent.enqueueUserMessage('Original isolated root', undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, { fromDesktopChatSend: true, channelDelivery: NO_CHANNEL_DELIVERY });
    await vi.waitFor(() => expect(blocked).toBe(true));
    const lifecycle = await import('../builtin-session/lifecycle'); const turn = await import('../builtin-session/turn');
    const oldQuery = lifecycle.lifecycleState.query!; fixtureQuery = oldQuery;
    const close = vi.fn(); const replacement = { close } as unknown as typeof oldQuery;
    const authority = lifecycle.setQuerySessionWithAuthority(replacement, { productSessionId: agent.getSessionId()!, expectedSdkSessionId: agent.getSessionId()! });
    const nextOwner = { id: randomUUID(), message: { role: 'user' as const, content: 'successor' }, messageText: 'successor',
      turnOwner: { kind: 'goal' as const, id: 'successor-goal' }, wasQueued: false, resolve: () => {}, channelDelivery: NO_CHANNEL_DELIVERY };
    turn.setCurrentTurnSourceItem(nextOwner);
    const before = state.events.length; const handledBefore = state.sdkResultHandled.mock.calls.length; release();
    await vi.waitFor(() => expect(returned).toBe(true));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(state.sdkResultHandled).toHaveBeenCalledTimes(handledBefore);
    expect(lifecycle.isCurrentQueryAuthority(authority)).toBe(true);
    expect(turn.getCurrentTurnSourceItem()).toBe(nextOwner);
    expect(state.events.slice(before).filter(([event]) => event === 'chat:agent-error' || event === 'chat:message-error')).toEqual([]);
    expect(pause).not.toHaveBeenCalled(); expect(finish).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
    expect(state.sdkInputs).toHaveLength(1);
    // Restore the fixture handle solely so normal test teardown can close it.
    lifecycle.setQuerySession(oldQuery);
  } finally {
    release?.();
    if (fixtureQuery) (await import('../builtin-session/lifecycle')).setQuerySession(fixtureQuery);
    agent.setSidecarPort(0); vi.unstubAllEnvs();
  }
});

async function startRealtimeBridgeFixture({ successor = true, closeOnInterrupt = false, failSetup = false, desktop = false } = {}) {
  const recoveryModule = await import('../builtin-session/model-recovery');
  type Recovery = InstanceType<typeof recoveryModule.SessionModelRecovery>;
  const recoveries = new Set<Recovery>();
  const readState = recoveryModule.SessionModelRecovery.prototype.readState;
  vi.spyOn(recoveryModule.SessionModelRecovery.prototype, 'readState').mockImplementation(function (this: Recovery) {
    recoveries.add(this); return readState.call(this);
  });
  const frames: unknown[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  let resolveClosed!: () => void;
  const closedPromise = new Promise<void>(resolve => { resolveClosed = resolve; });
  const received: { uuid: string; message: unknown }[] = [];
  const close = () => { closed = true; resolveClosed(); wake?.(); };
  releaseWrite = close;
  const emit = (...messages: unknown[]) => { frames.push(...messages); wake?.(); };
  let sdkOptions!: Options;
  state.query.mockImplementation((args: { prompt: AsyncIterable<{ uuid: string; message: unknown }>; options: Options }) => {
    sdkOptions = args.options;
    const prompt = args.prompt[Symbol.asyncIterator]();
    void (async () => {
      while (!closed) {
        const next = await Promise.race([prompt.next(), closedPromise.then(() => ({ done: true as const, value: undefined }))]);
        if (next.done) break;
        received.push(next.value);
      }
    })();
    emit({ type: 'system', subtype: 'init', session_id: args.options.sessionId, uuid: randomUUID(),
      model: 'fixture-model', tools: [], mcp_servers: [] });
    return {
      async next() {
        while (!closed && !frames.length) await new Promise<void>(resolve => { wake = resolve; });
        return closed ? { done: true, value: undefined } : { done: false, value: frames.shift() };
      },
      [Symbol.asyncIterator]() { return this; },
      initializationResult: async () => ({ commands: [] }),
      interrupt: async () => { if (closeOnInterrupt) close(); return { still_queued: received[1] ? [received[1].uuid] : [] }; },
      cancelAsyncMessage: async () => true, close,
      mcpServerStatus: async () => [], setModel: async () => {}, setPermissionMode: async () => {}, setMcpServers: async () => {},
    };
  });
  const workspace = join(state.home, 'workspace'); await mkdir(workspace);
  const providerDir = join(state.home, '.myagents', 'providers'); await mkdir(providerDir, { recursive: true });
  await writeFile(join(providerDir, 'steering-fixture.json'), JSON.stringify({ id: 'steering-fixture', name: 'fixture', type: 'api', models: [{ model: 'fixture-model' }] }));
  const metadata = await store.createSession(workspace, { runtime: 'builtin' });
  agent.setSidecarPort(15432);
  await agent.initializeAgent(workspace, null, metadata.id, { preWarmDisabled: true });
  await agent.setSessionProviderEnv({ providerId: 'steering-fixture', baseUrl: 'http://fixture.invalid', apiKey: 'fixture-only', apiProtocol: 'openai' });
  await agent.setSessionModel('fixture-model');
  const send = (text: string, human = desktop) => agent.enqueueUserMessage(text, [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined,
    { channelDelivery: NO_CHANNEL_DELIVERY, fromDesktopChatSend: human,
      queueResponseModeOverride: desktop ? 'turn' : 'realtime' });
  const assistant = (text: string) => ({ type: 'assistant', session_id: metadata.id,
    parent_tool_use_id: null, uuid: randomUUID(), message: { id: randomUUID(), role: 'assistant', model: 'fixture-model',
      content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 } } });
  if (failSetup) {
    const persistence = await import('../builtin-session/transcript-persistence');
    await agent.enqueueUserMessage('Guarded first input', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, {
        channelDelivery: NO_CHANNEL_DELIVERY,
        beforeDispatch: async () => {
          vi.spyOn(persistence, 'scheduleTranscriptPersist').mockRejectedValueOnce(new Error('fixture admission persistence failed'));
          return { accepted: true };
        },
      });
    await vi.waitFor(() => expect(agent.getBuiltinSessionCompletionTerminal()?.status).toBe('error'));
  } else {
    await send('Bounded original A');
    await vi.waitFor(() => expect(received).toHaveLength(1));
    emit(assistant('A partial'));
    await vi.waitFor(() => expect(agent.getLastBuiltinAssistantText()).toBe('A partial'));
  }
  const turn = await import('../builtin-session/turn');
  expect(turn.peekPendingOutputOwner()?.sourceItem?.id).toBe(received[0]?.uuid);
  const base = sdkOptions.env!.ANTHROPIC_BASE_URL!;
  const bridge = await import('../openai-bridge/bridge-registry');
  const token = new URL(base).pathname.split('/').at(-1)!;
  const body = (content: string) => ({ model: 'fixture-model', max_tokens: 16, stream: true,
    messages: [{ role: 'user' as const, content }] });
  const oldBody = body('Bounded original A');
  const oldRequest = new Request(`${base}/v1/messages`, { method: 'POST', body: JSON.stringify(oldBody) });
  const config = await bridge.lookupBridge(token, oldRequest);
  expect(config?.modelFailover).toBeDefined();
  const sessionConfig = config! as NonNullable<typeof config> & {
    modelFailover: ModelFailoverController; contextRecovery: ContextRecoveryController;
  };
  const b = successor ? await send('Explicit successor B') : undefined;
  if (successor) {
    await vi.waitFor(() => expect(received).toHaveLength(2));
    // Stdin yield is not a native result: output FIFO still owns A.
    expect(turn.peekPendingOutputOwner()?.sourceItem?.id).toBe(received[0].uuid);
    expect(turn.getCurrentTurnSourceItem()?.id).toBe(received[1].uuid);
  }
  return { received, turn, base, bridge, token, body, oldRequest, config: sessionConfig, emit, b, send,
    getRecovery: () => {
      // Invoke the existing liveness observer without pinning a failover root.
      // The recovery instance has otherwise not been read before first run.
      sessionConfig.contextRecovery.canRetryInference();
      const recovery = [...recoveries].at(-1);
      if (!recovery) throw new Error('fixture recovery was not observed');
      return recovery;
    } };
}

it.each(['normal', 'pending-pause', 'stop-during-resume', 'cancel-during-resume', 'automatic', 'inherited-desktop-retry'] as const)(
  'admits only a live human successor after force pauses the predecessor recovery (%s)', async mode => {
  const { getRecovery, received, emit, send, oldRequest, base, bridge, token, body } =
    await startRealtimeBridgeFixture({ successor: false, desktop: true });
  const recovery = getRecovery();
  expect(await recovery.wait(oldRequest, { status: 503, attempt: 4, usingBackup: false })).toBeGreaterThan(0);
  const checkpoint = store.getBuiltinModelRecovery(agent.getSessionId()!)!;
  const b = await send('Explicit successor B', mode !== 'automatic');
  expect(received).toHaveLength(1);
  if (mode === 'inherited-desktop-retry') {
    // The hidden provider-text retry clones its original source, including
    // desktop ingress. That inherited flag is not a new human instruction.
    const { getTurnBoundaryQueue } = await import('../builtin-session/queue');
    getTurnBoundaryQueue().find(item => item.queueId === b.queueId)!.sourceItem!.transientProviderRetry = {
      rootQueueId: checkpoint.turnId, attempt: 1,
    };
  }
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let blocked = false;
  if (mode === 'pending-pause') {
    const write = store.updateBuiltinModelRecovery;
    vi.spyOn(store, 'updateBuiltinModelRecovery').mockImplementation(async (...args) => {
      if (args[2]?.status === 'paused') { blocked = true; await gate; }
      return write(...args);
    });
  } else if (mode === 'stop-during-resume' || mode === 'cancel-during-resume') {
    const write = store.updateSessionMetadata;
    vi.spyOn(store, 'updateSessionMetadata').mockImplementation(async (...args) => {
      if ('modelRecovery' in args[1] && args[1].modelRecovery === undefined) { blocked = true; await gate; }
      return write(...args);
    });
  }
  const forcing = agent.forceExecuteQueueItem(b.queueId!);
  emit({ type: 'result', session_id: agent.getSessionId()!, uuid: randomUUID(), subtype: 'error_during_execution',
    is_error: true, terminal_reason: 'aborted_streaming', errors: ['Request interrupted by user'],
    duration_ms: 1, duration_api_ms: 1, num_turns: 1, total_cost_usd: 0,
    usage: { input_tokens: 1, output_tokens: 1 }, permission_denials: [] });
  try {
    if (mode === 'pending-pause' || mode === 'stop-during-resume' || mode === 'cancel-during-resume') {
      await vi.waitFor(() => expect(blocked).toBe(true));
      expect(received).toHaveLength(1);
      if (mode === 'stop-during-resume') await agent.interruptCurrentResponse();
      if (mode === 'cancel-during-resume')
        expect(await agent.cancelQueueItem(b.queueId!)).toMatchObject({ status: 'cancelled' });
    }
  } finally { release(); }
  await forcing;
  if (mode === 'stop-during-resume' || mode === 'cancel-during-resume') {
    await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
    expect(received).toHaveLength(1);
    expect(store.getBuiltinModelRecovery(agent.getSessionId()!)?.status).toBe('paused');
    return;
  }
  await vi.waitFor(() => expect(received).toHaveLength(2));
  const requestBody = body('Explicit successor B');
  const request = new Request(`${base}/v1/messages`, { method: 'POST', body: JSON.stringify(requestBody) });
  const config = (await bridge.lookupBridge(token, request))!;
  const execute = vi.fn(async () => new Response('{"role":"assistant","content":[{"type":"text","text":"B completed"}]}',
    { headers: { 'content-type': 'application/json' } }));
  const response = await config.contextRecovery!.run(request, { ...requestBody, stream: false }, execute);
  if (mode === 'automatic' || mode === 'inherited-desktop-retry') {
    expect(response.status).toBe(499);
    expect(execute).not.toHaveBeenCalled();
    expect(store.getBuiltinModelRecovery(agent.getSessionId()!)?.status).toBe('paused');
    return;
  }
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('B completed');
  expect(execute).toHaveBeenCalledOnce();
  expect(store.getBuiltinModelRecovery(agent.getSessionId()!)).toBeUndefined();
  expect(recovery.readState()).toBeUndefined();
  // The old chain remains durably stopped; clearing a new turn's checkpoint
  // must not remove its immutable Stop fence or replay the old input.
  const fence = join(state.home, '.myagents', 'context-recovery', agent.getSessionId()!, `stopped-${checkpoint.id}.json`);
  expect(JSON.parse(await readFile(fence, 'utf8'))).toMatchObject({ recoveryId: checkpoint.id, sdkSessionId: checkpoint.sdkSessionId });
  expect(received.map(row => row.uuid)).toEqual([checkpoint.turnId, b.queueId]);
});

it.each(['before', 'after'] as const)('keeps a force-steered native successor outside the cancelled predecessor bridge lease (A lease %s B yield)', async timing => {
  const { received, turn, base, bridge, token, body, oldRequest, config, emit, send } = await startRealtimeBridgeFixture({ successor: false });
  let b: Awaited<ReturnType<typeof send>>;
  if (timing === 'after') {
    b = await send('Explicit successor B');
    await vi.waitFor(() => expect(received).toHaveLength(2));
  }
  // The real registered Query controller admits an old A inference after B has
  // crossed stdin, while native A still owns the FIFO. No provider/tool runs.
  let upstreamCalls = 0;
  const oldResponse = await config.modelFailover!.run(oldRequest, config, async () => {
    upstreamCalls++;
    return new Response(new ReadableStream({ start(output) {
      output.enqueue(new TextEncoder().encode('data: {"type":"message_start","message":{"content":[]}}\n\n'));
    } }), { headers: { 'content-type': 'text/event-stream' } });
  }, 'old-inference');
  const reader = oldResponse.body!.getReader(); await reader.read();
  if (timing === 'before') {
    b = await send('Explicit successor B');
    await vi.waitFor(() => expect(received).toHaveLength(2));
  }
  await reader.cancel();
  // A's sealed scope still rejects both a replay and a new fingerprint before
  // the native result transfers the FIFO. No old inference is replayed.
  for (const fingerprint of ['old-inference', 'old-distinct-retry']) {
    const retry = new Request(`${base}/v1/messages`, { method: 'POST', body: JSON.stringify(body('A retry')) });
    const rejected = await config.modelFailover!.run(retry, config, async () => {
      upstreamCalls++; throw new Error('sealed A reached upstream');
    }, fingerprint);
    expect(rejected.status).toBe(409);
  }
  const force = agent.forceExecuteQueueItem(b!.queueId!);
  emit({ type: 'result', session_id: agent.getSessionId()!, uuid: randomUUID(), subtype: 'error_during_execution',
    is_error: true, terminal_reason: 'aborted_streaming', errors: ['Request interrupted by user'],
    duration_ms: 1, duration_api_ms: 1, num_turns: 1, total_cost_usd: 0,
    usage: { input_tokens: 1, output_tokens: 1 }, permission_denials: [] });
  await vi.waitFor(() => expect(state.events.some(([event, data]) => event === 'queue:started'
    && (data as { queueId?: string }).queueId === b!.queueId)).toBe(true));
  await force;
  expect(turn.peekPendingOutputOwner()?.sourceItem?.id).toBe(received[1].uuid);
  const nextBody = body('Explicit successor B');
  const nextRequest = new Request(`${base}/v1/messages`, { method: 'POST', body: JSON.stringify(nextBody) });
  const nextConfig = await bridge.lookupBridge(token, nextRequest);
  const response = await nextConfig!.modelFailover!.run(nextRequest, nextConfig!, async () => {
    upstreamCalls++;
    return new Response('data: {"type":"message_start","message":{"content":[]}}\n\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\ndata: {"type":"message_stop"}\n\n', { headers: { 'content-type': 'text/event-stream' } });
  }, 'new-distinct-inference');
  // Before the fix cancellation of old A wrongly sealed B's scope (409).
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('message_stop');
  const repeated = await nextConfig!.modelFailover!.run(
    new Request(nextRequest), nextConfig!, async () => { upstreamCalls++; throw new Error('B replay reached upstream'); },
    'new-distinct-inference');
  expect(repeated.status).toBe(409);
  expect(upstreamCalls).toBe(2);
  expect(received).toHaveLength(2);
});

it.each(['genuine', 'cloned-source', 'wrong-root'] as const)('retains only scheduler-proven hidden provider retry recovery (%s)', async provenance => {
  const { getRecovery, turn, received, emit, base, body } = await startRealtimeBridgeFixture({ successor: false });
  const recovery = getRecovery();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    emit({ type: 'result', session_id: agent.getSessionId()!, uuid: randomUUID(), subtype: 'success',
      is_error: false, result: '[Error]: Concurrency limit exceeded for account, please retry later',
      terminal_reason: 'completed', duration_ms: 1, duration_api_ms: 1, num_turns: 1, total_cost_usd: 0,
      usage: { input_tokens: 1, output_tokens: 1 }, permission_denials: [] });
    await vi.waitFor(() => expect(state.events.some(([event, data]) => event === 'chat:api-retry'
      && (data as { attempt?: number } | null)?.attempt === 1)).toBe(true));
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.waitFor(() => expect(received).toHaveLength(2));
  } finally { vi.useRealTimers(); }
  const original = turn.peekPendingOutputOwner()!.sourceItem!;
  const retry = turn.getCurrentTurnSourceItem()!;
  expect(original.id).toBe(received[0].uuid);
  expect(retry.id).toBe(received[1].uuid);
  expect(retry).not.toBe(original);
  expect(retry.transientProviderRetry).toMatchObject({ rootQueueId: original.id, attempt: 1 });
  if (provenance === 'cloned-source') turn.setCurrentTurnSourceItem({ ...retry, id: randomUUID() });
  if (provenance === 'wrong-root') retry.transientProviderRetry!.rootQueueId = randomUUID();
  const module = await import('../builtin-session/stream-continuation');
  const continuations = new Set<InstanceType<typeof module.SameTurnStreamContinuation>>();
  const interrupted = module.SameTurnStreamContinuation.prototype.interrupted;
  vi.spyOn(module.SameTurnStreamContinuation.prototype, 'interrupted').mockImplementation(function (this: InstanceType<typeof module.SameTurnStreamContinuation>) {
    continuations.add(this); interrupted.call(this);
  });
  const request = new Request(`${base}/v1/messages`, { method: 'POST', body: JSON.stringify(body('Retry inference')) });
  expect(await recovery.interrupted(request)).toBe(provenance === 'genuine');
  if (provenance === 'genuine') {
    expect(recovery.readState()).toMatchObject({ kind: 'stream', status: 'waiting', turnId: original.id });
    expect(store.getBuiltinModelRecovery(agent.getSessionId()!)).toMatchObject({ turnId: original.id });
    // Deadline failure must settle the retained logical root even though the
    // latest hidden input has another UUID. It must not silently stay busy.
    const continuation = [...continuations][0];
    const checkpoint = recovery.readState()!;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let clock: ReturnType<typeof vi.spyOn> | undefined;
    try {
      expect(continuation.schedule()).toBe(true);
      clock = vi.spyOn(Date, 'now').mockReturnValue(checkpoint.deadlineAt + 1);
      await vi.advanceTimersByTimeAsync(15_000);
      await vi.waitFor(() => expect(agent.getBuiltinSessionCompletionTerminal()?.status).toBe('error'));
      expect(state.events.some(([event]) => event === 'chat:agent-error')).toBe(true);
      expect(store.getBuiltinModelRecovery(agent.getSessionId()!)).toMatchObject({ status: 'paused', turnId: original.id });
      expect(turn.peekPendingOutputOwner()).toBeNull();
    } finally { clock?.mockRestore(); vi.useRealTimers(); }
  } else {
    expect(recovery.readState()).toBeUndefined();
    expect(store.getBuiltinModelRecovery(agent.getSessionId()!)).toBeUndefined();
  }
  expect(received).toHaveLength(2);
});

it('does not arm recovery or settled continuation for A after realtime B was admitted', async () => {
  const { getRecovery, oldRequest, config, received } = await startRealtimeBridgeFixture();
  const recovery = getRecovery();
  expect(await recovery.interrupted(oldRequest)).toBe(false);
  expect(await recovery.armSettledInterruption()).toBe(false);
  expect(recovery.readState()).toBeUndefined();
  expect(store.getBuiltinModelRecovery(agent.getSessionId()!)).toBeUndefined();
  expect(config.contextRecovery?.canRetryInference()).toBe(true);
  expect(received).toHaveLength(2); // No synthetic continuation jumps B.
});

it('does not adopt an A recovery across preparation await after realtime B admission', async () => {
  const { getRecovery, oldRequest, send, received } = await startRealtimeBridgeFixture({ successor: false });
  const recovery = getRecovery();
  const context = await import('../openai-bridge/context-recovery');
  let release!: () => void;
  let entered = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const protect = context.ContextRecoveryController.prototype.protectInference;
  vi.spyOn(context.ContextRecoveryController.prototype, 'protectInference').mockImplementationOnce(async function (this: InstanceType<typeof context.ContextRecoveryController>, body) {
    entered = true; await gate; return protect.call(this, body);
  });
  const pending = recovery.interrupted(oldRequest);
  try {
    await vi.waitFor(() => expect(entered).toBe(true));
    await send('Explicit successor B');
    await vi.waitFor(() => expect(received).toHaveLength(2));
  } finally { release(); }
  expect(await pending).toBe(false);
  expect(recovery.readState()).toBeUndefined();
  expect(store.getBuiltinModelRecovery(agent.getSessionId()!)).toBeUndefined();
  expect(received).toHaveLength(2);
});

it('does not retire executing A when only SDK-queued B is cancelled', async () => {
  const { config, b, turn, received } = await startRealtimeBridgeFixture();
  const end = vi.spyOn(config.modelFailover!, 'endTurn');
  await expect(agent.cancelQueueItem(b!.queueId!)).resolves.toMatchObject({ status: 'cancelled' });
  expect(turn.peekPendingOutputOwner()?.sourceItem?.id).toBe(received[0].uuid);
  expect(end).not.toHaveBeenCalled();
  expect(received).toHaveLength(2);
});

it('retires the executing FIFO root when Stop ends the Query without an SDK result', async () => {
  const { config, turn, received } = await startRealtimeBridgeFixture({ successor: false, closeOnInterrupt: true });
  const end = vi.spyOn(config.modelFailover!, 'endTurn');
  await expect(agent.interruptCurrentResponse()).resolves.toBe(true);
  await vi.waitFor(() => expect(agent.getBuiltinSessionCompletionTerminal()?.status).toBe('stopped'));
  expect(turn.peekPendingOutputOwner()).toBeNull();
  expect(end).toHaveBeenCalledOnce();
  expect(received).toHaveLength(1);
});

it('retires empty pre-dispatch setup authority without consuming an output owner', async () => {
  const module = await import('../openai-bridge/model-failover');
  const end = vi.spyOn(module.ModelFailoverController.prototype, 'endTurn');
  const { turn, received } = await startRealtimeBridgeFixture({ successor: false, failSetup: true });
  expect(turn.peekPendingOutputOwner()).toBeNull();
  expect(received).toHaveLength(0);
  expect(end).toHaveBeenCalledOnce();
  expect(agent.getBuiltinSessionCompletionTerminal()?.status).toBe('error');
});


describe('builtin known-unsent dispatch rollback', () => {
  it.each(['guard', 'final-validator'] as const)('awaits durable cancel after %s rejection before settling', async phase => {
    const workspace = join(state.home, `builtin-unsent-${phase}`);
    await mkdir(workspace);
    await agent.initializeAgent(workspace, null, undefined, { preWarmDisabled: true });
    const gate = Promise.withResolvers<void>();
    const cancel = vi.fn(async () => { await gate.promise; });
    const beforeDispatch = Object.assign(async () => phase === 'guard'
      ? { accepted: false, error: 'PLAN_START_STALE' }
      : { accepted: true, validateAtCommit: () => ({ accepted: false, error: 'PLAN_START_STALE' }) }, { cancel });
    const terminal = vi.fn();
    const queued = agent.enqueueUserMessage('rejected planned input', [], undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined,
      { channelDelivery: NO_CHANNEL_DELIVERY, beforeDispatch, onTerminal: terminal });
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
    expect(terminal).not.toHaveBeenCalled();
    expect(state.sdkInputs).toHaveLength(0);
    gate.resolve();
    const result = await queued;
    await expect(result.dispatchAcceptance).resolves.toMatchObject({ accepted: false });
    await vi.waitFor(() => expect(terminal).toHaveBeenCalledOnce());
    expect(state.sdkInputs).toHaveLength(0);
  });
});


it.each(['ambient', 'stop'] as const)('recovers capability rebuild input with %s background ownership (#676)', async mode => {
  const workspace = join(state.home, 'rebuild-owner');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  state.independentInputPump = true;
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: false });
  const lifecycle = await import('../builtin-session/lifecycle');
  const queue = await import('../builtin-session/queue');
  const config = await import('../builtin-session/config');
  const send = (text: string) => agent.enqueueUserMessage(text, [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY, queueResponseModeOverride: 'turn' });
  await send('old conversation');
  await vi.waitFor(() => expect(state.beforeResult).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  const oldQuery = lifecycle.getQuerySession()!;
  lifecycle.recordQueryBackgroundTask(oldQuery, 'long-lived-task', { description: 'task display record' });
  lifecycle.replaceQueryBackgroundActivity(oldQuery, [{
    task_id: 'long-lived-task', task_type: 'local_agent', description: 'current activity', ambient: mode === 'ambient',
  }]);
  // Change capabilities after enqueue's check, at the same pre-yield seam as
  // the reported provider-ready -> rebuild quarantine.
  state.beforeTurn.mockImplementationOnce(async () => {
    const skill = join(workspace, '.claude', 'skills', 'changed');
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, 'SKILL.md'), '---\nname: changed\ndescription: fixture\n---\nSynthetic.\n');
  });
  const input = await send('rebuild input');
  if (mode === 'stop') {
    await vi.waitFor(() => {
      expect(config.hasDeferredRestart()).toBe(true);
      expect(queue.getMessageQueue().some(item => item.id === input.queueId)).toBe(true);
      expect(lifecycle.hasMessageResolver()).toBe(false);
    });
    await expect(agent.interruptCurrentResponse()).resolves.toBe(true);
    await send('after stop');
  }
  await vi.waitFor(() => expect(state.sdkInputs).toHaveLength(2));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  expect(state.query).toHaveBeenCalledTimes(2);
  expect(lifecycle.getQuerySession()).not.toBe(oldQuery);
  expect(state.query.mock.calls[1][0].options.resume).toBe(meta.id);
  expect(agent.getMessages().filter(row => row.role === 'user').map(row => row.content))
    .toEqual(mode === 'stop' ? ['old conversation', 'rebuild input', 'after stop'] : ['old conversation', 'rebuild input']);
  expect(JSON.stringify(state.sdkInputs[1])).toContain(mode === 'stop' ? 'after stop' : 'rebuild input');
  if (mode === 'stop') expect(JSON.stringify(state.sdkInputs[1])).not.toContain('rebuild input');
});


it('releases a deferred rebuild when the SDK background snapshot becomes empty (#676)', async () => {
  const workspace = join(state.home, 'background-rebuild');
  await mkdir(workspace);
  const meta = await store.createSession(workspace, { runtime: 'builtin' });
  state.independentInputPump = true;
  state.backgroundTask = true;
  state.backgroundTaskGate = new Promise<void>(resolve => { releaseWrite = resolve; });
  await agent.initializeAgent(workspace, null, meta.id, { preWarmDisabled: false });
  const send = (text: string) => agent.enqueueUserMessage(text, [], undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, { channelDelivery: NO_CHANNEL_DELIVERY, queueResponseModeOverride: 'turn' });
  await send('start background work');
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  await vi.waitFor(() => expect(state.beforeResult).toHaveBeenCalledOnce());
  const lifecycle = await import('../builtin-session/lifecycle');
  const queue = await import('../builtin-session/queue');
  state.beforeTurn.mockImplementationOnce(async () => {
    const skill = join(workspace, '.claude', 'skills', 'changed');
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, 'SKILL.md'), '---\nname: changed\ndescription: fixture\n---\nSynthetic.\n');
  });
  const pending = await send('queued behind real background work');
  await vi.waitFor(() => expect(queue.getMessageQueue().some(item => item.id === pending.queueId)).toBe(true));
  expect(lifecycle.hasQueryBackgroundWork()).toBe(true);
  expect(state.sdkInputs).toHaveLength(1);
  state.backgroundTask = false;
  releaseWrite!(); releaseWrite = undefined;
  await vi.waitFor(() => expect(state.sdkInputs).toHaveLength(2));
  await vi.waitFor(() => expect(agent.isSessionBusy()).toBe(false));
  expect(state.query).toHaveBeenCalledTimes(2);
  expect(state.query.mock.calls[1][0].options.resume).toBe(meta.id);
});
