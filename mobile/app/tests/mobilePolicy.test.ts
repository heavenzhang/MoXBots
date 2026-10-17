import assert from 'node:assert/strict';
import test from 'node:test';
import { blocksMutationForScope, permitsLegacyTextFallback, provisionalMutation, receiptProtocol, reconcileFailedMutation, sendProtocol } from '../src/mobilePolicy.ts';
import { mutationDisposition } from '../src/operationPolicy.ts';
import { SerialUploadQueue } from '../src/uploadQueue.ts';

test('legacy mode is entered only for explicit mobile capability unsupported codes', () => {
  assert.equal(permitsLegacyTextFallback('MOBILE_PROFILE_MISMATCH'), true);
  assert.equal(permitsLegacyTextFallback('MOBILE_INTENT_UNSUPPORTED'), true);
  assert.equal(permitsLegacyTextFallback('METHOD_UNSUPPORTED'), true);
  assert.equal(permitsLegacyTextFallback('MOBILE_REMOTE_UNAVAILABLE'), false);
  assert.equal(permitsLegacyTextFallback('MOBILE_REPLY_INVALID'), false);
});

test('native error envelopes keep their code and malformed replies remain distinct', async () => {
  const { parseMobileBridgeResult } = await import('../src/mobileProtocol.ts');
  assert.throws(() => parseMobileBridgeResult({ kind: 'error', code: 'METHOD_UNSUPPORTED' }), /METHOD_UNSUPPORTED/);
  assert.throws(() => parseMobileBridgeResult({ kind: 'error', code: 'AUTH_REQUIRED' }), /AUTH_REQUIRED/);
  assert.throws(() => parseMobileBridgeResult({ kind: 'error', code: 'MOBILE_REMOTE_UNAVAILABLE' }), /MOBILE_REMOTE_UNAVAILABLE/);
  assert.throws(() => parseMobileBridgeResult({ kind: 'not-an-error' }), /MOBILE_REPLY_INVALID/);
});

test('a persisted operation found after a transport throw blocks a new UUID and keeps its original query-only ID', async () => {
  const attempt = { protocol: 'mobile' as const, targetId: 'target-a', agentId: 'agent-a', operationId: 'same-operation-id', sessionId: 'session-a' };
  let pending = [provisionalMutation(attempt)];
  const operationIdsCreated = ['same-operation-id'];
  assert.equal(mutationDisposition(pending[0].status), 'query-only');
  assert.equal(blocksMutationForScope(pending, attempt.targetId, attempt.sessionId), true);

  let resolveJournal!: (items: typeof pending) => void;
  const delayedJournal = new Promise<typeof pending>((resolve) => { resolveJournal = resolve; });
  const reconciliation = delayedJournal.then((items) => { pending = reconcileFailedMutation(pending, attempt, items); });
  if (!blocksMutationForScope(pending, attempt.targetId, attempt.sessionId)) operationIdsCreated.push('should-not-be-created');
  assert.deepEqual(operationIdsCreated, ['same-operation-id']);
  resolveJournal([{ ...attempt, status: 'unknown' }]);
  await reconciliation;
  assert.equal(pending[0].operationId, 'same-operation-id');
  assert.equal(mutationDisposition(pending[0].status), 'query-only');
  assert.equal(blocksMutationForScope(pending, attempt.targetId, attempt.sessionId), true);
  if (!blocksMutationForScope(pending, attempt.targetId, attempt.sessionId)) operationIdsCreated.push('duplicate-operation');
  assert.deepEqual(operationIdsCreated, ['same-operation-id']);
});

test('failed-send provisional state is removed only after an exact journal absence', () => {
  const attempt = { protocol: 'session' as const, targetId: 'target-a', agentId: 'agent-a', operationId: 'operation-a', sessionId: null };
  const provisional = [provisionalMutation(attempt)];
  assert.deepEqual(reconcileFailedMutation(provisional, attempt, null), provisional);
  assert.deepEqual(reconcileFailedMutation(provisional, attempt, []), []);
  assert.deepEqual(reconcileFailedMutation(provisional, attempt, [{ ...attempt, protocol: 'mobile', status: 'unknown' }]), provisional);
});

test('second upload waits for first ready event; paused work blocks until resumed or cancelled', async () => {
  const queue = new SerialUploadQueue();
  const epoch = queue.currentEpoch();
  let finishFirst!: () => void;
  let finishSecond!: () => void;
  let firstStarted = false;
  let secondStarted = false;
  const first = queue.enqueue(epoch, async () => { firstStarted = true; await new Promise<void>((resolve) => { finishFirst = resolve; }); });
  const second = queue.enqueue(epoch, async () => { secondStarted = true; await new Promise<void>((resolve) => { finishSecond = resolve; }); });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(firstStarted, true);
  assert.equal(secondStarted, false);
  // A paused first job does not finish its promise, so the next upload remains queued.
  await Promise.resolve();
  assert.equal(secondStarted, false);
  finishFirst(); // native ready event releases the active upload job
  await first;
  await Promise.resolve(); await Promise.resolve();
  assert.equal(secondStarted, true);
  finishSecond();
  await second;
});

test('owner change invalidates queued uploads after the active job settles', async () => {
  const queue = new SerialUploadQueue();
  const epoch = queue.currentEpoch();
  let finishActive!: () => void;
  let staleStarted = false;
  const active = queue.enqueue(epoch, () => new Promise<void>((resolve) => { finishActive = resolve; }));
  const stale = queue.enqueue(epoch, async () => { staleStarted = true; });
  await Promise.resolve(); await Promise.resolve();
  queue.invalidate();
  finishActive();
  await Promise.all([active, stale]);
  assert.equal(staleStarted, false);
});

test('attachments require ready asset IDs and legacy is limited to text-only 8k', () => {
  assert.equal(sendProtocol('supported', '', null, [{ state: 'ready', assetId: 'asset-id' }]), 'mobile');
  assert.equal(sendProtocol('supported', 'prompt', null, [{ state: 'paused', assetId: null }]), 'blocked');
  assert.equal(sendProtocol('supported', 'prompt', null, [{ state: 'ready', assetId: null }]), 'blocked');
  assert.equal(sendProtocol('legacy', 'x'.repeat(8000), null, []), 'legacy');
  assert.equal(sendProtocol('legacy', 'x'.repeat(8001), null, []), 'blocked');
  assert.equal(sendProtocol('legacy', 'text', 'selected-model', []), 'blocked');
  assert.equal(sendProtocol('legacy', 'text', null, [{ state: 'ready', assetId: 'asset-id' }]), 'blocked');
});

test('pending receipt lookup preserves the operation protocol and never constructs a resend', () => {
  const legacy = receiptProtocol({ protocol: 'session', targetId: 'target-1', agentId: 'agent-1', operationId: 'op-1' });
  const mobile = receiptProtocol({ protocol: 'mobile', targetId: 'target-1', agentId: 'agent-1', operationId: 'op-2' });
  assert.deepEqual(legacy, { kind: 'session', targetId: 'target-1', request: { kind: 'receipt', agentId: 'agent-1', operationId: 'op-1' } });
  assert.deepEqual(mobile, { kind: 'mobile', targetId: 'target-1', request: { version: 1, kind: 'mobile.receipt', agentId: 'agent-1', operationId: 'op-2' } });
  assert.equal('text' in mobile.request, false);
  assert.equal('operationId' in mobile.request, true);
});
