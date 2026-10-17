import assert from 'node:assert/strict';
import test from 'node:test';
import { artifactEventMatchesDescriptor, ArtifactDownloadTracker, ArtifactRowBusyTracker, type ArtifactOwner } from '../src/artifactPolicy.ts';
import type { ArtifactDownload } from '../src/native.ts';

const owner: ArtifactOwner = { targetId: 'target-a', identityKey: 'identity-a', agentId: 'agent-a', sessionId: 'session-a' };
const downloading: ArtifactDownload = { kind: 'artifact-download', ...owner, artifactId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', name: 'result.pdf', mimeType: 'application/pdf', sha256: 'a'.repeat(64), state: 'downloading', receivedBytes: 0, totalBytes: 100, errorCode: null };

test('a ready event that arrives before a delayed initial download reply remains authoritative', () => {
  const tracker = new ArtifactDownloadTracker();
  const epoch = tracker.activate(owner);
  const flight = tracker.begin(downloading.artifactId, epoch);
  let visible = downloading;
  const ready = { ...downloading, state: 'ready' as const, receivedBytes: 100 };
  assert.equal(tracker.acceptEvent(ready, epoch), true);
  visible = ready;
  assert.equal(tracker.acceptReply(downloading, flight), false);
  assert.equal(visible.state, 'ready');
});

test('late events and replies from a prior target owner cannot mutate the new owner state', () => {
  const tracker = new ArtifactDownloadTracker();
  const firstEpoch = tracker.activate(owner);
  const flight = tracker.begin(downloading.artifactId, firstEpoch);
  const secondOwner = { ...owner, targetId: 'target-b', identityKey: 'identity-b', agentId: 'agent-b' };
  const secondEpoch = tracker.activate(secondOwner);
  assert.equal(tracker.acceptEvent({ ...downloading, state: 'ready', receivedBytes: 100 }, firstEpoch), false);
  assert.equal(tracker.acceptReply(downloading, flight), false);
  assert.equal(tracker.isCurrent(secondEpoch, secondOwner), true);
});

test('route blur invalidates an outstanding status response', () => {
  const tracker = new ArtifactDownloadTracker();
  const epoch = tracker.activate(owner);
  const flight = tracker.begin(downloading.artifactId, epoch);
  tracker.blur();
  assert.equal(tracker.acceptReply(downloading, flight), false);
});

test('confirmed removal and later not-found status clear the tracker so an explicit redownload can start', () => {
  const tracker = new ArtifactDownloadTracker();
  const epoch = tracker.activate(owner);
  const ready = { ...downloading, state: 'ready' as const, receivedBytes: 100 };
  assert.equal(tracker.acceptReply(ready, tracker.begin(ready.artifactId, epoch)), true);
  assert.equal(tracker.latest(ready.artifactId, epoch)?.state, 'ready');

  assert.equal(tracker.forget(ready.artifactId, epoch), true); // matching successful artifact.remove reply
  assert.equal(tracker.latest(ready.artifactId, epoch), null);
  const statusFlight = tracker.begin(ready.artifactId, epoch);
  assert.equal(tracker.acceptAbsence(statusFlight), true); // a later explicit status check confirms no local file
  assert.equal(tracker.latest(ready.artifactId, epoch), null);

  const downloadFlight = tracker.begin(ready.artifactId, epoch);
  assert.equal(tracker.acceptReply(downloading, downloadFlight), true);
  assert.equal(tracker.latest(ready.artifactId, epoch)?.state, 'downloading');
});

test('unknown downloads stay gated until a matching status reply or event resolves them', () => {
  const tracker = new ArtifactDownloadTracker();
  const epoch = tracker.activate(owner);
  assert.equal(tracker.markUnknown(downloading.artifactId, epoch), true);
  assert.equal(tracker.isUnknown(downloading.artifactId, epoch), true);
  const mismatched = { ...downloading, name: 'different.pdf' };
  assert.equal(artifactEventMatchesDescriptor(mismatched, { ...downloading, sizeBytes: 100 }, owner), false);
  assert.equal(tracker.latest(downloading.artifactId, epoch), null);
  assert.equal(tracker.isUnknown(downloading.artifactId, epoch), true);

  const statusFlight = tracker.begin(downloading.artifactId, epoch);
  assert.equal(tracker.acceptReply(downloading, statusFlight), true);
  assert.equal(tracker.isUnknown(downloading.artifactId, epoch), false);
});

test('invalid metadata events are rejected before they can replace the tracked artifact state', () => {
  const tracker = new ArtifactDownloadTracker();
  const epoch = tracker.activate(owner);
  const descriptor = { ...downloading, sizeBytes: 100 };
  const wrongSizeEvent = { ...downloading, totalBytes: 101, state: 'ready' as const, receivedBytes: 100 };
  assert.equal(artifactEventMatchesDescriptor(wrongSizeEvent, descriptor, owner), false);
  assert.equal(tracker.latest(downloading.artifactId, epoch), null);
  assert.equal(tracker.acceptEvent(downloading, epoch), true);
  assert.equal(tracker.latest(downloading.artifactId, epoch)?.state, 'downloading');
});

test('blur reset permits a new same-id action and a late old finally cannot release its busy lock', () => {
  const busy = new ArtifactRowBusyTracker();
  const oldFlight = busy.claim(downloading.artifactId, 1);
  assert.ok(oldFlight);
  busy.reset();
  const newFlight = busy.claim(downloading.artifactId, 2);
  assert.ok(newFlight);
  assert.equal(busy.release(oldFlight), false);
  assert.equal(busy.release(newFlight), true);
});
