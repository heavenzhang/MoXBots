import { createServer, type Server, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeHandler } from './handler';
import { ContextRecoveryController, recoveryActionHash } from './context-recovery';
import { ModelFailoverController, type BridgeModelFailover } from './model-failover';
import { SessionModelRecovery } from '../builtin-session/model-recovery';
import { classifyContextTurnFailure } from '../utils/context-budget';
import type { AnthropicRequest } from './types/anthropic';

const servers: Server[] = [];
const errors: unknown[] = [];

async function fixture(reply: (body: AnthropicRequest, response: ServerResponse) => void | Promise<void>) {
  const requests: AnthropicRequest[] = [];
  const server = createServer((req, res) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as AnthropicRequest;
      requests.push(body);
      await reply(body, res);
    })().catch(error => { errors.push(error); res.destroy(); });
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture did not bind');
  return { baseUrl: `http://127.0.0.1:${address.port}`, requests };
}

function json(res: ServerResponse, body: unknown, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function message(content: unknown, stopReason = 'end_turn') {
  return { id: 'fixture-response', type: 'message', role: 'assistant', model: 'fixture-model', content,
    stop_reason: stopReason, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 3 } };
}

function request(body: AnthropicRequest, signal?: AbortSignal): Request {
  return new Request('http://127.0.0.1/bridge/exact-query-token/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal,
  });
}

function history(): AnthropicRequest {
  return { model: 'fixture-model', max_tokens: 128, system: 'Continue the same Goal and never repeat a completed action.',
    tools: [{ name: 'increment_counter', input_schema: { type: 'object', properties: {} } }], messages: [
      { role: 'user', content: 'Increment once, then report the counter.' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'first-tool-id', name: 'increment_counter', input: { delta: 1 } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'first-tool-id', content: `counter=1\n${'archived evidence '.repeat(2500)}` }] },
      { role: 'assistant', content: 'Counter execution is complete.' },
      { role: 'user', content: '/compact Preserve the completed counter result and current Goal.' },
    ] };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async server => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }));
  expect(errors.splice(0)).toEqual([]);
});

describe('context recovery over the existing bridge handler', () => {
  it('drains fragmented UTF-8 records and comments through stacked recovery stream owners', async () => {
    const source = 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"雪🙂"}}\n\n'
      + 'event: message_stop\ndata: {"type":"message_stop"}\n\n';
    const bytes = Buffer.from(source, 'utf8');
    const emoji = bytes.indexOf(Buffer.from('🙂'));
    const upstream = await fixture(async (_body, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const chunk of [Buffer.from(': keepalive\n\n'), bytes.subarray(0, emoji + 2), bytes.subarray(emoji + 2, -1), bytes.subarray(-1)]) {
        res.write(chunk);
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      res.end();
    });
    const context = new ContextRecoveryController({ scope: () => 'sse-fragment-turn', isActive: () => true,
      backup: async () => '/archive/fixture.json', persistLedger: async () => {} });
    const failover = new ModelFailoverController({ scope: () => 'sse-fragment-turn', isActive: () => true,
      resolveBackup: () => undefined, onSwitch: () => {}, retryDelaysMs: [0, 0, 0], bodyIdleTimeoutMs: 500 });
    const handler = createBridgeHandler({ logger: null, getUpstreamConfig: () => ({ providerId: 'fixture', apiProtocol: 'anthropic',
      baseUrl: upstream.baseUrl, apiKey: 'fixture', contextRecovery: context, modelFailover: failover }) });
    const body = { ...history(), stream: true };
    const result = await (await handler(request(body))).text();
    expect(result).toContain('雪🙂');
    expect(result).toContain('message_stop');
    expect(upstream.requests).toHaveLength(1);
  });
  it('keeps a restored uncertain Session available for verification and independent actions without failover retries', async () => {
    const upstream = await fixture((_body, res) => {
      if (upstream.requests.length === 3) return json(res, { error: { message: 'fixture unavailable' } }, 503);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');
    });
    let ledger: unknown;
    const options = { scope: () => 'explicit-read-only-turn', isActive: () => true, protectStreaming: true,
      backup: async () => '/archive/original.json', persistLedger: async (value: unknown) => { ledger = structuredClone(value); } };
    const original = new ContextRecoveryController(options);
    await original.protectInference(history());
    await original.authorizeTool('write_record', { id: 'uncertain' });
    const preserved = structuredClone(ledger);
    const context = new ContextRecoveryController({ ...options, initialLedger: ledger });
    const switched = vi.fn();
    const failover = new ModelFailoverController({ scope: options.scope, isActive: options.isActive,
      canRetry: () => context.canRetryInference(), canSwitch: () => true, resolveBackup: () => undefined,
      onSwitch: switched, retryDelaysMs: [0, 0, 0] });
    const handler = createBridgeHandler({ logger: null, getUpstreamConfig: () => ({ providerId: 'fixture', apiProtocol: 'anthropic',
      baseUrl: upstream.baseUrl, apiKey: 'fixture', contextRecovery: context, modelFailover: failover }) });
    const body = { ...history(), stream: true };
    body.messages.push({ role: 'user', content: 'Inspect the uncertain result read-only.' });
    expect(await (await handler(request(body))).text()).toContain('message_stop');
    expect(await context.authorizeTool('Read', { file_path: '/fixture/result.json' }, 'read-status')).toBeUndefined();
    const followup = structuredClone(body);
    followup.messages.push(
      { role: 'assistant', content: [{ type: 'tool_use', id: 'read-status', name: 'Read', input: { file_path: '/fixture/result.json' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'read-status', content: 'fixture status evidence' }] });
    expect(await (await handler(request(followup))).text()).toContain('message_stop');
    expect(context.beforeTool('increment_counter', { delta: 1 })).toContain('already completed');
    expect(context.beforeTool('write_record', { id: 'uncertain' })).toContain('uncertain outcome');
    expect(context.beforeTool('write_record', { id: 'other' })).toBeUndefined();
    expect(context.beforeTool('Bash', { command: "ssh fixture-host 'tail -n 80 /var/log/build.log'" })).toBeUndefined();
    const unavailable = structuredClone(followup);
    unavailable.messages.push({ role: 'user', content: 'Report only the evidence already read.' });
    const failed = await handler(request(unavailable));
    expect(failed.status).toBe(503);
    await failed.text();
    expect(upstream.requests).toHaveLength(3);
    expect(upstream.requests.slice(0, 2).map(body => body.messages)).toEqual([body.messages, followup.messages]);
    expect(switched).not.toHaveBeenCalled();
    expect(ledger).toEqual({ ...preserved as object, denied: [recoveryActionHash('increment_counter', { delta: 1 })] });
  });

  it('hands a partial stream to the original owner without reopening either guard or repeating completed actions', async () => {
    const upstream = await fixture((_body, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      if (upstream.requests.length === 1) {
        res.end('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"preserved partial"}}\n\n');
      } else {
        res.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');
      }
    });
    let generation = 0;
    const context = new ContextRecoveryController({ scope: () => `same-root:${generation}`, isActive: () => true,
      canRecover: () => true, protectStreaming: true, backup: async () => '/private/stream-archive.json',
      persistLedger: async () => {} });
    const interrupted = vi.fn(async () => true);
    const blocked = vi.fn(async () => {});
    const failover = new ModelFailoverController({ scope: () => `same-root:${generation}`, isActive: () => true,
      canRetry: () => context.canRetryInference(), canSwitch: () => true, resolveBackup: () => undefined,
      onSwitch: () => {}, retryDelaysMs: [0, 0, 0], recovery: {
        wait: async () => undefined, complete: async () => {}, interrupted, blocked,
      } });
    const handler = createBridgeHandler({ logger: null, getUpstreamConfig: () => ({ providerId: 'fixture', apiProtocol: 'anthropic',
      baseUrl: upstream.baseUrl, apiKey: 'fixture', contextRecovery: context, modelFailover: failover }) });
    const body = { ...history(), stream: true };
    const partial = await (await handler(request(body))).text();
    expect(partial).toContain('preserved partial');
    expect(partial).toContain('automatic_replay_blocked');
    expect(interrupted).toHaveBeenCalledTimes(1);
    expect(blocked).not.toHaveBeenCalled();
    expect((await handler(request(body))).status).toBe(409);
    expect(upstream.requests).toHaveLength(1);
    const continuation = structuredClone(body);
    continuation.messages.push({ role: 'user', content: '<system-reminder>Verified native continuation</system-reminder>' });
    expect(context.prepareStreamContinuation(continuation)).toBe(1);
    failover.endTurn();
    generation++;
    const completed = await handler(request(continuation));
    expect(completed.status).toBe(200);
    expect(await completed.text()).toContain('message_stop');
    expect(upstream.requests).toHaveLength(2);
    // Native IDs are deliberately absent from the action key.
    expect(await context.authorizeTool('increment_counter', { delta: 1 })).toContain('already completed successfully');
    expect(interrupted).toHaveBeenCalledTimes(1);
  });

  it.each([401, 409, 429, 503].flatMap(status => [false, true].map(declined => ({ status, declined }))))('preserves HTTP $status through both guards (durable owner declined=$declined)', async ({ status, declined }) => {
    const upstream = await fixture((_body, res) => json(res, { error: { type: 'api_error', message: 'fixture upstream rejection' } }, status));
    const diagnostics: string[] = [];
    const context = new ContextRecoveryController({ scope: () => 'same-root', isActive: () => true,
      backup: async () => '/private/archive/unused.json' });
    const failover = new ModelFailoverController({ scope: () => 'same-root', isActive: () => true,
      resolveBackup: () => undefined, onSwitch: () => {}, retryDelaysMs: [0, 0, 0],
      recovery: declined ? new SessionModelRecovery({ read: () => undefined, current: () => undefined,
        isLive: () => true, prepare: async () => {}, write: async () => true }) : undefined });
    const handler = createBridgeHandler({ logger: line => { diagnostics.push(line); }, getUpstreamConfig: () => ({ providerId: 'fixture-provider',
      apiProtocol: 'anthropic', baseUrl: upstream.baseUrl, apiKey: 'fixture', model: 'fixture-model',
      contextRecovery: context, modelFailover: failover }) });
    const body: AnthropicRequest = { model: 'fixture-model', max_tokens: 128,
      messages: [{ role: 'user', content: 'Read the task status.' }] };
    const first = await handler(request(body));
    expect(first.status).toBe(status);
    const originalError = await first.text();
    const attempts = upstream.requests.length;
    for (let repeat = 0; repeat < 3; repeat++) {
      const repeated = await handler(request(body));
      expect(repeated.status).toBe(status);
      const rejection = await repeated.json();
      expect(rejection.error.message).toContain(originalError);
      expect(rejection.error.code).toBe('automatic_replay_blocked');
      expect(classifyContextTurnFailure({ apiErrorStatus: status, errorText: rejection.error.message }))
        .toBe('automatic_replay_blocked');
      expect(repeated.headers.get('x-should-retry')).toBe('false');
    }
    expect(upstream.requests).toHaveLength(attempts);
    expect(attempts).toBe(status === 401 || status === 409 ? 1 : 4);
    expect(diagnostics.filter(line => line.includes(`Inference rejected HTTP ${status}`))).toHaveLength(4);
    expect(diagnostics.join(' ')).not.toContain('fixture upstream rejection');
  });

  it('continues the native compact inference path through outer recovery and inner failover, with archived pairs intact', async () => {
    const order: string[] = [];
    const upstream = await fixture((body, res) => {
      if (JSON.stringify(body).length > 10000) {
        json(res, { error: { type: 'invalid_request_error', code: 'context_length_exceeded', message: 'Maximum context length exceeded' } }, 400);
      } else {
        json(res, message([{ type: 'text', text: 'Compaction summary: counter completed once, value=1. Continue the existing Goal.' }]));
      }
    });
    const archives: Array<{ body: AnthropicRequest; digest: string; scope: string }> = [];
    let scope = 'same-session:same-goal:same-turn';
    const recovery = new ContextRecoveryController({ scope: () => scope, isActive: () => true,
      backup: async (body, metadata) => { order.push('backup'); archives.push({ body: structuredClone(body), ...metadata }); return '/private/archive/native-compact.json'; } });
    const failover: BridgeModelFailover = { async run(_request, primary, execute) { order.push('failover'); return execute(primary); } };
    const handler = createBridgeHandler({ logger: null, getUpstreamConfig: () => ({ providerId: 'fixture-provider',
      apiProtocol: 'anthropic', baseUrl: upstream.baseUrl, apiKey: 'fixture', model: 'fixture-model',
      contextRecovery: recovery, modelFailover: failover }) });
    const original = history();
    const response = await handler(request(original));
    expect(response.status).toBe(200);
    expect((await response.json()).content[0].text).toContain('Compaction summary');
    expect(order).toEqual(['failover', 'backup', 'failover']);
    expect(upstream.requests).toHaveLength(2);
    expect(archives).toHaveLength(1);
    expect(archives[0].body).toEqual(original);
    expect(archives[0].scope).toBe('same-session:same-goal:same-turn');
    expect(archives[0].digest).toMatch(/^[a-f0-9]{64}$/);
    const retry = upstream.requests[1];
    expect(retry.system).toEqual(original.system);
    expect(retry.messages[1]).toEqual(original.messages[1]);
    expect(retry.messages.slice(-2)).toEqual(original.messages.slice(-2));
    expect(JSON.stringify(retry.messages[2])).toContain('first-tool-id');
    expect(JSON.stringify(retry.messages[2])).toContain('counter=1');
    expect(JSON.stringify(retry.messages[2])).toContain('/private/archive/native-compact.json');
    // Once SDK consumes this response it owns writing compact_boundary. A later
    // request may already contain the native compact summary instead of the prefix.
    recovery.endTurn(); scope = 'same-session:same-goal:next-turn';
    const nativeCompacted: AnthropicRequest = { model: 'fixture-model', max_tokens: 128,
      messages: [{ role: 'user', content: 'Native compact summary: counter already completed once. Report it.' }] };
    const next = await handler(request(nativeCompacted));
    expect(next.status).toBe(200);
    await next.text();
    expect(recovery.beforeTool('increment_counter', { delta: 1 })).toContain('already completed');
  });

  it('executes the side effect once even when recovery emits the same business operation under a new tool id', async () => {
    let calls = 0;
    let counter = 0;
    const upstream = await fixture((_body, res) => {
      calls++;
      if (calls === 2) return json(res, { error: { message: 'Prompt is too long' } }, 400);
      json(res, message([{ type: 'tool_use', id: calls === 1 ? 'first-tool-id' : 'new-native-id',
        name: 'increment_counter', input: { delta: 1 } }], 'tool_use'));
    });
    const recovery = new ContextRecoveryController({ scope: () => 'session:goal:turn', isActive: () => true,
      backup: async () => '/private/archive/successful-counter.json' });
    const handler = createBridgeHandler({ logger: null, getUpstreamConfig: () => ({ providerId: 'fixture', apiProtocol: 'anthropic',
      baseUrl: upstream.baseUrl, apiKey: 'fixture', model: 'fixture-model', contextRecovery: recovery }) });
    const initial: AnthropicRequest = { model: 'fixture-model', max_tokens: 128,
      messages: [{ role: 'user', content: 'Increment once.' }] };
    const first = await (await handler(request(initial))).json();
    expect(first.content[0].id).toBe('first-tool-id');
    if (!recovery.beforeTool(first.content[0].name, first.content[0].input)) counter++;
    recovery.recordToolResult(first.content[0].name, first.content[0].input, 'counter=1');
    const recovered = await (await handler(request(history()))).json();
    expect(recovered.content[0].id).toBe('new-native-id');
    const denied = recovery.beforeTool(recovered.content[0].name, recovered.content[0].input);
    if (!denied) counter++;
    expect(counter).toBe(1);
    expect(denied).toContain('counter=1');
    expect(denied).toContain('/private/archive/successful-counter.json');
    expect(upstream.requests).toHaveLength(3);
  });

  it('does not interpret a partial successful SSE response as a recoverable context failure', async () => {
    let finish!: () => void;
    const finished = new Promise<void>(resolve => { finish = resolve; });
    const upstream = await fixture(async (_body, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"partial"}}\n\n');
      await finished;
      res.destroy();
    });
    let backups = 0;
    const recovery = new ContextRecoveryController({ scope: () => 'same-turn', isActive: () => true,
      backup: async () => { backups++; return '/private/archive/unused'; } });
    const handler = createBridgeHandler({ logger: null, getUpstreamConfig: () => ({ providerId: 'fixture', apiProtocol: 'anthropic',
      baseUrl: upstream.baseUrl, apiKey: 'fixture', contextRecovery: recovery }) });
    const response = await handler(request({ ...history(), stream: true }));
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('partial');
    finish();
    const failure = new TextDecoder().decode((await reader.read()).value);
    expect(failure).toContain('event: error');
    expect(failure).toContain('automatic_replay_blocked');
    expect((await reader.read()).done).toBe(true);
    const replay = history(); replay.messages.push({ role: 'user', content: 'SDK rescue after interrupted output' });
    const blocked = await handler(request(replay));
    expect(blocked.status).toBe(409);
    expect(await blocked.text()).toContain('context_recovery_required');
    expect(upstream.requests).toHaveLength(1);
    expect(backups).toBe(0);
  });
});

it.each(['transport', 'eof', 'half-eof', 'idle', 'authentication', 'billing', 'policy', 'claims-transport'] as const)(
  'uses trusted handler causality rather than rewritten SSE text (%s)', async cause => {
    let background = false;
    const start = { type: 'message_start', message: { id: 'fixture', type: 'message', role: 'assistant', model: 'fixture', content: [], usage: { input_tokens: 1, output_tokens: 0 } } };
    const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
    const upstream = await fixture((_body, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write(frame(start));
      if (!background) res.end(frame({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 0 } }) + frame({ type: 'message_stop' }));
      else if (cause === 'transport') setTimeout(() => res.destroy(), 5);
      else if (cause === 'eof') res.end();
      else if (cause === 'half-eof') res.end('data: {"incomplete":');
      else if (cause === 'idle') { /* bounded by the real test-local ModelBodyReader */ }
      else res.end(frame({ type: 'error', error: { type: cause === 'authentication' ? 'authentication_error' : 'api_error',
        code: cause, message: cause === 'claims-transport' ? 'transport_error: socket reset' : 'fixture permanent rejection' } }));
    });
    const context = new ContextRecoveryController({ scope: () => 'original-root', isActive: () => true, canRecover: () => !background,
      protectStreaming: () => !background, recoveryOwner: { sessionId: 'session', sdkSessionId: 'native' },
      persistLedger: async () => {}, backup: async () => 'history-archive', archiveSettledInterruption: async () => 'proof-archive' });
    context.bindNoDispatchOwner({ sessionId: 'session', sdkSessionId: 'native', queryGeneration: 1, isCurrent: () => true });
    const modelFailover = new ModelFailoverController({ scope: () => 'original-root', isActive: () => true,
      canRetry: () => context.canRetryInference(), canSwitch: () => !background,
      resolveBackup: () => undefined, onSwitch: () => {}, retryDelaysMs: [0, 0, 0], bodyIdleTimeoutMs: 200 });
    const handler = createBridgeHandler({ logger: null, getUpstreamConfig: () => ({ providerId: 'fixture', apiProtocol: 'anthropic',
      baseUrl: upstream.baseUrl, apiKey: 'fixture', contextRecovery: context, modelFailover }) });
    const first: AnthropicRequest = { model: 'fixture', max_tokens: 16, stream: true, messages: [{ role: 'user', content: 'foreground' }] };
    expect(await (await handler(request(first))).text()).toContain('message_stop');
    background = true;
    const child = structuredClone(first); child.messages.push({ role: 'user', content: 'background' });
    expect(await (await handler(request(child))).text()).toContain('automatic_replay_blocked');
    background = false;
    const receipt = await context.prepareSettledInterruption(() => true);
    expect(!!receipt).toBe(cause === 'transport' || cause === 'eof' || cause === 'idle');
    expect(upstream.requests).toHaveLength(2);
  },
);

it.each(['chat_completions', 'responses'] as const)('keeps raw %s socket failure distinct from provider/protocol errors through translation', async format => {
  let background = false; let failure: 'transport' | 'permanent' | 'eof' | 'ping-eof' | 'half-eof' = 'transport';
  const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
  const upstream = await fixture((_body, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    if (background && (failure === 'ping-eof' || failure === 'half-eof')) {
      res.end(failure === 'ping-eof' ? 'event: ping\ndata: {}\n\n' : 'data: {"incomplete":');
      return;
    }
    if (format === 'chat_completions') {
      res.write(frame({ id: 'fixture', model: 'fixture', choices: [{ index: 0, delta: { role: 'assistant', content: 'partial' }, finish_reason: null }] }));
      if (!background) res.end(frame({ id: 'fixture', model: 'fixture', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n');
      else if (failure === 'transport') setTimeout(() => res.destroy(), 5);
      else if (failure === 'eof') res.end();
      else res.end(frame({ error: { type: 'authentication_error', message: 'transport_error claimed by provider' } }));
    } else {
      res.write(frame({ type: 'response.created', response: { id: 'resp', model: 'fixture', status: 'in_progress', output: [] } }));
      res.write(frame({ type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'partial' }));
      if (!background) res.end(frame({ type: 'response.completed', response: { id: 'resp', model: 'fixture', status: 'completed', output: [] } }));
      else if (failure === 'transport') setTimeout(() => res.destroy(), 5);
      else if (failure === 'eof') res.end();
      else res.end(frame({ type: 'response.failed', response: { id: 'resp', model: 'fixture', status: 'failed', output: [], error: { code: 'authentication_error', message: 'transport_error claimed by provider' } } }));
    }
  });
  for (failure of ['transport', 'permanent', 'eof', 'ping-eof', 'half-eof'] as const) {
    background = false;
    const context = new ContextRecoveryController({ scope: () => 'original-root', isActive: () => true, canRecover: () => !background,
      protectStreaming: () => !background, recoveryOwner: { sessionId: 'session', sdkSessionId: 'native' },
      persistLedger: async () => {}, backup: async () => 'history-archive', archiveSettledInterruption: async () => 'proof-archive' });
    context.bindNoDispatchOwner({ sessionId: 'session', sdkSessionId: 'native', queryGeneration: 1, isCurrent: () => true });
    const modelFailover = new ModelFailoverController({ scope: () => 'original-root', isActive: () => true, canRetry: () => context.canRetryInference(),
      canSwitch: () => !background, resolveBackup: () => undefined, onSwitch: () => {}, retryDelaysMs: [0, 0, 0] });
    const handler = createBridgeHandler({ logger: null, getUpstreamConfig: () => ({ providerId: 'fixture', apiProtocol: 'openai', upstreamFormat: format,
      baseUrl: upstream.baseUrl, apiKey: 'fixture', contextRecovery: context, modelFailover }) });
    const body: AnthropicRequest = { model: 'fixture', max_tokens: 16, stream: true, messages: [{ role: 'user', content: 'foreground' }] };
    expect(await (await handler(request(body))).text()).toContain('message_stop');
    background = true; body.messages.push({ role: 'user', content: 'background' });
    expect(await (await handler(request(body))).text()).toContain('automatic_replay_blocked');
    background = false;
    expect(!!await context.prepareSettledInterruption(() => true)).toBe(failure === 'transport' || failure === 'eof');
  }
});

it.each(['transport', 'authentication', 'malformed'] as const)('arms the old foreground recovery only for proven transport (%s)', async cause => {
  const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
  const upstream = await fixture((_body, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(frame({ type: 'message_start', message: { id: 'fixture', type: 'message', role: 'assistant', content: [] } }));
    if (cause === 'transport') setTimeout(() => res.destroy(), 5);
    else if (cause === 'malformed') res.end('data: {not-json\n\n');
    else res.end(frame({ type: 'error', error: { type: 'authentication_error', message: 'transport_error claimed by provider' } }));
  });
  const context = new ContextRecoveryController({ scope: () => 'foreground', isActive: () => true, protectStreaming: true,
    persistLedger: async () => {}, backup: async () => 'history-archive' });
  const interrupted = vi.fn(async () => true); const blocked = vi.fn(async () => {});
  const modelFailover = new ModelFailoverController({ scope: () => 'foreground', isActive: () => true, canRetry: () => context.canRetryInference(),
    canSwitch: () => true, resolveBackup: () => undefined, onSwitch: () => {}, recovery: {
      wait: async () => undefined, complete: async () => {}, interrupted, blocked,
    } });
  const handler = createBridgeHandler({ logger: null, getUpstreamConfig: () => ({ providerId: 'fixture', apiProtocol: 'anthropic', baseUrl: upstream.baseUrl,
    apiKey: 'fixture', modelFailover, contextRecovery: context }) });
  const body: AnthropicRequest = { model: 'fixture', max_tokens: 16, stream: true, messages: [{ role: 'user', content: 'foreground' }] };
  expect(await (await handler(request(body))).text()).toContain('automatic_replay_blocked');
  expect(interrupted).toHaveBeenCalledTimes(cause === 'transport' ? 1 : 0);
  expect(blocked).toHaveBeenCalledTimes(cause === 'transport' ? 0 : 1);
  if (cause !== 'transport') expect(() => context.prepareStreamContinuation(body)).toThrow('automatic_replay_blocked');
});
