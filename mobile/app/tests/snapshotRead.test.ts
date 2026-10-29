import assert from 'node:assert/strict';
import test from 'node:test';
import { SnapshotReadTracker, snapshotReadStatus } from '../src/snapshotRead.ts';
import { sessionSnapshotReady } from '../src/transcriptHistory.ts';
import type { ViewOwner } from '../src/operationPolicy.ts';

const chat: ViewOwner = { epoch: 1, screen: 'chat', targetId: 'host-a', agentId: 'agent-a', sessionId: 'session-a' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test('opening a session remains pending across unrelated global loading completion until its read settles', async () => {
  const reads = new SnapshotReadTracker({ ...chat, epoch: 0, screen: 'sessions', sessionId: null });
  const reply = deferred<boolean>();
  reads.reset(chat); // The same owner transition which cancels the global run indicator.
  const flight = reads.begin(chat)!;
  const completion = reply.promise.then((success) => reads.finish(flight, chat, success ? 'success' : 'error'));
  assert.equal(snapshotReadStatus(reads.current(), chat), 'pending');
  assert.equal(sessionSnapshotReady(chat, null), false, 'a pending read does not grant permission to send or create');
  await Promise.resolve(); // Global run/finally or another refresh may have completed meanwhile.
  assert.equal(snapshotReadStatus(reads.current(), chat), 'pending');
  reply.resolve(true);
  assert.equal(await completion, true);
  assert.equal(snapshotReadStatus(reads.current(), chat), 'success');
});

test('a real error permits one retry and an old completion cannot settle that retry', () => {
  const reads = new SnapshotReadTracker(chat);
  const first = reads.begin(chat)!;
  assert.equal(reads.begin(chat), null, 'rapid retry taps do not duplicate a native read');
  assert.equal(reads.finish(first, chat, 'error'), true);
  assert.equal(snapshotReadStatus(reads.current(), chat), 'error');
  const retry = reads.begin(chat)!;
  assert.equal(snapshotReadStatus(reads.current(), chat), 'pending');
  assert.equal(reads.finish(first, chat, 'error'), false);
  assert.equal(reads.pending(chat), true);
  assert.equal(reads.finish(retry, chat, 'success'), true);
});

test('rapid session switching and returning to the same session discard both stale successes and failures', async () => {
  const reads = new SnapshotReadTracker(chat);
  const oldReply = deferred<'success' | 'error'>();
  const first = reads.begin(chat)!;
  let visibleOwner = chat;
  const completion = oldReply.promise.then((result) => reads.finish(first, visibleOwner, result));
  visibleOwner = { ...chat, epoch: 2, sessionId: 'session-b' };
  reads.reset(visibleOwner);
  const second = reads.begin(visibleOwner)!;
  oldReply.resolve('error');
  assert.equal(await completion, false);
  assert.equal(snapshotReadStatus(reads.current(), visibleOwner), 'pending');
  visibleOwner = { ...chat, epoch: 3 };
  reads.reset(visibleOwner);
  reads.begin(visibleOwner);
  assert.equal(reads.finish(first, visibleOwner, 'success'), false, 'same session ID is not the same view generation');
  assert.equal(reads.finish(second, visibleOwner, 'error'), false);
  assert.equal(snapshotReadStatus(reads.current(), visibleOwner), 'pending');
});

test('account refresh invalidates an old read without turning the new read into an error or idle state', () => {
  const reads = new SnapshotReadTracker(chat);
  const oldRead = reads.begin(chat)!;
  const refreshed = { ...chat, epoch: 2 };
  reads.reset(refreshed);
  const refreshRead = reads.begin(refreshed)!;
  assert.equal(reads.finish(oldRead, refreshed, 'idle'), false);
  assert.equal(reads.pending(refreshed), true);
  assert.equal(reads.finish(refreshRead, refreshed, 'success'), true);
});

test('a snapshot confirmed by another current read prevents an older failure from replacing the success', () => {
  const reads = new SnapshotReadTracker(chat);
  const read = reads.begin(chat)!;
  reads.accept(chat);
  assert.equal(reads.finish(read, chat, 'error'), false);
  assert.equal(snapshotReadStatus(reads.current(), chat), 'success');
  const away = { ...chat, epoch: 2, screen: 'sessions' as const, sessionId: null };
  reads.reset(away);
  assert.equal(snapshotReadStatus(reads.current(), chat), 'idle', 'a previous owner cannot project state into a different view');
});

test('an abandoned foreground refresh releases only its own read so a later retry can proceed', () => {
  const reads = new SnapshotReadTracker(chat);
  const read = reads.begin(chat)!;
  assert.equal(reads.finish(read, chat, 'idle'), true);
  assert.equal(snapshotReadStatus(reads.current(), chat), 'idle', 'a cancelled request is not a failed session');
  assert.ok(reads.begin(chat));
});
