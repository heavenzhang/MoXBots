/** Actual SDK task queries and persisted native history; synthetic loopback inference only. */
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { query, getSessionMessages } from '@anthropic-ai/claude-agent-sdk';
import { ContextRecoveryController, recoveryActionHash } from '../src/server/openai-bridge/context-recovery';
import { inspectRecoveryActions, reconcileRecoveryAction } from '../src/server/builtin-session/recovery-reconciliation';
const scratch = await mkdtemp(join(tmpdir(), 'mox-native-review-'));
const previousConfig = process.env.CLAUDE_CONFIG_DIR;
process.env.CLAUDE_CONFIG_DIR = join(scratch, '.claude');
const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), 60_000);
let calls = 0; let sdkSessionId = ''; let terminal = false;
const frame = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
const server = createServer((req, res) => {
  void (async () => {
    for await (const _chunk of req) { /* Consume only this synthetic request. */ }
    if (req.url?.includes('count_tokens')) { res.writeHead(200); res.end('{"input_tokens":100}'); return; }
    const step = calls++;
    assert(step < 3, 'Unexpected inference replay');
    const name = step === 0 ? 'TaskGet' : 'TaskList';
    const tool = step < 2;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(frame('message_start', { message: { id: `m-${step}`, type: 'message', role: 'assistant', model: 'fixture-model', content: [], usage: { input_tokens: 100, output_tokens: 0 } } })
      + frame('content_block_start', { index: 0, content_block: tool ? { type: 'tool_use', id: `query-${step}`, name, input: {} } : { type: 'text', text: '' } })
      + frame('content_block_delta', { index: 0, delta: tool ? { type: 'input_json_delta', partial_json: '{}' } : { type: 'text_delta', text: 'Fixture query complete.' } })
      + frame('content_block_stop', { index: 0 })
      + frame('message_delta', { delta: { stop_reason: tool ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 20 } })
      + frame('message_stop', {}));
  })().catch(error => { console.error(error); abort.abort(); res.destroy(); });
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address(); assert(address && typeof address !== 'string');
const native = query({ prompt: 'Query the synthetic task list.', options: {
  cwd: scratch, model: 'fixture-model', settingSources: [], tools: ['TaskGet', 'TaskList'],
  ...(process.env.MOX_NATIVE_EXECUTABLE ? { pathToClaudeCodeExecutable: process.env.MOX_NATIVE_EXECUTABLE } : {}),
  permissionMode: 'default', abortController: abort, maxTurns: 4,
  env: { PATH: process.env.PATH, HOME: scratch, USERPROFILE: scratch, CLAUDE_CONFIG_DIR: join(scratch, '.claude'),
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${address.port}`, ANTHROPIC_API_KEY: 'fixture',
    ANTHROPIC_AUTH_TOKEN: '', CLAUDE_CODE_OAUTH_TOKEN: '', CLAUDE_CODE_MAX_RETRIES: '0',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1', ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
    HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '', http_proxy: '', https_proxy: '', all_proxy: '',
  },
} });
try {
  for await (const event of native) {
    if (event.type === 'system' && event.subtype === 'init') sdkSessionId = event.session_id;
    if (event.type === 'result') { terminal = !event.is_error; assert(terminal, event.subtype); }
  }
  assert(terminal); assert.equal(calls, 3); assert(sdkSessionId);
  const rows = await getSessionMessages(sdkSessionId, { dir: scratch, limit: 50_001 });
  assert(rows.length > 0, 'Actual SDK persisted history must be readable');
  const keys = ['TaskGet', 'TaskList'].map(name => recoveryActionHash(name, {}));
  let ledger: unknown = { version: 1, completed: [], uncertain: keys, denied: [], blocked: false };
  const path = join(scratch, 'review-ledger.json');
  const deps = { owner: { sessionId: 'fixture-product', sdkSessionId, epoch: 1, reviewAuthority: 'fixture-native-review' },
    isCurrent: () => true, load: () => ledger, readNative: async () => rows,
    save: async (next: unknown) => { await writeFile(path, JSON.stringify(next), { mode: 0o600 }); ledger = JSON.parse(await readFile(path, 'utf8')); },
    adopt: () => {},
  };
  for (const actionHash of keys) {
    const snapshot = await inspectRecoveryActions(deps);
    assert(snapshot.actions.find(action => action.actionHash === actionHash)?.eligible);
    await reconcileRecoveryAction({ ...deps.owner, ledgerDigest: snapshot.ledgerDigest, actionHash }, deps);
  }
  const restored = new ContextRecoveryController({ initialLedger: JSON.parse(await readFile(path, 'utf8')), recoveryOwner: deps.owner,
    scope: () => undefined, isActive: () => false, backup: async () => { throw new Error('No inference'); } });
  assert.equal(restored.inspectActionLedger().uncertainCount, 0);
  assert.equal(restored.inspectActionLedger().readonlyTaskReceiptCount, 2);
  assert.deepEqual((ledger as { uncertain: string[] }).uncertain, keys);
  console.log(JSON.stringify({ status: 'PASS', scratch, calls, actualSdkAndNativeQueries: true, actualSdkHistoryReader: true,
    queryReceipts: 2, preservedRawUnknowns: 2, effectiveUnknowns: 0, syntheticModel: true, syntheticInitialLedger: true,
    productionStore: false, installedClient: false, originalBusinessSessionsTouched: false }));
} finally {
  clearTimeout(timer); native.close(); server.closeAllConnections(); server.close();
  if (previousConfig === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = previousConfig;
}
