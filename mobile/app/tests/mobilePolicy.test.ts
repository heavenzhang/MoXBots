import assert from 'node:assert/strict';
import test from 'node:test';
import { permitsLegacyTextFallback, receiptProtocol, sendProtocol } from '../src/mobilePolicy.ts';

test('legacy mode is entered only for explicit mobile capability unsupported codes', () => {
  assert.equal(permitsLegacyTextFallback('MOBILE_PROFILE_MISMATCH'), true);
  assert.equal(permitsLegacyTextFallback('MOBILE_INTENT_UNSUPPORTED'), true);
  assert.equal(permitsLegacyTextFallback('MOBILE_REMOTE_UNAVAILABLE'), false);
  assert.equal(permitsLegacyTextFallback('MOBILE_REPLY_INVALID'), false);
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
