import { describe, expect, it } from 'vitest';
import { inspectNativeCompletions } from './native-completion-review';
import { inspectRecoveryActions, reconcileRecoveryAction, recoveryLedgerDigest, type RecoveryReviewDependencies } from './recovery-reconciliation';
import { ContextRecoveryController, recoveryActionHash } from '../openai-bridge/context-recovery';

export function completionFixture() {
  const owner = {sessionId:'product',sdkSessionId:'native',epoch:1,reviewAuthority:'authority'};
  const input = {file_path:'/workspace/result.txt',content:'expected private bytes'};
  const hash = recoveryActionHash('Write',input);
  const records: Record<string, unknown>[] = [
    {type:'assistant',uuid:'use',sessionId:'native',isSidechain:false,message:{content:[{type:'tool_use',id:'tool',name:'Write',input}]}},
    {type:'user',uuid:'result',sessionId:'native',isSidechain:false,parentUuid:'use',sourceToolAssistantUUID:'use',message:{content:[{type:'tool_result',tool_use_id:'tool',content:'File created',is_error:false}]}},
  ];
  const selected = records.map(row => ({type:row.type,uuid:row.uuid,session_id:'native',message:structuredClone(row.message)}));
  let ledger: unknown = {version:1,uncertain:[hash],completed:[],denied:[],blocked:false};
  let current = true;
  const deps: RecoveryReviewDependencies = {owner, isCurrent:()=>current,load:()=>ledger,
    readNative:async()=>selected,readNativeRecords:async()=>records,
    save:async(next,expected,live)=>{if (!live() || expected!==recoveryLedgerDigest(ledger)) throw new Error('CAS');ledger=next;},
    adopt:()=>{}};
  return {owner,input,hash,records,selected,deps,setLedger:(value:unknown)=>{ledger=value;},setCurrent:(value:boolean)=>{current=value;},
    receipt:()=>inspectNativeCompletions(records,selected,hash,owner,recoveryLedgerDigest(ledger))};
}

describe('exact native completion recovery',()=>{
  it('confirms a legacy completed Write and retains replay protection through cold restart',async()=>{
    const f=completionFixture();
    const first=await inspectRecoveryActions(f.deps);
    expect(first.actions[0]).toMatchObject({eligible:true,reason:'native_success',check:{kind:'native_success'}});
    expect(JSON.stringify(first)).not.toContain('expected private bytes');
    await reconcileRecoveryAction({...f.owner,actionHash:f.hash,ledgerDigest:first.ledgerDigest},f.deps);
    const after=await inspectRecoveryActions(f.deps);
    expect(after.actions).toEqual([]);expect(after.completed).toHaveLength(1);
    const restored=new ContextRecoveryController({initialLedger:f.deps.load(),recoveryOwner:f.owner,scope:()=> 'new',isActive:()=>true,protectStreaming:true,backup:async()=>'/archive'});
    expect(restored.inspectActionLedger().uncertainCount).toBe(0);
    expect(restored.beforeTool('Write',f.input)).toContain('already completed');
    expect(restored.beforeTool('Bash',{command:'independent action'})).toBeUndefined();
  });
  it('adopts a committed completion into the original live controller only once',async()=>{
    const f=completionFixture();
    const live=new ContextRecoveryController({initialLedger:f.deps.load(),recoveryOwner:f.owner,scope:()=> 'new',isActive:()=>true,protectStreaming:true,backup:async()=>'/archive'});
    f.deps.adopt=receipt=>{if(receipt.kind==='native-completion-reviewed') live.adoptNativeCompletion(receipt);};
    const snapshot=await inspectRecoveryActions(f.deps);
    await reconcileRecoveryAction({...f.owner,actionHash:f.hash,ledgerDigest:snapshot.ledgerDigest},f.deps);
    expect(live.inspectActionLedger().uncertainCount).toBe(0);
    expect(live.beforeTool('Write',f.input)).toContain('already completed');
    expect(()=>live.adoptNativeCompletion(f.receipt()!)).toThrow();
  });
  it.each(['foreign','sidechain','message_mismatch','missing_result','error','duplicate_result','duplicate_use','unproved_peer','wrong_parent','wrong_source','truncated_selected','launch'])('keeps %s evidence unconfirmed',async mode=>{
    const f=completionFixture(); const result=f.records[1];
    if(mode==='foreign')result.sessionId='other';
    if(mode==='sidechain')result.isSidechain=true;
    if(mode==='message_mismatch')f.selected[1].message={content:[]};
    if(mode==='missing_result')f.records.pop();
    if(mode==='error')(result.message as {content:{is_error:boolean}[]}).content[0].is_error=true;
    if(mode==='duplicate_result')f.records.push({...structuredClone(result),uuid:'dup'});
    if(mode==='duplicate_use')f.records.push({...structuredClone(f.records[0]),uuid:'dup'});
    if(mode==='unproved_peer')f.records.push({...structuredClone(f.records[0]),uuid:'peer',message:{content:[{type:'tool_use',id:'peer',name:'Write',input:f.input}]}});
    if(mode==='wrong_parent')result.parentUuid='other';
    if(mode==='wrong_source')result.sourceToolAssistantUUID='other';
    if(mode==='truncated_selected')f.selected.pop();
    if(mode==='launch') { (f.records[0].message as {content:{name:string;input:unknown}[]}).content[0]={...((f.records[0].message as {content:object[]}).content[0]),name:'Bash',input:{command:'work',run_in_background:true}}; }
    expect(f.receipt()).toBeUndefined();
    expect((await inspectRecoveryActions(f.deps)).actions[0].eligible).toBe(false);
  });
  it('never confirms an unpaired newer reserved attempt for the same input',async()=>{
    const f=completionFixture();
    f.setLedger({version:1,uncertain:[f.hash],completed:[],denied:[],blocked:false,operationAttempts:{version:1,legacyUncertain:[f.hash],entries:[{
      id:'11111111-1111-4111-8111-111111111111',queryEpoch:'22222222-2222-4222-8222-222222222222',queryGeneration:1,
      sessionId:'product',sdkSessionId:'native',scope:'queue',toolUseId:'newer-unpaired',toolName:'Write',actionHash:f.hash,reservedAt:new Date().toISOString(),status:'reserved',
    }]}});
    expect((await inspectRecoveryActions(f.deps)).actions[0].eligible).toBe(false);
  });
  it('settles a matching reserved attempt and retains its tool identity after restart',async()=>{
    const f=completionFixture();
    f.setLedger({version:1,uncertain:[f.hash],completed:[],denied:[],blocked:false,operationAttempts:{version:1,legacyUncertain:[],entries:[{
      id:'11111111-1111-4111-8111-111111111111',queryEpoch:'22222222-2222-4222-8222-222222222222',queryGeneration:1,
      sessionId:'product',sdkSessionId:'native',scope:'queue',toolUseId:'tool',toolName:'Write',actionHash:f.hash,reservedAt:new Date().toISOString(),status:'reserved',
    }]}});
    const snapshot=await inspectRecoveryActions(f.deps);
    await reconcileRecoveryAction({...f.owner,actionHash:f.hash,ledgerDigest:snapshot.ledgerDigest},f.deps);
    expect(f.deps.load()).toMatchObject({operationAttempts:{entries:[{toolUseId:'tool',status:'returned',outcome:'success'}]}});
    const restored=new ContextRecoveryController({initialLedger:f.deps.load(),recoveryOwner:f.owner,scope:()=> 'new',isActive:()=>true,backup:async()=>'/archive'});
    expect(restored.inspectActionLedger().uncertainCount).toBe(0);
  });
  it('rejects owner changes and lost storage without adopting a completion',async()=>{
    const f=completionFixture();const snapshot=await inspectRecoveryActions(f.deps);f.setCurrent(false);
    await expect(reconcileRecoveryAction({...f.owner,actionHash:f.hash,ledgerDigest:snapshot.ledgerDigest},f.deps)).rejects.toThrow();
  });
});

it('never overwrites a durable error outcome with an inconsistent history success',async()=>{
 const f=completionFixture();
 f.setLedger({version:1,uncertain:[f.hash],completed:[],denied:[],blocked:false,operationAttempts:{version:1,legacyUncertain:[],entries:[{
  id:'11111111-1111-4111-8111-111111111111',queryEpoch:'22222222-2222-4222-8222-222222222222',queryGeneration:1,
  sessionId:'product',sdkSessionId:'native',scope:'queue',toolUseId:'tool',toolName:'Write',actionHash:f.hash,
  reservedAt:new Date().toISOString(),returnedAt:new Date().toISOString(),status:'unresolved',outcome:'error',resultDigest:'e'.repeat(64),
 }]}});
 expect((await inspectRecoveryActions(f.deps)).actions[0].eligible).toBe(false);
});
