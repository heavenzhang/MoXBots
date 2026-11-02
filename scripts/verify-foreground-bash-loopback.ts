/** Real native Bash lifecycle against a local model; no user/provider data. */
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import {
  completeQueryBackgroundTask, completeQueryForegroundBash, getQueryExecutionVerificationEpoch,
  recordQueryBackgroundTask, replaceQueryBackgroundActivity, setQuerySession, setQuerySessionWithAuthority,
  snapshotSettledQueryBackground, type BuiltinQueryAuthority,
} from '../src/server/builtin-session/lifecycle';

const background = process.argv.includes('--background');
const scratch = await mkdtemp(join(tmpdir(), 'moxbots-foreground-native-'));
await writeFile(join(scratch, 'verification.txt'), 'isolated verification');
const abort = new AbortController();
const events: unknown[] = [];
let calls = 0;
let authority: BuiltinQueryAuthority | null = null;
let shellReceipts = 0;
let foregroundSettlements = 0;
let readVerified = false;
let starts = 0;
let updates = 0;
let finish!: () => void;
const done = new Promise<void>(resolve => { finish = resolve; });
const frame = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
const server = createServer((req, res) => { void (async () => {
  for await (const _chunk of req) { /* consume only the synthetic SDK request */ }
  if (req.url?.includes('count_tokens')) {
    res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"input_tokens":100}'); return;
  }
  calls++;
  const content = calls === 1
    ? { type: 'tool_use', id: 'shell-one', name: 'Bash', input: {
      command: background ? 'sleep 1; printf fixture-done' : 'sleep 12; printf fixture-done', run_in_background: background,
    } }
    : calls === 2 ? { type: 'tool_use', id: 'verify-read', name: 'Read', input: { file_path: join(scratch, 'verification.txt') } }
      : { type: 'text', text: 'Fixture complete.' };
  // Allow the background control to finish before its independent Read.
  if (calls === 2 && background) await new Promise(resolve => setTimeout(resolve, 1800));
  const isTool = content.type === 'tool_use';
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.end(frame('message_start', { type: 'message_start', message: { id: `fixture-${calls}`, type: 'message', role: 'assistant',
    model: 'claude-sonnet-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0 } } })
    + frame('content_block_start', { type: 'content_block_start', index: 0, content_block: isTool ? { ...content, input: {} } : { type: 'text', text: '' } })
    + frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: isTool
      ? { type: 'input_json_delta', partial_json: JSON.stringify(content.input) } : { type: 'text_delta', text: content.text } })
    + frame('content_block_stop', { type: 'content_block_stop', index: 0 })
    + frame('message_delta', { type: 'message_delta', delta: { stop_reason: isTool ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 20 } })
    + frame('message_stop', { type: 'message_stop' }));
})().catch(error => { events.push({ fixtureError: String(error) }); res.destroy(); }); });
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('fixture bind failed');
async function* prompt(): AsyncGenerator<SDKUserMessage> {
  yield { type: 'user', session_id: '', parent_tool_use_id: null, message: { role: 'user', content: 'Run the isolated shell and Read fixtures once.' } };
  await done;
}
const timer = setTimeout(() => { finish(); abort.abort(); }, 45_000);
const run = query({ prompt: prompt(), options: {
  cwd: scratch, model: 'claude-sonnet-5-5', settingSources: [], tools: ['Bash', 'Read'], allowedTools: ['Bash', 'Read'],
  ...(process.env.MOXBOTS_NATIVE_CLI ? { pathToClaudeCodeExecutable: process.env.MOXBOTS_NATIVE_CLI } : {}),
  permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true, maxTurns: 4, abortController: abort,
  env: { PATH: process.env.PATH, HOME: scratch, USERPROFILE: scratch, CLAUDE_CONFIG_DIR: join(scratch, '.claude'),
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${address.port}`, ANTHROPIC_API_KEY: 'fixture-only', ANTHROPIC_AUTH_TOKEN: '',
    CLAUDE_CODE_OAUTH_TOKEN: '', CLAUDE_CODE_MAX_RETRIES: '0', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1', ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
    HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '', http_proxy: '', https_proxy: '', all_proxy: '' },
} });
try {
  for await (const event of run) {
    if (event.type === 'system' && event.subtype === 'init') {
      authority = setQuerySessionWithAuthority(run, { productSessionId: 'isolated-fixture', expectedSdkSessionId: event.session_id });
    }
    if (event.type === 'system') {
      if (event.subtype === 'task_started') {
        starts++;
        recordQueryBackgroundTask(run, event.task_id, { runId: event.run_id, toolUseId: event.tool_use_id,
          agentType: event.task_type, isBackgrounded: event.is_backgrounded });
      }
      if (event.subtype === 'background_tasks_changed') replaceQueryBackgroundActivity(run, event.tasks);
      if (event.subtype === 'task_updated' || event.subtype === 'task_notification') {
        if (event.subtype === 'task_updated') updates++;
        const status = event.subtype === 'task_updated' ? event.patch.status : event.status;
        if (event.subtype === 'task_updated' && event.patch.is_backgrounded === true) {
          recordQueryBackgroundTask(run, event.task_id, { runId: event.run_id, isBackgrounded: true });
        }
        if (status === 'completed' || status === 'failed' || status === 'stopped' || status === 'killed') {
          completeQueryBackgroundTask(run, event.task_id, { runId: event.run_id,
            authoritative: event.subtype === 'task_updated', status: status === 'killed' ? 'stopped' : status });
        }
      }
      events.push({ type: event.subtype, epoch: getQueryExecutionVerificationEpoch() });
    }
    if (event.type === 'user' && !event.isSynthetic && Array.isArray(event.message.content)) {
      for (const block of event.message.content) {
        if (block.type !== 'tool_result') continue;
        if (block.tool_use_id === 'shell-one') {
          shellReceipts++;
          const settled = completeQueryForegroundBash(authority, block.tool_use_id, event.tool_use_result, block.is_error);
          if (settled) foregroundSettlements++;
          assert.equal(settled, !background);
          if (!background) assert.equal(typeof getQueryExecutionVerificationEpoch(), 'string');
        }
        if (block.tool_use_id === 'verify-read') {
          assert.equal(block.is_error === true, false);
          readVerified = typeof getQueryExecutionVerificationEpoch() === 'string';
        }
      }
    }
    if (event.type === 'result') { assert.equal(event.is_error, false); finish(); break; }
  }
  assert.equal(shellReceipts, 1); assert.equal(starts, 1);
  assert.equal(foregroundSettlements, background ? 0 : 1);
  assert.equal(readVerified, true);
  if (!background) assert.equal(updates, 0);
  assert.equal(snapshotSettledQueryBackground(authority!)?.(), true);
  const receipt = { passed: true, realSdk: true, upstream: 'synthetic-loopback-only', paidCalls: 0,
    background, calls, starts, updates, shellReceipts, foregroundSettlements, readVerified, evidence: scratch };
  await writeFile(join(scratch, 'receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
} finally {
  await writeFile(join(scratch, 'events.json'), JSON.stringify(events, null, 2));
  clearTimeout(timer); finish(); run.close(); setQuerySession(null); server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
