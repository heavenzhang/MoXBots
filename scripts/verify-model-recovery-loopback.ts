/** Real SDK/native child and actual MCP counter; synthetic loopback suppliers only.
 * Private journal persistence is a fixture writer, not production SessionStore acceptance.
 * A controlled clock records the real 15s policy but compresses permitted transport waits to 0ms.
 */
import { strict as assert } from 'node:assert';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { mkdtemp, writeFile, readFile, rename, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { createBridgeHandler } from '../src/server/openai-bridge/handler';
import { ContextRecoveryController } from '../src/server/openai-bridge/context-recovery';
import { ModelFailoverController, type InferenceRecoveryHooks } from '../src/server/openai-bridge/model-failover';
import { SessionModelRecovery } from '../src/server/builtin-session/model-recovery';
import type { AnthropicRequest } from '../src/server/openai-bridge/types/anthropic';
import { MODEL_RECOVERY_WINDOW_MS, validModelRecovery, type ModelRecoveryState } from '../src/shared/modelRecovery';

const scratch = await mkdtemp(join(tmpdir(), 'moxbots-model-recovery-native-'));
const journalPath = join(scratch, 'model-recovery.json');
const ledgerPath = join(scratch, 'action-ledger.json');
const counterPath = join(scratch, 'counter.txt');
const transport = {
  API_TIMEOUT_MS: String(MODEL_RECOVERY_WINDOW_MS + 5 * 60_000),
  CLAUDE_ENABLE_BYTE_WATCHDOG: '0',
  CLAUDE_ENABLE_STREAM_WATCHDOG: '0',
  API_FORCE_IDLE_TIMEOUT: '0',
  CLAUDE_CODE_RETRY_WATCHDOG: '0',
};
type Phase = 'initial' | 'checkpoint' | 'restart';
let phase: Phase = 'initial';
let active = true;
let scope = 'original-goal-turn';
let nativeSessionId: string | undefined;
let clock = Date.now();
let counter = 0;
let denied = 0;
let archives = 0;
let gatewayCalls = 0;
let phaseCalls = 0;
let restoredAdmits = 0;
let restoredAdmissionDelayMs: number | undefined;
let restartSource: ModelRecoveryState | undefined;
let journal: ModelRecoveryState | undefined;
const waits: { phase: Phase; attempt: number; requestedDelayMs: number; nextRetryAt: number; status: number }[] = [];
const results: { phase: Phase; subtype: string; sessionId: string }[] = [];
const errors: unknown[] = [];
const servers: Server[] = [];
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
const checkpointReady = deferred();
const checkpointReleased = deferred();
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
function message(res: ServerResponse, toolId?: string): void {
  const text = 'Existing progress verified. Counter remains 1. Task complete.';
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.end(frame('message_start', { type: 'message_start', message: { id: `fixture-${phase}-${phaseCalls}`, type: 'message', role: 'assistant',
    model: 'primary-fixture', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0 } } })
    + frame('content_block_start', { type: 'content_block_start', index: 0,
      content_block: toolId ? { type: 'tool_use', id: toolId, name: 'mcp__counter__increment', input: {} } : { type: 'text', text: '' } })
    + frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: toolId
      ? { type: 'input_json_delta', partial_json: '{}' } : { type: 'text_delta', text } })
    + frame('content_block_stop', { type: 'content_block_stop', index: 0 })
    + frame('message_delta', { type: 'message_delta', delta: { stop_reason: toolId ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 20 } })
    + frame('message_stop', { type: 'message_stop' }));
}
async function listen(server: Server): Promise<number> {
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Loopback fixture did not bind');
  return address.port;
}
const upstream = createServer((req, res) => {
  void (async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as AnthropicRequest;
    phaseCalls++;
    assert.equal(body.model, 'primary-fixture');
    if (phase === 'initial' && phaseCalls === 1) { message(res, 'first-confirmed-action'); return; }
    if (phase === 'checkpoint' || (phase === 'initial' && phaseCalls >= 2 && phaseCalls <= 5)) {
      assert.equal(counter, 1, 'outage begins only after the real MCP action succeeded');
      assert(JSON.stringify(body.messages).includes('first-confirmed-action'), 'failed inference retains completed action evidence');
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'synthetic temporary outage' } }));
      return;
    }
    if (phase === 'initial' && phaseCalls === 6) { message(res, 'new-id-same-action-after-wait'); return; }
    if (phase === 'restart' && phaseCalls === 1) { message(res, 'new-id-same-action-after-restart'); return; }
    assert(phaseCalls <= (phase === 'initial' ? 7 : 2), 'fixture must not hide extra implicit model replay');
    message(res);
  })().catch(error => { errors.push(error); res.destroy(); });
});
const upstreamPort = await listen(upstream);
let context: ContextRecoveryController;
let modelRecovery: SessionModelRecovery;
let failover: ModelFailoverController;
async function createControllers(initialLedger?: unknown): Promise<void> {
  context = new ContextRecoveryController({ scope: () => scope, isActive: () => active, initialLedger,
    persistLedger: async ledger => { await writeFile(ledgerPath, JSON.stringify(ledger), { mode: 0o600 }); },
    backup: async (body, metadata) => {
      archives++;
      const path = join(scratch, `${metadata.digest}.json`);
      await writeFile(path, JSON.stringify(body), { mode: 0o600 });
      return path;
    },
  });
  const queryContext = context;
  modelRecovery = new SessionModelRecovery({ read: () => journal,
    write: async (next, expected, live) => {
      if (!live() || JSON.stringify(journal) !== JSON.stringify(expected)) return false;
      const temporary = `${journalPath}.pending`;
      await writeFile(temporary, JSON.stringify({ modelRecovery: next ?? null }), { mode: 0o600 });
      if (!live()) return false;
      await rename(temporary, journalPath);
      journal = next ? structuredClone(next) : undefined;
      return true;
    },
    current: () => nativeSessionId ? { sdkSessionId: nativeSessionId, routeIdentity: 'fixture-provider-primary-no-backup', turnId: scope, goalId: 'same-goal-fixture' } : undefined,
    isLive: () => active,
    prepare: async request => {
      try { await queryContext.protectInference(await request.json() as AnthropicRequest); }
      catch (error) { errors.push(error); throw error; }
    },
    now: () => clock,
  });
  const queryRecovery = modelRecovery;
  const hooks: InferenceRecoveryHooks = {
    validateResume: request => queryRecovery.validateResume(request),
    async admit(request) {
      const restored = await queryRecovery.admit(request);
      if (!restored) return undefined;
      assert.equal(phase, 'restart');
      assert(restored.delayMs > 0, 'a genuine future retry date must gate the restarted Query');
      assert(journal && validModelRecovery(journal));
      assert(restartSource);
      assert.equal(journal.id, restartSource.id, 'Query reconstruction retains the existing recovery identity');
      assert.equal(journal.attempt, restartSource.attempt, 'admission cannot reset durable wait rounds');
      assert.equal(journal.startedAt, restartSource.startedAt);
      assert.equal(journal.nextRetryAt, restartSource.nextRetryAt);
      assert.equal(journal.deadlineAt, restartSource.deadlineAt, 'admission cannot open a new recovery window');
      restoredAdmissionDelayMs = restored.delayMs;
      restoredAdmits++;
      clock = journal.nextRetryAt;
      return { delayMs: 0 };
    },
    async wait(request, failure) {
      const delay = await queryRecovery.wait(request, failure);
      console.log(JSON.stringify({ event: 'durable-wait', phase, delay, attempt: failure.attempt, phaseCalls }));
      assert.equal(delay, 15_000, 'real policy must durably authorize a 15-second first wait');
      assert(journal && validModelRecovery(journal));
      assert.equal(journal.status, 'waiting');
      const disk = JSON.parse(await readFile(journalPath, 'utf8')).modelRecovery as ModelRecoveryState;
      assert.deepEqual(disk, journal, 'checkpoint must reach the private file before any retry permission');
      waits.push({ phase, attempt: failure.attempt, requestedDelayMs: delay, nextRetryAt: journal.nextRetryAt, status: failure.status });
      if (phase === 'checkpoint') {
        checkpointReady.resolve();
        await checkpointReleased.promise;
        return 0;
      }
      clock = journal.nextRetryAt;
      return 0;
    },
    complete: request => queryRecovery.complete(request),
    blocked: (request, reason) => queryRecovery.blocked(request, reason),
  };
  failover = new ModelFailoverController({ scope: () => scope, isActive: () => active,
    requestIdentity: () => 'fixture-provider-primary-no-backup', canRetry: () => queryContext.canRetryInference(),
    resolveBackup: () => undefined, onSwitch: () => { throw new Error('fixture has no backup'); }, retryDelaysMs: [0, 0, 0], recovery: hooks });
}
await createControllers();
const handler = createBridgeHandler({ logger: null, getUpstreamConfig: () => ({ providerId: 'fixture',
  baseUrl: `http://127.0.0.1:${upstreamPort}`, apiProtocol: 'anthropic', model: 'primary-fixture', apiKey: 'fixture',
  contextRecovery: context, modelFailover: failover }) });
const gateway = createServer((req, res) => {
  void (async () => {
    if (req.url?.endsWith('/count_tokens')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"input_tokens":100}'); return; }
    gatewayCalls++;
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const response = await handler(new Request(`http://127.0.0.1${req.url}`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: Buffer.concat(chunks), signal: abort.signal }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) for await (const chunk of response.body) res.write(chunk);
    res.end();
  })().catch(error => { if (active) errors.push(error); if (!res.headersSent) res.writeHead(500); res.end(); });
});
const gatewayPort = await listen(gateway);
const abort = new AbortController();
const deadline = setTimeout(() => abort.abort(), 90_000);
const counterServer = createSdkMcpServer({ name: 'counter', version: '1.0.0', tools: [
  tool('increment', 'Increment the local fixture business counter exactly once', {}, async () => {
    counter++;
    await writeFile(counterPath, String(counter), { mode: 0o600 });
    return { content: [{ type: 'text', text: `count=${counter}` }] };
  }),
] });
async function run(prompt: string, stopAtCheckpoint = false): Promise<void> {
  const native = query({ prompt, options: {
    cwd: scratch, model: 'primary-fixture', settingSources: [], tools: [], resume: nativeSessionId,
    mcpServers: { counter: counterServer }, allowedTools: ['mcp__counter__increment'],
    permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true,
    hooks: {
      PreToolUse: [{ hooks: [async input => {
        if (input.hook_event_name !== 'PreToolUse') return {};
        const reason = await context.authorizeTool(input.tool_name, input.tool_input);
        if (!reason) return {};
        denied++;
        return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
      }] }],
      PostToolUse: [{ hooks: [async input => {
        if (input.hook_event_name === 'PostToolUse') await context.commitToolResult(input.tool_name, input.tool_input, input.tool_response);
        return {};
      }] }],
    },
    abortController: abort, maxTurns: 5, persistSession: true,
    env: { PATH: process.env.PATH, HOME: scratch, USERPROFILE: scratch,
      ...transport,
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${gatewayPort}/bridge/fixture`, ANTHROPIC_API_KEY: 'fixture-key',
      ANTHROPIC_AUTH_TOKEN: '', CLAUDE_CODE_OAUTH_TOKEN: '', CLAUDE_CODE_MAX_RETRIES: '0',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1', ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
      HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '', http_proxy: '', https_proxy: '', all_proxy: '',
    },
  } });
  const shutdown = stopAtCheckpoint ? checkpointReady.promise.then(() => {
    // Simulated abrupt Query retirement, deliberately without the user Stop/pause path.
    active = false;
    native.close();
    checkpointReleased.resolve();
  }) : undefined;
  try {
    for await (const event of native) {
      if (event.type === 'system' && event.subtype === 'init') {
        if (nativeSessionId) assert.equal(event.session_id, nativeSessionId, 'native history must retain its original Session ID');
        nativeSessionId = event.session_id;
        console.log(JSON.stringify({ event: 'native-init', phase, nativeSessionId }));
      }
      if (event.type === 'result') results.push({ phase, subtype: event.subtype, sessionId: event.session_id });
    }
    if (shutdown) await shutdown;
  } catch (error) {
    if (!stopAtCheckpoint || !journal || journal.status !== 'waiting') throw error;
  } finally {
    native.close();
    context.endTurn();
    failover.endTurn();
  }
}
try {
  await run('Increment the fixture counter once, then report its result.');
  assert.equal(counter, 1);
  assert.equal(denied, 1, 'real SDK PreToolUse must deny the new-ID duplicate after durable waiting');
  assert.equal(phaseCalls, 7);
  assert.deepEqual(waits.map(row => row.attempt), [4]);
  assert.equal(journal, undefined, 'full inference delivery must clear the first waiting checkpoint');
  assert.equal(results.at(-1)?.subtype, 'success');

  phase = 'checkpoint'; scope = 'same-goal-interrupted-turn'; phaseCalls = 0;
  await createControllers(JSON.parse(await readFile(ledgerPath, 'utf8')));
  await run('Continue the same original Goal from verified progress.', true);
  assert.equal(phaseCalls, 4, 'Query retirement occurs after the original fast retry budget');
  const persisted = JSON.parse(await readFile(journalPath, 'utf8')).modelRecovery as ModelRecoveryState;
  assert(validModelRecovery(persisted));
  assert.equal(persisted.status, 'waiting');
  assert(persisted.nextRetryAt > clock, 'restart fixture retains a genuinely pending retry timestamp');

  phase = 'restart'; scope = 'same-goal-rebuilt-query'; phaseCalls = 0; active = true;
  restartSource = structuredClone(persisted);
  journal = structuredClone(persisted);
  await createControllers(JSON.parse(await readFile(ledgerPath, 'utf8')));
  await run('Resume the same Goal from its saved model-wait checkpoint.');
  assert.equal(restoredAdmits, 1);
  assert.equal(phaseCalls, 2);
  assert.equal(counter, 1, 'same-history ledger must prevent the real MCP side effect after native Query restart');
  assert.equal(await readFile(counterPath, 'utf8'), '1');
  assert.equal(denied, 2);
  assert.equal(journal, undefined, 'complete resumed inference clears the rebound durable wait');
  assert.equal(results.at(-1)?.subtype, 'success');
  assert(results.every(row => row.sessionId === nativeSessionId));
  assert.deepEqual(errors, []);
  assert.equal((await stat(ledgerPath)).mode & 0o777, 0o600);
  assert.equal((await stat(journalPath)).mode & 0o777, 0o600);
  const receipt = { passed: true, counter, denied, archives, gatewayCalls, waits, restoredAdmits, restoredAdmissionDelayMs, nativeSessionId,
    nativeQueryRestart: true, realSdk: true, actualMcpCounter: true, isolatedHome: true, paidCalls: 0,
    supplier: 'synthetic-loopback-only', persistence: 'private fixture writer; production SessionStore separately tested',
    clock: 'controlled; real 15000ms policy recorded, authorized waits compressed to 0ms',
    nativeTransport: transport, transportEvidence: 'configured production settings; not a 35-minute wall-clock soak', results };
  await writeFile(join(scratch, 'receipt.json'), JSON.stringify(receipt, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ ...receipt, evidence: scratch }));
} catch (error) {
  console.error(JSON.stringify({ passed: false, phase, phaseCalls, gatewayCalls, counter, denied, evidence: scratch,
    error: String(error), causes: errors.map(String) }));
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  active = false;
  checkpointReleased.resolve();
  for (const server of servers) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
