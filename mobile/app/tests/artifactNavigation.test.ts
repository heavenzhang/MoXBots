import assert from 'node:assert/strict';
import test from 'node:test';
import { artifactReturnSnapshotMatches, clearArtifactChatReturn, peekArtifactChatReturn, rememberArtifactChatReturn, resolveArtifactReturnTarget, type ArtifactChatReturn } from '../src/artifactNavigation.ts';
import type { Target } from '../src/native.ts';

const intent: ArtifactChatReturn = { principalId: 'account-a', identityKey: 'identity-a', agentId: 'agent-a', sessionId: 'session-a' };
const target: Target = { targetId: 'fresh-native-approved-target', identityKey: 'identity-a', agentId: 'agent-a', name: 'Bot', deviceName: 'Phone', online: true, runtime: null };

test('artifact return hint survives a superseded refresh, then clears after a fresh account/catalog decision', () => {
  rememberArtifactChatReturn(intent);
  assert.deepEqual(peekArtifactChatReturn(), intent);
  assert.deepEqual(peekArtifactChatReturn(), intent);
  assert.equal(resolveArtifactReturnTarget(intent, 'other-account', [target]), null);
  assert.equal(resolveArtifactReturnTarget(intent, 'account-a', [{ ...target, identityKey: 'renamed-or-rebound' }]), null);
  assert.equal(resolveArtifactReturnTarget(intent, 'account-a', [{ ...target, agentId: 'other-agent' }]), null);
  assert.equal(resolveArtifactReturnTarget(intent, 'account-a', [{ ...target, online: false }]), null);
  assert.equal(resolveArtifactReturnTarget(intent, 'account-a', [{ ...target, targetId: '' }]), null);
  assert.deepEqual(resolveArtifactReturnTarget(intent, 'account-a', [target]), target);
  clearArtifactChatReturn({ ...intent, sessionId: 'stale' });
  assert.deepEqual(peekArtifactChatReturn(), intent, 'an old route cannot clear a newer return hint');
  clearArtifactChatReturn(intent);
  assert.equal(peekArtifactChatReturn(), null);
});

test('artifact return requires the exact agent and session in a fresh snapshot', () => {
  assert.equal(artifactReturnSnapshotMatches(intent, { kind: 'snapshot', agentId: 'agent-a', sessionId: 'session-a' }), true);
  assert.equal(artifactReturnSnapshotMatches(intent, { kind: 'snapshot', agentId: 'agent-b', sessionId: 'session-a' }), false);
  assert.equal(artifactReturnSnapshotMatches(intent, { kind: 'snapshot', agentId: 'agent-a', sessionId: 'session-b' }), false);
  assert.equal(artifactReturnSnapshotMatches(intent, { kind: 'error', agentId: 'agent-a', sessionId: 'session-a' }), false);
});

test('revision draft remains fenced to the same signed-in owner and source session', () => {
  const artifact = { artifactId: '11111111-1111-4111-8111-111111111111', name: 'result.pdf', mimeType: 'application/pdf', sizeBytes: 10, sha256: 'a'.repeat(64) };
  const revisionIntent = { ...intent, revisionDraft: { artifact, text: '修改指定成果' } };
  rememberArtifactChatReturn(revisionIntent);
  assert.equal(resolveArtifactReturnTarget(revisionIntent, 'different-account', [target]), null);
  assert.equal(artifactReturnSnapshotMatches(revisionIntent, { kind: 'snapshot', agentId: 'agent-a', sessionId: 'wrong-session' }), false);
  assert.deepEqual(peekArtifactChatReturn()?.revisionDraft?.artifact, artifact);
  clearArtifactChatReturn(intent);
  assert.equal(peekArtifactChatReturn(), revisionIntent);
  clearArtifactChatReturn(revisionIntent);
});
