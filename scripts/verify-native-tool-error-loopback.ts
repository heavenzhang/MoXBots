/** Actual SDK/native shell + hooks + bridge; synthetic loopback model, no account or paid inference. */
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { ContextRecoveryController } from '../src/server/openai-bridge/context-recovery';
import { createBridgeHandler } from '../src/server/openai-bridge/handler';
import type { AnthropicRequest } from '../src/server/openai-bridge/types/anthropic';

const scratch = await mkdtemp(join(tmpdir(), 'mox-native-tool-errors-'));
const abort = new AbortController();
const timer = setTimeout(() => abort.abort(), 60_000);
let context: ContextRecoveryController;
let ledger: { uncertain: string[]; nativeErrors: unknown[] } | undefined;
let calls = 0;
let denied = 0;
let terminal = false;
const nativeFailures: unknown[] = [];
const emptyError = process.argv.includes('--empty-error');
const failingInput = { command: emptyError ? "printf 'once\n' >> attempts.txt; exit 1"
  : "printf 'once\n' >> attempts.txt; printf 'expected fixture failure\n' >&2; exit 1", description: 'Run a failing local check' };
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const upstream = createServer((req, res) => {
  void (async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()) as AnthropicRequest;
    const step = calls++;
    assert(step < 5, 'Unexpected inference replay');
    if (step === 1) {
      assert.deepEqual(ledger?.uncertain, [], 'normal Bash failure must settle before the next model call');
      await context.protectInference(body); // Actual recovery guard, forcing an exact-command replay attempt.
    }
    const tool = step < 2 ? { id: `failure-${step}`, name: 'Bash', input: failingInput }
      : step === 2 ? { id: 'corrected-write', name: 'Write', input: { file_path: join(scratch, 'corrected.txt'), content: 'corrected' } }
        : step === 3 ? { id: 'verify-correction', name: 'Bash', input: { command: 'test "$(cat corrected.txt)" = corrected && printf verified > verified.txt', description: 'Verify the correction' } } : undefined;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(frame('message_start', { type: 'message_start', message: { id: `message-${step}`, type: 'message', role: 'assistant',
      model: 'fixture-model', content: [], stop_reason: null, usage: { input_tokens: 100, output_tokens: 0 } } })
      + frame('content_block_start', { type: 'content_block_start', index: 0, content_block: tool
        ? { type: 'tool_use', id: tool.id, name: tool.name, input: {} } : { type: 'text', text: '' } })
      + frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: tool
        ? { type: 'input_json_delta', partial_json: JSON.stringify(tool.input) } : { type: 'text_delta', text: 'Local correction verified.' } })
      + frame('content_block_stop', { type: 'content_block_stop', index: 0 })
      + frame('message_delta', { type: 'message_delta', delta: { stop_reason: tool ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 20 } })
      + frame('message_stop', { type: 'message_stop' }));
  })().catch(error => { console.error(error); abort.abort(); res.destroy(); });
});
await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
const address = upstream.address();
assert(address && typeof address !== 'string');
const handler = createBridgeHandler({ logger: null, getUpstreamConfig: () => ({ providerId: 'fixture',
  apiProtocol: 'anthropic', baseUrl: `http://127.0.0.1:${address.port}`, model: 'fixture-model', apiKey: 'fixture', contextRecovery: context }) });
const gateway = createServer((req, res) => {
  void (async () => {
    if (req.url?.endsWith('/count_tokens')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"input_tokens":100}'); return; }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const response = await handler(new Request(`http://127.0.0.1${req.url}`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: Buffer.concat(chunks), signal: abort.signal }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) for await (const chunk of response.body) res.write(chunk);
    res.end();
  })().catch(error => { console.error(error); abort.abort(); res.destroy(); });
});
await new Promise<void>(resolve => gateway.listen(0, '127.0.0.1', resolve));
const gatewayAddress = gateway.address();
assert(gatewayAddress && typeof gatewayAddress !== 'string');
const native = query({ prompt: 'Run the local check, correct the fixture and verify it.', options: {
  cwd: scratch, model: 'fixture-model', settingSources: [], tools: ['Bash', 'Write'],
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
  env: { PATH: process.env.PATH, HOME: scratch, USERPROFILE: scratch,
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
      context = new ContextRecoveryController({ scope: () => 'fixture-turn', isActive: () => !abort.signal.aborted,
        protectStreaming: true, recoveryOwner: owner,
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
  assert.equal(denied, 1);
  assert.equal(await readFile(join(scratch, 'attempts.txt'), 'utf8'), 'once\n', 'failed command must never replay its partial write');
  assert.equal(await readFile(join(scratch, 'verified.txt'), 'utf8'), 'verified');
  assert.deepEqual(ledger?.uncertain, []);
  assert.equal(ledger?.nativeErrors.length, 2);
  console.log(JSON.stringify({ status: 'PASS', scratch, calls, denied, counter: 1, nativeFailures, unknown: ledger?.uncertain.length,
    actualSdkNativeAndShell: true, syntheticModel: true, productionStore: false, installedClient: false }));
} finally {
  clearTimeout(timer);
  native.close();
  gateway.closeAllConnections(); gateway.close();
  upstream.closeAllConnections(); upstream.close();
}
