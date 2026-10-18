import assert from 'node:assert/strict';
import test from 'node:test';
import { createLoginAttemptGate, dismissToExistingRoot, loginNeedsPolling, loginPollNeedsStatus, logoutAndConfirm, returnFromAccountRoute } from '../src/accountPolicy.ts';
import { createPollFlightGate, createSingleFlightPoll } from '../src/operationPolicy.ts';

test('logout waits for signed-out confirmation before dismissing to the existing session owner', async () => {
  let resolveReply!: (reply: { kind: 'account'; state: 'signed-out'; displayName: null; principalId: null }) => void;
  const navigation: string[] = [];
  const flight = logoutAndConfirm(
    () => new Promise((resolve) => { resolveReply = resolve; }),
    () => dismissToExistingRoot(() => navigation.push('dismiss-existing-root')),
  );
  await Promise.resolve();
  assert.deepEqual(navigation, []);
  resolveReply({ kind: 'account', state: 'signed-out', displayName: null, principalId: null });
  assert.equal(await flight, 'confirmed');
  assert.deepEqual(navigation, ['dismiss-existing-root']);
});

test('logout leaves the route in place when native has not confirmed signed out', async () => {
  let returned = false;
  const result = await logoutAndConfirm(async () => ({ kind: 'account', state: 'authenticating', displayName: null, principalId: null }), () => { returned = true; });
  assert.equal(result, 'not-confirmed');
  assert.equal(returned, false);
});

test('native logout errors do not trigger navigation', async () => {
  let returned = false;
  await assert.rejects(() => logoutAndConfirm(async () => ({ kind: 'error', code: 'MOBILE_REMOTE_UNAVAILABLE' }), () => { returned = true; }), /MOBILE_REMOTE_UNAVAILABLE/);
  assert.equal(returned, false);
});

test('an account deep link returns to the app root when the router has no in-app back entry', () => {
  const actions: string[] = [];
  returnFromAccountRoute(() => false, () => actions.push('back'), () => actions.push('home'));
  assert.deepEqual(actions, ['home']);
  returnFromAccountRoute(() => true, () => actions.push('back'), () => actions.push('home'));
  assert.deepEqual(actions, ['home', 'back']);
});

test('login start is synchronously exclusive, and a pending native login cannot start twice', () => {
  const gate = createLoginAttemptGate();
  const staleStatus = gate.capture();
  const start = gate.beginStart()!;
  assert.equal(gate.beginStart(), null);
  assert.equal(gate.beginCancel(), null);
  assert.equal(gate.canRead(), false);
  assert.equal(gate.observe(staleStatus, 'signed-out'), false);
  assert.equal(gate.observe(start, 'authenticating'), true);
  gate.finish(start);
  assert.equal(gate.canRead(), true);
  assert.equal(gate.beginStart(), null);
});

test('confirmed cancellation fences late poll/read results and permits exactly one new start', async () => {
  const gate = createLoginAttemptGate();
  gate.observe(gate.capture(), 'authenticating');
  const oldPoll = gate.capture(), oldRead = gate.capture();
  let finishLogout!: (reply: { kind: 'account'; state: 'signed-out'; displayName: null; principalId: null }) => void;
  let visible = 'authenticating';
  const cancel = gate.beginCancel()!;
  const result = logoutAndConfirm(() => new Promise(resolve => { finishLogout = resolve; }), () => {
    if (gate.confirmCancel(cancel)) visible = 'signed-out';
  });
  assert.equal(gate.beginCancel(), null);
  assert.equal(gate.beginStart(), null);
  assert.equal(gate.canRead(), false);
  assert.equal(gate.observe(oldPoll, 'signed-in'), false);
  assert.equal(gate.observe(oldRead, 'authenticating'), false);
  assert.equal(visible, 'authenticating');
  finishLogout({ kind: 'account', state: 'signed-out', displayName: null, principalId: null });
  assert.equal(await result, 'confirmed');
  gate.finish(cancel);
  assert.equal(visible, 'signed-out');
  assert.equal(gate.isCurrent(oldPoll), false);
  const next = gate.beginStart();
  assert.notEqual(next, null);
  gate.finish(cancel); // A late prior finally must not unlock the new mutation.
  assert.equal(gate.beginStart(), null);
});

test('failed and unconfirmed cancellation remain quarantined until a successful explicit retry', async () => {
  for (const failed of [false, true]) {
    const gate = createLoginAttemptGate();
    gate.observe(gate.capture(), 'authenticating');
    const cancel = gate.beginCancel()!;
    let confirmed = false;
    const operation = logoutAndConfirm(async () => {
      if (failed) throw new Error('MOBILE_REMOTE_UNAVAILABLE');
      return { kind: 'account', state: 'authenticating', displayName: null, principalId: null };
    }, () => { confirmed = true; gate.confirmCancel(cancel); });
    if (failed) await assert.rejects(operation, /MOBILE_REMOTE_UNAVAILABLE/);
    else assert.equal(await operation, 'not-confirmed');
    gate.finish(cancel);
    assert.equal(confirmed, false);
    assert.equal(gate.canRead(), false);
    assert.equal(gate.observe(gate.capture(), 'signed-out'), false);
    assert.equal(gate.beginStart(), null);
    const retry = gate.beginCancel()!;
    assert.notEqual(retry, null);
    assert.equal(gate.confirmCancel(cancel), false);
    await logoutAndConfirm(async () => ({ kind: 'account', state: 'signed-out', displayName: null, principalId: null }), () => {
      confirmed = gate.confirmCancel(retry);
    });
    gate.finish(retry);
    assert.equal(confirmed, true);
    assert.equal(gate.canRead(), true);
    assert.notEqual(gate.beginStart(), null);
  }
});

test('cold authenticating status restores polling; terminal states and expired native polls recover through status only', () => {
  const gate = createLoginAttemptGate();
  assert.equal(gate.observe(gate.capture(), 'authenticating'), true);
  assert.equal(loginNeedsPolling('authenticating'), true);
  assert.equal(gate.beginStart(), null);
  for (const state of ['expired', 'signed-out', 'signed-in'] as const) {
    assert.equal(loginNeedsPolling(state), false);
    assert.equal(gate.observe(gate.capture(), state), true);
  }
  assert.equal(loginPollNeedsStatus('OWNED_LOGIN_EXPIRED'), true);
  assert.equal(loginPollNeedsStatus('OWNED_LOGIN_REQUIRED'), true);
  assert.equal(loginPollNeedsStatus('MOBILE_REMOTE_UNAVAILABLE'), false);
  const start = gate.beginStart()!;
  gate.invalidate();
  assert.equal(gate.isCurrent(start), false);
  assert.equal(gate.observe(start, 'authenticating'), false);
  const cancel = gate.beginCancel()!;
  gate.finish(start);
  assert.equal(gate.beginCancel(), null);
  assert.equal(gate.confirmCancel(cancel), true);
});

test('a deferred native poll cannot publish or overlap another poll after explicit cancellation', async () => {
  const gate = createLoginAttemptGate();
  gate.observe(gate.capture(), 'authenticating');
  const epoch = gate.capture();
  const flights = createPollFlightGate();
  let resolvePoll!: () => void;
  let requests = 0, commits = 0;
  const poll = createSingleFlightPoll(async isCurrent => {
    requests += 1;
    await new Promise<void>(resolve => { resolvePoll = resolve; });
    if (isCurrent() && gate.observe(epoch, 'signed-in')) commits += 1;
  }, () => gate.isCurrent(epoch) && gate.canRead(), flights);
  const pending = poll.tick();
  await Promise.resolve();
  assert.equal(requests, 1);
  assert.equal(poll.tick(), null);
  const cancel = gate.beginCancel()!;
  poll.stop();
  gate.confirmCancel(cancel);
  gate.finish(cancel);
  const nextPoll = createSingleFlightPoll(async () => { requests += 1; }, () => true, flights);
  assert.equal(nextPoll.tick(), null); // Old native work still owns the shared RPC lease.
  resolvePoll();
  await pending;
  assert.equal(commits, 0);
  await nextPoll.tick();
  assert.equal(requests, 2);
  nextPoll.stop();
});
