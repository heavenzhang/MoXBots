#!/usr/bin/env node
// Actual Node precheck + actual Rust selection/proof functions. I/O, signing and
// actor delivery are isolated adapters, never native/service/device acceptance.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i++){
  if(['--expect-red','--legacy-unfenced'].includes(args[i])){options[args[i].slice(2)]=true;continue;}
  if(!['--deps-dir','--extern-manifest','--node-modules','--delivery-source'].includes(args[i])||!args[i+1])throw Error('Explicit --deps-dir --extern-manifest --node-modules required');
  options[args[i].slice(2)]=args[++i];
}
const deps=options['deps-dir'],modules=options['node-modules'];
if(!path.isAbsolute(deps??'')||!path.isAbsolute(modules??''))throw Error('Absolute verified dependency directories required');
const manifest=JSON.parse(fs.readFileSync(options['extern-manifest'],'utf8'));
const dependencies=['serde','serde_json','sha2','uuid','jsonwebtoken','libc','chrono','tokio','myagents_agent_network_protocol'];
const externs=[],dependencyEvidence=[];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
for(const name of dependencies){
  const item=manifest[name];
  if(!item||path.basename(item.file)!==item.file||!new RegExp(`^lib${name}-[a-f0-9]+\\.rlib$`).test(item.file))throw Error(`Missing exact artifact ${name}`);
  const file=path.join(deps,item.file),stat=fs.lstatSync(file),digest=hash(fs.readFileSync(file));
  if(!stat.isFile()||stat.isSymbolicLink()||digest!==item.sha256)throw Error(`Changed dependency ${name}`);
  externs.push('--extern',`${name}=${file}`);dependencyEvidence.push({name,...item});
}
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'moxbots-desktop-source-flow-'));
const targetPath=path.join(root,'src/server/agent-network/target.ts');
const target=fs.readFileSync(targetPath,'utf8');
function index(text,anchor){const i=text.indexOf(anchor);if(i<0||text.indexOf(anchor,i+1)>=0)throw Error(`Ambiguous source anchor: ${anchor}`);return i;}
const precheck=target.slice(index(target,'const precheckSchema ='),index(target,'/** This projection is for the three read operations only.'));
const require=createRequire(import.meta.url),esbuild=require(path.join(modules,'esbuild/lib/main.js'));
const fixtureModule=path.join(directory,'actual-precheck.cjs');
esbuild.buildSync({stdin:{resolveDir:root,sourcefile:'actual-precheck-fixture.ts',loader:'ts',contents:`
import {z} from 'zod';
import {isProjectArchived,isProjectVisibleToUser} from ${JSON.stringify(path.join(root,'src/shared/config-types.ts'))};
import {workspacePathsEqual} from ${JSON.stringify(path.join(root,'src/shared/workspacePath.ts'))};
let state:any;
const resolvePersistedAgentWorkspaceRegistry=async()=>{if(state.fail)throw Error('isolated fixture I/O failure');return state.registry;};
const getSessionMetadata=(id:string)=>state.metadata[id];
const isHistoryVisibleSession=(row:any)=>row.visible!==false;
${precheck}
export async function cases(workspaceA:string,workspaceB:string){
 const sessionA='11111111-1111-4111-8111-111111111111',sessionB='22222222-2222-4222-8222-222222222222';
 const agentA='agent-a',agentB='agent-b';
 const projection=(agentId:string,workspacePath:string)=>({agentId,workspacePath,project:{id:agentId,path:workspacePath},agent:{id:agentId,enabled:true}});
 const registry={diagnostics:[],agentProjections:[projection(agentA,workspaceA),projection(agentB,workspaceB)]};
 const metadata={[sessionB]:{id:sessionB,agentDir:workspaceB,visible:true}};
 const read=()=>handleNetworkTargetPrecheck({localAgentId:agentA,localSessionId:sessionA});
 state={registry,metadata};const missing=await read();
 state={registry:{...registry,agentProjections:[projection(agentB,workspaceB)]},metadata};const unavailable=await read();
 state={registry:{...registry,diagnostics:[{agentIds:[agentA]}]},metadata};const conflict=await read();
 state={fail:true,registry,metadata};const infra=await read();
 state={registry,metadata};const valid=await handleNetworkTargetPrecheck({localAgentId:agentB,localSessionId:sessionB});
 return{workspaceA,workspaceB,sessionA,sessionB,agentA,agentB,missing,unavailable,conflict,infra,valid};
}`},bundle:true,platform:'node',format:'cjs',outfile:fixtureModule,nodePaths:[modules],logLevel:'silent'});
const fixture=await require(fixtureModule).cases(path.join(directory,'workspace-a'),path.join(directory,'workspace-b'));
const fixturePath=path.join(directory,'actual-precheck-responses.json');fs.writeFileSync(fixturePath,JSON.stringify(fixture));
const deliveryPath=options['delivery-source']??path.join(root,'src-tauri/src/agent_network/notification_source_delivery.rs');
const delivery=fs.readFileSync(deliveryPath,'utf8');
function fn(anchor){const at=index(delivery,anchor),start=delivery.lastIndexOf('\n',at)+1,end=delivery.indexOf('\n}',at);if(end<at)throw Error('Changed Rust function layout');return delivery.slice(start,end+2);}
const selected=fn('async fn select_pointer(');
const queuePath=path.join(root,'src-tauri/src/agent_network/notification_source_queue.rs');
const localOwner=fs.readFileSync(path.join(root,'src-tauri/src/agent_network/local_owner.rs'),'utf8');
const identityStart=localOwner.lastIndexOf('#[derive',index(localOwner,'pub(crate) struct TargetIdentity'));
const identity=localOwner.slice(identityStart,index(localOwner,'pub(crate) struct PreparedTarget'));
const policy=fs.readFileSync(path.join(root,'src-tauri/src/agent_network/policy.rs'),'utf8');
const policyTypes=policy.slice(policy.indexOf('#[derive(Clone)]'),index(policy,"fn text<'a>"));
const actorPath=path.join(root,'src-tauri/src/agent_network/actor.rs');
const actor=fs.readFileSync(actorPath,'utf8');
function actorMethod(anchor){const at=index(actor,anchor),start=actor.lastIndexOf('\n',at)+1,end=actor.indexOf('\n    }',at);if(end<at)throw Error('Changed actor method');return actor.slice(start,end+6);}
function actorArm(anchor){const at=index(actor,anchor),start=actor.indexOf('=> {',at)+4,indent=actor.slice(actor.lastIndexOf('\n',at)+1,at).match(/^ */)[0],end=actor.indexOf('\n'+indent+'}',start);if(start<at||end<start)throw Error('Changed actor arm');return actor.slice(start,end);}
const readyAnchor='ServerMessage::Ready { catalog_seq: accepted, .. } if ready_requested && accepted == catalog_seq && local_policy.is_some() => {';
const readyAt=index(actor,readyAnchor);
const readyGuard=actor.slice(readyAt,actor.indexOf('=> {',readyAt)).split(' if ')[1].trim();
const notifyArm=actorArm('_ = owner.catalog_changed.notified(), if !catalog_busy && !management_only =>');
const notifyPrefix=notifyArm.slice(0,index(notifyArm,'catalog_seq = catalog_seq.checked_add'));
const launchAnchor='let source_version = owner.notification_source.hydration_version(source_catalog_seen);';
index(actor,launchAnchor);
const declarationStart=delivery.lastIndexOf('#[derive',index(delivery,'struct Challenge'));
const protocolTypes=delivery.slice(declarationStart,index(delivery,'pub(in crate::agent_network) async fn publish_once'));
const legacy=options['legacy-unfenced']===true;
if(legacy===fn('async fn publish_selected(').includes('lease: PolicyLease'))throw Error('Explicit historical call adapter does not match production signature');
const proofCall=legacy?'publish_selected(source,manager,identity,expected,MemoryBudget,item,agent).await':'publish_selected(source,manager,identity,expected,MemoryBudget,item,agent,lease).await';
const flow=String.raw`
 use std::{cell::RefCell,sync::atomic::{AtomicBool,AtomicU8,AtomicUsize,Ordering}};
 use queue::{PolicyLease,PolicyVersion};
 #[derive(Clone)]struct Descriptor{issuer:String}
 impl Descriptor{fn ensure_same_trust(&self,other:&Self)->Result<(),NetworkError>{if self.issuer==other.issuer{Ok(())}else{Err(invalid())}}}
 struct OwnedSession{principal_id:String,network_id:String,access_token:String}
 struct OwnedAccount{descriptor:Descriptor,session:OwnedSession,device_id:String,binding:String,active:AtomicBool,public_tls_ca:Option<String>}
 #[derive(Clone)]enum NetworkAccountSession{Owned(Arc<OwnedAccount>),Other}
 impl NetworkAccountSession{fn ensure_current(&self)->Result<(),NetworkError>{match self{Self::Owned(a) if a.active.load(Ordering::Acquire)=>Ok(()),_=>Err(invalid())}}fn binding_id(&self)->&str{match self{Self::Owned(a)=>&a.binding,_=>""}}}
 #[derive(Clone)]struct KeyScope{issuer:String,service_id:String,environment:String,principal_id:String,device_id:String,key_generation:u64}
 #[derive(Clone)]struct NetworkIdentity{account:NetworkAccountSession,scope:KeyScope,context:Arc<Context>}
 struct Signer(Arc<Context>);
 impl Signer{fn sign_proof(&self,_:&str,_:&str)->Result<Value,NetworkError>{self.0.signs.fetch_add(1,Ordering::AcqRel);Ok(json!({"testSigner":true}))}}
 impl NetworkIdentity{fn device_key(&self)->Signer{Signer(self.context.clone())}}
 struct Context{mode:AtomicU8,signs:AtomicUsize,hints:AtomicUsize,challenge:tokio::sync::Notify,hint:tokio::sync::Notify,release:tokio::sync::Notify,descriptor:Descriptor}
 thread_local!{static CONTEXT:RefCell<Option<Arc<Context>>>=const{RefCell::new(None)};}
 struct OwnedClient(Arc<Context>);
 impl OwnedClient{
  async fn discover(_: &str,_:Option<&str>)->Result<(Self,Descriptor),NetworkError>{let c=CONTEXT.with(|v|v.borrow().as_ref().unwrap().clone());Ok((Self(c.clone()),c.descriptor.clone()))}
  async fn notification_source_request(&self,url:&str,_:Value,_:&str)->Result<Value,NetworkError>{
   if url=="/api/mobile-notify/v1/source/challenges"{
    self.0.challenge.notify_one();if self.0.mode.load(Ordering::Acquire)==1{self.0.release.notified().await;}
    if self.0.mode.load(Ordering::Acquire)==3{return Err(NetworkError::new("NOTIFICATION_DISABLED"));}
    return Ok(json!({"version":1,"challengeId":"33333333-3333-4333-8333-333333333333","nonce":"fixture-only","expiresAt":jsonwebtoken::get_current_timestamp()+60}));
   }
   assert_eq!(url,"/api/mobile-notify/v1/source/hints");self.0.hints.fetch_add(1,Ordering::AcqRel);self.0.hint.notify_one();
   if self.0.mode.load(Ordering::Acquire)==2{self.0.release.notified().await;}
   Ok(json!({"version":1,"eventId":"44444444-4444-4444-8444-444444444444"}))
  }
 }
 __ACTIVATION__
 __CURRENT__
 __UUID__
 __PROTOCOL_TYPES__
 __PROOF__
 #[derive(Clone,Default)]struct Snapshot{device_name:Option<String>,connection_id:String,state:&'static str,principal_id:Option<String>,network_id:Option<String>,error:Option<NetworkError>,revision:u64,auth_generation:u64}
 type NetworkSnapshot=Snapshot;
 struct ActorFixture{connection_id:String,notification_source:Arc<DesktopNotificationSource>,catalog_changed:tokio::sync::Notify}
 impl ActorFixture{
  __CATALOG_METHOD__
  fn snapshot(&self)->Snapshot{Snapshot{device_name:None,..Snapshot::default()}}
  fn publish(&self,_:&(),_:u64,_:Snapshot){}
 }
 fn deliver_change(owner:&ActorFixture,kind:&str)->Result<(),NetworkError>{
  if kind=="local"{owner.catalog_changed();return Ok(());}
  let mut local_policy:Option<LocalPolicy>=None;let mut hydrate_dirty=false;let mut source_policy_version=None::<PolicyVersion>;let app=&();let generation=1;
  if kind=="catalog-ack"{let result:Result<u64,NetworkError>=Ok(1);let catalog_seq=1;let mut catalog_busy=true;__CATALOG_ARM__ return Ok(());}
  let change=if kind=="settings"{myagents_agent_network_protocol::ChangeScope::Settings}else{myagents_agent_network_protocol::ChangeScope::Catalog};
  __CHANGED_ARM__
  Ok(())
 }
 fn launch_version(owner:&ActorFixture,source_catalog_seen:u64)->PolicyVersion{__LAUNCH_VERSION__ source_version}
 async fn consume_local_dirty(owner:&ActorFixture,seen:u64)->u64{
  owner.catalog_changed.notified().await;
  let mut source_catalog_seen=seen;let mut source_policy_version=None::<PolicyVersion>;
  __NOTIFY_PREFIX__
  source_catalog_seen
 }
 struct Reconnect;impl Reconnect{fn recovered(&mut self){}}
 fn accept_ready(owner:&ActorFixture,expected:&Activation,policy:LocalPolicy,source_policy_version:Option<PolicyVersion>)->bool{
  let ready_requested=true;let accepted=1;let catalog_seq=1;let local_policy=Some(policy);let mut hydrated=false;
  let source_activation=Some(expected.clone());let local=expected.scope.local.clone();let mut reconnect=Reconnect;
  let app=&();let generation=expected.generation;
  if __READY_GUARD__ {__READY_ARM__}
  hydrated
 }
 async fn accepted_hydrate(owner:&ActorFixture,expected:&Activation,policy:LocalPolicy,ready:bool,dirty:bool)->Result<Option<PolicyVersion>,NetworkError>{
  let source_version=launch_version(owner,owner.notification_source.policy_version().catalog_revision);
  hydrate_result(owner,expected,policy,ready,dirty,source_version).await
 }
 async fn hydrate_result(owner:&ActorFixture,expected:&Activation,policy:LocalPolicy,ready:bool,dirty:bool,source_version:PolicyVersion)->Result<Option<PolicyVersion>,NetworkError>{
  let mut source_policy_version=None;
  let mut hydrate_busy=true;let hydrated_seq=1;let catalog_seq=1;let hydrate_dirty=dirty;let mut local_policy=None;
  let hydrated=ready;let mut ready_requested=ready;let catalog_busy=false;let result:Result<LocalPolicy,NetworkError>=Ok(policy);
  let source_activation=Some(expected.clone());let scope=expected.connection.clone();let app=&();let generation=expected.generation;let mut socket=();
  __HYDRATE_ARM__
  Ok(source_policy_version)
 }
 async fn send(_: &mut(),_:myagents_agent_network_protocol::ClientMessage)->Result<String,NetworkError>{Ok("fixture".into())}
 struct FlowFixture{root:std::path::PathBuf,source:Arc<DesktopNotificationSource>,manager:ManagedSidecarManager,identity:NetworkIdentity,expected:Activation,item:Observation,policy:LocalPolicy,context:Arc<Context>}
 impl FlowFixture{
  fn new(mode:u8)->Self{
   let f=fixture();let id=||uuid::Uuid::new_v4().to_string();let issuer=format!("https://{}.fixture.test",id());
   let local=myagents_agent_network_protocol::DeviceScope{service_id:id(),environment:"development".into(),network_id:id(),principal_id:id(),device_id:id(),key_generation:1};
   let connection=myagents_agent_network_protocol::ConnectionScope{service_id:local.service_id.clone(),network_id:local.network_id.clone(),boot_epoch:id(),connection_epoch:id()};
   let expected=Activation{scope:SourceScope{issuer:issuer.clone(),local:local.clone(),account_binding:id()},connection,generation:1};
   let root=std::env::temp_dir().join(format!("source-proof-flow-{}",id()));let source=Arc::new(DesktopNotificationSource::new(Some(root.clone())));source.activate(expected.clone()).unwrap();
   source.observe(&expected,f["sessionB"].as_str().unwrap(),Path::new(f["workspaceB"].as_str().unwrap()),"terminal:original").unwrap();let item=source.peek(&expected).unwrap().unwrap();
   let descriptor=Descriptor{issuer:issuer.clone()};let context=Arc::new(Context{mode:AtomicU8::new(mode),signs:AtomicUsize::new(0),hints:AtomicUsize::new(0),challenge:tokio::sync::Notify::new(),hint:tokio::sync::Notify::new(),release:tokio::sync::Notify::new(),descriptor:descriptor.clone()});
   CONTEXT.with(|c|*c.borrow_mut()=Some(context.clone()));
   let account=NetworkAccountSession::Owned(Arc::new(OwnedAccount{descriptor,session:OwnedSession{principal_id:local.principal_id.clone(),network_id:local.network_id.clone(),access_token:"test-only".into()},device_id:local.device_id.clone(),binding:expected.scope.account_binding.clone(),active:AtomicBool::new(true),public_tls_ca:None}));
   let identity=NetworkIdentity{account,scope:KeyScope{issuer,service_id:local.service_id,environment:local.environment,principal_id:local.principal_id,device_id:local.device_id,key_generation:local.key_generation},context:context.clone()};
   let manager=Arc::new(Mutex::new(FixtureManager{packets:HashMap::from([(f["sessionB"].as_str().unwrap().into(),f["valid"].clone())]),calls:Vec::new(),before_return:None}));
   let policy=LocalPolicy{device_name:"fixture".into(),joined:true,membership_revision:1,mounts:HashMap::new()};
   Self{root,source,manager,identity,expected,item,policy,context}
  }
  fn actor(&self)->ActorFixture{ActorFixture{connection_id:"fixture".into(),notification_source:self.source.clone(),catalog_changed:tokio::sync::Notify::new()}}
  fn lease(&self)->PolicyLease{self.source.accept_policy(&self.expected,self.source.policy_version()).unwrap();self.source.policy_lease(&self.expected).unwrap()}
  fn launch(&self,lease:PolicyLease)->impl std::future::Future<Output=Result<(),NetworkError>>+Send+'static{
   let source=self.source.clone();let manager=self.manager.clone();let identity=self.identity.clone();let expected=self.expected.clone();let item=self.item.clone();let agent=fixture()["agentB"].as_str().unwrap().to_string();async move{__PROOF_CALL__}
  }
 }
 impl Drop for FlowFixture{fn drop(&mut self){let _=std::fs::remove_dir_all(&self.root);}}
 #[test]fn actor_policy_dirty_during_challenge_never_signs_hints_or_acknowledges(){
  let rt=tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();rt.block_on(async{
   for kind in ["settings","catalog","local","catalog-ack"]{
    let f=FlowFixture::new(1);let lease=f.lease();let task=tokio::spawn(f.launch(lease));tokio::time::timeout(std::time::Duration::from_secs(3),f.context.challenge.notified()).await.unwrap();
    let owner=f.actor();deliver_change(&owner,kind).unwrap();
    if kind=="local"{consume_local_dirty(&owner,0).await;}
    accepted_hydrate(&owner,&f.expected,f.policy.clone(),true,false).await.unwrap();
    f.context.release.notify_one();let result=task.await.unwrap();
    assert!(result.is_err()&&f.context.signs.load(Ordering::Acquire)==0&&f.context.hints.load(Ordering::Acquire)==0&&f.source.peek(&f.expected).unwrap().is_some(),"POLICY_DIRTY_REUSED_OLD_PUBLICATION");
    f.context.mode.store(0,Ordering::Release);let fresh=f.source.policy_lease(&f.expected).expect("accepted fresh hydrate must issue a new lease");f.launch(fresh).await.unwrap();
    assert!(f.source.peek(&f.expected).unwrap().is_none());
   }
  });
 }
 #[test]fn policy_dirty_after_challenge_validation_cannot_sign(){
  let f=FlowFixture::new(0);let source=f.source.clone();
  f.manager.lock().unwrap().before_return=Some(Arc::new(move||{let owner=ActorFixture{connection_id:"fixture".into(),notification_source:source.clone(),catalog_changed:tokio::sync::Notify::new()};deliver_change(&owner,"settings").unwrap();}));
  let rt=tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();let result=rt.block_on(f.launch(f.lease()));
  assert!(result.is_err()&&f.context.signs.load(Ordering::Acquire)==0&&f.context.hints.load(Ordering::Acquire)==0&&f.source.peek(&f.expected).unwrap().is_some(),"POLICY_DIRTY_AFTER_CHALLENGE_SIGNED");
 }
 #[test]fn policy_dirty_after_hint_response_cannot_commit_ack(){
  let rt=tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();rt.block_on(async{
   let f=FlowFixture::new(2);let task=tokio::spawn(f.launch(f.lease()));tokio::time::timeout(std::time::Duration::from_secs(3),f.context.hint.notified()).await.unwrap();
   deliver_change(&f.actor(),"settings").unwrap();f.context.release.notify_one();let result=task.await.unwrap();
   assert!(result.is_err()&&f.source.peek(&f.expected).unwrap().is_some(),"POLICY_DIRTY_ACKNOWLEDGED_OLD_HINT");
  });
 }
 #[test]fn disabled_source_service_retains_unconfirmed_pointer(){
  let f=FlowFixture::new(3);let rt=tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();let result=rt.block_on(f.launch(f.lease()));
  assert!(result.is_err()&&f.context.signs.load(Ordering::Acquire)==0&&f.source.peek(&f.expected).unwrap().is_some());
 }
 #[test]fn hydrate_before_ready_or_stale_hydrate_cannot_enable_publication(){
  let rt=tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();rt.block_on(async{
   let f=FlowFixture::new(0);assert!(f.source.policy_lease(&f.expected).is_none());accepted_hydrate(&f.actor(),&f.expected,f.policy.clone(),false,false).await.unwrap();assert!(f.source.policy_lease(&f.expected).is_none());
   accepted_hydrate(&f.actor(),&f.expected,f.policy.clone(),true,true).await.unwrap();assert!(f.source.policy_lease(&f.expected).is_none());
  });
 }
 #[test]fn unconsumed_local_dirty_cannot_accept_old_inflight_hydrate(){
  let rt=tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();rt.block_on(async{
   let f=FlowFixture::new(0);let owner=f.actor();let seen=f.source.policy_version().catalog_revision;
   let launched=launch_version(&owner,seen);owner.catalog_changed();
   let accepted=hydrate_result(&owner,&f.expected,f.policy.clone(),true,false,launched).await.unwrap();
   assert!(accepted.is_none()&&f.source.policy_lease(&f.expected).is_none(),"UNCONSUMED_LOCAL_DIRTY_ACCEPTED_STALE_POLICY");
  });
 }
 #[test]fn hydrate_launched_before_notify_consumption_cannot_cover_unseen_catalog(){
  let rt=tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();rt.block_on(async{
   let f=FlowFixture::new(0);let owner=f.actor();let seen=f.source.policy_version().catalog_revision;
   owner.catalog_changed();let launched=launch_version(&owner,seen);
   assert_eq!(launched.revision,f.source.policy_version().revision);assert_ne!(launched.catalog_revision,f.source.policy_version().catalog_revision);
   let accepted=hydrate_result(&owner,&f.expected,f.policy.clone(),true,false,launched).await.unwrap();
   assert!(accepted.is_none()&&f.source.policy_lease(&f.expected).is_none(),"UNSEEN_CATALOG_LAUNCH_ACCEPTED");
  });
 }
 #[test]fn ready_cannot_reissue_policy_after_unconsumed_local_dirty(){
  let rt=tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();rt.block_on(async{
   let f=FlowFixture::new(0);let owner=f.actor();let seen=f.source.policy_version().catalog_revision;
   let launched=launch_version(&owner,seen);
   let accepted=hydrate_result(&owner,&f.expected,f.policy.clone(),false,false,launched).await.unwrap();
   assert!(accepted.is_some()&&f.source.policy_lease(&f.expected).is_none());
   owner.catalog_changed();assert!(accept_ready(&owner,&f.expected,f.policy.clone(),accepted));
   assert!(f.source.policy_lease(&f.expected).is_none(),"READY_REISSUED_STALE_POLICY");
  });
 }
 #[test]fn consumed_local_dirty_and_fresh_hydrate_restore_publication(){
  let rt=tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();rt.block_on(async{
   let f=FlowFixture::new(0);let owner=f.actor();let seen=f.source.policy_version().catalog_revision;
   owner.catalog_changed();let observed=consume_local_dirty(&owner,seen).await;assert!(observed>seen);
   let launched=launch_version(&owner,observed);
   let accepted=hydrate_result(&owner,&f.expected,f.policy.clone(),false,false,launched).await.unwrap();
   assert_eq!(accepted,Some(launched));assert!(accept_ready(&owner,&f.expected,f.policy.clone(),accepted));
   f.launch(f.source.policy_lease(&f.expected).expect("fresh accepted projection must restore publication")).await.unwrap();
   assert!(f.source.peek(&f.expected).unwrap().is_none());
  });
 }
 __LIFETIME__
 #[test]fn original_connection_lifetime_cleans_before_ready_and_preserves_successor(){
  let f=FlowFixture::new(0);let lifetime=Lifetime(f.source.clone(),Some(f.expected.clone()));drop(lifetime);assert!(!f.source.current(&f.expected));assert!(f.source.policy_lease(&f.expected).is_none());
  let f=FlowFixture::new(0);let lifetime=Lifetime(f.source.clone(),Some(f.expected.clone()));let old=f.lease();let mut successor=f.expected.clone();successor.connection.connection_epoch=uuid::Uuid::new_v4().to_string();
  f.source.activate(successor.clone()).unwrap();f.source.accept_policy(&successor,f.source.policy_version()).unwrap();let current=f.source.policy_lease(&successor).unwrap();drop(lifetime);assert!(!old.current());assert!(current.current());assert!(f.source.current(&successor));drop(Lifetime(f.source.clone(),Some(successor)));assert!(!current.current());
 }
`;
const rust=String.raw`
#![allow(dead_code)]
#[path=__WORKSPACE__] mod workspace_path;
mod cron_task{pub(crate) use crate::workspace_path::normalize_workspace_path_identity as normalize_path;}
mod agent_network{
 use std::{collections::HashMap,path::Path,sync::{Arc,Mutex}};
 use serde::Deserialize;use serde_json::{Value,json};
 use myagents_agent_network_protocol::{CatalogItem,CatalogLifecycle,ConnectionScope,DeviceScope,ClientMessage};
 #[derive(Debug,Clone)] pub struct NetworkError{pub code:String}impl NetworkError{pub fn new(s:&'static str)->Self{Self{code:s.into()}}pub fn cloud(s:&str,_:u16)->Self{Self{code:s.into()}}}
 fn invalid()->NetworkError{NetworkError::new("DESKTOP_NOTIFICATION_SOURCE_INVALID")}
 #[path=__QUEUE__] mod queue;
 use queue::{Activation,DesktopNotificationSource,Observation,SourceScope};
 #[derive(Clone)]struct MemoryBudget;
 struct FixtureManager{packets:HashMap<String,Value>,calls:Vec<String>,before_return:Option<Arc<dyn Fn()+Send+Sync>>}
 type ManagedSidecarManager=Arc<Mutex<FixtureManager>>;
 fn global(m:&ManagedSidecarManager)->Result<ManagedSidecarManager,NetworkError>{Ok(m.clone())}
 async fn post(m:&ManagedSidecarManager,url:&str,body:Value,_:&MemoryBudget)->Result<(Value,()),NetworkError>{
  assert_eq!(url,"/api/admin/agent/network-precheck");let sid=body["localSessionId"].as_str().unwrap();
  let (value,hook)={let mut m=m.lock().unwrap();m.calls.push(sid.into());(m.packets.get(sid).unwrap().clone(),m.before_return.take())};
  if let Some(hook)=hook{hook();}
  if value["success"]!=true{return Err(NetworkError::cloud(value["code"].as_str().unwrap(),409));}Ok((value["data"].clone(),()))
 }
 __IDENTITY__
 __POLICY_TYPES__
 __UNIQUE__
 __VALIDATE__
 __SELECT__
 fn fixture()->Value{serde_json::from_str(include_str!(__FIXTURE__)).unwrap()}
 fn check_case(name:&str,should_skip:bool){
  let f=fixture();let root=std::env::temp_dir().join(format!("source-selection-{}",uuid::Uuid::new_v4()));
  let id=||uuid::Uuid::new_v4().to_string();
  let local=myagents_agent_network_protocol::DeviceScope{service_id:id(),environment:"development".into(),network_id:id(),principal_id:id(),device_id:id(),key_generation:1};
  let connection=myagents_agent_network_protocol::ConnectionScope{service_id:local.service_id.clone(),network_id:local.network_id.clone(),boot_epoch:id(),connection_epoch:id()};
  let expected=Activation{scope:SourceScope{issuer:"https://source.test".into(),local,account_binding:id()},connection,generation:1};
  let source=DesktopNotificationSource::new(Some(root.clone()));source.activate(expected.clone()).unwrap();
  source.observe(&expected,f["sessionA"].as_str().unwrap(),Path::new(f["workspaceA"].as_str().unwrap()),"terminal:a").unwrap();
  source.observe(&expected,f["sessionB"].as_str().unwrap(),Path::new(f["workspaceB"].as_str().unwrap()),"terminal:b").unwrap();
  let catalog:Vec<CatalogItem>=[("agentA","workspaceA"),("agentB","workspaceB")].into_iter().map(|(a,w)|CatalogItem{local_agent_id:f[a].as_str().unwrap().into(),local_workspace_id:id(),name:"fixture".into(),path:f[w].as_str().unwrap().into(),lifecycle:CatalogLifecycle::Active,exposure_revision:1,icon:None}).collect();
  let policy=LocalPolicy{device_name:"fixture".into(),joined:true,membership_revision:1,mounts:catalog.iter().map(|a|(a.local_agent_id.clone(),MountPolicy{agent_id:a.local_agent_id.clone(),enabled:true,enable_revision:1})).collect()};
  let manager=Arc::new(Mutex::new(FixtureManager{packets:HashMap::from([(f["sessionA"].as_str().unwrap().into(),f[name].clone()),(f["sessionB"].as_str().unwrap().into(),f["valid"].clone())]),calls:Vec::new(),before_return:None}));
  let runtime=tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
  let result=runtime.block_on(select_pointer(&manager,&MemoryBudget,source.candidates(&expected).unwrap(),&catalog,&policy));
  assert_eq!(source.candidates(&expected).unwrap().len(),2,"selection must not consume/confirm either event");
  let _=std::fs::remove_dir_all(root);
  if should_skip{assert!(matches!(result,Ok(Some((ref item,_))) if item.session_id==f["sessionB"].as_str().unwrap()),"ACTUAL_PRECHECK_HEAD_BLOCKED_LATER_SOURCE");}
  else{assert!(result.is_err());assert_eq!(manager.lock().unwrap().calls.len(),1,"unknown/authority/infra errors must fail closed");}
 }
 #[test]fn deleted_session_does_not_block_live_source(){check_case("missing",true);}
 #[test]fn unavailable_agent_does_not_block_live_source(){check_case("unavailable",true);}
 #[test]fn identity_conflict_fails_closed(){check_case("conflict",false);}
 #[test]fn original_owner_infrastructure_failure_fails_closed(){check_case("infra",false);}
 __FLOW_EXTRA__
}
`;
let harness=rust.replace('__WORKSPACE__',JSON.stringify(path.join(root,'src-tauri/src/workspace_path.rs')))
 .replace('__QUEUE__',JSON.stringify(queuePath)).replace('__IDENTITY__',identity).replace('__POLICY_TYPES__',policyTypes)
 .replace('__UNIQUE__',fn("fn unique_agent<'a>")).replace('__VALIDATE__',fn('async fn validate_pointer('))
 .replace('__SELECT__',selected).replace('__FIXTURE__',JSON.stringify(fixturePath))
 .replace('__FLOW_EXTRA__',flow.replace('__ACTIVATION__',fn('fn activation(')).replace('__CURRENT__',fn('fn current('))
  .replace('__UUID__',fn('fn uuid(')).replace('__PROTOCOL_TYPES__',protocolTypes).replace('__PROOF__',fn('async fn publish_selected('))
  .replace('__CATALOG_METHOD__',actorMethod('pub(crate) fn catalog_changed('))
  .replace('__CATALOG_ARM__',actorArm('Work::Catalog(result) =>'))
  .replace('__CHANGED_ARM__',actorArm('ServerMessage::Changed { change, .. } =>'))
  .replace('__HYDRATE_ARM__',actorArm('Work::Hydrate { catalog_seq: hydrated_seq, source_version, result } =>'))
  .replace('__LAUNCH_VERSION__',launchAnchor).replace('__NOTIFY_PREFIX__',notifyPrefix)
  .replace('__READY_GUARD__',readyGuard).replace('__READY_ARM__',actorArm(readyAnchor))
  .replace('__PROOF_CALL__',proofCall)
  .replace('__LIFETIME__',(()=>{const text=fs.readFileSync(path.join(root,'src-tauri/src/agent_network/notification_source.rs'),'utf8');return text.slice(index(text,'pub(super) struct Lifetime'),index(text,'/// Called only after SidecarManager'));})()));
const sourcePath=path.join(directory,'flow.rs'),binary=path.join(directory,'flow-tests');fs.writeFileSync(sourcePath,harness);
const compiled=spawnSync('rustc',['--edition=2021','--test',sourcePath,'-L',`dependency=${deps}`,'-o',binary,...externs],{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(directory,'compile.log'),`${compiled.stdout??''}${compiled.stderr??''}`);
if(compiled.error||compiled.status!==0)throw Error(`Compilation failed, not RED: ${directory}`);
const run=spawnSync(binary,['--nocapture'],{cwd:directory,encoding:'utf8',timeout:20000,maxBuffer:4*1024*1024});
const output=`${run.stdout??''}${run.stderr??''}`;fs.writeFileSync(path.join(directory,'tests.log'),output);
const passed=!run.error&&(options['expect-red']?run.status===101&&output.includes('ACTUAL_PRECHECK_HEAD_BLOCKED_LATER_SOURCE')&&output.includes('POLICY_DIRTY_REUSED_OLD_PUBLICATION'):run.status===0);
const report={passed,expected:options['expect-red']?'RED':'GREEN',exit:run.status,deliverySha256:hash(delivery),actorSha256:hash(actor),precheckSha256:hash(target),precheckFragmentSha256:hash(precheck),queueSha256:hash(fs.readFileSync(queuePath)),esbuildVersion:esbuild.version,dependencyEvidence,directory,boundaries:'Actual Node precheck/schema + real shared helpers; actual Rust selection, proof sequencing and actor dirty/hydrate/Ready bodies and launch-version expression. Registry/history/HTTP/signing/actor platform/error adapters isolated. No App/native claim/real device/cloud/proof acceptance.'};
fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!passed)process.exitCode=1;
