import assert from 'node:assert/strict';
import test from 'node:test';
import { applyBotSnapshot, botKey, botSessionKey, botSessionStatus, botSessionAction, botStatusCoverage, nextBotStatusBatch, readBotDirectory, recentBotSessions } from '../src/botDirectory.ts';
import type { BotSession } from '../src/botDirectory.ts';
import type { Snapshot, Target } from '../src/native.ts';
const a: Target = { targetId:'a', identityKey:'identity-a',agentId:'agent-a',name:'同名 Bot',deviceName:'电脑',online:true,runtime:null };
const b = {...a,targetId:'b',identityKey:'identity-b',agentId:'agent-b'};
const row = (target:Target, date:string):BotSession => ({target,sessionId:'same-session',title:'工作',updatedAt:date,preview:'不是状态的文字：已完成',runtime:'codex'});
test('cross-Bot same session IDs remain separate and newest work sorts first', () => {
 const rows=recentBotSessions([a,b].map((target,i)=>({target,sessions:[row(target,`2026-11-0${i+1}T00:00:00Z`)],error:null,hasMore:false,loadedAt:0})));
 assert.equal(rows.length,2);assert.equal(rows[0].target,b);assert.notEqual(botSessionKey(rows[0]),botSessionKey(rows[1]));assert.notEqual(botKey(a),botKey(b));
});
test('only matching Bot and session may update observed state; text cannot invent completion',()=>{
 const rows=[row(a,''),row(b,'')];const snapshot={agentId:a.agentId,sessionId:'same-session',title:'真实标题',state:'running',terminal:null,messages:[]} as unknown as Snapshot;
 const updated=applyBotSnapshot(rows,a,snapshot,123);
 assert.equal(updated[0].state,'running');assert.equal(updated[1].state,undefined);assert.equal(botSessionStatus(rows[0]).label,'状态待同步');
 assert.deepEqual(applyBotSnapshot(rows,b,snapshot),rows);
 assert.equal(botSessionStatus({...rows[0],terminal:'complete'}).label,'本轮已结束');
 assert.equal(botSessionStatus({...rows[0],target:{...a,online:false},state:'running'}).label,'设备离线');
});

test('unread states do not mean an empty needs-me filter; offline rows stay separate',()=>{
 const rows=[{...row(a,''),state:'waiting_user_action' as const,observedAt:1},row(b,''),{...row(a,''),sessionId:'offline',target:{...a,online:false}}];
 assert.deepEqual(botStatusCoverage(rows),{total:3,known:1,unread:1,failed:0,offline:1});
 assert.equal(botSessionStatus({...row(a,''),state:'unavailable'}).tone,'error');
 assert.equal(botSessionAction({...row(a,''),state:'unavailable'}),'核对状态');
});

test('an explicit batch discovers unread work before retrying failed sources and never exceeds12',()=>{
 const known={...row(a,''),sessionId:'known',state:'idle' as const};
 const failed={...row(a,''),sessionId:'failed',statusReadFailed:true};
 const unseen=Array.from({length:15},(_,i)=>({...row(b,''),sessionId:`unread-${i}`}));
 const selected=nextBotStatusBatch([known,failed,...unseen]);
 assert.equal(selected.length,12);assert.ok(selected.every(item=>item.sessionId.startsWith('unread-')));
 assert.deepEqual(nextBotStatusBatch([known,failed]),[failed]);
 assert.deepEqual(nextBotStatusBatch([{...failed,target:{...a,online:false}}]),[]);
 assert.equal(botStatusCoverage([known,failed]).unread,1);
});
test('directory concurrency is bounded and obsolete work stops scheduling reads',async()=>{
 let current=true,active=0,peak=0,read=0;let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 const task=readBotDirectory([1,2,3,4,5,6],async()=>{read++;active++;peak=Math.max(peak,active);await gate;active--;},()=>current,2);
 assert.equal(read,2);current=false;release();await task;assert.equal(read,2);assert.equal(peak,2);
});

test('directory actions only open the original context and a turn result never claims task acceptance',()=>{
 const base=row(a,'');
 assert.equal(botSessionAction({...base,state:'running'}),'查看进展');
 assert.equal(botSessionAction({...base,state:'waiting_user_action'}),'查看请求');
 assert.equal(botSessionAction({...base,terminal:'error'}),'核对状态');
 assert.equal(botSessionAction({...base,terminal:'complete'}),'打开原会话');
 assert.match(botSessionStatus({...base,terminal:'complete'}).detail,/不代表任务已验收/);
 assert.equal(botSessionAction({...base,target:{...a,online:false}}),'查看已有记录');
});
