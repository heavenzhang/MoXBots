import assert from 'node:assert/strict';
import test from 'node:test';
import { receiptCheckDelay, snapshotSessionToRead, submittedDraftHidden } from '../src/deliveryPolicy.ts';
import { readRecentSessions } from '../src/recentSessionRead.ts';
import type { Target } from '../src/native.ts';
import type { RecentSessionItem } from '../src/sessionPresentation.ts';
const owner = { epoch: 1, screen: 'chat' as const, targetId: 'a', agentId: 'agent-a', sessionId: 's' };
const ticket = { key: 'draft-a', text: '已提交', editRevision: 2, accountGeneration: 0 };
test('submitted text is hidden while retained; newer edits and other scopes are never hidden', () => {
  assert.equal(submittedDraftHidden(ticket, [ticket], [], owner), true);
  assert.equal(submittedDraftHidden({ ...ticket, editRevision: 3 }, [ticket], [], owner), false);
  const pending = [{ protocol: 'mobile' as const, targetId: 'a', agentId: 'agent-a', operationId: 'op', sessionId: 's', status: 'unknown' as const, submittedText: '已提交', submittedDraft: { revision: 4, lastWriteId: '00000000-0000-4000-8000-000000000004' } }];
  const durable = { ...ticket, revision: 4, lastWriteId: '00000000-0000-4000-8000-000000000004', status: 'saved' };
  assert.equal(submittedDraftHidden(durable, [], pending, owner), true);
  assert.equal(submittedDraftHidden({ ...durable, revision: 6 }, [], pending, owner), false);
  assert.equal(submittedDraftHidden({ ...durable, status: 'unsaved' }, [], pending, owner), false);
  assert.equal(submittedDraftHidden({ ...ticket, text: '下一条草稿' }, [], pending, owner), false);
  assert.equal(submittedDraftHidden(ticket, [], pending, { ...owner, sessionId: 'other' }), false);
  assert.equal(submittedDraftHidden(ticket, [], [], owner), false, 'definitive local failure restores normal editing');
});
test('receipt reads back off and stop automatically; no schedule authorizes resending', () => {
  assert.deepEqual(Array.from({ length: 9 }, (_, i) => receiptCheckDelay(i)), [1500, 3000, 6000, 12000, 15000, 15000, 15000, 15000, null]);
});
test('failed first snapshot remains readable and unrelated snapshots do not poll another session', () => {
  assert.equal(snapshotSessionToRead(owner, null), 's');
  assert.equal(snapshotSessionToRead(owner, { sessionId: 's', agentId: 'agent-a' }), 's');
  assert.equal(snapshotSessionToRead(owner, { sessionId: 'other', agentId: 'agent-a' }), null);
  assert.equal(snapshotSessionToRead({ ...owner, sessionId: null }, null), null);
});
const target = (id: string): Target => ({ targetId: id, identityKey: id, agentId: `agent-${id}`, name: id, deviceName: 'host', online: true, runtime: null });
const row = (id: string) => ({ sessionId: id, title: id, updatedAt: '2026-11-01T00:00:00Z', preview: id, runtime: 'codex' });
test('recent reads are bounded, publish successes before slow peers, and preserve cache during refresh', async () => {
  let release!: () => void; const wait = new Promise<void>((resolve) => { release = resolve; });
  let active = 0; let peak = 0; const published: RecentSessionItem[][] = [];
  const reading = readRecentSessions([target('a'), target('b'), target('c')], async (t) => {
    active++; peak = Math.max(peak, active);
    try { if (t.targetId === 'a') await wait; if (t.targetId === 'b') throw new Error('offline'); return [row(t.targetId)]; }
    finally { active--; }
  }, () => true, (rows) => published.push(rows), [{ ...row('cached-a'), target: target('a') }]);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(peak, 2); assert.equal(published[0][0].sessionId, 'cached-a');
  assert.ok(published.some((rows) => rows.some((row) => row.sessionId === 'c')));
  release(); await reading;
  assert.deepEqual(published.at(-1)?.map((row) => row.sessionId), ['a', 'c']);
});
test('old account recent responses cannot commit or launch more reads after invalidation', async () => {
  let release!: () => void; const wait = new Promise<void>((resolve) => { release = resolve; });
  let current = true; let calls = 0; const published: RecentSessionItem[][] = [];
  const reading = readRecentSessions([target('a'), target('b'), target('c')], async (t) => { calls++; await wait; return [row(t.targetId)]; }, () => current, (rows) => published.push(rows));
  current = false; release(); await reading;
  assert.equal(calls, 2); assert.equal(published.length, 1); assert.deepEqual(published[0], []);
});

test('materialized first-message rejection restores original text without replacing newer editing', async () => {
  const {rejectedDraftForOwner}=await import('../src/deliveryPolicy.ts');
  const owner={epoch:2,screen:'chat' as const,targetId:'t',agentId:'a',sessionId:'created-session'};
  const item={targetId:'t',agentId:'a',sessionId:null,submittedText:'first message'};
  assert.deepEqual(rejectedDraftForOwner(owner,item,'created-session',''),{kind:'restore',text:'first message'});
  assert.deepEqual(rejectedDraftForOwner(owner,item,'created-session','new edit'),{kind:'restore',text:'new edit\n\nfirst message'});
  assert.deepEqual(rejectedDraftForOwner(owner,item,'created-session','first message'),{kind:'restore',text:'first message'});
  assert.deepEqual(rejectedDraftForOwner({...owner,agentId:'other'},item,'created-session',''),{kind:'skip'});
  assert.deepEqual(rejectedDraftForOwner({...owner,sessionId:'other'},item,'created-session',''),{kind:'skip'});
  assert.deepEqual(rejectedDraftForOwner(owner,item,'created-session','full',5),{kind:'overflow'});
});
