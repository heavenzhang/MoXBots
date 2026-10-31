import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conversationStatus, filterSessionRows, recentSessionRows, sessionDateGroup, sessionUpdatedLabel } from '../src/sessionPresentation.ts';

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


const bot = { targetId: 'bot-a', identityKey: 'identity-a', agentId: 'agent', name: '产品 Bot', deviceName: 'Mac Studio', online: true, runtime: 'codex' };
const recent = [
  { ...rows[0], updatedAt: 'invalid', target: bot },
  { ...rows[1], sessionId: 'shared-id', updatedAt: '2026-11-01T10:00:00Z', target: { ...bot, targetId: 'bot-b', name: '研发 Bot', deviceName: 'Windows PC', online: false } },
  { ...rows[0], sessionId: 'shared-id', updatedAt: '2026-11-01T12:00:00Z', target: bot },
  { ...rows[1], updatedAt: '', target: bot },
];

test('recent sessions sort across Bots, retain offline origins and do not merge shared session IDs', () => {
  const result = recentSessionRows(recent, '');
  assert.deepEqual(result, [recent[2], recent[1], recent[0], recent[3]]);
  assert.equal(result[1].target.online, false);
  assert.equal(result[1], recent[1]);
  assert.equal(recent[0].updatedAt, 'invalid');
  assert.equal(result.length, recent.length);
});

test('recent search covers Bot and device as well as title/preview and never depends on selected Bot', () => {
  assert.deepEqual(recentSessionRows(recent, '  WINDOWS  '), [recent[1]]);
  assert.deepEqual(recentSessionRows(recent, '研发'), [recent[1]]);
  assert.deepEqual(recentSessionRows(recent, 'API'), [recent[2], recent[0]]);
  assert.deepEqual(recentSessionRows(recent, '不存在'), []);
  assert.deepEqual(recentSessionRows([], ''), []);
});

test('equal recent timestamps keep source order and absent metadata never becomes recent', () => {
  const sameTime = recent.map((row) => ({ ...row, updatedAt: '2026-11-01T10:00:00Z' }));
  assert.deepEqual(recentSessionRows(sameTime, ''), sameTime);
  assert.notEqual(recentSessionRows(sameTime, ''), sameTime);
});
