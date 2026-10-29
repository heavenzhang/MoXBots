/** Real SDK/native child + local synthetic suppliers. No account or paid inference. */
import { strict as assert } from 'node:assert';
import { createServer, type ServerResponse } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { createBridgeHandler } from '../src/server/openai-bridge/handler';
import { SessionModelRecovery } from '../src/server/builtin-session/model-recovery';
import { ContextRecoveryController } from '../src/server/openai-bridge/context-recovery';
import { ModelFailoverController } from '../src/server/openai-bridge/model-failover';

const chain = process.argv.includes('--chain');
assert(!chain || process.argv.slice(2).every(flag => flag === '--chain'), '--chain cannot be combined with another mode');
const terminalTrailer = process.argv.includes('--terminal-trailer');
const providerCooldown = process.argv.includes('--retry-after');
const declinedRecovery = process.argv.includes('--declined-recovery');
const upstreamRejection = providerCooldown || declinedRecovery || process.argv.includes('--upstream-rejection');
const streamFailure = process.argv.includes('--stream-failure');
const stopDuringRetry = process.argv.includes('--stop-during-retry');
let interruptSdk: (() => Promise<unknown>) | undefined;
let interruptRequested = false;
let interruptScheduled = false;
let stopFence = false;
let interruptTask: Promise<void> | undefined;
let interruptCompleted = false;
const interruptFailures: string[] = [];
const scratch = await mkdtemp(join(tmpdir(), 'moxbots-failover-native-'));
let rejectedResponses = 0;
let counter = 0;
let primaryCalls = 0;
let backupCalls = 0;
const candidateCalls = { a: 0, b: 0 };
let switches = 0;
let restoredResult = false;
let nativeSessionId: string | undefined;
const results: unknown[] = [];
function nativeTerminalText(rows: readonly unknown[]): string {
  return rows.flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const row = value as { result?: unknown; errors?: unknown };
    return [typeof row.result === 'string' ? row.result : '',
      ...(Array.isArray(row.errors) ? row.errors.filter((error): error is string => typeof error === 'string') : [])];
  }).filter(Boolean).join('\n');
}
// Duration, UUID and port digits are not upstream HTTP status evidence.
assert.equal(nativeTerminalText([{ duration_ms: 409, session_id: 'fixture-409',
  result: 'API Error: 503 fixture outage' }]), 'API Error: 503 fixture outage');
assert.equal(nativeTerminalText([{ errors: ['API Error: 409 blocked'] }]), 'API Error: 409 blocked');
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
function message(res: ServerResponse, useTool: boolean) {
  const content = useTool ? { type: 'tool_use', id: 'count-once', name: 'mcp__counter__increment', input: {} }
    : { type: 'text', text: 'Resumed from count=1. Task complete.' };
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.end(frame('message_start', { type: 'message_start', message: { id: 'fixture-message', type: 'message', role: 'assistant',
    model: 'primary-fixture', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0 } } })
    + frame('content_block_start', { type: 'content_block_start', index: 0, content_block: useTool ? { ...content, input: {} } : { type: 'text', text: '' } })
    + (useTool ? frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{}' } })
      : frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Resumed from count=1. Task complete.' } }))
    + frame('content_block_stop', { type: 'content_block_stop', index: 0 })
    + frame('message_delta', { type: 'message_delta', delta: { stop_reason: useTool ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 20 } })
    + frame('message_stop', { type: 'message_stop' })
    + (terminalTrailer ? 'data: [DONE]\n\n' : ''));
}
const upstream = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString());
  if (req.url?.startsWith('/backup')) {
    backupCalls++;
    restoredResult = JSON.stringify(body.messages).includes('count=1');
    assert(restoredResult, 'backup must receive the completed tool result');
    if (chain) {
      const candidate = req.url.startsWith('/backup-a/') ? 'a' : 'b';
      candidateCalls[candidate]++;
      if (candidate === 'a') {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'fixture candidate outage' } }));
        return;
      }
    }
    message(res, false);
  } else {
    primaryCalls++;
    if (JSON.stringify(body.messages).includes('count=1')) {
      if (streamFailure) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(frame('message_start', { type: 'message_start', message: { id: 'partial', type: 'message', role: 'assistant',
          model: 'primary-fixture', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0 } } })
          + frame('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
          + frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'partial response' } }));
        setTimeout(() => res.destroy(), 25);
        return;
      }
      if (stopDuringRetry && !interruptScheduled) {
        interruptScheduled = true;
        setTimeout(() => {
          stopFence = true; interruptRequested = true;
          interruptTask = interruptSdk?.().then(() => { interruptCompleted = true; }).catch(error => { interruptFailures.push(String(error)); });
        }, 50);
      }
      res.writeHead(503, { 'content-type': 'application/json', ...(providerCooldown ? { 'retry-after': '60' } : {}) });
      res.end(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'fixture outage' } }));
    } else message(res, true);
  }
});
await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
const upstreamAddress = upstream.address();
if (!upstreamAddress || typeof upstreamAddress === 'string') throw new Error('No fixture port');
const base = `http://127.0.0.1:${upstreamAddress.port}`;
// Fixed Query-local candidate snapshot; no settings or actual provider pool.
const candidates = (chain ? ['a', 'b'] : ['backup']).map(id => ({ providerId: chain ? `backup-${id}` : 'backup',
  baseUrl: `${base}/${chain ? `backup-${id}` : 'backup'}`, apiProtocol: 'anthropic' as const,
  model: chain ? `backup-${id}-fixture` : 'backup-fixture', apiKey: 'fixture-backup' }));
let candidateIndex = 0;
const failover = new ModelFailoverController({ scope: () => 'native-root',
  // Product Stop marks its existing interrupt owner before awaiting SDK transport cancellation.
  canRetry: () => !stopFence,
  resolveBackup: () => upstreamRejection ? undefined : candidates[candidateIndex],
  advanceCandidate: chain ? () => {
    if (candidateIndex + 1 >= candidates.length) return false;
    candidateIndex++; return true;
  } : undefined,
  onSwitch: () => { switches++; },
  recovery: declinedRecovery ? new SessionModelRecovery({ read: () => undefined, current: () => undefined,
    isLive: () => true, prepare: async () => {}, write: async () => true }) : undefined });
const contextRecovery = upstreamRejection ? new ContextRecoveryController({ scope: () => 'fixture-root',
  isActive: () => true, backup: async () => join(scratch, 'unused-archive.json') }) : undefined;
const handler = createBridgeHandler({ logger: null, getUpstreamConfig: () => ({ providerId: 'primary',
  baseUrl: `${base}/primary`, apiProtocol: 'anthropic', model: 'primary-fixture', apiKey: 'fixture-main', modelFailover: failover, contextRecovery }) });
const gateway = createServer(async (req, res) => {
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  try {
    if (req.url?.endsWith('/count_tokens')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"input_tokens":100}'); return; }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const response = await handler(new Request(`http://127.0.0.1${req.url}`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: Buffer.concat(chunks), signal: controller.signal }));
    const headers = Object.fromEntries(response.headers);
    if (upstreamRejection && !response.ok) {
      rejectedResponses++;
      // Force one native SDK repeat to exercise both admission guards, as in
      // stream rescue/older transports that do not honor the initial hint.
      if (rejectedResponses === 1) delete headers['x-should-retry'];
      // This fixture deliberately provokes an SDK repeat without a minute-long wait.
      // Production preserves Retry-After; the real-HTTP integration asserts that.
      if (providerCooldown) delete headers['retry-after'];
    }
    res.writeHead(response.status, headers);
    if (response.body) for await (const chunk of response.body) res.write(chunk);
    res.end();
  } catch { if (!res.headersSent) res.writeHead(500); res.end(); }
});
await new Promise<void>(resolve => gateway.listen(0, '127.0.0.1', resolve));
const gatewayAddress = gateway.address();
if (!gatewayAddress || typeof gatewayAddress === 'string') throw new Error('No gateway port');
const abort = new AbortController();
const deadline = setTimeout(() => abort.abort(), 45_000);
try {
  const counterServer = createSdkMcpServer({ name: 'counter', version: '1.0.0', tools: [
    tool('increment', 'Increment the local fixture counter exactly once', {}, async () => {
      counter++;
      await writeFile(join(scratch, 'counter.txt'), String(counter));
      return { content: [{ type: 'text', text: `count=${counter}` }] };
    }),
  ] });
  const run = query({ prompt: 'Call the counter once, then report its result. Never increment twice.', options: {
    cwd: scratch, model: 'primary-fixture', settingSources: [], tools: [],
    mcpServers: { counter: counterServer }, allowedTools: ['mcp__counter__increment'],
    permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true,
    abortController: abort, maxTurns: 4, persistSession: true,
    env: { PATH: process.env.PATH, HOME: scratch, USERPROFILE: scratch,
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${gatewayAddress.port}/bridge/fixture`,
      ANTHROPIC_API_KEY: 'fixture-key', ANTHROPIC_AUTH_TOKEN: '', CLAUDE_CODE_OAUTH_TOKEN: '',
      CLAUDE_CODE_MAX_RETRIES: upstreamRejection ? '1' : '0', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1', ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
      HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '', http_proxy: '', https_proxy: '', all_proxy: '',
    },
  } });
  interruptSdk = () => run.interrupt();
  let nativeFailed = false;
  try {
    for await (const event of run) {
      if (event.type === 'system' && event.subtype === 'init') nativeSessionId = event.session_id;
      if (event.type === 'result') results.push(event);
    }
  } catch (error) { nativeFailed = true; if (!streamFailure && !stopDuringRetry && !upstreamRejection) throw error; } finally { if (stopDuringRetry && interruptTask) await interruptTask; run.close(); }
  assert.equal(counter, 1);
  assert.equal(primaryCalls, providerCooldown || streamFailure || stopDuringRetry ? 2 : 5); // first tool, then initial availability failure plus three retries
  assert.equal(backupCalls, chain ? 5 : streamFailure || stopDuringRetry || upstreamRejection ? 0 : 1);
  if (chain) assert.deepEqual(candidateCalls, { a: 4, b: 1 });
  assert.equal(switches, chain ? 2 : streamFailure || stopDuringRetry || upstreamRejection ? 0 : 1);
  if (stopDuringRetry) { assert(interruptRequested); assert(interruptCompleted); assert.equal(interruptFailures.length, 0); }
  else if (upstreamRejection) {
    const terminal = nativeTerminalText(results);
    assert.equal(rejectedResponses, 2, 'native SDK must actually repeat the rejected inference');
    assert(terminal.includes('automatic_replay_blocked'), 'native terminal must retain Goal safety pause semantics');
    assert(/\b(?:API Error:|HTTP)\s*503\b/.test(terminal), 'native terminal must retain original HTTP 503');
    assert(!/\b(?:API Error:|HTTP)\s*409\b/.test(terminal), 'native terminal must not replace rejection with HTTP 409');
  }
  else if (streamFailure) assert(nativeFailed || results.some(value => (value as { subtype?: string }).subtype !== 'success'));
  else { assert(restoredResult); assert(results.some(value => (value as { subtype?: string }).subtype === 'success')); }
  const receipt = { passed: true, providerCooldown, chain, candidateCalls, terminalTrailer, declinedRecovery, rejectedResponses, upstreamRejection, streamFailure, stopDuringRetry, interruptRequested, interruptCompleted, nativeSessionId, counter, primaryCalls, backupCalls, switches,
    restoredResult, realSdk: true, upstream: 'synthetic-loopback-only', paidCalls: 0 };
  await writeFile(join(scratch, 'receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ ...receipt, evidence: scratch }));
} finally {
  clearTimeout(deadline);
  for (const server of [gateway, upstream]) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
