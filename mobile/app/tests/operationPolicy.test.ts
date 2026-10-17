import assert from 'node:assert/strict';
import test from 'node:test';
import { approvalStillCurrent, mutationDisposition } from '../src/operationPolicy.ts';

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
