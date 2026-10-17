import assert from 'node:assert/strict';
import test from 'node:test';
import { approvalStillCurrent, commitIfViewOwned, createPollFlightGate, createSingleFlightPoll, draftKey, mutationDisposition, readDraft, updateDraft, viewStillOwned } from '../src/operationPolicy.ts';

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

test('slow polling stays single-flight and only commits while its app and view owner remain current', async () => {
  let resolveRequest!: () => void;
  const deferred = new Promise<void>((resolve) => { resolveRequest = resolve; });
  let appActive = true;
  let selectedOwner = 'Bot A';
  let commits = 0;
  let requests = 0;
  const poll = createSingleFlightPoll(async (isCurrent) => {
    requests += 1;
    await deferred;
    if (isCurrent() && selectedOwner === 'Bot A') commits += 1;
  }, () => appActive && selectedOwner === 'Bot A');

  const first = poll.tick();
  assert.ok(first);
  assert.equal(poll.tick(), null, 'a timer tick cannot start another request while one is pending');
  selectedOwner = 'Bot B';
  resolveRequest();
  assert.equal(await first, true);
  assert.equal(requests, 1);
  assert.equal(commits, 0, 'a late Bot A result cannot commit into Bot B');
  assert.equal(poll.tick(), null, 'the old owner no longer schedules requests');
  poll.stop();
});

test('background state and effect cleanup prevent native poll dispatch or late commits', async () => {
  let appActive = false;
  let accountRefreshing = true;
  let dispatched = 0;
  let resolveRequest!: () => void;
  const deferred = new Promise<void>((resolve) => { resolveRequest = resolve; });
  let commits = 0;
  const poll = createSingleFlightPoll(async (isCurrent) => {
    dispatched += 1;
    await deferred;
    if (isCurrent()) commits += 1;
  }, () => appActive && !accountRefreshing);

  assert.equal(poll.tick(), null, 'background polling is suppressed');
  appActive = true;
  assert.equal(poll.tick(), null, 'snapshot polling waits for the existing foreground account refresh');
  accountRefreshing = false;
  const inFlight = poll.tick();
  assert.ok(inFlight);
  poll.stop();
  assert.equal(poll.tick(), null, 'cleanup prevents a scheduled follow-up tick');
  resolveRequest();
  assert.equal(await inFlight, true);
  assert.equal(dispatched, 1);
  assert.equal(commits, 0, 'cleanup invalidates the request before it can update the UI');
});

test('an owner change cannot start a second poll until the previous native request settles', async () => {
  const gate = createPollFlightGate();
  let resolveOld!: () => void;
  const oldRequest = new Promise<void>((resolve) => { resolveOld = resolve; });
  let oldOwnerCurrent = true;
  let dispatched = 0;
  let commits = 0;
  const oldPoll = createSingleFlightPoll(async (isCurrent) => {
    dispatched += 1;
    await oldRequest;
    if (isCurrent() && oldOwnerCurrent) commits += 1;
  }, () => oldOwnerCurrent, gate);
  const oldFlight = oldPoll.tick();
  assert.ok(oldFlight);
  await Promise.resolve();

  oldOwnerCurrent = false;
  oldPoll.stop();
  const newPoll = createSingleFlightPoll(async (isCurrent) => {
    dispatched += 1;
    if (isCurrent()) commits += 1;
  }, () => true, gate);
  assert.equal(newPoll.tick(), null, 'the new owner waits for the outstanding native RPC instead of queuing another');
  assert.equal(dispatched, 1);

  resolveOld();
  await oldFlight;
  const newFlight = newPoll.tick();
  assert.ok(newFlight);
  await newFlight;
  assert.equal(dispatched, 2);
  assert.equal(commits, 1, 'the old owner response is discarded and only the current owner commits');
  newPoll.stop();
});
