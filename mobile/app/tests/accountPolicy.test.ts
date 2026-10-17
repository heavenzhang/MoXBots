import assert from 'node:assert/strict';
import test from 'node:test';
import { logoutAndConfirm } from '../src/accountPolicy.ts';

test('logout waits for native signed-out confirmation before returning to the session owner', async () => {
  let resolveReply!: (reply: { kind: 'account'; state: 'signed-out'; displayName: null; principalId: null }) => void;
  let returned = false;
  const flight = logoutAndConfirm(() => new Promise((resolve) => { resolveReply = resolve; }), () => { returned = true; });
  await Promise.resolve();
  assert.equal(returned, false);
  resolveReply({ kind: 'account', state: 'signed-out', displayName: null, principalId: null });
  assert.equal(await flight, 'confirmed');
  assert.equal(returned, true);
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
