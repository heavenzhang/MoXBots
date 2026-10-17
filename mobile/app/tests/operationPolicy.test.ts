import assert from 'node:assert/strict';
import test from 'node:test';
import { approvalStillCurrent, commitIfViewOwned, draftKey, mutationDisposition, readDraft, updateDraft, viewStillOwned } from '../src/operationPolicy.ts';

test('an unknown mutation is query-only and cannot be submitted a second time', () => {
  assert.equal(mutationDisposition('unknown'), 'query-only');
  assert.equal(mutationDisposition('unconfirmed'), 'query-only');
  assert.equal(mutationDisposition('not-found'), 'query-only');
  assert.equal(mutationDisposition('processing'), 'query-only');
  assert.equal(mutationDisposition('accepted'), 'settled');
  assert.equal(mutationDisposition('rejected'), 'settled');
});

test('approval requires the same current request, generation, turn, and actionable state', () => {
  const current = { state: 'waiting_user_action', generation: 'g1', turnId: 't1', interactions: [{ requestId: 'r1', generation: 'g1', turnId: 't1', actionable: true }] };
  assert.equal(approvalStillCurrent(current, { requestId: 'r1', generation: 'g1', turnId: 't1' }), true);
  assert.equal(approvalStillCurrent({ ...current, turnId: 't2' }, { requestId: 'r1', generation: 'g1', turnId: 't1' }), false);
  assert.equal(approvalStillCurrent(current, { requestId: 'stale', generation: 'g1', turnId: 't1' }), false);
  assert.equal(approvalStillCurrent({ ...current, state: 'running' }, { requestId: 'r1', generation: 'g1', turnId: 't1' }), false);
});

test('a deferred Bot A list response cannot overwrite the currently selected Bot B list', async () => {
  const ownerA = { epoch: 4, screen: 'sessions' as const, targetId: 'target-a', agentId: 'agent-a', sessionId: null };
  const ownerB = { epoch: 5, screen: 'sessions' as const, targetId: 'target-b', agentId: 'agent-b', sessionId: null };
  let resolveA!: (value: string[]) => void;
  const deferredA = new Promise<string[]>((resolve) => { resolveA = resolve; });
  let visible = ['Bot B current session'];
  const oldRequest = deferredA.then((value) => commitIfViewOwned(ownerA, ownerB, value, (sessions) => { visible = sessions; }));
  resolveA(['Bot A stale session']);
  assert.equal(await oldRequest, false);
  assert.deepEqual(visible, ['Bot B current session']);
});

test('session drafts stay within their Bot/session and old voice events lose ownership after navigation', () => {
  const targetA = { agentId: 'agent-a', deviceName: 'host-1', name: 'Bot A' };
  const targetB = { agentId: 'agent-b', deviceName: 'host-1', name: 'Bot B' };
  const keyA = draftKey(targetA, 'session-a');
  const keyB = draftKey(targetB, 'session-b');
  const newKeyA = draftKey(targetA, null);
  let drafts = updateDraft({}, keyA, 'A unsent draft');
  drafts = updateDraft(drafts, keyB, 'B draft');
  drafts = updateDraft(drafts, newKeyA, 'A new-conversation draft');
  assert.equal(readDraft(drafts, keyA), 'A unsent draft');
  assert.equal(readDraft(drafts, keyB), 'B draft');
  assert.equal(readDraft(drafts, newKeyA), 'A new-conversation draft');

  const voiceOwner = { epoch: 8, screen: 'chat' as const, targetId: 'target-a', agentId: 'agent-a', sessionId: 'session-a' };
  const afterSwitch = { epoch: 9, screen: 'chat' as const, targetId: 'target-b', agentId: 'agent-b', sessionId: 'session-b' };
  assert.equal(viewStillOwned(voiceOwner, afterSwitch), false);
  assert.equal(commitIfViewOwned(voiceOwner, afterSwitch, 'late transcript', (text) => { drafts = updateDraft(drafts, keyB, text); }), false);
  assert.equal(readDraft(drafts, keyB), 'B draft');
  assert.equal(readDraft(drafts, keyA), 'A unsent draft');
});
