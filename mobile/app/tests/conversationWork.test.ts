import assert from 'node:assert/strict';
import test from 'node:test';
import type { Snapshot } from '../src/native.ts';
import { conversationWorkExcerpts, conversationWorkProgress, currentWorkRequests } from '../src/conversationWork.ts';

const snapshot = (patch: Partial<Snapshot> = {}): Snapshot => ({ kind: 'snapshot', agentId: 'bot-a', sessionId: 'session-a', generation: 'g', turnId: 't', revision: '1', state: 'idle', title: '继续完善报告', runtime: 'codex', model: null, terminal: null, messages: [], interactions: [], hasMoreBefore: false, nextBefore: null, ...patch });
const input = (value: Snapshot | null) => ({ snapshot: value, online: true, awaiting: false, reading: false, sending: false, receipt: null });
const message = (id: string, role: 'user' | 'assistant', content: string): Snapshot['messages'][number] => ({ id, role, content, timestamp: '2026-11-03T01:00:00Z', truncated: false, tools: [] });

test('unconfirmed submission takes priority over an actionable request and only offers same-operation query', () => {
  const request = { requestId: 'r', generation: 'g', turnId: 't', interaction: 'permission' as const, title: '授权请求', description: '', actionable: true, questions: [] };
  const value = snapshot({ state: 'waiting_user_action', interactions: [request] });
  assert.equal(conversationWorkProgress({ ...input(value), receipt: 'unknown' }).action, 'query');
  assert.equal(conversationWorkProgress(input(value)).action, 'requests');
  assert.equal(conversationWorkProgress(input(snapshot({ ...value, generation: 'new' }))).action, 'read');
  assert.equal(conversationWorkProgress(input(snapshot({ ...value, interactions: [{ ...request, actionable: false }] }))).action, 'read');
});

test('reopening before its snapshot arrives cannot look like a new ready-to-send conversation', () => {
  const result = conversationWorkProgress({ ...input(null), awaiting: true, reading: true });
  assert.equal(result.action, 'read');assert.match(result.detail, /不会新建或发送/);
  assert.equal(conversationWorkProgress({ ...input(snapshot()), online: false }).actionLabel, '继续写草稿');
});

test('running, ended and interrupted states keep continuation separate from task acceptance', () => {
  assert.equal(conversationWorkProgress(input(snapshot({ state: 'running' }))).action, 'compose');
  const ended = conversationWorkProgress(input(snapshot({ terminal: 'complete' })));
  assert.match(ended.detail, /不代表任务已验收/);assert.equal(ended.action, 'compose');
  assert.equal(conversationWorkProgress(input(snapshot({ terminal: 'interrupted' }))).tone, 'error');
  assert.equal(conversationWorkProgress(input(snapshot({ state: 'unavailable' }))).action, 'read');
});

test('an older Bot reply is never presented as the answer to a newer requirement', () => {
  const value = snapshot({ messages: [message('a', 'user', '旧要求'), message('b', 'assistant', '旧回复'), message('c', 'user', '加入新的要求')] });
  assert.equal(conversationWorkExcerpts(value).reply, null);
  assert.equal(conversationWorkExcerpts(value).request?.content, '加入新的要求');
  assert.equal(conversationWorkExcerpts(snapshot({ ...value, messages: [...value.messages, message('d', 'assistant', '针对新要求的回复')] })).reply?.id, 'd');
});

test('excerpts remain bounded to the current authoritative snapshot and retain missing-history boundary', () => {
  const a = conversationWorkExcerpts(snapshot({ messages: [message('a', 'user', '甲的要求')] }));
  const b = conversationWorkExcerpts(snapshot({ messages: [message('b', 'assistant', '乙的回复')], hasMoreBefore: true, nextBefore: 'b' }));
  assert.equal(a.request?.content, '甲的要求');assert.equal(b.request, null);assert.equal(b.reply?.content, '乙的回复');assert.equal(b.partial, true);
  assert.deepEqual(conversationWorkExcerpts(null), { request: null, reply: null, partial: false });
});


test('request section shows only the active generation and turn, including desktop-only requests', () => {
  const live = { requestId: 'r', generation: 'g', turnId: 't', interaction: 'permission' as const, title: '本次请求', description: '', actionable: true, questions: [] };
  const desktopOnly = { ...live, requestId: 'desktop', actionable: false };
  const current = snapshot({ state: 'waiting_user_action', interactions: [live, { ...live, requestId: 'old-g', generation: 'old' }, { ...live, requestId: 'old-t', turnId: 'old' }, desktopOnly] });
  assert.deepEqual(currentWorkRequests(current), [live, desktopOnly]);
  assert.match(conversationWorkProgress(input(current)).detail, /^1 项/);
  assert.deepEqual(currentWorkRequests({ ...current, state: 'running' }), []);
  assert.deepEqual(currentWorkRequests({ ...current, state: 'idle' }), []);
  assert.deepEqual(currentWorkRequests(null), []);
});
