import { describe, expect, it } from 'vitest';
import { ContextRecoveryController } from './context-recovery';
import { QueryRequestGuard } from './request-lifetime';
import type { AnthropicRequest } from './types/anthropic';
const frame = (v: unknown) => `data: ${JSON.stringify(v)}\n\n`;
const start = { type: 'message_start', message: { id: 'fixture', type: 'message', role: 'assistant', model: 'fixture', content: [], usage: { input_tokens: 1, output_tokens: 0 } } };
const main = { sdkSessionId: 'native' };
const action = { command: 'fixture action; never executed' };
function harness() {
  const owner = { scope: 'old-root', background: false, active: true, onPersist: undefined as (() => void) | undefined };
  const c = new ContextRecoveryController({ scope: () => owner.scope, isActive: () => owner.active,
    canRecover: () => !owner.background, protectStreaming: true,
    recoveryOwner: { sessionId: 'product', sdkSessionId: 'native' },
    persistLedger: async () => { owner.onPersist?.(); }, backup: async () => '/synthetic/archive' });
  const run = async (events: unknown[], content = owner.scope) => {
    const body: AnthropicRequest = { model: 'fixture', max_tokens: 100, stream: true, messages: [{ role: 'user', content }] };
    return (await c.run(new Request('http://loopback-not-called', { method: 'POST' }), body,
      async () => new Response(events.map(frame).join(''), { headers: { 'content-type': 'text/event-stream' } }))).text();
  };
  const fail = () => run([start, { type: 'error', error: { type: 'api_error' } }], owner.scope + '-failed-inference');
  const deliver = (input = action, id = 'current-tool') => run([start,
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id, name: 'Bash', input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 1 } }, { type: 'message_stop' }]);
  return { c, owner, fail, deliver };
}
async function newRoot() {
  const h = harness(); expect(await h.fail()).toContain('automatic_replay_blocked');
  h.owner.scope = 'new-root'; expect(await h.deliver()).toContain('message_stop');
  h.owner.background = true; return h;
}
describe('delivered foreground tool ownership while a new background task starts', () => {
  it('admits the already delivered exact main-thread action without clearing a prior root fence', async () => {
    const { c, owner } = await newRoot();
    expect(await c.authorizeTool('Bash', action, 'current-tool', main)).toBeUndefined();
    await c.commitToolResult('Bash', action, 'fixture complete', false, 'current-tool');
    // No inference/recovery authority or old fingerprint is reopened by this tool receipt.
    expect(c.canRetryInference()).toBe(false);
    owner.scope = 'old-root';
    expect(await c.authorizeTool('Bash', { command: 'old root' }, 'current-tool', main)).toContain('automatic_replay_blocked');
  });
  it.each(['unknown-id', 'changed-input', 'subagent', 'foreign-session', 'missing-native-owner', 'changed-root', 'stopped', 'same-root-failure'] as const)(
    'keeps the fail-closed boundary for %s', async variant => {
      const { c, owner, fail } = await newRoot();
      let input = action; let id = 'current-tool'; let native: typeof main & { agentId?: string } | undefined = main;
      if (variant === 'unknown-id') id = 'unobserved';
      if (variant === 'changed-input') input = { command: 'changed' };
      if (variant === 'subagent') native = { ...main, agentId: 'worker' };
      if (variant === 'foreign-session') native = { sdkSessionId: 'other' };
      if (variant === 'missing-native-owner') native = undefined;
      if (variant === 'changed-root') owner.scope = 'other-root';
      if (variant === 'stopped') owner.active = false;
      if (variant === 'same-root-failure') { owner.background = false; await fail(); owner.background = true; }
      expect(await c.authorizeTool('Bash', input, id, native)).toContain('automatic_replay_blocked');
    });
  it('does not grant a second native admission for an already reserved tool ID', async () => {
    const { c } = await newRoot();
    expect(await c.authorizeTool('Bash', action, 'current-tool', main)).toBeUndefined();
    // A second pre-hook for the same tool cannot inherit a once-only main-thread proof.
    expect(await c.authorizeTool('Bash', action, 'current-tool', main)).toContain('automatic_replay_blocked');
  });
  it('rechecks the exact owner after the durable reservation await', async () => {
    const { c, owner } = await newRoot();
    owner.onPersist = () => { owner.scope = 'replacement-root'; };
    expect(await c.authorizeTool('Bash', action, 'current-tool', main)).toContain('owner changed');
  });
  it('requires a finished successful request and exact tool identity, keeping inference closed', () => {
    const guard = new QueryRequestGuard(); const lease = guard.begin('root', 'fingerprint', false)!;
    lease.toolMayBeDelivered('tool');
    expect(guard.ownsDeliveredTool('root', 'fingerprint', 'tool')).toBe(false);
    lease.delivered();
    expect(guard.ownsDeliveredTool('root', 'fingerprint', 'tool')).toBe(false);
    lease.finish();
    expect(guard.ownsDeliveredTool('root', 'fingerprint', 'tool')).toBe(true);
    expect(guard.ownsDeliveredTool('root', 'fingerprint', 'unknown')).toBe(false);
    expect(guard.ownsDeliveredTool('other', 'fingerprint', 'tool')).toBe(false);
    expect(guard.begin('root', 'fingerprint', false)).toBeUndefined();
    lease.block();
    expect(guard.ownsDeliveredTool('root', 'fingerprint', 'tool')).toBe(false);
  });
});
