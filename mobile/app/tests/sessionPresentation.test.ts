import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conversationStatus, filterSessionRows, sessionDateGroup, sessionUpdatedLabel } from '../src/sessionPresentation.ts';

const rows = [
  { sessionId: 'one', title: '产品讨论', preview: '复核 API 返回', updatedAt: '', runtime: 'codex' },
  { sessionId: 'two', title: '附件预览', preview: '检查文件', updatedAt: '', runtime: 'codex' },
];

test('compact status never reports idle or unavailable work as completed', () => {
  assert.equal(conversationStatus('idle', true), '可继续');
  assert.equal(conversationStatus('running', true), '正在执行');
  assert.equal(conversationStatus('waiting_user_action', true), '等待确认');
  assert.equal(conversationStatus('unavailable', true), '暂不可用');
  assert.equal(conversationStatus('running', false), '离线');
  assert.equal(conversationStatus(undefined, true), '在线');
});

test('search finds title or preview without changing session identity or source order', () => {
  assert.deepEqual(filterSessionRows(rows, '  api  '), [rows[0]]);
  assert.deepEqual(filterSessionRows(rows, '附件'), [rows[1]]);
  assert.deepEqual(filterSessionRows(rows, '不存在'), []);
  assert.deepEqual(filterSessionRows(rows, ''), rows);
  assert.equal(filterSessionRows(rows, 'api')[0], rows[0]);
  assert.equal(rows.length, 2);
});

test('date grouping uses calendar boundaries, including a month and year transition', () => {
  const now = new Date(2026, 0, 1, 10, 0);
  assert.equal(sessionDateGroup(new Date(2026, 0, 1, 1).toISOString(), now), '今天');
  assert.equal(sessionDateGroup(new Date(2025, 11, 31, 23, 59).toISOString(), now), '昨天');
  assert.equal(sessionDateGroup(new Date(2025, 11, 29).toISOString(), now), '2025年');
  assert.equal(sessionDateGroup('invalid', now), '会话');
});

test('relative times do not invent a timestamp for absent or future-clock metadata', () => {
  const now = new Date(2026, 9, 21, 12, 0);
  assert.equal(sessionUpdatedLabel('', now), '');
  assert.equal(sessionUpdatedLabel(new Date(2026, 9, 21, 11, 59, 40).toISOString(), now), '刚刚');
  assert.equal(sessionUpdatedLabel(new Date(2026, 9, 21, 11, 55).toISOString(), now), '5分钟前');
  assert.equal(sessionUpdatedLabel(new Date(2026, 9, 21, 12, 2).toISOString(), now), '12:02');
});
