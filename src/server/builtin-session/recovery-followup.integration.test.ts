import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
const state=vi.hoisted(()=>({home:''}));
vi.mock('os',async original=>({...await original<typeof import('os')>(),homedir:()=>state.home}));
vi.mock('../sse',()=>({broadcast:vi.fn()}));
let store: typeof import('../SessionStore');
let taskOwner: typeof import('../session-engine/task-orchestration');
let review: typeof import('./recovery-reconciliation');
let id:string;
beforeEach(async()=>{
 state.home=await mkdtemp(join(tmpdir(),'mox-recovery-followup-'));vi.resetModules();
 store=await import('../SessionStore');taskOwner=await import('../session-engine/task-orchestration');review=await import('./recovery-reconciliation');
 id=(await store.createSession('/synthetic')).id;
});
afterEach(async()=>{await rm(state.home,{recursive:true,force:true});});
async function fixture(){
 const {recoveryActionHash}=await import('../openai-bridge/context-recovery');
 const input={command:'private business operation'};const hash=recoveryActionHash('Bash',input);
 const ledger={version:1,uncertain:[hash],completed:[],denied:[],blocked:false};
 await store.saveBuiltinContextLedger(id,id,ledger,()=>true);
 const deps: import('./recovery-reconciliation').RecoveryReviewDependencies={
  owner:{sessionId:id,sdkSessionId:id,epoch:1,reviewAuthority:'a'},isCurrent:()=>true,
  load:()=>store.loadBuiltinContextLedger(id,id),readNative:async()=>[{type:'assistant',uuid:'use',session_id:id,message:{content:[{type:'tool_use',id:'tool',name:'Bash',input}]}}],
  save:(next,digest,current)=>store.saveBuiltinContextLedger(id,id,next,current,undefined,digest),adopt:()=>{},
  taskLedger:()=>store.getSessionMetadata(id)?.taskOrchestration,
  mutateTaskLedger:async(mutation,current)=>{await taskOwner.mutateSessionTaskLedger(id,mutation,current);},
 };
 return {deps,hash,ledger};
}
it('durably saves user context and deferral with idempotency while preserving the uncertain action ledger',async()=>{
 const f=await fixture();const snapshot=await review.inspectRecoveryActions(f.deps);
 const request={...f.deps.owner,ledgerDigest:snapshot.ledgerDigest,actionHash:f.hash,kind:'note' as const,text:'记录编号 ABC，尚需查询原系统',requestId:randomUUID()};
 const first=await review.reconcileRecoveryAction(request,f.deps);
 expect(first.actions[0].followups).toHaveLength(1);
 await review.reconcileRecoveryAction(request,f.deps);
 expect((await review.inspectRecoveryActions(f.deps)).actions[0].followups).toHaveLength(1);
 await expect(review.reconcileRecoveryAction({...request,text:'conflicting result'},f.deps)).rejects.toThrow('conflict');
 await review.reconcileRecoveryAction({...request,kind:'defer',text:'',requestId:randomUUID()},f.deps);
 expect(store.loadBuiltinContextLedger(id,id)).toEqual(f.ledger);
 vi.resetModules();const reopened=await import('../SessionStore');
 const notes=reopened.getSessionMetadata(id)?.taskOrchestration?.recoveryFollowups;
 expect(notes?.map(note=>note.kind)).toEqual(['note','defer']);
 expect(reopened.loadBuiltinContextLedger(id,id)).toEqual(f.ledger);
});
it('rejects foreign/stale notes and never creates operation execution authority',async()=>{
 const f=await fixture();const s=await review.inspectRecoveryActions(f.deps);
 const request={...f.deps.owner,ledgerDigest:s.ledgerDigest,actionHash:f.hash,kind:'note' as const,text:'I think done',requestId:randomUUID()};
 for(const altered of [{...request,sdkSessionId:'foreign'},{...request,actionHash:'a'.repeat(64)},{...request,text:'x'.repeat(4001)},{...request,kind:'unlock'}]){
  await expect(review.reconcileRecoveryAction(altered as typeof request,f.deps)).rejects.toThrow();
 }
 expect(store.getSessionMetadata(id)?.taskOrchestration?.recoveryFollowups).toBeUndefined();
 expect(store.loadBuiltinContextLedger(id,id)).toEqual(f.ledger);
});
it('groups only exact task bindings, traverses dependencies, and does not guess missing associations',async()=>{
 const f=await fixture();
 await taskOwner.mutateSessionTaskLedger(id,next=>({...next,tasks:[{id:'a',title:'保存方案',blockedBy:[]},{id:'b',title:'复核方案',blockedBy:['a']},{id:'c',title:'独立查资料',blockedBy:[]}],bindings:{tool:'a'}}));
 const s=await review.inspectRecoveryActions(f.deps);
 expect(s.actions[0].association).toEqual({taskId:'a',title:'保存方案',blockedTaskIds:['b']});
 expect(s.independentTasks).toEqual([{taskId:'c',title:'独立查资料'}]);
 await taskOwner.mutateSessionTaskLedger(id,next=>({...next,bindings:{}}));
 const unknown=await review.inspectRecoveryActions(f.deps);
 expect(unknown.actions[0].association).toBeUndefined();expect(unknown.independentTasks).toEqual([]);
});

it('commits native completion and repairs only the exact original pending execution fact, with a cold reload',async()=>{
 const f=await fixture();
 const {recoveryActionHash}=await import('../openai-bridge/context-recovery');
 const {executionToolObservationDigest}=await import('../session-engine/session-execution');
 const {createSessionExecution}=await import('../../shared/sessionExecution');
 const {reconcileKnownExecutionCompletions}=await import('./execution-failure-reconciliation');
 const input={file_path:'/synthetic/file.txt',content:'expected'};const hash=recoveryActionHash('Write',input);
 const ledger={version:1,uncertain:[hash],completed:[],denied:[],blocked:false};await store.saveBuiltinContextLedger(id,id,ledger,()=>true);
 const execution=createSessionExecution({id:'original-execution',requestId:'human',queueId:'queue',originalInput:'create file',now:Date.now(),intent:{kind:'execute',objective:'create file',scope:'workspace',acceptanceCriteria:['verified artifact']}});
 await taskOwner.mutateSessionTaskLedger(id,next=>({...next,execution:{...execution,phase:'paused',reason:'TOOL_OUTCOME_UNKNOWN',lastSettledQueueId:'queue'},executionEvidence:[
  {id:'write-tool',name:'Write',queueId:'queue',digest:executionToolObservationDigest('Write',input),successful:false,mutating:true,pending:true,observationOrder:1},
  {id:'other',name:'Bash',queueId:'queue',digest:'unknown',successful:false,mutating:true,pending:true,observationOrder:2},
 ]}));
 const records=[{type:'assistant',uuid:'use',sessionId:id,isSidechain:false,message:{content:[{type:'tool_use',id:'write-tool',name:'Write',input}]}},
 {type:'user',uuid:'result',sessionId:id,isSidechain:false,parentUuid:'use',sourceToolAssistantUUID:'use',message:{content:[{type:'tool_result',tool_use_id:'write-tool',content:'File written',is_error:false}]}}];
 f.deps.readNative=async()=>records.map(row=>({type:row.type,uuid:row.uuid,session_id:id,message:row.message}));f.deps.readNativeRecords=async()=>records;
 const s=await review.inspectRecoveryActions(f.deps);expect(s.actions[0].reason).toBe('native_success');
 await review.reconcileRecoveryAction({...f.deps.owner,ledgerDigest:s.ledgerDigest,actionHash:hash},f.deps);
 await reconcileKnownExecutionCompletions({...f.deps,observationDigest:executionToolObservationDigest,mutateLedger:taskOwner.mutateSessionTaskLedger});
 const facts=store.getSessionMetadata(id)!.taskOrchestration!.executionEvidence!;
 expect(facts[0]).toMatchObject({id:'write-tool',pending:false,successful:true,recovered:'native-completion'});
 expect(facts[1]).toMatchObject({id:'other',pending:true,successful:false});
 expect(store.getSessionMetadata(id)!.taskOrchestration!.execution).toMatchObject({id:'original-execution',phase:'paused',reason:'TOOL_OUTCOME_UNKNOWN'});
 vi.resetModules();const cold=await import('../SessionStore');
 expect(cold.getSessionMetadata(id)?.taskOrchestration?.executionEvidence?.[0].recovered).toBe('native-completion');
});
