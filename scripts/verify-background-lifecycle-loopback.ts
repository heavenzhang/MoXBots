/** Actual native SDK background Agent; all inference is served by local fixtures. */
import { createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { createServer, type ServerResponse } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { query, createSdkMcpServer, tool, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { createBridgeHandler } from '../src/server/openai-bridge/handler';
import { ModelFailoverController } from '../src/server/openai-bridge/model-failover';
import { ContextRecoveryController } from '../src/server/openai-bridge/context-recovery';

const afterRecovery = process.argv.includes('--after-recovery');
const scratch = await mkdtemp(join(tmpdir(), 'moxbots-background-native-'));
const abort = new AbortController();
let active = true;
let scope: string | undefined = 'parent-root';
let background = false;
let parentCompleted = false;
let counter = 0;
let childCallsAfterParent = 0;
let parentCalls = 0;
let childCalls = 0;
let taskStatus: string | undefined;
let releaseParent!: () => void;
let finishInput!: () => void;
const parentDone = new Promise<void>(resolve => { releaseParent = resolve; });
const inputDone = new Promise<void>(resolve => { finishInput = resolve; });
const events: unknown[] = [];
const frame = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
function reply(res: ServerResponse, content: { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: object }) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const isTool = content.type === 'tool_use';
  res.end(frame('message_start', { type: 'message_start', message: { id: `fixture-${parentCalls}-${childCalls}`, type: 'message', role: 'assistant',
    model: 'primary-fixture', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0 } } })
    + frame('content_block_start', { type: 'content_block_start', index: 0, content_block: isTool ? { ...content, input: {} } : { type: 'text', text: '' } })
    + frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: isTool
      ? { type: 'input_json_delta', partial_json: JSON.stringify(content.input) } : { type: 'text_delta', text: content.text } })
    + frame('content_block_stop', { type: 'content_block_stop', index: 0 })
    + frame('message_delta', { type: 'message_delta', delta: { stop_reason: isTool ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 20 } })
    + frame('message_stop', { type: 'message_stop' }));
}
const failures: unknown[] = [];
const upstream = createServer((req, res) => {
  void (async () => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (JSON.stringify(body.system).includes('BACKGROUND_CHILD_SENTINEL')) {
      childCalls++;
      await parentDone;
      if (parentCompleted) childCallsAfterParent++;
      reply(res, JSON.stringify(body.messages).includes('count=1')
        ? { type: 'text', text: 'Background finished with count=1.' }
        : { type: 'tool_use', id: 'counter-once', name: 'mcp__counter__increment', input: {} });
    } else {
      parentCalls++;
      reply(res, parentCalls === 1
        ? { type: 'tool_use', id: 'spawn-background', name: 'Agent', input: { subagent_type: 'background-fixture', description: 'Background lifecycle fixture', prompt: 'Increment the local counter once and report.', run_in_background: true } }
        : { type: 'text', text: 'Parent reply complete; background work continues.' });
    }
  })().catch(error => { failures.push(String(error)); res.destroy(); });
});
await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
const address = upstream.address(); if (!address || typeof address === 'string') throw new Error('fixture bind');
const modelFailover = new ModelFailoverController({ scope: () => scope, isActive: () => active && !abort.signal.aborted,
  canSwitch: () => !background, resolveBackup: () => undefined, onSwitch: () => { throw new Error('unexpected fallback'); } });
const contextRecovery = new ContextRecoveryController({ scope: () => scope, isActive: () => active && !abort.signal.aborted,
  canRecover: () => !background,
  persistLedger: async ledger => { await writeFile(join(scratch, 'ledger.json'), JSON.stringify(ledger), { mode: 0o600 }); },
  backup: async (body, info) => {
    if (!afterRecovery) throw new Error('unexpected projection');
    const archive = join(scratch, `${info.digest}.json`); await writeFile(archive, JSON.stringify(body), { mode: 0o600 }); return archive;
  } });
if (afterRecovery) {
  const checkpoint = { model: 'primary-fixture', max_tokens: 10, messages: [
    { role: 'user' as const, content: 'Prior action already completed.' },
    { role: 'assistant' as const, content: [{ type: 'tool_use' as const, id: 'prior-action', name: 'prior_write', input: { id: 'old' } }] },
    { role: 'user' as const, content: [{ type: 'tool_result' as const, tool_use_id: 'prior-action', content: 'success' }] },
  ] };
  contextRecovery.restoreCheckpoint(checkpoint, 'isolated-fixture-archive', createHash('sha256').update(JSON.stringify(checkpoint)).digest('hex'));
}
const handler = createBridgeHandler({ logger: null, getUpstreamConfig: () => ({ providerId: 'fixture', apiProtocol: 'anthropic',
  baseUrl: `http://127.0.0.1:${address.port}`, apiKey: 'fixture-only', model: 'primary-fixture', modelFailover, contextRecovery }) });
const gateway = createServer((req, res) => {
  void (async () => {
    if (req.url?.endsWith('/count_tokens')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"input_tokens":100}'); return; }
    const cancellation = new AbortController(); res.on('close', () => { if (!res.writableEnded) cancellation.abort(); });
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const response = await handler(new Request(`http://127.0.0.1${req.url}`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: Buffer.concat(chunks), signal: cancellation.signal }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) for await (const chunk of response.body) res.write(chunk);
    res.end();
  })().catch(error => { failures.push(String(error)); res.destroy(); });
});
await new Promise<void>(resolve => gateway.listen(0, '127.0.0.1', resolve));
const gatewayAddress = gateway.address(); if (!gatewayAddress || typeof gatewayAddress === 'string') throw new Error('gateway bind');
async function* prompt(): AsyncGenerator<SDKUserMessage> {
  yield { type: 'user', session_id: '', parent_tool_use_id: null, message: { role: 'user', content: 'Start the background fixture, then complete the parent reply.' } };
  await inputDone;
}
const deadline = setTimeout(() => { finishInput(); releaseParent(); abort.abort(); }, 60_000);
const counterServer = createSdkMcpServer({ name: 'counter', version: '1.0.0', tools: [tool('increment', 'Increment local fixture counter once', {}, async () => {
  const denied = await contextRecovery.authorizeTool('mcp__counter__increment', {});
  if (denied) return { content: [{ type: 'text', text: denied }], isError: true };
  counter++; await writeFile(join(scratch, 'counter.txt'), String(counter)); await contextRecovery.commitToolResult('mcp__counter__increment', {}, `count=${counter}`);
  return { content: [{ type: 'text', text: `count=${counter}` }] };
})] });
const run = query({ prompt: prompt(), options: { cwd: scratch, model: 'primary-fixture', settingSources: [], tools: ['Agent'],
  mcpServers: { counter: counterServer }, allowedTools: ['Agent', 'mcp__counter__increment'], agents: {
    'background-fixture': { description: 'Local background fixture only', prompt: 'BACKGROUND_CHILD_SENTINEL. Use the counter exactly once.', tools: ['mcp__counter__increment'], model: 'inherit' },
  }, permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true, abortController: abort, maxTurns: 4,
  env: { PATH: process.env.PATH, HOME: scratch, USERPROFILE: scratch, ANTHROPIC_BASE_URL: `http://127.0.0.1:${gatewayAddress.port}/bridge/fixture`,
    ANTHROPIC_API_KEY: 'fixture-only', ANTHROPIC_AUTH_TOKEN: '', CLAUDE_CODE_OAUTH_TOKEN: '', CLAUDE_CODE_MAX_RETRIES: '0',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1', ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
    HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '', http_proxy: '', https_proxy: '', all_proxy: '' } } });
try {
  for await (const event of run) {
    if (event.type === 'system' && event.subtype === 'background_tasks_changed') background = event.tasks.some(task => !task.ambient);
    if (event.type === 'result' && !parentCompleted) {
      assert.equal(event.is_error, false); parentCompleted = true; scope = undefined;
      modelFailover.endTurn(); contextRecovery.endTurn(); releaseParent();
      events.push({ type: 'parent-completed', background });
    }
    if (event.type === 'system' && event.subtype === 'task_notification') {
      taskStatus = event.status; events.push({ type: event.subtype, status: taskStatus, summary: event.summary }); finishInput(); break;
    }
  }
  await writeFile(join(scratch, 'observed.json'), JSON.stringify({ taskStatus, parentCompleted, counter, parentCalls, childCalls, childCallsAfterParent, failures, events }, null, 2));
  if (taskStatus !== 'completed') console.error(JSON.stringify({ evidence: scratch, taskStatus, events, failures }));
  assert.equal(taskStatus, 'completed'); assert.equal(parentCompleted, true); assert.equal(counter, 1);
  assert(childCallsAfterParent >= 2); assert.deepEqual(failures, []);
  const receipt = { passed: true, afterRecovery, realSdk: true, upstream: 'synthetic-loopback-only', paidCalls: 0, parentCompleted,
    taskStatus, counter, parentCalls, childCalls, childCallsAfterParent, events, evidence: scratch };
  await writeFile(join(scratch, 'receipt.json'), JSON.stringify(receipt, null, 2)); console.log(JSON.stringify(receipt));
} finally {
  active = false; finishInput(); releaseParent(); run.close(); clearTimeout(deadline);
  for (const server of [gateway, upstream]) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
