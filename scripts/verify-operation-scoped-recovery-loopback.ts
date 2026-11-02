/** Actual SDK/native Bash + recovery hooks; synthetic model and local log fixture. No remote account or paid inference. */
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { ContextRecoveryController, recoveryActionHash } from '../src/server/openai-bridge/context-recovery';
import { createBridgeHandler } from '../src/server/openai-bridge/handler';
import { ModelFailoverController } from '../src/server/openai-bridge/model-failover';
import type { NativeOperationJournalData } from '../src/server/openai-bridge/native-operation-journal';
import type { AnthropicRequest } from '../src/server/openai-bridge/types/anthropic';

const scratch = await mkdtemp(join(tmpdir(), 'mox-operation-scoped-'));
const abort = new AbortController();
const injectHttpCooldown = process.argv.includes('--http-rejection-cooldown');
const timer = setTimeout(() => abort.abort(), injectHttpCooldown ? 120_000 : 60_000);
let context: ContextRecoveryController;
let ledger: { uncertain: string[]; nativeErrors: unknown[]; operationAttempts: NativeOperationJournalData } | undefined;
let calls = 0;
const injectReturnedHistoryGap = process.argv.includes('--returned-history-gap');
const injectHttpRejection = process.argv.includes('--http-rejection');
assert(!(injectHttpCooldown && injectHttpRejection), 'Select one HTTP rejection scenario');
let rejectedHttpCalls = 0;
let cooldownStartedAt = 0;
let cooldownElapsedMs = 0;
let backupSwitches = 0;
let injectedHistoryGap = false;
let denied = 0;
let terminal = false;
const nativeFailures: unknown[] = [];
let nativeOwner: { sessionId: string; sdkSessionId: string };
const oldInput = { command: "printf 'unexpected replay' >> original-launch.txt", description: 'Original operation with unknown outcome' };
const oldHash = recoveryActionHash('Bash', oldInput);
const inspectInput = { command: 'cat build.log', description: 'Read the existing build result' };
const nextInput = { command: 'test "$(cat build.log)" = "BUILD SUCCESS" && printf "once\\n" >> package-count.txt', description: 'Package only after verifying build success' };
await writeFile(join(scratch, 'build.log'), 'BUILD SUCCESS');
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const upstream = createServer((req, res) => {
  void (async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()) as AnthropicRequest;
    // Real time and a real SDK connection: the model endpoint rejects once,
    // then the same admitted inference waits without replaying any native tool.
    if (injectHttpCooldown && rejectedHttpCalls === 0) {
      rejectedHttpCalls++;
      cooldownStartedAt = Date.now();
      res.writeHead(502, { 'content-type': 'application/json', 'retry-after': '60' });
      res.end('{"error":{"message":"Synthetic complete upstream HTTP rejection with cooldown"}}');
      return;
    }
    if (injectHttpCooldown && calls === 0) {
      cooldownElapsedMs = Date.now() - cooldownStartedAt;
      assert(cooldownElapsedMs >= 60_000, 'provider cooldown must not be shortened');
    }
    const step = calls++;
    assert(step < 5, 'Unexpected inference replay');
    if (step > 0) assert.deepEqual(ledger?.uncertain, [oldHash], 'verification must preserve the original unknown');
    if (step === 2) {
      if (injectReturnedHistoryGap) assert(injectedHistoryGap, 'one proven result projection gap was injected');
      else assert(JSON.stringify(body.messages).includes('BUILD SUCCESS'), 'native log output must reach the next inference');
    }
    const tool = step === 0 ? { id: 'old-new-id', name: 'Bash', input: oldInput }
      : step === 1 ? { id: 'inspect-log', name: 'Bash', input: inspectInput }
        : step < 4 ? { id: `package-${step}`, name: 'Bash', input: nextInput } : undefined;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(frame('message_start', { type: 'message_start', message: { id: `message-${step}`, type: 'message', role: 'assistant',
      model: 'fixture-model', content: [], stop_reason: null, usage: { input_tokens: 100, output_tokens: 0 } } })
      + frame('content_block_start', { type: 'content_block_start', index: 0, content_block: tool
        ? { type: 'tool_use', id: tool.id, name: tool.name, input: {} } : { type: 'text', text: '' } })
      + frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: tool
        ? { type: 'input_json_delta', partial_json: JSON.stringify(tool.input) } : { type: 'text_delta', text: 'Existing build verified; package produced once. Original unknown preserved.' } })
      + frame('content_block_stop', { type: 'content_block_stop', index: 0 })
      + frame('message_delta', { type: 'message_delta', delta: { stop_reason: tool ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 20 } })
      + frame('message_stop', { type: 'message_stop' }));
  })().catch(error => { console.error(error); abort.abort(); res.destroy(); });
});
await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
const address = upstream.address();
assert(address && typeof address !== 'string');
const rejectingUpstream = injectHttpRejection ? createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    rejectedHttpCalls++;
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end('{"error":{"message":"Synthetic complete upstream HTTP rejection"}}');
  });
}) : undefined;
if (rejectingUpstream) await new Promise<void>(resolve => rejectingUpstream.listen(0, '127.0.0.1', resolve));
const rejectionAddress = rejectingUpstream?.address();
const failover = injectHttpRejection || injectHttpCooldown ? new ModelFailoverController({ scope: () => 'fixture-turn',
  isActive: () => !abort.signal.aborted, canSwitch: () => true, canUsePinnedRoute: () => !abort.signal.aborted,
  canRetry: () => context.canRetryInference(), canRetryRejectedResponse: () => context.canRetryRejectedInference(),
  retryDelaysMs: [0, 0, 0], onSwitch: () => { backupSwitches++; },
  resolveBackup: () => injectHttpCooldown ? undefined : ({ providerId: 'fixture-backup', apiProtocol: 'anthropic',
    baseUrl: `http://127.0.0.1:${address.port}`, model: 'fixture-model', apiKey: 'fixture' }),
}) : undefined;
const handler = createBridgeHandler({ logger: null, getUpstreamConfig: () => ({ providerId: 'fixture',
  apiProtocol: 'anthropic', baseUrl: `http://127.0.0.1:${rejectionAddress && typeof rejectionAddress !== 'string' ? rejectionAddress.port : address.port}`,
  model: 'fixture-model', apiKey: 'fixture', contextRecovery: context, modelFailover: failover }) });
function injectGap(body: AnthropicRequest): AnthropicRequest {
  if (!injectReturnedHistoryGap || calls !== 2 || injectedHistoryGap) return body;
  let removed = 0;
  for (const message of body.messages) if (Array.isArray(message.content)) {
    message.content = message.content.filter(block => {
      if (block.type !== 'tool_result' || block.tool_use_id !== 'inspect-log') return true;
      assert(JSON.stringify(block.content).includes('BUILD SUCCESS'), 'actual native Bash result must exist before injection');
      removed++; return false;
    });
  }
  assert.equal(removed, 1);
  body.messages = body.messages.filter(message => !Array.isArray(message.content) || message.content.length > 0);
  assert.equal(ledger?.operationAttempts.entries.find(item => item.toolUseId === 'inspect-log')?.status, 'returned');
  injectedHistoryGap = true;
  return body;
}
const gateway = createServer((req, res) => {
  void (async () => {
    if (req.url?.endsWith('/count_tokens')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"input_tokens":100}'); return; }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const response = await handler(new Request(`http://127.0.0.1${req.url}`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(injectGap(JSON.parse(Buffer.concat(chunks).toString()))), signal: abort.signal }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) for await (const chunk of response.body) res.write(chunk);
    res.end();
  })().catch(error => { console.error(error); abort.abort(); res.destroy(); });
});
await new Promise<void>(resolve => gateway.listen(0, '127.0.0.1', resolve));
const gatewayAddress = gateway.address();
assert(gatewayAddress && typeof gatewayAddress !== 'string');
const native = query({ prompt: 'Verify the existing build log, then package exactly once. Never repeat an unknown launch.', options: {
  cwd: scratch, model: 'fixture-model', settingSources: [], tools: ['Bash'],
  ...(process.env.MOX_NATIVE_EXECUTABLE ? { pathToClaudeCodeExecutable: process.env.MOX_NATIVE_EXECUTABLE } : {}),
  permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true, abortController: abort, maxTurns: 8,
  hooks: {
    PreToolUse: [{ hooks: [async input => {
      if (input.hook_event_name !== 'PreToolUse') return {};
      const reason = await context.authorizeTool(input.tool_name, input.tool_input, input.tool_use_id);
      if (!reason) return {};
      denied++;
      return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
    }] }],
    PostToolUse: [{ hooks: [async input => {
      if (input.hook_event_name === 'PostToolUse') await context.commitToolResult(input.tool_name, input.tool_input, input.tool_response, false, input.tool_use_id);
      return {};
    }] }],
    PostToolUseFailure: [{ hooks: [async input => {
      if (input.hook_event_name === 'PostToolUseFailure') {
        nativeFailures.push({ name: input.tool_name, error: input.error, interrupted: input.is_interrupt });
        await context.commitToolResult(input.tool_name, input.tool_input, input.error, true, input.tool_use_id, { interrupted: input.is_interrupt });
      }
      return {};
    }] }],
  },
  env: { PATH: process.env.PATH, CLAUDE_CONFIG_DIR: join(scratch, '.claude'),
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${gatewayAddress.port}/bridge/fixture`, ANTHROPIC_API_KEY: 'fixture',
    ANTHROPIC_AUTH_TOKEN: '', CLAUDE_CODE_OAUTH_TOKEN: '', CLAUDE_CODE_MAX_RETRIES: '0',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1', ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
    HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '', http_proxy: '', https_proxy: '', all_proxy: '',
  },
} });
try {
  for await (const event of native) {
    if (event.type === 'system' && event.subtype === 'init') {
      const owner = { sessionId: 'fixture-product', sdkSessionId: event.session_id };
      nativeOwner = owner;
      context = new ContextRecoveryController({ scope: () => 'fixture-turn', isActive: () => !abort.signal.aborted,
        protectStreaming: true, recoveryOwner: owner,
        initialLedger: { version: 1, completed: [], uncertain: [oldHash], denied: [], blocked: false,
          projectionActive: true, streamArmedOnly: false },
        backup: async (body, metadata) => {
          const path = join(scratch, `${metadata.digest}.json`);
          await writeFile(path, JSON.stringify(body), { mode: 0o600 }); return path;
        },
        persistLedger: async value => {
          ledger = structuredClone(value) as typeof ledger;
          await writeFile(join(scratch, 'ledger.json'), JSON.stringify(value), { mode: 0o600 });
        },
      });
      context.bindNoDispatchOwner({ ...owner, queryGeneration: 1, isCurrent: () => !abort.signal.aborted });
    }
    if (event.type === 'result') { terminal = !event.is_error; assert(terminal, event.subtype); }
  }
  assert(terminal);
  assert.equal(calls, 5);
  assert.equal(rejectedHttpCalls, injectHttpRejection ? 4 : injectHttpCooldown ? 1 : 0);
  assert.equal(backupSwitches, injectHttpRejection ? 1 : 0);
  assert.equal(denied, 2);
  await assert.rejects(readFile(join(scratch, 'original-launch.txt')), { code: 'ENOENT' });
  assert.equal(await readFile(join(scratch, 'package-count.txt'), 'utf8'), 'once\n');
  assert.deepEqual(ledger?.uncertain, [oldHash]);
  const persisted = JSON.parse(await readFile(join(scratch, 'ledger.json'), 'utf8'));
  const restored = new ContextRecoveryController({ scope: () => 'cold-query', isActive: () => true,
    recoveryOwner: nativeOwner!, initialLedger: persisted, backup: async () => 'unused', persistLedger: async () => {} });
  assert.deepEqual(restored.inspectActionLedger().operationAttempts.map(a => a.status), ['returned', 'returned']);
  assert.match(restored.beforeTool('Bash', oldInput) ?? '', /uncertain outcome/);
  assert.match(restored.beforeTool('Bash', nextInput) ?? '', /already completed/);
  assert.equal(restored.beforeTool('Bash', { command: "ssh fixture-host 'tail -n 80 /var/log/build.log'" }), undefined);
  const receipt = { status: 'PASS', scratch, injectedHistoryGap, rejectedHttpCalls, cooldownElapsedMs, backupSwitches, calls, denied, packageCount: 1, originalLaunchCount: 0,
    unknown: ledger?.uncertain.length, actualSdkNativeAndShell: true, journalReload: true,
    syntheticModel: true, actualRemoteSsh: false, productionStore: false, installedClient: false };
  await writeFile(join(scratch, 'receipt.json'), JSON.stringify(receipt, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(receipt));
} finally {
  clearTimeout(timer);
  native.close();
  gateway.closeAllConnections(); gateway.close();
  upstream.closeAllConnections(); upstream.close();
  rejectingUpstream?.closeAllConnections(); rejectingUpstream?.close();
}
