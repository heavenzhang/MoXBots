/** Real SDK + MCP, synthetic loopback supplier, private fixture persistence.
 * --goal uses a synthetic fixed Goal owner, not the production Rust scheduler.
 * --stop stops during durable waiting. Real 15s policy is recorded; clock is compressed.
 */
import { randomUUID } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { mkdtemp, writeFile, readFile, rename, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { query, createSdkMcpServer, tool, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { createBridgeHandler } from '../src/server/openai-bridge/handler';
import { ContextRecoveryController } from '../src/server/openai-bridge/context-recovery';
import { ModelFailoverController } from '../src/server/openai-bridge/model-failover';
import { SessionModelRecovery } from '../src/server/builtin-session/model-recovery';
import { SameTurnStreamContinuation } from '../src/server/builtin-session/stream-continuation';
import type { AnthropicRequest } from '../src/server/openai-bridge/types/anthropic';
import { MODEL_RECOVERY_WINDOW_MS, modelRecoveryDelay, validModelRecovery, type ModelRecoveryState } from '../src/shared/modelRecovery';
import type { StreamRecoveryEvidence } from '../src/shared/streamRecovery';

const interruptions = process.argv.includes('--twice') ? 2 : 1;
const fixtureNativeId = randomUUID();
const goal = process.argv.includes('--goal');
const stop = process.argv.includes('--stop');
const sdkVersion = JSON.parse(await readFile(new URL('../node_modules/@anthropic-ai/claude-agent-sdk/package.json', import.meta.url), 'utf8')).version as string;
const scratch = await mkdtemp(join(tmpdir(), `moxbots-stream-native-${stop ? 'stop' : goal ? 'goal' : 'ordinary'}-`));
const journalPath = join(scratch, 'model-recovery.json');
const ledgerPath = join(scratch, 'action-ledger.json');
const rootId = 'original-product-turn';
const original = 'PRIVATE FIXTURE TASK: increment the local counter once and then report completion.';
const partial = 'PRESERVED_PARTIAL_PROGRESS_747: the counter has completed once; continuing analysis.';
const servers: Server[] = [];
const errors: string[] = [];
const evidence: StreamRecoveryEvidence[] = [];
const sdkResults: string[] = [];
const suppliedInputs: string[] = [];
const upstreamBodies: AnthropicRequest[] = [];
const waits: { policyDelayMs: number; startedAt: number; deadlineAt: number }[] = [];
let active = true;
let generation = 0;
let gatewayCalls = 0;
let clock = Date.now();
let counter = 0;
let denied = 0;
let finalTerminalCallbacks = 0;
let nativeSessionId: string | undefined;
let journal: ModelRecoveryState | undefined;
let initialCheckpoint: ModelRecoveryState | undefined;
let latestCheckpoint: ModelRecoveryState | undefined;
let partialObserved = false;
let observedText = '';
let replayRejections = 0;
let stoppedUpstreamCalls: number | undefined;
let generatorDone = false;
let wakeInput: (() => void) | undefined;
const queue: SDKUserMessage[] = [];
const abort = new AbortController();
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
function reply(res: ServerResponse, toolId?: string, interrupted = false): void {
  const text = interrupted ? partial : 'Verified existing progress. Counter remains 1. Task complete.';
  const start = frame('message_start', { type: 'message_start', message: { id: `fixture-${upstreamBodies.length}`, type: 'message', role: 'assistant',
    model: 'primary-fixture', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0 } } });
  const block = frame('content_block_start', { type: 'content_block_start', index: 0,
    content_block: toolId ? { type: 'tool_use', id: toolId, name: 'mcp__counter__increment', input: {} } : { type: 'text', text: '' } })
    + frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: toolId
      ? { type: 'input_json_delta', partial_json: '{}' } : { type: 'text_delta', text } });
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.end(start + block + (interrupted ? '' : frame('content_block_stop', { type: 'content_block_stop', index: 0 })
    + frame('message_delta', { type: 'message_delta', delta: { stop_reason: toolId ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 20 } })
    + frame('message_stop', { type: 'message_stop' })));
}
async function listen(server: Server): Promise<number> {
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  return address.port;
}
function pushInput(text: string): void {
  suppliedInputs.push(text);
  queue.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null });
  wakeInput?.(); wakeInput = undefined;
}
function finishInputs(): void { generatorDone = true; wakeInput?.(); wakeInput = undefined; }
async function* inputs(): AsyncGenerator<SDKUserMessage> {
  while (!generatorDone) {
    if (queue.length) { yield queue.shift()!; continue; }
    await new Promise<void>(resolve => { wakeInput = resolve; });
  }
}
const upstream = createServer((req, res) => {
  void (async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as AnthropicRequest;
    upstreamBodies.push(body);
    assert(active, 'no supplier call is allowed after Stop');
    assert(upstreamBodies.length <= 2 + interruptions * 2, 'bounded fixture cannot hide automatic replay');
    assert.equal(body.model, 'primary-fixture');
    if (upstreamBodies.length === 1) { reply(res, 'confirmed-first-action'); return; }
    assert.equal(counter, 1, 'partial stream follows a real completed MCP action');
    assert(JSON.stringify(body.messages).includes('confirmed-first-action'));
    if (upstreamBodies.length === 2 || (interruptions === 2 && upstreamBodies.length === 4)) { reply(res, undefined, true); return; }
    assert.equal(generation, Math.floor((upstreamBodies.length - 1) / 2), 'continuation uses a fresh bridge namespace');
    assert(JSON.stringify(body.messages).includes('mox-stream-continuation:'), 'supplier sees marker-authorized native history');
    assert(body.messages.some(message => message.role === 'user' && Array.isArray(message.content)
      && message.content.some(block => block.type === 'tool_result' && block.tool_use_id === 'confirmed-first-action')), 'completed tool result remains in native history');
    if (upstreamBodies.length % 2 === 1) { reply(res, `new-id-same-action-${generation}`); return; }
    reply(res);
  })().catch(error => { errors.push(String(error)); res.destroy(); });
});
const upstreamPort = await listen(upstream);
const scope = () => `${rootId}:inference-generation-${generation}`;
const owner = { sessionId: 'fixture-product', sdkSessionId: fixtureNativeId };
const context = new ContextRecoveryController({ scope, isActive: () => active, protectStreaming: true, recoveryOwner: owner,
  persistLedger: async ledger => { await writeFile(ledgerPath, JSON.stringify(ledger), { mode: 0o600 }); },
  backup: async (body, metadata) => {
    const path = join(scratch, `native-request-${metadata.digest}.json`);
    await writeFile(path, JSON.stringify(body), { mode: 0o600 });
    return path;
  },
});
context.bindNoDispatchOwner({ ...owner, queryGeneration: 1, isCurrent: () => active });
const modelRecovery = new SessionModelRecovery({ read: () => journal,
  write: async (next, expected, live) => {
    if (!live() || JSON.stringify(journal) !== JSON.stringify(expected)) return false;
    const temporary = `${journalPath}.pending`;
    await writeFile(temporary, JSON.stringify({ modelRecovery: next ?? null }), { mode: 0o600 });
    if (!live()) return false;
    await rename(temporary, journalPath); journal = next ? structuredClone(next) : undefined;
    return true;
  },
  current: () => nativeSessionId ? { sdkSessionId: nativeSessionId, routeIdentity: 'synthetic-primary-no-backup', turnId: rootId,
    ...(goal ? { goalId: 'synthetic-fixed-goal-owner' } : {}) } : undefined,
  isLive: () => active, prepare: async request => context.protectInference(await request.json() as AnthropicRequest), now: () => clock,
});
const failover = new ModelFailoverController({ scope, isActive: () => active,
  requestIdentity: () => 'synthetic-primary-no-backup', canRetry: () => context.canRetryInference(), resolveBackup: () => undefined,
  onSwitch: () => { throw new Error('fixture has no backup'); }, retryDelaysMs: [0, 0, 0], recovery: {
    admit: async request => {
      const admitted = await modelRecovery.admit(request);
      if (admitted) {
        assert.equal(admitted.delayMs, 0);
        assert(initialCheckpoint && journal);
        assert.equal(journal.deadlineAt, initialCheckpoint.deadlineAt, 'continuation cannot renew the durable budget');
        assert.equal(journal.startedAt, initialCheckpoint.startedAt);
        assert.equal(journal.attempt, latestCheckpoint!.attempt);
        assert.equal(journal.turnId, rootId);
        return { delayMs: 0 };
      }
      return undefined;
    },
    validateResume: request => modelRecovery.validateResume(request), wait: (request, failure) => modelRecovery.wait(request, failure),
    complete: request => modelRecovery.complete(request), blocked: (request, reason) => modelRecovery.blocked(request, reason),
    interrupted: async request => {
      const allowed = await modelRecovery.interrupted(request);
      if (allowed) {
        assert(journal && validModelRecovery(journal));
        initialCheckpoint ??= structuredClone(journal);
        latestCheckpoint = structuredClone(journal);
        assert.equal(journal.id, initialCheckpoint.id, 'repeated interruptions retain the same recovery chain');
        assert.equal(journal.deadlineAt, initialCheckpoint.deadlineAt);
        assert.equal(journal.attempt, waits.length + 1);
        assert.equal(journal.nextRetryAt - clock, modelRecoveryDelay(journal.attempt), 'record actual first wait policy');
        assert.deepEqual(JSON.parse(await readFile(journalPath, 'utf8')).modelRecovery, journal);
        waits.push({ policyDelayMs: journal.nextRetryAt - clock, startedAt: journal.startedAt, deadlineAt: journal.deadlineAt });
        continuation.interrupted();
      }
      return allowed;
    },
  },
});
const continuation = new SameTurnStreamContinuation({ recovery: modelRecovery, rootId: () => rootId,
  isLive: () => active, now: () => clock,
  advance: body => {
    const count = context.prepareStreamContinuation(body);
    failover.endTurn(); generation++;
    return count;
  },
  enqueue: (permit, reminder) => {
    assert(continuation.acceptsInput(permit));
    assert.equal(permit.rootId, rootId);
    assert(!reminder.includes(original));
    pushInput(reminder); return true;
  },
  observe: row => { evidence.push(row); },
});
const handler = createBridgeHandler({ logger: null, getUpstreamConfig: () => {
  return { providerId: 'fixture', baseUrl: `http://127.0.0.1:${upstreamPort}`, apiProtocol: 'anthropic', model: 'primary-fixture',
    apiKey: 'fixture-key', contextRecovery: context, modelFailover: failover };
} });
const gateway = createServer((req, res) => {
  void (async () => {
    if (req.url?.endsWith('/count_tokens')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"input_tokens":100}'); return; }
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const request = new Request(`http://127.0.0.1${req.url}`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: Buffer.concat(chunks), signal: controller.signal });
    const parsed = await request.clone().json() as AnthropicRequest;
    await writeFile(join(scratch, `gateway-${++gatewayCalls}.json`), JSON.stringify(parsed, null, 2), { mode: 0o600 });
    const authorized = continuation.authorizeRequest(parsed);
    console.log(JSON.stringify({ event: 'gateway-admission', gatewayCalls, authorized, generation, lastRole: parsed.messages?.at(-1)?.role }));
    const response = await handler(request);
    if (response.status === 409) replayRejections++;
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) for await (const chunk of response.body) res.write(chunk);
    res.end();
  })().catch(error => { if (active) errors.push(String(error)); if (!res.headersSent) res.writeHead(500); res.end(); });
});
const gatewayPort = await listen(gateway);
const counterServer = createSdkMcpServer({ name: 'counter', version: '1.0.0', tools: [
  tool('increment', 'Increment the local fixture counter exactly once', {}, async () => {
    counter++; await writeFile(join(scratch, 'counter.txt'), String(counter), { mode: 0o600 });
    return { content: [{ type: 'text', text: `count=${counter}` }] };
  }),
] });
const deadline = setTimeout(() => abort.abort('fixture exceeded 90 second bound'), 90_000);
pushInput(original);
const native = query({ prompt: inputs(), options: { sessionId: fixtureNativeId, cwd: scratch, model: 'primary-fixture', settingSources: [], tools: [],
  mcpServers: { counter: counterServer }, allowedTools: ['mcp__counter__increment'], persistSession: true, includePartialMessages: true,
  permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true, abortController: abort, maxTurns: 8,
  hooks: {
    PreToolUse: [{ hooks: [async input => {
      if (input.hook_event_name !== 'PreToolUse') return {};
      const reason = await context.authorizeTool(input.tool_name, input.tool_input, input.tool_use_id);
      if (!reason) return {};
      denied++; return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
    }] }],
    PostToolUse: [{ hooks: [async input => {
      if (input.hook_event_name === 'PostToolUse') await context.commitToolResult(input.tool_name, input.tool_input, input.tool_response, false, input.tool_use_id);
      return {};
    }] }],
  },
  env: { PATH: process.env.PATH, HOME: scratch, USERPROFILE: scratch,
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${gatewayPort}/bridge/fixture`, ANTHROPIC_API_KEY: 'fixture-key',
    ANTHROPIC_AUTH_TOKEN: '', CLAUDE_CODE_OAUTH_TOKEN: '', CLAUDE_CODE_MAX_RETRIES: '0',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1', ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
    API_TIMEOUT_MS: String(MODEL_RECOVERY_WINDOW_MS + 5 * 60_000), CLAUDE_ENABLE_BYTE_WATCHDOG: '0', CLAUDE_ENABLE_STREAM_WATCHDOG: '0',
    API_FORCE_IDLE_TIMEOUT: '0', CLAUDE_CODE_RETRY_WATCHDOG: '0',
    HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '', http_proxy: '', https_proxy: '', all_proxy: '',
  },
} });
try {
  for await (const event of native) {
    if (event.type === 'system' && event.subtype === 'init') {
      if (nativeSessionId) assert.equal(event.session_id, nativeSessionId);
      assert.equal(event.session_id, fixtureNativeId);
      nativeSessionId = event.session_id;
      console.log(JSON.stringify({ event: 'native-init', mode: stop ? 'stop' : goal ? 'goal' : 'ordinary', nativeSessionId }));
    }
    if (event.type === 'stream_event' && event.event.type === 'content_block_delta'
      && event.event.delta.type === 'text_delta') {
      observedText += event.event.delta.text;
      partialObserved = observedText.includes(partial);
    }
    if (event.type !== 'result') continue;
    sdkResults.push(`${event.subtype}:${event.is_error ? 'error' : 'ok'}`);
    if (event.is_error || event.subtype !== 'success') {
      assert(journal && initialCheckpoint, 'native error result must follow a durable stream checkpoint');
      const stopNow = stop && waits.length === interruptions;
      clock = stopNow ? journal.nextRetryAt - 25 : journal.nextRetryAt;
      assert(continuation.schedule(), 'only original native result boundary schedules continuation');
      if (stopNow) {
        continuation.stop(); await modelRecovery.pause('synthetic user Stop during durable wait');
        stoppedUpstreamCalls = upstreamBodies.length; active = false;
        await new Promise(resolve => setTimeout(resolve, 100));
        assert.equal(upstreamBodies.length, stoppedUpstreamCalls);
        finishInputs(); native.close(); break;
      }
      continue;
    }
    assert(journal && initialCheckpoint);
    assert.equal(journal.deadlineAt, initialCheckpoint.deadlineAt);
    assert.equal(journal.attempt, latestCheckpoint!.attempt);
    assert(await modelRecovery.finishStreamTurn()); continuation.finish(); finalTerminalCallbacks++;
    finishInputs(); break;
  }
  assert.equal(counter, 1); assert.equal(await readFile(join(scratch, 'counter.txt'), 'utf8'), '1');
  assert(partialObserved, 'native SDK exposes the already-delivered partial text');
  assert(sdkResults[0]?.endsWith(':error'), 'interrupted native result is an error');
  assert(initialCheckpoint && validModelRecovery(initialCheckpoint));
  assert.equal(initialCheckpoint.turnId, rootId);
  assert.equal(initialCheckpoint.goalId, goal ? 'synthetic-fixed-goal-owner' : undefined);
  assert.equal(waits.length, interruptions);
  const durableActions = JSON.parse(await readFile(ledgerPath, 'utf8'));
  assert.equal(durableActions.operationAttempts.entries.length, 1);
  assert.equal(durableActions.operationAttempts.entries[0].status, 'returned');
  assert.equal(durableActions.uncertain.length, 0);
  if (stop) {
    assert.equal(generation, interruptions - 1); assert.equal(upstreamBodies.length, interruptions * 2); assert.equal(suppliedInputs.length, interruptions);
    assert.equal(finalTerminalCallbacks, 0); assert.equal(journal?.status, 'paused');
    assert.equal(evidence.at(-1)?.status, 'stopped'); assert.equal(evidence.at(-1)?.continuations, interruptions - 1);
  } else {
    assert.equal(generation, interruptions); assert.equal(upstreamBodies.length, 2 + interruptions * 2); assert.equal(denied, interruptions);
    assert.equal(suppliedInputs.length, interruptions + 1); assert.equal(suppliedInputs.filter(input => input === original).length, 1);
    assert(suppliedInputs[1].includes('mox-stream-continuation:')); assert(!suppliedInputs[1].includes(original));
    assert.equal(finalTerminalCallbacks, 1); assert.equal(sdkResults.at(-1), 'success:ok'); assert.equal(journal, undefined);
    assert.deepEqual(evidence.at(-1), { ...evidence.at(-1), version: 1, interruptions, continuations: interruptions, protectedActions: 1, status: 'completed' });
  }
  await writeFile(join(scratch, 'observed-stream-text.txt'), observedText, { mode: 0o600 });
  assert((await readFile(join(scratch, 'observed-stream-text.txt'), 'utf8')).includes(partial));
  assert.equal((await stat(ledgerPath)).mode & 0o777, 0o600); assert.equal((await stat(journalPath)).mode & 0o777, 0o600);
  assert.deepEqual(errors, []);
  const receipt = { passed: true, interruptions, operationAttemptCount: 1, mode: stop ? 'stop' : goal ? 'synthetic Goal owner' : 'ordinary original owner', rootId, nativeSessionId,
    counter, denied, upstreamCalls: upstreamBodies.length, inputCount: suppliedInputs.length, finalTerminalCallbacks, sdkResults, evidence, waits,
    partialObserved, partialEvidence: 'delivered SDK stream deltas saved; partial assistant was not retained in native continuation wire history',
    generation, stoppedUpstreamCalls, gatewayCalls, replayRejections, sdkVersion, realSdk: true, actualMcpCounter: true, isolatedHome: true, paidCalls: 0,
    supplier: 'synthetic loopback; clean EOF after delivered text without message_stop',
    persistence: 'private fixture writer, not production SessionStore acceptance',
    clock: 'controlled; real policy delays recorded, permitted waits compressed to 0ms (Stop timer to 25ms)',
    goalBoundary: 'fixed synthetic owner only, not production Rust Goal acceptance' };
  await writeFile(join(scratch, 'receipt.json'), JSON.stringify(receipt, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ ...receipt, artifactDirectory: scratch }));
} catch (error) {
  console.error(JSON.stringify({ passed: false, error: String(error), errors, counter, denied, upstreamCalls: upstreamBodies.length,
    nativeSessionId, sdkResults, evidence, waits, partialObserved, generation, artifactDirectory: scratch })); process.exitCode = 1;
} finally {
  clearTimeout(deadline); active = false; finishInputs(); native.close(); continuation.reset(); context.endTurn(); failover.endTurn();
  for (const server of servers) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
