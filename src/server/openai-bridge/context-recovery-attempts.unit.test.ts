import { expect, it } from 'vitest';
import { ContextRecoveryController, recoveryActionHash } from './context-recovery';
import type { NativeOperationJournalData } from './native-operation-journal';
import type { AnthropicRequest } from './types/anthropic';
const input = { command: 'synthetic mutation' };
const frame = (type: string, extra: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...extra })}\n\n`;
function fixture(initialLedger?: unknown) {
  const state = { active: true, current: true, scope: 'turn-a' };
  let saved: { uncertain: string[]; completed: unknown[]; operationAttempts: NativeOperationJournalData } | undefined;
  const owner = { sessionId: 'product', sdkSessionId: 'native' };
  const options = { recoveryOwner: owner, initialLedger, scope: () => state.scope, isActive: () => state.active, protectStreaming: true,
    backup: async () => '/fixture/archive', persistLedger: async (value: unknown) => { saved = structuredClone(value) as typeof saved; } };
  const controller = new ContextRecoveryController(options);
  controller.bindNoDispatchOwner({ ...owner, queryGeneration: 1, isCurrent: () => state.current });
  const body: AnthropicRequest = { model: 'fixture', max_tokens: 64, stream: true, messages: [{ role: 'user', content: 'Controlled fixture' }] };
  async function emit(ids: string[]) {
    const response = await controller.run(new Request('http://localhost/fixture'), body, async () => new Response(
      frame('message_start', { message: { id: 'fixture', type: 'message', role: 'assistant', content: [] } })
      + ids.map((id, index) => frame('content_block_start', { index, content_block: { type: 'tool_use', id, name: 'Bash', input: {} } })
        + frame('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } })
        + frame('content_block_stop', { index })).join('')
      + frame('message_delta', { delta: { stop_reason: 'tool_use' } }) + frame('message_stop', {}), { headers: { 'content-type': 'text/event-stream' } }));
    expect(response.status).toBe(200); await response.text();
  }
  return { controller, state, options, owner, emit, saved: () => saved! };
}
it('keeps the second identical pending attempt uncertain after the first succeeds', async () => {
  const h = fixture(); await h.emit(['a', 'b']);
  await h.controller.authorizeTool('Bash', input, 'a'); await h.controller.authorizeTool('Bash', input, 'b');
  await h.controller.commitToolResult('Bash', input, 'first result', false, 'a');
  expect(h.saved().uncertain).toEqual([recoveryActionHash('Bash', input)]);
  await h.controller.commitToolResult('Bash', input, 'second result', false, 'b');
  expect(h.saved().uncertain).toEqual([]);
});
it.each(['owner', 'scope', 'stop', 'missing-id', 'foreign-id', 'input'])('never settles a reservation with a %s success', async change => {
  const h = fixture(); await h.emit(['a']); await h.controller.authorizeTool('Bash', input, 'a');
  if (change === 'owner') h.state.current = false;
  if (change === 'scope') h.state.scope = 'successor';
  if (change === 'stop') h.state.active = false;
  await h.controller.commitToolResult('Bash', change === 'input' ? { command: 'different' } : input, 'success', false,
    change === 'missing-id' ? undefined : change === 'foreign-id' ? 'foreign' : 'a');
  expect(h.saved().uncertain).toContain(recoveryActionHash('Bash', input));
  expect(h.saved().completed).toEqual([]);
});
it('does not let a duplicate old success clear a newer identical attempt', async () => {
  const h = fixture(); await h.emit(['a', 'b']);
  await h.controller.authorizeTool('Bash', input, 'a'); await h.controller.commitToolResult('Bash', input, 'first', false, 'a');
  await h.controller.authorizeTool('Bash', input, 'b');
  await h.controller.commitToolResult('Bash', input, 'duplicate', false, 'a');
  expect(h.saved().uncertain).toEqual([recoveryActionHash('Bash', input)]);
});
it('does not convert an older anonymous unknown into completion from a later callback', async () => {
  const h = fixture({ version: 1, completed: [], uncertain: [recoveryActionHash('Bash', input)], denied: [], blocked: false });
  await h.controller.commitToolResult('Bash', input, 'later result', false, 'new-id');
  expect(h.saved()?.uncertain ?? h.controller.inspectActionLedger().uncertainActions.map(a => a.actionId)).toContain(recoveryActionHash('Bash', input));
  expect(h.controller.inspectActionLedger().completedCount).toBe(0);
});

it('persists distinct admissions and returned receipts across a controller restart', async () => {
  const h = fixture(); await h.emit(['a', 'b']);
  await h.controller.authorizeTool('Bash', input, 'a'); await h.controller.authorizeTool('Bash', input, 'b');
  await h.controller.commitToolResult('Bash', input, { result: 'private output' }, false, 'a');
  const disk = structuredClone(h.saved());
  expect(disk.operationAttempts.entries.map(a => a.status)).toEqual(['returned', 'reserved']);
  expect(new Set(disk.operationAttempts.entries.map(a => a.id)).size).toBe(2);
  const restarted = fixture(disk);
  await restarted.controller.commitToolResult('Bash', input, 'late success', false, 'b');
  expect(restarted.controller.inspectActionLedger().uncertainCount).toBe(1);
  expect(await restarted.controller.authorizeTool('Bash', input, 'b')).toContain('already reserved');
  const report = JSON.stringify(restarted.controller.inspectActionLedger());
  expect(report).not.toContain('synthetic mutation'); expect(report).not.toContain('private output');
  // A rollback reader ignoring the optional extension still sees the pending hash.
  const { operationAttempts: _journal, ...oldLedger } = disk;
  expect(fixture(oldLedger).controller.inspectActionLedger().uncertainCount).toBe(1);
});
it('does not accept a callback after rebinding an equal generation to a new native epoch', async () => {
  const h = fixture(); await h.emit(['a']); await h.controller.authorizeTool('Bash', input, 'a');
  h.controller.bindNoDispatchOwner({ ...h.owner, queryGeneration: 1, isCurrent: () => true });
  await h.controller.commitToolResult('Bash', input, 'late', false, 'a');
  expect(h.saved().operationAttempts.entries[0].status).toBe('reserved');
  expect(await h.controller.authorizeTool('Bash', input, 'a')).toContain('already reserved');
});
it('keeps an interrupted attempt unresolved when an identical peer succeeds', async () => {
  const h = fixture(); await h.emit(['a', 'b']);
  await h.controller.authorizeTool('Bash', input, 'a'); await h.controller.authorizeTool('Bash', input, 'b');
  await h.controller.commitToolResult('Bash', input, 'timed out', true, 'a', { interrupted: true });
  await h.controller.commitToolResult('Bash', input, 'completed', false, 'b');
  await h.controller.commitToolResult('Bash', input, 'late success', false, 'a');
  expect(h.saved().operationAttempts.entries.map(a => a.status)).toEqual(['unresolved', 'returned']);
  expect(h.saved().uncertain).toHaveLength(1);
  expect(fixture(h.saved()).controller.inspectActionLedger().uncertainCount).toBe(1);
});
it('preserves a legacy unknown even when a new exact attempt succeeds', async () => {
  const h = fixture(); await h.emit(['a']);
  h.controller.recordToolResult('Bash', input, 'old unknown', true);
  await h.controller.authorizeTool('Bash', input, 'a');
  await h.controller.commitToolResult('Bash', input, 'new known result', false, 'a');
  expect(h.saved().operationAttempts.entries[0].status).toBe('returned');
  expect(h.saved().uncertain).toHaveLength(1);
  expect(fixture(h.saved()).controller.inspectActionLedger().uncertainCount).toBe(1);
});
it.each(['reservation', 'result'])('fails closed on %s persistence failure and retains the last disk state', async phase => {
  const h = fixture(); await h.emit(['a']);
  if (phase === 'result') await h.controller.authorizeTool('Bash', input, 'a');
  const disk = structuredClone(h.saved());
  h.options.persistLedger = async () => { throw new Error('disk full'); };
  if (phase === 'reservation') expect(await h.controller.authorizeTool('Bash', input, 'a')).toContain('execution stopped');
  else await expect(h.controller.commitToolResult('Bash', input, 'done', false, 'a')).rejects.toThrow('could not be committed');
  expect(h.saved()).toEqual(disk);
  expect(h.controller.inspectActionLedger().blocked).toBe(true);
  expect(await h.controller.authorizeTool('Bash', { command: 'different' }, 'next')).toContain('blocked');
  if (phase === 'result') expect(fixture(disk).controller.inspectActionLedger().uncertainCount).toBe(1);
});
it.each(['reservation', 'result'])('does not authorize after %s storage changes the native owner', async phase => {
  const h = fixture(); await h.emit(['a']);
  if (phase === 'result') await h.controller.authorizeTool('Bash', input, 'a');
  const persist = h.options.persistLedger;
  h.options.persistLedger = async value => { await persist(value); h.state.current = false; };
  if (phase === 'reservation') expect(await h.controller.authorizeTool('Bash', input, 'a')).toContain('cancelled');
  else await expect(h.controller.commitToolResult('Bash', input, 'done', false, 'a')).rejects.toThrow('owner changed');
  expect(h.controller.canRetryInference()).toBe(false);
});
it.each(['owner', 'status', 'digest', 'coverage', 'duplicate', 'capacity'])('fails closed on corrupt journal %s', async field => {
  const h = fixture(); await h.emit(['a']); await h.controller.authorizeTool('Bash', input, 'a');
  const ledger = structuredClone(h.saved()); const entry = ledger.operationAttempts.entries[0];
  if (field === 'owner') entry.sessionId = 'another';
  if (field === 'status') entry.status = 'returned';
  if (field === 'digest') entry.resultDigest = 'bad';
  if (field === 'coverage') ledger.uncertain = [];
  if (field === 'duplicate') ledger.operationAttempts.entries.push(structuredClone(entry));
  if (field === 'capacity') ledger.operationAttempts.entries = Array.from({ length: 2049 }, () => entry);
  expect(() => fixture(ledger)).toThrow('context_recovery_required');
});
