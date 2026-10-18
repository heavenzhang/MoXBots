import assert from 'node:assert/strict';
import test from 'node:test';
import { NotificationOpenQueue, NotificationPreferenceFence, notificationEventId, notificationSnapshotMatches } from '../src/notificationPolicy.ts';

const action = 'default';
const first = '77777777-7777-4777-8777-777777777777';
const second = '88888888-8888-4888-8888-888888888888';
const response = (data: unknown, actionIdentifier = action) => ({ actionIdentifier, notification: { request: { content: { data } } } });

test('a delayed token rotation cannot re-enable reminders after an explicit disable', () => {
  const fence = new NotificationPreferenceFence();
  const oldRotation = fence.captureAutoRefresh();
  const olderEnable = fence.beginChange();
  fence.beginChange(); // Newer user disable; an unconfirmed disable stays blocked.
  fence.confirmEnabled(olderEnable);
  assert.equal(fence.isAutoRefreshCurrent(oldRotation), false);
  assert.equal(fence.captureAutoRefresh(), null);
  const explicitEnable = fence.beginChange();
  fence.confirmEnabled(explicitEnable);
  assert.equal(fence.isAutoRefreshCurrent(fence.captureAutoRefresh()), true);
});

test('notification routing accepts only an opaque event from an explicit default tap', () => {
  assert.equal(notificationEventId(response({ eventId: first, url: 'https://untrusted.invalid', approved: true }), action), first);
  for (const value of [null, {}, response({ eventId: first }, 'approve'), response({ url: '/' }), response({ eventId: 'bad' }), response([first])]) {
    assert.equal(notificationEventId(value, action), null);
  }
  assert.equal(notificationEventId(response({ eventId: 'abcdefab-cdef-4abc-8abc-abcdefabcdef'.toUpperCase() }), action), null);
});

test('a delayed old completion cannot erase a newer explicit notification tap', () => {
  const queue = new NotificationOpenQueue();
  let notifications = 0;
  const unsubscribe = queue.subscribe(() => { notifications += 1; });
  assert.equal(queue.receive(first), true);
  const old = queue.peek()!;
  assert.equal(queue.receive(first), false);
  assert.equal(queue.receive(second), true);
  assert.equal(queue.complete(old), false);
  assert.equal(queue.peek()?.eventId, second);
  queue.dismiss(old);
  assert.equal(queue.peek()?.eventId, second);
  const current = queue.peek()!;
  assert.equal(queue.complete(current), true);
  assert.equal(queue.receive(second), false);
  assert.equal(notifications, 2);
  assert.equal(queue.receive(second, true), true, 'a later explicit tap may reopen the same read-only hint');
  unsubscribe();
});

test('an interrupted read remains retryable and a fresh process can reopen the hint safely', () => {
  const queue = new NotificationOpenQueue();
  queue.receive(first);
  const pending = queue.peek()!;
  assert.equal(queue.isCurrent(pending), true);
  // Failed reads do not consume the hint. Caller may retry the same read.
  assert.equal(queue.peek(), pending);
  const restarted = new NotificationOpenQueue();
  assert.equal(restarted.receive(first), true);
  assert.equal(notificationSnapshotMatches({ agentId: 'agent-a', sessionId: 'session-a' }, { kind: 'snapshot', agentId: 'agent-b', sessionId: 'session-a' }), false);
  assert.equal(notificationSnapshotMatches({ agentId: 'agent-a', sessionId: 'session-a' }, { kind: 'snapshot', agentId: 'agent-a', sessionId: 'session-a' }), true);
});

test('ignoring a hint suppresses cold-response recovery but allows a later explicit tap', () => {
  const queue = new NotificationOpenQueue();
  queue.receive(first);
  queue.dismiss(queue.peek()!);
  assert.equal(queue.peek(), null);
  assert.equal(queue.receive(first), false);
  assert.equal(queue.receive(first, true), true);
});
