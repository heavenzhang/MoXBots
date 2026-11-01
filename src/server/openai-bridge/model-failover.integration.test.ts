import { createServer, type Server, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Stream as AnthropicStream } from '@anthropic-ai/sdk/core/streaming';
import { Response as UpstreamResponse } from 'undici';
import { createBridgeHandler } from './handler';
import { ContextRecoveryController } from './context-recovery';
import { ModelFailoverController, type InferenceRecoveryHooks } from './model-failover';
import type { UpstreamConfig } from './types/bridge';
import type { AnthropicRequest } from './types/anthropic';
import { SessionModelRecovery } from '../builtin-session/model-recovery';
import type { ModelRecoveryState } from '../../shared/modelRecovery';
import { classifyContextTurnFailure } from '../utils/context-budget';
import type { AnthropicStreamEvent } from './types/anthropic';

type RecordedRequest = { path: string; body: Record<string, unknown>; authorization?: string };
type Fixture = { baseUrl: string; requests: RecordedRequest[] };
const servers: Server[] = [];
const fixtureErrors: unknown[] = [];

async function fixture(reply: (request: RecordedRequest, response: ServerResponse) => void | Promise<void>): Promise<Fixture> {
  const requests: RecordedRequest[] = [];
  const server = createServer((req, res) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const request = { path: req.url ?? '', body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        authorization: req.headers.authorization };
      requests.push(request);
      await reply(request, res);
    })().catch(error => { fixtureErrors.push(error); res.destroy(); });
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('loopback fixture failed to bind');
  return { baseUrl: `http://127.0.0.1:${address.port}`, requests };
}

function json(res: ServerResponse, body: unknown, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}
function anthropicText(text = 'task finished'): unknown {
  return { id: 'anthropic-message', type: 'message', role: 'assistant', model: 'backup-model',
    content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null,
    usage: { input_tokens: 20, output_tokens: 4 } };
}
function openaiText(format: 'chat_completions' | 'responses', text = 'task finished'): unknown {
  if (format === 'responses') return { id: 'response-1', object: 'response', status: 'completed', model: 'backup-model',
    output: [{ id: 'output-1', type: 'message', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text, annotations: [] }] }],
    usage: { input_tokens: 20, output_tokens: 4, total_tokens: 24 } };
  return { id: 'completion-1', object: 'chat.completion', model: 'backup-model',
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 20, completion_tokens: 4, total_tokens: 24 } };
}
function target(server: Fixture, protocol: 'anthropic' | 'openai', format?: 'chat_completions' | 'responses'): UpstreamConfig {
  return { providerId: `fixture-${protocol}`, baseUrl: server.baseUrl, apiKey: 'fixture-key',
    apiProtocol: protocol, upstreamFormat: format, model: 'backup-model', headersTimeoutMs: 500 };
}
const userText = 'Increment the counter once, then report the result.';
function request(messages: AnthropicRequest['messages'] = [{ role: 'user', content: userText }], signal?: AbortSignal, stream = false): Request {
  return new Request('http://127.0.0.1/bridge/query-token/v1/messages', { method: 'POST', signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'primary-model', max_tokens: 128, stream, messages,
      tools: [{ name: 'increment_counter', description: 'Increment once', input_schema: { type: 'object', properties: {} } }] }) });
}
function harness(primary: UpstreamConfig, backup: UpstreamConfig, state = { scope: 'root-turn-1' as string | undefined, active: true }) {
  const notices: string[] = [];
  const controller = new ModelFailoverController({ scope: () => state.scope,
    isActive: () => state.active, retryDelaysMs: [0, 0, 0],
    resolveBackup: () => backup, onSwitch: selected => { notices.push(selected.providerId); } });
  const handler = createBridgeHandler({ getUpstreamConfig: () => ({ ...primary, modelFailover: controller }), logger: null });
  return { handler, controller, notices, state };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function sessionRecoveryPair(backup: UpstreamConfig | undefined) {
  const context = new ContextRecoveryController({
    scope: () => 'slow-header-root', isActive: () => true, canRecover: () => true,
    backup: async () => 'archive://fixture',
  });
  const notices: string[] = [];
  const failover = new ModelFailoverController({
    scope: () => 'slow-header-root', isActive: () => true, canSwitch: () => true,
    canRetry: () => context.canRetryInference(),
    resolveBackup: () => backup, onSwitch: selected => { notices.push(selected.providerId); },
    retryDelaysMs: [0, 0, 0],
  });
  return { context, failover, notices };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async server => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }));
  expect(fixtureErrors.splice(0)).toEqual([]);
});

describe('model failover over real loopback HTTP', () => {
  it('continues distinct same-root HTTP inference after long work and compaction without replaying delivered history', async () => {
    const provider = await fixture((_req, res) => json(res, anthropicText('Verified current step')));
    const config = target(provider, 'anthropic');
    const { context, failover } = sessionRecoveryPair(undefined);
    const handler = createBridgeHandler({ getUpstreamConfig: () => ({ ...config, contextRecovery: context, modelFailover: failover }), logger: null });
    let now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const first = await handler(request());
      expect(first.status).toBe(200); await first.text();
      now += 33 * 60_000;
      const compacted = await handler(request([{ role: 'user', content: 'Native summary: step one verified. Continue the unfinished step.' }]));
      expect(compacted.status).toBe(200); await compacted.text();
      expect(provider.requests).toHaveLength(2);
      const duplicate = await handler(request());
      expect(duplicate.status).toBe(409); await duplicate.text();
      expect(provider.requests).toHaveLength(2);
    } finally { clock.mockRestore(); }
  });

  it.each(['foreground-without-wait', 'background'])('preserves a real 429 cooldown and prevents SDK amplification (%s)', async mode => {
    const provider = await fixture((_req, res) => {
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '60' });
      res.end(JSON.stringify({ error: { type: 'rate_limit_error', message: 'fixture cooldown' } }));
    });
    const config = target(provider, 'anthropic');
    const controller = new ModelFailoverController({ scope: () => mode === 'background' ? undefined : 'root',
      resolveBackup: () => undefined, onSwitch: () => {}, retryDelaysMs: [0, 0, 0] });
    const handler = createBridgeHandler({ getUpstreamConfig: () => ({ ...config, modelFailover: controller }), logger: null });
    const first = await handler(request());
    expect(first.status).toBe(429); expect(first.headers.get('retry-after')).toBe('60');
    expect(await first.text()).toContain('fixture cooldown');
    expect(provider.requests).toHaveLength(1);
    const repeated = await handler(request());
    expect(repeated.status).toBe(429); expect(await repeated.text()).toContain('automatic_replay_blocked');
    expect(provider.requests).toHaveLength(1);
  });

  it('honors the real upstream Retry-After before any fast repeat of the same provider', async () => {
    const waiting = deferred();
    const committed = deferred();
    let observed: Parameters<InferenceRecoveryHooks['wait']>[1] | undefined;
    const primary = await fixture((_req, res) => {
      if (primary.requests.length > 1) { json(res, anthropicText('cooldown respected')); return; }
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '120' });
      res.end(JSON.stringify({ error: { type: 'rate_limit_error', message: 'concurrency limit' } }));
    });
    const config = target(primary, 'anthropic');
    const controller = new ModelFailoverController({ scope: () => 'rate-limited-root', resolveBackup: () => undefined,
      onSwitch: () => {}, retryDelaysMs: [0, 0, 0], recovery: {
        async wait(_request, failure) { observed = failure; waiting.resolve(); await committed.promise; return 0; },
        async complete() {},
      } });
    const handler = createBridgeHandler({ getUpstreamConfig: () => ({ ...config, modelFailover: controller }), logger: null });
    const pending = handler(request());
    await waiting.promise;
    expect(primary.requests).toHaveLength(1);
    expect(observed).toMatchObject({ status: 429, attempt: 1, retryAfterMs: 120_000, usingBackup: false });
    committed.resolve();
    expect((await (await pending).json()).content[0].text).toBe('cooldown respected');
    expect(primary.requests).toHaveLength(2);
  });

  it('switches to backup after slow primary headers while fast recovery is authorized', async () => {
    const primary = await fixture((_req, res) => {
      setTimeout(() => json(res, anthropicText('primary answered')), 200);
    });
    const backupFixture = await fixture((_req, res) => json(res, anthropicText('backup answered')));
    const backup = { ...target(backupFixture, 'anthropic'), providerId: 'backup-fixture' };
    const { context, failover, notices } = sessionRecoveryPair(backup);
    const config = target(primary, 'anthropic');
    const handler = createBridgeHandler({
      getUpstreamConfig: () => ({ ...config, contextRecovery: context, modelFailover: failover,
        headersTimeoutMs: () => failover.fastRecoveryAuthorized() ? 50 : undefined }),
      upstreamHeadersTimeoutMs: 3_000,
      logger: null,
    });

    const response = await handler(request());

    expect(response.status).toBe(200);
    expect((await response.json()).content[0].text).toBe('backup answered');
    expect(primary.requests).toHaveLength(4);
    expect(backupFixture.requests).toHaveLength(1);
    expect(notices).toEqual(['backup-fixture']);
  });

  it('keeps the generic header bound when uncertain tool history fences fast recovery', async () => {
    const primary = await fixture((_req, res) => {
      setTimeout(() => json(res, anthropicText('primary answered slowly')), 200);
    });
    const backupFixture = await fixture((_req, res) => json(res, anthropicText('backup must not run')));
    const { context, failover } = sessionRecoveryPair({ ...target(backupFixture, 'anthropic'), providerId: 'backup-fixture' });
    const config = target(primary, 'anthropic');
    const handler = createBridgeHandler({
      getUpstreamConfig: () => ({ ...config, contextRecovery: context, modelFailover: failover,
        headersTimeoutMs: () => failover.fastRecoveryAuthorized() ? 50 : undefined }),
      upstreamHeadersTimeoutMs: 3_000,
      logger: null,
    });
    const history: AnthropicRequest['messages'] = [
      { role: 'user', content: userText },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'uncertain-write', name: 'increment_counter', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'uncertain-write', content: 'write failed', is_error: true }] },
    ];

    const response = await handler(request(history));

    expect(context.canRetryInference()).toBe(false);
    expect(response.status).toBe(200);
    expect((await response.json()).content[0].text).toBe('primary answered slowly');
    // No replay of the fenced inference, and no premature local 408.
    expect(primary.requests).toHaveLength(1);
    expect(backupFixture.requests).toHaveLength(0);
  });

  it('returns a bounded classified 408 when the backup also times out', async () => {
    const primary = await fixture((_req, res) => json(res, { error: { message: 'overloaded' } }, 503));
    const backupFixture = await fixture(() => { /* never send response headers */ });
    const backup = { ...target(backupFixture, 'anthropic'), providerId: 'backup-fixture', headersTimeoutMs: 50 };
    const { context, failover } = sessionRecoveryPair(backup);
    const config = target(primary, 'anthropic');
    const handler = createBridgeHandler({
      getUpstreamConfig: () => ({ ...config, contextRecovery: context, modelFailover: failover }),
      logger: null,
    });

    const response = await handler(request());

    expect(response.status).toBe(408);
    expect(await response.json()).toMatchObject({
      error: { type: 'api_error', code: 'upstream_headers_timeout' },
    });
    expect(primary.requests).toHaveLength(4);
    expect(backupFixture.requests).toHaveLength(4);
  });

  it('gives the actual Session recovery owner a cloneable complete inference request after handler parsing', async () => {
    const primary = await fixture((_req, res) => primary.requests.length <= 4
      ? json(res, { error: { message: 'overloaded' } }, 503) : json(res, anthropicText('durable owner recovered')));
    let journal: ModelRecoveryState | undefined;
    let archived: AnthropicRequest | undefined;
    let now = Date.now();
    const owner = new SessionModelRecovery({ read: () => journal,
      write: async (next, expected, live) => {
        if (!live() || journal !== expected) return false;
        journal = next;
        return true;
      },
      current: () => ({ sdkSessionId: 'same-native-history', routeIdentity: 'fixture-route', turnId: 'cloneable-request-root' }),
      isLive: () => true,
      prepare: async request => { archived = await request.json() as AnthropicRequest; },
      now: () => now,
    });
    const recovery: InferenceRecoveryHooks = {
      validateResume: request => owner.validateResume(request),
      admit: request => owner.admit(request),
      async wait(request, failure) { expect(await owner.wait(request, failure)).toBe(15_000); now += 15_000; return 0; },
      complete: request => owner.complete(request), blocked: (request, reason) => owner.blocked(request, reason),
    };
    const config = target(primary, 'anthropic');
    const controller = new ModelFailoverController({ scope: () => 'cloneable-request-root', resolveBackup: () => undefined,
      onSwitch: () => {}, retryDelaysMs: [0, 0, 0], recovery });
    const handler = createBridgeHandler({ getUpstreamConfig: () => ({ ...config, modelFailover: controller }), logger: null });
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect((await response.json()).content[0].text).toBe('durable owner recovered');
    expect(archived?.messages).toEqual([{ role: 'user', content: userText }]);
    expect(primary.requests).toHaveLength(5);
    expect(journal).toBeUndefined();
  });

  it('durably waits after fast exhaustion and resumes only the failed inference with existing tool evidence', async () => {
    let counter = 0;
    const checkpointEntered = deferred();
    const commitCheckpoint = deferred();
    const waited: number[] = [];
    let completed = 0;
    const primary = await fixture((req, res) => {
      const messages = req.body.messages as AnthropicRequest['messages'];
      if (messages.length === 1) return json(res, { id: 'durable-tool-message', type: 'message', role: 'assistant',
        model: 'primary-model', content: [{ type: 'tool_use', id: 'durable-counter', name: 'increment_counter', input: {} }],
        stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 4 } });
      if (primary.requests.length < 7) return json(res, { error: { message: 'overloaded' } }, 503);
      json(res, anthropicText('preserved counter = 1'));
    });
    const recovery: InferenceRecoveryHooks = {
      async wait(_request, failure) {
        waited.push(failure.attempt);
        if (waited.length === 1) { checkpointEntered.resolve(); await commitCheckpoint.promise; }
        return 0;
      },
      async complete() { completed++; },
    };
    const config = target(primary, 'anthropic');
    const controller = new ModelFailoverController({ scope: () => 'durable-root', resolveBackup: () => undefined,
      onSwitch: () => {}, retryDelaysMs: [0, 0, 0], recovery });
    const handler = createBridgeHandler({ getUpstreamConfig: () => ({ ...config, modelFailover: controller }), logger: null });
    const first = await (await handler(request())).json();
    expect(first.stop_reason).toBe('tool_use');
    counter++;
    const history: AnthropicRequest['messages'] = [{ role: 'user', content: userText },
      { role: 'assistant', content: first.content },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'durable-counter', content: String(counter) }] }];
    const pending = handler(request(history));
    await checkpointEntered.promise;
    expect(primary.requests).toHaveLength(5);
    expect((await handler(request(history))).status).toBe(409);
    commitCheckpoint.resolve();
    const response = await pending;
    expect((await response.json()).content[0].text).toBe('preserved counter = 1');
    expect(waited).toEqual([4, 5]);
    expect(primary.requests).toHaveLength(7);
    expect(primary.requests.slice(1).every(row => JSON.stringify(row.body.messages) === JSON.stringify(history))).toBe(true);
    expect(counter).toBe(1);
    expect(completed).toBe(2);
  });

  it('stops real HTTP inference when the durable wait checkpoint cannot commit', async () => {
    const primary = await fixture((_req, res) => json(res, { error: { message: 'overloaded' } }, 503));
    let blocked = 0;
    const controller = new ModelFailoverController({ scope: () => 'commit-failed', resolveBackup: () => undefined,
      onSwitch: () => {}, retryDelaysMs: [0, 0, 0], recovery: {
        async wait() { throw new Error('durable disk unavailable'); },
        async complete() { throw new Error('must not complete'); },
        async blocked() { blocked++; },
      } });
    const config = target(primary, 'anthropic');
    const handler = createBridgeHandler({ getUpstreamConfig: () => ({ ...config, modelFailover: controller }), logger: null });
    const response = await handler(request());
    expect(response.status).toBe(409);
    await response.text();
    expect(primary.requests).toHaveLength(4);
    expect(blocked).toBe(1);
  });

  it.each(['chat_completions', 'responses'] as const)(
    'continues after one executed tool without repeating it, Anthropic to %s', async format => {
      let counter = 0;
      let primaryCalls = 0;
      const primary = await fixture((_req, res) => {
        primaryCalls++;
        if (primaryCalls > 1) return json(res, { error: { message: 'temporarily unavailable' } }, 503);
        json(res, { id: 'tool-message', type: 'message', role: 'assistant', model: 'primary-model',
          content: [{ type: 'tool_use', id: 'counter-call-1', name: 'increment_counter', input: {} }],
          stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } });
      });
      const backup = await fixture((_req, res) => json(res, openaiText(format)));
      const h = harness(target(primary, 'anthropic'), target(backup, 'openai', format));
      const first = await (await h.handler(request())).json();
      expect(first.stop_reason).toBe('tool_use');
      expect(first.content).toEqual([{ type: 'tool_use', id: 'counter-call-1', name: 'increment_counter', input: {} }]);
      // This is the test's actual side effect. Only an observed native tool_use can execute it.
      counter++;
      const history: AnthropicRequest['messages'] = [{ role: 'user', content: userText },
        { role: 'assistant', content: first.content },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'counter-call-1', content: String(counter) }] }];
      const result = await (await h.handler(request(history))).json();
      expect(result.content).toContainEqual({ type: 'text', text: 'task finished' });
      expect(counter).toBe(1);
      expect(primary.requests).toHaveLength(5);
      expect(backup.requests).toHaveLength(1);
      const forwarded = JSON.stringify(backup.requests[0].body);
      expect(forwarded.split(userText)).toHaveLength(2);
      expect(forwarded).toContain('counter-call-1');
      if (format === 'chat_completions') {
        expect(backup.requests[0].path).toBe('/chat/completions');
        expect(backup.requests[0].body.messages).toContainEqual({ role: 'tool', tool_call_id: 'counter-call-1', content: '1' });
      } else {
        expect(backup.requests[0].path).toBe('/responses');
        expect(backup.requests[0].body.input).toContainEqual({ type: 'function_call_output', call_id: 'counter-call-1', output: '1' });
      }
      expect(h.notices).toHaveLength(1);
    });

  it('translates a failed OpenAI primary request into an Anthropic backup request', async () => {
    const primary = await fixture((_req, res) => json(res, { error: { message: 'overloaded' } }, 503));
    const backup = await fixture((_req, res) => json(res, anthropicText()));
    const h = harness(target(primary, 'openai', 'chat_completions'), target(backup, 'anthropic'));
    const response = await h.handler(request());
    expect(response.status).toBe(200);
    expect((await response.json()).content[0].text).toBe('task finished');
    expect(primary.requests).toHaveLength(4);
    expect(backup.requests[0].path).toBe('/v1/messages');
    expect(backup.requests[0].body.messages).toEqual([{ role: 'user', content: userText }]);
    expect(backup.requests[0].body.model).toBe('backup-model');
  });

  it('never replays a successful SSE response after partial delivery and a socket failure', async () => {
    const finishStream = deferred();
    let streamCalls = 0;
    const primary = await fixture(async (_req, res) => {
      if (++streamCalls > 1) { json(res, anthropicText('new root finished')); return; }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"partial progress"}}\n\n');
      await finishStream.promise;
      res.destroy();
    });
    const backup = await fixture((_req, res) => json(res, anthropicText()));
    const h = harness(target(primary, 'anthropic'), target(backup, 'anthropic'));
    const response = await h.handler(request(undefined, undefined, true));
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('partial progress');
    finishStream.resolve();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('automatic_replay_blocked');
    expect((await reader.read()).done).toBe(true);
    const replay = await h.handler(request(undefined, undefined, true));
    expect(replay.status).toBe(409);
    await replay.text();
    const changedHistory = await h.handler(request([{ role: 'user', content: 'Recover the partial output with changed native history' }]));
    expect(changedHistory.status).toBe(409);
    await changedHistory.text();
    expect(primary.requests).toHaveLength(1);
    expect(backup.requests).toHaveLength(0);
    expect(h.notices).toHaveLength(0);
    h.controller.endTurn();
    h.state.scope = 'root-turn-2';
    const nextRoot = await h.handler(request());
    expect(nextRoot.status).toBe(200);
    expect((await nextRoot.json()).content[0].text).toBe('new root finished');
    expect(primary.requests).toHaveLength(2);
    expect(backup.requests).toHaveLength(0);
  });

  it.each(['anthropic', 'anthropic_partial_frame', 'chat_completions', 'responses'] as const)(
    'preserves the same budget and fences SDK replay after %s truncation', async format => {
      const primary = await fixture((_req, res) => {
        if (primary.requests.length <= 4) return json(res, { error: { message: 'overloaded' } }, 503);
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        if (format === 'anthropic' || format === 'anthropic_partial_frame') {
          res.end('event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"partial"}}\n\n'
            + (format === 'anthropic_partial_frame' ? 'event: content_block_delta\ndata: {"type":' : ''));
        } else if (format === 'responses') {
          res.end('data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"partial"}\n\n');
        } else {
          res.end('data: {"choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":null}]}\n\n');
        }
      });
      let stored: ModelRecoveryState | undefined;
      let recoveryTime = Date.now();
      const writes: ModelRecoveryState[] = [];
      const recovery = new SessionModelRecovery({
        read: () => stored,
        write: async (next, expected, live) => {
          if (!live() || stored !== expected) return false;
          stored = next;
          if (next) writes.push(next);
          return true;
        },
        current: () => ({ sdkSessionId: 'same-native-history', routeIdentity: 'same-route', turnId: 'same-turn' }),
        isLive: () => true, prepare: async () => {}, now: () => recoveryTime,
      });
      // Use the production recovery owner, compress only its wait duration.
      const wait = recovery.wait.bind(recovery);
      vi.spyOn(recovery, 'wait').mockImplementation(async (...args) => {
        const delay = await wait(...args);
        if (delay !== undefined) recoveryTime += delay;
        return delay === undefined ? delay : 0;
      });
      const complete = vi.spyOn(recovery, 'complete');
      const failover = new ModelFailoverController({ scope: () => 'same-root', resolveBackup: () => undefined,
        onSwitch: () => {}, retryDelaysMs: [0, 0, 0], recovery });
      const native = format === 'anthropic' || format === 'anthropic_partial_frame';
      const config = target(primary, native ? 'anthropic' : 'openai', native ? undefined : format as 'chat_completions' | 'responses');
      const handler = createBridgeHandler({ getUpstreamConfig: () => ({ ...config, modelFailover: failover }), logger: null });
      const history: AnthropicRequest['messages'] = [{ role: 'user', content: userText },
        { role: 'assistant', content: [{ type: 'tool_use', id: 'already-done', name: 'increment_counter', input: {} }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'already-done', content: '1' }] }];
      const response = await handler(request(history, undefined, true));
      let failure = '';
      try {
        for await (const event of AnthropicStream.fromSSEResponse<AnthropicStreamEvent>(response, new AbortController())) {
          expect(event.type).not.toBe('message_stop');
        }
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }
      expect(failure).toContain('automatic_replay_blocked');
      expect(classifyContextTurnFailure({ errorText: failure })).toBe('automatic_replay_blocked');
      expect(complete).not.toHaveBeenCalled();
      const incompleteFrame = format === 'anthropic_partial_frame';
      expect(writes.map(row => row.status)).toEqual(['waiting', incompleteFrame ? 'paused' : 'waiting']);
      expect(writes[1]).toMatchObject({ id: writes[0].id,
        startedAt: writes[0].startedAt, deadlineAt: writes[0].deadlineAt });
      if (!incompleteFrame) expect(writes[1]).toMatchObject({ kind: 'stream', attempt: 2 });
      expect(stored?.sdkSessionId).toBe('same-native-history');
      expect(primary.requests).toHaveLength(5);
      expect((await handler(request(history, undefined, true))).status).toBe(409);
      expect(primary.requests).toHaveLength(5);
    });

  it.each(['chat_completions', 'responses'] as const)('Stop cancels a held non-stream %s body after headers', async format => {
    const reading = deferred();
    const disconnected = deferred();
    const originalText = UpstreamResponse.prototype.text;
    const spy = vi.spyOn(UpstreamResponse.prototype, 'text').mockImplementation(function (this: UpstreamResponse) {
      if (this.headers.has('x-fixture-held')) reading.resolve();
      return originalText.call(this);
    });
    try {
      const primary = await fixture((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json', 'x-fixture-held': 'true' });
        res.write('{"id":"held');
        res.once('close', disconnected.resolve);
      });
      const backup = await fixture((_req, res) => json(res, anthropicText()));
      const h = harness(target(primary, 'openai', format), target(backup, 'anthropic'));
      const abort = new AbortController();
      const pending = h.handler(request(undefined, abort.signal));
      await reading.promise;
      abort.abort();
      expect((await pending).status).toBe(499);
      await disconnected.promise;
      expect(primary.requests).toHaveLength(1);
      expect(backup.requests).toHaveLength(0);
    } finally { spy.mockRestore(); }
  }, 3_000);

  it.each([{ error: { message: 'upstream failed' } }, { choices: [] },
    { choices: [{ message: { role: 'assistant', content: 'partial' }, finish_reason: null }] }])(
    'does not translate a 200 incomplete Chat JSON payload into successful assistant output', async payload => {
      const primary = await fixture((_req, res) => json(res, payload));
      const handler = createBridgeHandler({ getUpstreamConfig: () => target(primary, 'openai', 'chat_completions'), logger: null });
      const response = await handler(request());
      expect(response.status).toBe(502);
      expect(await response.text()).toContain('Invalid upstream');
      expect(primary.requests).toHaveLength(1);
    });

  it('publishes one switch for concurrent failures and pins subsequent inference to backup', async () => {
    const bothPrimariesArrived = deferred();
    let calls = 0;
    const primary = await fixture(async (_req, res) => {
      calls++;
      if (calls === 2) bothPrimariesArrived.resolve();
      await bothPrimariesArrived.promise;
      json(res, { error: { message: 'overloaded' } }, 503);
    });
    const backup = await fixture((_req, res) => json(res, anthropicText()));
    const h = harness(target(primary, 'anthropic'), target(backup, 'anthropic'));
    const results = await Promise.all([
      h.handler(request([{ role: 'user', content: 'Independent root inference' }])),
      h.handler(request([{ role: 'user', content: 'Independent child inference' }])),
    ]);
    for (const response of results) {
      expect(response.status).toBe(200);
      expect((await response.json()).content[0].text).toBe('task finished');
    }
    expect(h.notices).toHaveLength(1);
    const before = primary.requests.length;
    await (await h.handler(request([{ role: 'user', content: 'Next independent inference' }]))).text();
    expect(primary.requests).toHaveLength(before);
    expect(backup.requests).toHaveLength(3);
  });

  it('continues the tool loop after cancelling a completed tool-use SSE at message_stop', async () => {
    let calls = 0;
    let counter = 0;
    const tool = { type: 'tool_use' as const, id: 'completed-stream-tool', name: 'increment_counter', input: {} };
    const primary = await fixture((_req, res) => {
      if (++calls > 1) { json(res, anthropicText('counter confirmed once')); return; }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const events = [
        { type: 'message_start', message: { id: 'stream-tool-message', type: 'message', role: 'assistant',
          model: 'primary-model', content: [], stop_reason: null, stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 0 } } },
        { type: 'content_block_start', index: 0, content_block: tool },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{}' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 4 } },
        { type: 'message_stop' },
      ];
      res.write(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
      // Deliberately leave HTTP open: successful protocol termination is sufficient for the SDK to cancel.
    });
    const backup = await fixture((_req, res) => json(res, anthropicText()));
    const h = harness(target(primary, 'anthropic'), target(backup, 'anthropic'));
    const response = await h.handler(request(undefined, undefined, true));
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    let received = '';
    const decoder = new TextDecoder();
    while (!received.includes('event: message_stop\n')) {
      const next = await reader.read();
      if (next.done) throw new Error('tool stream ended without message_stop');
      received += decoder.decode(next.value, { stream: true });
    }
    const toolEvent = received.split('\n').filter(line => line.startsWith('data: '))
      .map(line => JSON.parse(line.slice(6))).find(event => event.type === 'content_block_start');
    expect(toolEvent.content_block).toEqual(tool);
    await reader.cancel('SDK consumed successful message_stop');
    counter++;
    const history: AnthropicRequest['messages'] = [{ role: 'user', content: userText },
      { role: 'assistant', content: [tool] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: tool.id, content: String(counter) }] }];
    const next = await h.handler(request(history));
    expect(next.status).toBe(200);
    expect((await next.json()).content[0].text).toBe('counter confirmed once');
    expect(primary.requests).toHaveLength(2);
    expect(primary.requests[1].body.messages).toEqual(history);
    expect(counter).toBe(1);
    expect(backup.requests).toHaveLength(0);
  });

  it.each(['initial', 'retry'] as const)('does not deliver late successful %s primary output after Query revocation', async phase => {
    const arrived = deferred();
    const release = deferred();
    let calls = 0;
    const primary = await fixture(async (_req, res) => {
      calls++;
      if (phase === 'retry' && calls === 1) {
        json(res, { error: { message: 'overloaded' } }, 503);
        return;
      }
      arrived.resolve();
      await release.promise;
      json(res, { id: 'late-message', type: 'message', role: 'assistant', model: 'primary-model',
        content: [{ type: 'tool_use', id: 'unsafe-late-tool', name: 'increment_counter', input: {} }],
        stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 4 } });
    });
    const backup = await fixture((_req, res) => json(res, anthropicText()));
    const h = harness(target(primary, 'anthropic'), target(backup, 'anthropic'));
    const inFlight = h.handler(request());
    await arrived.promise;
    h.state.scope = undefined;
    h.state.active = false;
    // A second late request cannot bypass the revoked scope to reach primary.
    const stale = await h.handler(request([{ role: 'user', content: 'stale request after Query revocation' }]));
    expect(stale.status).toBe(499);
    await stale.text();
    release.resolve();
    const response = await inFlight;
    expect(response.status).toBe(499);
    const body = await response.text();
    expect(body).toContain('superseded or cancelled');
    expect(body).not.toContain('unsafe-late-tool');
    expect(primary.requests).toHaveLength(phase === 'initial' ? 1 : 2);
    expect(backup.requests).toHaveLength(0);
    expect(h.notices).toHaveLength(0);
  });

  it.each(['abort', 'scope-revocation'] as const)('does not start backup after %s during primary retry', async mode => {
    const retryArrived = deferred();
    const releaseRetry = deferred();
    let calls = 0;
    const primary = await fixture(async (_req, res) => {
      calls++;
      if (calls === 2) { retryArrived.resolve(); await releaseRetry.promise; }
      json(res, { error: { message: 'overloaded' } }, 503);
    });
    const backup = await fixture((_req, res) => json(res, anthropicText()));
    const h = harness(target(primary, 'anthropic'), target(backup, 'anthropic'));
    const cancellation = new AbortController();
    const result = h.handler(request(undefined, cancellation.signal));
    await retryArrived.promise;
    if (mode === 'abort') cancellation.abort();
    else { h.state.scope = undefined; h.controller.endTurn(); }
    releaseRetry.resolve();
    const response = await result;
    await response.text();
    expect(response.ok).toBe(false);
    expect(backup.requests).toHaveLength(0);
    expect(h.notices).toHaveLength(0);
  });

  it('does not spend on backup for explicit Anthropic billing failures', async () => {
    let billing: unknown;
    const primary = await fixture((_req, res) => json(res, billing, 429));
    const backup = await fixture((_req, res) => json(res, anthropicText()));
    for (const error of [{ code: 'quota_exhausted', message: 'quota exhausted' },
      { code: 'quota_exceeded', message: 'quota exceeded' }, { message: '账户欠费，余额不足' }]) {
      billing = { error };
      const h = harness(target(primary, 'anthropic'), target(backup, 'anthropic'));
      const response = await h.handler(request());
      expect(response.status).toBe(429);
      await response.text();
      expect(h.notices).toHaveLength(0);
    }
    expect(primary.requests).toHaveLength(3);
    expect(backup.requests).toHaveLength(0);
  });

  it('stops after both primary and backup fail without switching back to primary', async () => {
    const primary = await fixture((_req, res) => json(res, { error: { message: 'overloaded' } }, 503));
    const backup = await fixture((_req, res) => json(res, { error: { message: 'backup overloaded' } }, 503));
    const h = harness(target(primary, 'anthropic'), target(backup, 'anthropic'));
    const result = await h.handler(request());
    expect(result.status).toBe(503);
    expect(await result.text()).toContain('backup overloaded');
    expect(primary.requests).toHaveLength(4);
    expect(backup.requests).toHaveLength(4);
    // Even a native HTTP retry of the same inference must not repeat either upstream.
    const replay = await h.handler(request());
    expect(replay.status).toBe(503);
    expect(await replay.text()).toContain('backup overloaded');
    expect(primary.requests).toHaveLength(4);
    expect(backup.requests).toHaveLength(4);
    expect(h.notices).toHaveLength(1);
  });

  it('uses backup-owned current credentials for every inference after switching', async () => {
    const primary = await fixture((_req, res) => json(res, { error: { message: 'overloaded' } }, 503));
    const backup = await fixture((_req, res) => json(res, anthropicText()));
    const primaryConfig = { ...target(primary, 'anthropic'), apiKey: 'primary-only-key' };
    let backupConfig = { ...target(backup, 'anthropic'), apiKey: 'backup-key-generation-1' };
    const controller = new ModelFailoverController({ scope: () => 'root-turn-credentials', retryDelaysMs: [0, 0, 0],
      resolveBackup: () => ({ ...backupConfig }), onSwitch: () => {} });
    const handler = createBridgeHandler({ getUpstreamConfig: () => ({ ...primaryConfig, modelFailover: controller }), logger: null });
    await (await handler(request())).text();
    backupConfig = { ...backupConfig, apiKey: 'backup-key-generation-2' };
    await (await handler(request([{ role: 'user', content: 'Next inference after credential rotation' }]))).text();
    expect(primary.requests.map(row => row.authorization)).toEqual(Array(4).fill('Bearer primary-only-key'));
    expect(backup.requests.map(row => row.authorization)).toEqual(['Bearer backup-key-generation-1', 'Bearer backup-key-generation-2']);
    expect(primary.requests).toHaveLength(4);
  });

  it('rejects the same inference while its original request is still in flight', async () => {
    const arrived = deferred();
    const release = deferred();
    const primary = await fixture(async (_req, res) => {
      arrived.resolve();
      await release.promise;
      json(res, anthropicText());
    });
    const backup = await fixture((_req, res) => json(res, anthropicText()));
    const h = harness(target(primary, 'anthropic'), target(backup, 'anthropic'));
    const original = h.handler(request());
    await arrived.promise;
    const duplicate = await h.handler(request());
    expect(duplicate.status).toBe(409);
    await duplicate.text();
    release.resolve();
    expect((await (await original).json()).content[0].text).toBe('task finished');
    expect(primary.requests).toHaveLength(1);
    expect(backup.requests).toHaveLength(0);
  });

  it.each(['anthropic', 'openai'] as const)(
    'bounds a %s error body that stalls after response headers without starting backup', async protocol => {
      const primary = await fixture((_req, res) => {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.flushHeaders();
        // Keep the body open. The error-body bound, not the headers deadline, must settle this request.
      });
      const backup = await fixture((_req, res) => json(res, anthropicText()));
      const h = harness(target(primary, protocol), target(backup, 'anthropic'));
      const response = await h.handler(request());
      expect(response.status).toBe(503);
      expect(await response.text()).toMatch(/incomplete|unavailable|recovery stopped/i);
      expect(primary.requests).toHaveLength(1);
      expect(backup.requests).toHaveLength(0);
      expect(h.notices).toHaveLength(0);
      const replay = await h.handler(request());
      expect(replay.status).toBe(503);
      expect(await replay.json()).toMatchObject({ error: { code: 'automatic_replay_blocked' } });
      expect(primary.requests).toHaveLength(1);
    }, 5_000);

  it.each(['anthropic', 'openai'] as const)(
    'fails closed for an oversized %s error body', async protocol => {
      const primary = await fixture((_req, res) => json(res, {
        error: { message: 'overloaded '.repeat(4_000) },
      }, 503));
      const backup = await fixture((_req, res) => json(res, anthropicText()));
      const h = harness(target(primary, protocol), target(backup, 'anthropic'));
      const response = await h.handler(request());
      expect(response.status).toBe(503);
      expect(await response.text()).toMatch(/incomplete|unavailable|recovery stopped/i);
      expect(primary.requests).toHaveLength(1);
      expect(backup.requests).toHaveLength(0);
      expect(h.notices).toHaveLength(0);
    });
});
