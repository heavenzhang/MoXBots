import { createServer, type Server, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createBridgeHandler } from './handler';
import { ContextRecoveryController } from './context-recovery';
import { ModelFailoverController } from './model-failover';
import { hasBridge, lookupBridge, registerBridge, unregisterBridge } from './bridge-registry';
import type { AnthropicRequest } from './types/anthropic';
import type { UpstreamConfig } from './types/bridge';

type RecordedRequest = { body: AnthropicRequest; path: string };
type Fixture = { baseUrl: string; requests: RecordedRequest[] };
const servers: Server[] = [];
const releases: Array<() => void> = [];
const fixtureErrors: unknown[] = [];
const queryToken = 'background-lifecycle-fixture-query';

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  releases.push(resolve);
  return { promise, resolve };
}

async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Loopback lifecycle fixture did not make progress')), 2_000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

async function fixture(reply: (request: RecordedRequest, response: ServerResponse) => void | Promise<void>): Promise<Fixture> {
  const requests: RecordedRequest[] = [];
  const server = createServer((req, res) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const request = { body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as AnthropicRequest, path: req.url ?? '' };
      requests.push(request);
      await reply(request, res);
    })().catch(error => { fixtureErrors.push(error); res.destroy(); });
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Loopback fixture failed to bind');
  return { baseUrl: `http://127.0.0.1:${address.port}`, requests };
}

function json(response: ServerResponse, body: unknown, status = 200): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function message(text: string) {
  return { id: 'fixture-message', type: 'message', role: 'assistant', model: 'fixture-model',
    content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null,
    usage: { input_tokens: 3, output_tokens: 2 } };
}

function delta(text: string): string {
  return `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0,
    delta: { type: 'text_delta', text } })}\n\n`;
}
const terminal = 'event: message_stop\ndata: {"type":"message_stop"}\n\n';

function upstream(server: Fixture, providerId = 'primary'): UpstreamConfig {
  return { providerId, model: `${providerId}-model`, baseUrl: server.baseUrl, apiKey: 'loopback-fixture-key',
    apiProtocol: 'anthropic', headersTimeoutMs: 1_000 };
}

function request(text: string, options: { stream?: boolean; signal?: AbortSignal; messages?: AnthropicRequest['messages'] } = {}): Request {
  return new Request(`http://127.0.0.1/bridge/${queryToken}/v1/messages`, { method: 'POST', signal: options.signal,
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'primary-model', max_tokens: 128,
      stream: options.stream ?? false, messages: options.messages ?? [{ role: 'user', content: text }],
      tools: [{ name: 'increment_counter', description: 'Increment the controlled fixture counter once',
        input_schema: { type: 'object', properties: {} } }] }) });
}

/** Real handler nests context recovery outside model failover, as production does. */
function harness(primary: Fixture, backup: Fixture) {
  const owner = { scope: 'foreground-1' as string | undefined, queryActive: true, recoveryAllowed: true,
    route: 'primary-route-generation-1' };
  const isActive = () => owner.queryActive && hasBridge(queryToken);
  const switches: string[] = [];
  const archives: string[] = [];
  const ledgers: Array<{ completed: unknown[]; uncertain: string[]; denied: string[]; blocked: boolean }> = [];
  const failover = new ModelFailoverController({ scope: () => owner.scope, isActive,
    requestIdentity: () => owner.route,
    canSwitch: () => owner.recoveryAllowed, resolveBackup: () => upstream(backup, 'backup'),
    canRetry: () => context.canRetryInference(),
    onSwitch: target => { switches.push(target.providerId); }, retryDelaysMs: [0, 0, 0] });
  const context = new ContextRecoveryController({ scope: () => owner.scope, isActive,
    requestIdentity: () => owner.route,
    persistLedger: async ledger => { ledgers.push(structuredClone(ledger) as typeof ledgers[number]); },
    canRecover: () => owner.recoveryAllowed, backup: async (_body, info) => {
      archives.push(info.scope); return 'loopback-history-archive';
    } });
  registerBridge(queryToken, () => ({ ...upstream(primary), apiKey: 'loopback-fixture-key', model: owner.route, modelAliases: undefined,
    contextRecovery: context, modelFailover: failover }), 'isolated background lifecycle fixture');
  const handler = createBridgeHandler({ getUpstreamConfig: async req => {
    const token = new URL(req.url).pathname.split('/')[2];
    const config = await lookupBridge(token, req);
    if (!config) throw new Error('Unknown bridge token in isolated fixture');
    return config;
  }, logger: null });
  function retire(cause: 'request abort' | 'Query token retirement' | 'primary route retirement', abort: AbortController) {
    if (cause === 'request abort') abort.abort();
    else if (cause === 'Query token retirement') unregisterBridge(queryToken);
    else owner.route = 'primary-route-generation-2';
  }
  function finishParent() {
    owner.scope = undefined;
    owner.recoveryAllowed = false;
    failover.endTurn();
    context.endTurn();
  }
  return { handler, owner, switches, archives, ledgers, failover, context, finishParent, retire };
}

afterEach(async () => {
  unregisterBridge(queryToken);
  for (const release of releases.splice(0)) release();
  await Promise.all(servers.splice(0).map(async server => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }));
  expect(fixtureErrors.splice(0)).toEqual([]);
});

describe('Query-owned background inference through both recovery controllers', () => {
  it('accepts new background JSON and SSE requests after the parent finishes, without replaying delivered requests', async () => {
    const primary = await fixture((req, res) => {
      if (req.body.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.end(delta('background stream completed') + terminal);
      } else json(res, message('background JSON completed'));
    });
    const backup = await fixture((_req, res) => json(res, message('unexpected backup')));
    const h = harness(primary, backup);
    expect(await (await h.handler(request('parent request'))).json()).toMatchObject({ stop_reason: 'end_turn' });
    h.finishParent();
    const background = await h.handler(request('background next inference'));
    expect(background.status).toBe(200);
    expect(await background.json()).toMatchObject({ content: [{ text: 'background JSON completed' }] });
    const sse = await h.handler(request('background streaming inference', { stream: true }));
    expect(sse.status).toBe(200);
    expect(await sse.text()).toContain('background stream completed');
    const duplicate = await h.handler(request('background next inference'));
    expect(duplicate.status).toBe(409);
    await duplicate.text();
    expect(primary.requests).toHaveLength(3);
    expect(backup.requests).toHaveLength(0);
    expect(h.archives).toEqual([]);
  });

  it('delivers an already issued ordinary request across parent completion', async () => {
    const arrived = gate();
    const respond = gate();
    const primary = await fixture(async (_req, res) => {
      arrived.resolve(); await respond.promise; json(res, message('in-flight child completed'));
    });
    const backup = await fixture((_req, res) => json(res, message('unexpected backup')));
    const h = harness(primary, backup);
    const pending = h.handler(request('child issued before parent terminal'));
    await bounded(arrived.promise);
    h.finishParent();
    respond.resolve();
    const response = await bounded(pending);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ content: [{ text: 'in-flight child completed' }] });
    expect(primary.requests).toHaveLength(1);
    expect(backup.requests).toHaveLength(0);
  });

  it('keeps an already delivered SSE alive across parent completion and a pending body read', async () => {
    const continueStream = gate();
    const primary = await fixture(async (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(delta('before-parent-terminal'));
      await continueStream.promise;
      res.end(delta('after-parent-terminal') + terminal);
    });
    const backup = await fixture((_req, res) => json(res, message('unexpected backup')));
    const h = harness(primary, backup);
    const response = await bounded(h.handler(request('streaming child', { stream: true })));
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await bounded(reader.read())).value)).toContain('before-parent-terminal');
    const pendingRead = reader.read();
    h.finishParent();
    continueStream.resolve();
    const remaining = await bounded(pendingRead);
    expect(new TextDecoder().decode(remaining.value)).toContain('after-parent-terminal');
    while (!(await bounded(reader.read())).done) { /* drain protocol terminal */ }
    expect(primary.requests).toHaveLength(1);
    expect(backup.requests).toHaveLength(0);
  });

  it.each(['JSON response', 'pending SSE read'] as const)(
    'delivers an already issued backup %s across parent completion', async mode => {
      const backupArrived = gate();
      const finishBackup = gate();
      const primary = await fixture((_req, res) => json(res, { error: { message: 'temporary primary failure' } }, 503));
      const backup = await fixture(async (_req, res) => {
        backupArrived.resolve();
        if (mode === 'pending SSE read') {
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          res.write(delta('backup before parent terminal'));
          await finishBackup.promise;
          res.end(delta('backup after parent terminal') + terminal);
        } else {
          await finishBackup.promise;
          json(res, message('backup after parent terminal'));
        }
      });
      const h = harness(primary, backup);
      const pending = h.handler(request('recovery already submitted', { stream: mode === 'pending SSE read' }));
      await bounded(backupArrived.promise);
      if (mode === 'pending SSE read') {
        const response = await bounded(pending);
        const reader = response.body!.getReader();
        expect(new TextDecoder().decode((await bounded(reader.read())).value)).toContain('backup before parent terminal');
        const pendingRead = reader.read();
        h.finishParent();
        finishBackup.resolve();
        expect(new TextDecoder().decode((await bounded(pendingRead)).value)).toContain('backup after parent terminal');
        while (!(await bounded(reader.read())).done) { /* consume successful protocol terminal */ }
      } else {
        h.finishParent();
        finishBackup.resolve();
        const response = await bounded(pending);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ content: [{ text: 'backup after parent terminal' }] });
      }
      expect(primary.requests).toHaveLength(4);
      expect(backup.requests).toHaveLength(1);
      expect(h.switches).toEqual(['backup']);
    });

  it.each(['JSON response', 'pending SSE read'] as const)(
    'delivers an already issued projected %s across parent completion', async mode => {
      const reducedArrived = gate();
      const finishReduced = gate();
      const primary = await fixture(async (req, res) => {
        if (JSON.stringify(req.body.messages).length > 10_000) {
          json(res, { error: { type: 'context_length_exceeded', message: 'Maximum context length exceeded' } }, 400);
          return;
        }
        reducedArrived.resolve();
        if (mode === 'pending SSE read') {
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          res.write(delta('projected before parent terminal'));
          await finishReduced.promise;
          res.end(delta('projected after parent terminal') + terminal);
        } else {
          await finishReduced.promise;
          json(res, message('projected after parent terminal'));
        }
      });
      const backup = await fixture((_req, res) => json(res, message('unexpected backup')));
      const h = harness(primary, backup);
      const pending = h.handler(request('context recovery already submitted', { stream: mode === 'pending SSE read', messages: [
        { role: 'user', content: 'Continue the same task and preserve successful actions.' },
        { role: 'assistant', content: 'old safe-to-archive reasoning '.repeat(2_000) },
        { role: 'user', content: 'Return the existing result.' },
        { role: 'assistant', content: 'The existing action already finished.' },
      ] }));
      await bounded(reducedArrived.promise);
      if (mode === 'pending SSE read') {
        const response = await bounded(pending);
        const reader = response.body!.getReader();
        expect(new TextDecoder().decode((await bounded(reader.read())).value)).toContain('projected before parent terminal');
        const pendingRead = reader.read();
        h.finishParent();
        finishReduced.resolve();
        expect(new TextDecoder().decode((await bounded(pendingRead)).value)).toContain('projected after parent terminal');
        while (!(await bounded(reader.read())).done) { /* consume successful protocol terminal */ }
      } else {
        h.finishParent();
        finishReduced.resolve();
        const response = await bounded(pending);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ content: [{ text: 'projected after parent terminal' }] });
      }
      expect(primary.requests).toHaveLength(2);
      expect(backup.requests).toHaveLength(0);
      expect(h.archives).toEqual(['foreground-1']);
    });

  it.each(['request abort', 'Query token retirement', 'primary route retirement'] as const)(
    'rejects a late response after %s while awaiting headers', async cause => {
      const arrived = gate();
      const respond = gate();
      const primary = await fixture(async (_req, res) => {
        arrived.resolve(); await respond.promise; json(res, message('late forbidden response'));
      });
      const backup = await fixture((_req, res) => json(res, message('unexpected backup')));
      const h = harness(primary, backup);
      const abort = new AbortController();
      const pending = h.handler(request('late headers', { signal: abort.signal }));
      await bounded(arrived.promise);
      h.retire(cause, abort);
      respond.resolve();
      const response = await bounded(pending);
      expect(response.status).toBe(499);
      expect(await response.text()).not.toContain('late forbidden response');
      expect(primary.requests).toHaveLength(1);
      expect(backup.requests).toHaveLength(0);
    });

  it('admits a supported new model on the same Query token while retiring the old model request lease', async () => {
    const oldArrived = gate();
    const replyOld = gate();
    const primary = await fixture(async (req, res) => {
      if (req.body.messages[0].content === 'old model inference') {
        oldArrived.resolve(); await replyOld.promise;
      }
      json(res, message(`completed with ${req.body.model}`));
    });
    const backup = await fixture((_req, res) => json(res, message('unexpected backup')));
    const h = harness(primary, backup);
    const old = h.handler(request('old model inference'));
    await bounded(oldArrived.promise);
    h.owner.route = 'primary-route-generation-2';
    const current = await bounded(h.handler(request('new model inference')));
    expect(current.status).toBe(200);
    expect(await current.json()).toMatchObject({ content: [{ text: 'completed with primary-route-generation-2' }] });
    replyOld.resolve();
    const retired = await bounded(old);
    expect(retired.status).toBe(499);
    await retired.text();
    expect(primary.requests).toHaveLength(2);
    expect(backup.requests).toHaveLength(0);
    expect(hasBridge(queryToken)).toBe(true);
  });

  it.each(['request abort', 'Query token retirement', 'primary route retirement'] as const)(
    'rejects late SSE bytes after %s during a pending read', async cause => {
      const continueStream = gate();
      const primary = await fixture(async (_req, res) => {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(delta('authorized initial bytes'));
        await continueStream.promise;
        res.end(delta('late forbidden bytes') + terminal);
      });
      const backup = await fixture((_req, res) => json(res, message('unexpected backup')));
      const h = harness(primary, backup);
      const abort = new AbortController();
      const response = await bounded(h.handler(request('late stream bytes', { stream: true, signal: abort.signal })));
      const reader = response.body!.getReader();
      expect(new TextDecoder().decode((await bounded(reader.read())).value)).toContain('authorized initial bytes');
      const pendingRead = reader.read();
      const failure = expect(bounded(pendingRead)).rejects.toThrow();
      h.retire(cause, abort);
      continueStream.resolve();
      await failure;
      expect(primary.requests).toHaveLength(1);
      expect(backup.requests).toHaveLength(0);
    });

  it('makes three primary retries before failover while preserving one controlled tool side effect', async () => {
    let toolEffects = 0;
    const tool = { type: 'tool_use' as const, id: 'counter-call-once', name: 'increment_counter', input: {} };
    const primary = await fixture((_req, res) => {
      if (primary.requests.length === 1) json(res, { ...message(''), content: [tool], stop_reason: 'tool_use' });
      else json(res, { error: { type: 'overloaded_error', message: 'temporary 503' } }, 503);
    });
    const backup = await fixture((_req, res) => json(res, message('confirmed counter result')));
    const h = harness(primary, backup);
    const first = await (await h.handler(request('increment exactly once'))).json();
    expect(first.content).toEqual([tool]);
    toolEffects++; // The controlled action runs only after observing the native tool_use.
    const messages: AnthropicRequest['messages'] = [{ role: 'user', content: 'increment exactly once' },
      { role: 'assistant', content: [tool] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: tool.id, content: String(toolEffects) }] }];
    const response = await h.handler(request('', { messages }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ content: [{ text: 'confirmed counter result' }] });
    expect(primary.requests).toHaveLength(5); // One tool response + first failed inference + three retries.
    expect(backup.requests).toHaveLength(1);
    expect(backup.requests[0].body.messages).toEqual(messages);
    expect(toolEffects).toBe(1);
    const replay = await h.handler(request('', { messages }));
    expect(replay.status).toBe(409);
    await replay.text();
    expect(primary.requests).toHaveLength(5);
    expect(backup.requests).toHaveLength(1);
    expect(h.switches).toEqual(['backup']);
  });

  it('retries ordinary background inference three times without starting takeover or context reduction', async () => {
    const primary = await fixture((_req, res) => json(res, { error: { message: 'temporarily overloaded' } }, 503));
    const backup = await fixture((_req, res) => json(res, message('unexpected backup')));
    const h = harness(primary, backup);
    h.finishParent();
    const response = await h.handler(request('background transient failure'));
    expect(response.status).toBe(503);
    await response.text();
    expect(primary.requests).toHaveLength(4);
    expect(backup.requests).toHaveLength(0);
    expect(h.archives).toEqual([]);
    expect(h.switches).toEqual([]);
  });

  it('does not upgrade a background-admitted 503 request into foreground failover when the background registry drains', async () => {
    const backgroundArrived = gate();
    const releaseBackground = gate();
    const backgroundText = 'background admitted while the new foreground scope already exists';
    const primary = await fixture(async (req, res) => {
      if (req.body.messages[0].content === backgroundText) {
        backgroundArrived.resolve();
        await releaseBackground.promise;
      }
      json(res, { error: { message: 'temporary 503' } }, 503);
    });
    const backup = await fixture((_req, res) => json(res, message('genuine foreground recovered')));
    const h = harness(primary, backup);
    h.owner.scope = 'new-foreground-scope-with-old-background';
    h.owner.recoveryAllowed = false;
    const pending = h.handler(request(backgroundText));
    await bounded(backgroundArrived.promise);
    h.owner.recoveryAllowed = true;
    releaseBackground.resolve();
    const background = await bounded(pending);
    expect(background.status).toBe(503);
    await background.text();
    expect(primary.requests).toHaveLength(4);
    expect(backup.requests).toHaveLength(0);
    expect(h.switches).toEqual([]);

    const foreground = await h.handler(request('genuine new foreground inference after the registry drained'));
    expect(foreground.status).toBe(200);
    expect(await foreground.json()).toMatchObject({ content: [{ text: 'genuine foreground recovered' }] });
    expect(primary.requests).toHaveLength(8);
    expect(backup.requests).toHaveLength(1);
    expect(h.switches).toEqual(['backup']);
  });

  it('does not upgrade a background-admitted overflow request into context recovery when the background registry drains', async () => {
    const backgroundArrived = gate();
    const releaseBackground = gate();
    const backgroundText = 'background overflowing request admitted beside a new foreground scope';
    const history = (text: string): AnthropicRequest['messages'] => [
      { role: 'user', content: text },
      { role: 'assistant', content: 'old safely archivable evidence '.repeat(2_000) },
      { role: 'user', content: 'Preserve the existing result and continue.' },
      { role: 'assistant', content: 'The original action is already complete.' },
    ];
    const primary = await fixture(async (req, res) => {
      if (req.body.messages[0].content === backgroundText) {
        backgroundArrived.resolve();
        await releaseBackground.promise;
      }
      if (JSON.stringify(req.body.messages).length > 10_000) {
        json(res, { error: { type: 'context_length_exceeded', message: 'Maximum context length exceeded' } }, 400);
      } else json(res, message('genuine foreground context recovered'));
    });
    const backup = await fixture((_req, res) => json(res, message('unexpected backup')));
    const h = harness(primary, backup);
    h.owner.scope = 'new-foreground-scope-with-old-background';
    h.owner.recoveryAllowed = false;
    const originalBackgroundHistory = history(backgroundText);
    const pending = h.handler(request('', { messages: originalBackgroundHistory }));
    await bounded(backgroundArrived.promise);
    h.owner.recoveryAllowed = true;
    releaseBackground.resolve();
    const background = await bounded(pending);
    expect(background.status).toBe(409);
    await background.text();
    expect(primary.requests).toHaveLength(1);
    expect(primary.requests[0].body.messages).toEqual(originalBackgroundHistory);
    expect(h.archives).toEqual([]);
    expect(h.ledgers).toEqual([]);

    const foreground = await h.handler(request('', { messages: history('genuine foreground overflow after the registry drained') }));
    expect(foreground.status).toBe(200);
    expect(await foreground.json()).toMatchObject({ content: [{ text: 'genuine foreground context recovered' }] });
    expect(primary.requests).toHaveLength(3);
    expect(h.archives).toEqual(['new-foreground-scope-with-old-background']);
    expect(h.ledgers).toHaveLength(1);
    expect(backup.requests).toHaveLength(0);
    expect(h.switches).toEqual([]);
  });

  it('does not inherit a foreground backup pin when background ownership becomes ambiguous', async () => {
    const primary = await fixture((_req, res) => json(res, { error: { message: 'temporary primary failure' } }, 503));
    const backup = await fixture((_req, res) => json(res, message('foreground recovered')));
    const h = harness(primary, backup);
    expect(await (await h.handler(request('foreground inference before background work'))).json())
      .toMatchObject({ content: [{ text: 'foreground recovered' }] });
    expect(primary.requests).toHaveLength(4);
    expect(backup.requests).toHaveLength(1);
    // Parent is still current, but the shared token cannot identify this request's root.
    h.owner.recoveryAllowed = false;
    const background = await h.handler(request('new background inference after foreground fallback'));
    expect(background.status).toBe(503);
    await background.text();
    expect(primary.requests).toHaveLength(8);
    expect(backup.requests).toHaveLength(1);
    expect(h.switches).toEqual(['backup']);
    const duplicate = await h.handler(request('new background inference after foreground fallback'));
    expect(duplicate.status).toBe(409);
    await duplicate.text();
    expect(primary.requests).toHaveLength(8);
  });

  it('continues a new background pipeline with an armed Query ledger and enforces its real tool reservations', async () => {
    let counter = 0;
    const originalTool = { type: 'tool_use' as const, id: 'original-counter', name: 'increment_counter', input: { delta: 1 } };
    const repeatedTool = { ...originalTool, id: 'different-native-id-for-completed-action' };
    const newTool = { ...originalTool, id: 'new-authorized-counter', input: { delta: 2 } };
    const primary = await fixture((req, res) => {
      const count = primary.requests.length;
      if (count === 1) return json(res, { ...message(''), content: [originalTool], stop_reason: 'tool_use' });
      if (JSON.stringify(req.body.messages).length > 10_000) {
        return json(res, { error: { type: 'context_length_exceeded', message: 'Maximum context length exceeded' } }, 400);
      }
      if (count === 3) return json(res, message('recovery ledger armed'));
      if (count === 4) return json(res, { ...message(''), content: [repeatedTool], stop_reason: 'tool_use' });
      if (count === 5) return json(res, { ...message(''), content: [newTool], stop_reason: 'tool_use' });
      if (count === 6) return json(res, message('background counter is 3'));
      json(res, { error: { message: 'temporary failure after uncertain background action' } }, 503);
    });
    const backup = await fixture((_req, res) => json(res, message('unexpected backup')));
    const h = harness(primary, backup);
    const first = await (await h.handler(request('start controlled counter'))).json();
    expect(first.content).toEqual([originalTool]);
    expect(await h.context.authorizeTool(originalTool.name, originalTool.input)).toBeUndefined();
    counter += originalTool.input.delta;
    await h.context.commitToolResult(originalTool.name, originalTool.input, `counter=${counter}`);
    const nativeHistory: AnthropicRequest['messages'] = [{ role: 'user', content: 'start controlled counter' },
      { role: 'assistant', content: [originalTool] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: originalTool.id,
        content: `counter=${counter}\n${'old tool evidence '.repeat(2_000)}` }] },
      { role: 'assistant', content: 'The original action completed successfully.' },
      { role: 'user', content: 'Continue with the saved counter result.' }];
    const recovered = await h.handler(request('', { messages: nativeHistory }));
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toMatchObject({ content: [{ text: 'recovery ledger armed' }] });
    expect(h.archives).toEqual(['foreground-1']);
    expect(h.ledgers.at(-1)).toMatchObject({ completed: [expect.any(Array)], uncertain: [], blocked: false });
    h.finishParent();

    // This is a new, unprojected native request, after real overflow recovery armed the Query ledger.
    const backgroundHistory: AnthropicRequest['messages'] = [{ role: 'user', content: 'Background: verify the saved counter and continue.' }];
    const repeated = await h.handler(request('', { messages: backgroundHistory }));
    expect(repeated.status).toBe(200);
    expect((await repeated.json()).content).toEqual([repeatedTool]);
    expect(primary.requests[3].body.messages).toEqual(backgroundHistory);
    expect(h.archives).toHaveLength(1);
    const denial = await h.context.authorizeTool(repeatedTool.name, repeatedTool.input);
    expect(denial).toContain('already completed');
    await h.context.commitToolResult(repeatedTool.name, repeatedTool.input, denial, true);
    expect(counter).toBe(1);
    expect(h.ledgers.at(-1)?.uncertain).toEqual([]);

    backgroundHistory.push({ role: 'assistant', content: [repeatedTool] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: repeatedTool.id, content: denial, is_error: true }] });
    const next = await h.handler(request('', { messages: backgroundHistory }));
    expect(next.status).toBe(200);
    expect((await next.json()).content).toEqual([newTool]);
    expect(await h.context.authorizeTool(newTool.name, newTool.input)).toBeUndefined();
    expect(h.ledgers.at(-1)?.uncertain).toHaveLength(1); // Durable reservation precedes the actual action.
    counter += newTool.input.delta;
    await h.context.commitToolResult(newTool.name, newTool.input, `counter=${counter}`);
    expect(h.ledgers.at(-1)?.uncertain).toEqual([]);
    expect(h.ledgers.at(-1)?.completed).toHaveLength(2);
    backgroundHistory.push({ role: 'assistant', content: [newTool] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: newTool.id, content: `counter=${counter}` }] });
    const complete = await h.handler(request('', { messages: backgroundHistory }));
    expect(complete.status).toBe(200);
    expect(await complete.json()).toMatchObject({ content: [{ text: 'background counter is 3' }] });
    expect(counter).toBe(3);
    expect(h.archives).toHaveLength(1);

    const uncertainInput = { delta: 3 };
    expect(await h.context.authorizeTool('increment_counter', uncertainInput)).toBeUndefined();
    expect(h.ledgers.at(-1)?.uncertain).toHaveLength(1);
    await h.context.commitToolResult('increment_counter', uncertainInput, 'unknown outcome after tool transport failed', true);
    expect(await h.context.authorizeTool('increment_counter', uncertainInput)).toContain('uncertain');
    const uncertain = await h.handler(request('background read-only verification after uncertain action'));
    expect(uncertain.status).toBe(503);
    await uncertain.text();
    expect(primary.requests).toHaveLength(7); // Unknown action disables all three automatic retries.
    expect(counter).toBe(3);

    expect(() => h.context.restoreCheckpoint({ model: 'primary-model', max_tokens: 16,
      messages: [{ role: 'user', content: 'corrupt checkpoint' }] }, 'loopback-corrupt-archive', '0'.repeat(64))).toThrow('integrity');
    expect(await h.context.authorizeTool('increment_counter', { delta: 4 })).toContain('blocked');
    const corrupt = await h.handler(request('background inference after ledger integrity failure'));
    expect(corrupt.status).toBe(409);
    await corrupt.text();
    expect(primary.requests).toHaveLength(7);
    expect(backup.requests).toHaveLength(0);
  });

  it('stops the retry chain when the Query retires during a retry response', async () => {
    const retryArrived = gate();
    const reply = gate();
    const primary = await fixture(async (_req, res) => {
      if (primary.requests.length === 2) { retryArrived.resolve(); await reply.promise; }
      json(res, { error: { message: 'temporarily overloaded' } }, 503);
    });
    const backup = await fixture((_req, res) => json(res, message('unexpected backup')));
    const h = harness(primary, backup);
    const pending = h.handler(request('stop during retry'));
    await bounded(retryArrived.promise);
    h.owner.queryActive = false;
    reply.resolve();
    const response = await bounded(pending);
    expect(response.status).toBe(499);
    await response.text();
    expect(primary.requests).toHaveLength(2);
    expect(backup.requests).toHaveLength(0);
    expect(h.switches).toEqual([]);
  });

  it.each(['active parent', 'completed parent', 'background tool after parent completed'] as const)(
    'does not retry inference or switch providers after a known uncertain tool outcome with %s', async phase => {
      const primary = await fixture((_req, res) => json(res, { error: { message: 'temporarily unavailable' } }, 503));
      const backup = await fixture((_req, res) => json(res, message('unexpected backup')));
      const h = harness(primary, backup);
      if (phase === 'background tool after parent completed') h.finishParent();
      h.context.recordToolResult('increment_counter', { delta: 1 }, 'transport lost after write started', true);
      if (phase === 'completed parent') h.finishParent();
      const response = await h.handler(request('read-only check required before continuing'));
      expect(response.status).toBe(503);
      await response.text();
      expect(primary.requests).toHaveLength(1);
      expect(backup.requests).toHaveLength(0);
      expect(h.switches).toEqual([]);
      expect(h.context.canRetryInference()).toBe(false);
    });

  it('refuses background context reduction without archiving or replaying the overflowing request', async () => {
    const primary = await fixture((_req, res) => json(res,
      { error: { type: 'context_length_exceeded', message: 'Maximum context length exceeded' } }, 400));
    const backup = await fixture((_req, res) => json(res, message('unexpected backup')));
    const h = harness(primary, backup);
    h.finishParent();
    const response = await h.handler(request('background overflow', { messages: [
      { role: 'user', content: 'Preserve the original request and its completed actions.' },
      { role: 'assistant', content: 'large archived reasoning '.repeat(2_000) },
      { role: 'user', content: 'Continue background work' },
      { role: 'assistant', content: 'Current work is still active.' },
    ] }));
    expect(response.status).toBe(409);
    await response.text();
    expect(primary.requests).toHaveLength(1);
    expect(backup.requests).toHaveLength(0);
    expect(h.archives).toEqual([]);
  });

  it('keeps partial-stream replay sealed after the parent ends', async () => {
    const breakStream = gate();
    const primary = await fixture(async (_req, res) => {
      if (primary.requests.length > 1) { json(res, message('explicit new foreground completed')); return; }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(delta('delivered partial progress'));
      await breakStream.promise;
      res.destroy();
    });
    const backup = await fixture((_req, res) => json(res, message('unexpected backup')));
    const h = harness(primary, backup);
    const response = await bounded(h.handler(request('original stream', { stream: true })));
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await bounded(reader.read())).value)).toContain('delivered partial progress');
    const failure = expect(bounded(reader.read())).rejects.toThrow();
    breakStream.resolve();
    await failure;
    h.finishParent();
    for (const text of ['original stream', 'implicit continuation with modified native history']) {
      const replay = await h.handler(request(text, { stream: true }));
      expect(replay.status).toBe(409);
      await replay.text();
    }
    expect(primary.requests).toHaveLength(1);
    expect(backup.requests).toHaveLength(0);
    h.owner.scope = 'foreground-2';
    h.owner.recoveryAllowed = true;
    const explicitNewRoot = await h.handler(request('original stream', { stream: true }));
    expect(explicitNewRoot.status).toBe(200);
    expect(await explicitNewRoot.json()).toMatchObject({ content: [{ text: 'explicit new foreground completed' }] });
    expect(primary.requests).toHaveLength(2);
  });

  it('keeps a late background failure from consuming the next foreground root retry budget', async () => {
    const backgroundArrived = gate();
    const replyBackground = gate();
    const primary = await fixture(async (req, res) => {
      if (req.body.messages[0].content === 'old background inference') {
        backgroundArrived.resolve(); await replyBackground.promise;
      }
      json(res, { error: { message: 'temporary failure' } }, 503);
    });
    const backup = await fixture((_req, res) => json(res, message('new foreground recovered')));
    const h = harness(primary, backup);
    const old = h.handler(request('old background inference'));
    await bounded(backgroundArrived.promise);
    h.finishParent();
    h.owner.scope = 'foreground-2';
    h.owner.recoveryAllowed = true;
    const current = await bounded(h.handler(request('new foreground inference')));
    expect(current.status).toBe(200);
    expect(await current.json()).toMatchObject({ content: [{ text: 'new foreground recovered' }] });
    replyBackground.resolve();
    const oldResponse = await bounded(old);
    // Old-root failure may stop or safely exhaust its own primary budget, but cannot adopt the new root's backup.
    expect([409, 499, 503]).toContain(oldResponse.status);
    await oldResponse.text();
    expect(primary.requests.filter(req => req.body.messages[0].content === 'new foreground inference')).toHaveLength(4);
    expect(backup.requests).toHaveLength(1);
    expect(backup.requests[0].body.messages[0].content).toBe('new foreground inference');
    expect(h.switches).toEqual(['backup']);
  });
});
