import assert from 'node:assert/strict';
import test from 'node:test';
import { latestTranscript, prependTranscript, refreshTranscript, sessionSnapshotReady } from '../src/transcriptHistory.ts';
import type { ViewOwner } from '../src/operationPolicy';

function page(start: number, end: number) {
  return { agentId: 'agent', sessionId: 'session', messages: Array.from({ length: end - start + 1 }, (_, index) => ({
    id: `m-${start + index}`, role: 'assistant' as const, timestamp: '', content: `message ${start + index}`, truncated: false, tools: [],
  })), hasMoreBefore: start > 1, nextBefore: start > 1 ? `m-${start}` : null };
}
const owner: ViewOwner = { epoch: 1, screen: 'chat', targetId: 'target', agentId: 'agent', sessionId: 'session' };

test('failed/pending existing-session reads cannot fall through to new-session sends', () => {
  assert.equal(sessionSnapshotReady(owner, null), false);
  assert.equal(sessionSnapshotReady(owner, { agentId: 'agent', sessionId: 'other' }), false);
  assert.equal(sessionSnapshotReady(owner, { agentId: 'other', sessionId: 'session' }), false);
  assert.equal(sessionSnapshotReady(owner, { agentId: 'agent', sessionId: 'session' }), true);
  assert.equal(sessionSnapshotReady({ ...owner, sessionId: null }, null), true);
  assert.equal(sessionSnapshotReady({ ...owner, sessionId: null }, { agentId: 'agent', sessionId: 'session' }), false);
  assert.equal(sessionSnapshotReady({ ...owner, screen: 'sessions' }, null), false);
});

test('older pages prepend once, retain order and exhaust their own cursor', () => {
  let history = latestTranscript(page(61, 90));
  history = prependTranscript(history, page(31, 60), 'm-61');
  history = prependTranscript(history, page(1, 30), 'm-31');
  assert.equal(history.messages.length, 90);
  assert.equal(history.messages[0].id, 'm-1');
  assert.equal(history.messages.at(-1)!.id, 'm-90');
  assert.equal(history.hasMoreBefore, false);
  assert.equal(history.nextBefore, null);
});

test('latest authority updates without losing loaded history or leaving deleted live entries', () => {
  const history = prependTranscript(latestTranscript(page(61, 90)), page(31, 60), 'm-61');
  const latest = page(63, 92);
  latest.messages[0].content = 'edited live text';
  latest.messages.splice(1, 1);
  const updated = refreshTranscript(history, latest);
  assert.equal(updated.nextBefore, 'm-31');
  assert.equal(updated.messages[0].id, 'm-31');
  assert.equal(updated.messages.find(message => message.id === 'm-63')!.content, 'edited live text');
  assert.equal(updated.messages.some(message => message.id === 'm-64'), false);
  assert.equal(updated.messages.at(-1)!.id, 'm-92');
  assert.equal(new Set(updated.messages.map(message => message.id)).size, updated.messages.length);
  assert.equal('generation' in updated, false);
  assert.equal('interactions' in updated, false);
});

test('scope changes, empty or disjoint replacement reset the reading projection', () => {
  const history = prependTranscript(latestTranscript(page(61, 90)), page(31, 60), 'm-61');
  for (const next of [{ ...page(1, 30), agentId: 'other' }, { ...page(1, 30), sessionId: 'other' }, page(100, 129), { ...page(1, 1), messages: [] }]) {
    const updated = refreshTranscript(history, next);
    assert.equal(updated.expanded, false);
    assert.deepEqual(updated.messages, next.messages);
  }
});

test('cross-scope, duplicate, non-progressing and stale-anchor pages are rejected', () => {
  const prior = latestTranscript(page(61, 90));
  for (const next of [{ ...page(31, 60), agentId: 'other' }, { ...page(31, 60), sessionId: 'other' }, page(31, 61), { ...page(31, 60), nextBefore: 'm-61' }, { ...page(31, 60), nextBefore: null }, { ...page(31, 60), messages: [] }, { ...page(31, 60), messages: [page(31, 31).messages[0], page(31, 31).messages[0]] }]) {
    assert.throws(() => prependTranscript(prior, next, 'm-61'), /SESSION_HISTORY_PAGE_INVALID/);
  }
  assert.throws(() => prependTranscript(prior, page(31, 60), 'm-60'), /SESSION_HISTORY_PAGE_INVALID/);
});

test('a page started before a live-window shift retains the intervening messages', () => {
  const captured = latestTranscript(page(61, 90));
  const paged = prependTranscript(captured, page(31, 60), 'm-61');
  const updated = refreshTranscript(paged, page(65, 94));
  assert.deepEqual(updated.messages.map(message => message.id), page(31, 94).messages.map(message => message.id));
});
