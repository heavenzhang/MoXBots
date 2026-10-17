import {randomUUID} from 'node:crypto';
import {chmod,mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {admitHeadlessMobileStart} from '../../host/headless-mobile-start';
import {createRemoteReceiptOwner} from './receipts';
import type {RemoteMobileRequest} from '../../shared/remoteMobile';

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))});
async function fixture(scope='host:fixture'){
 const dir=await mkdtemp(join(tmpdir(),'headless-mobile-ledger-'));dirs.push(dir);
 return {dir,owner:createRemoteReceiptOwner(scope,dir)};
}
const start=():Extract<RemoteMobileRequest,{kind:'mobile.start'}>=>({kind:'mobile.start',version:1,agentId:'agent',operationId:randomUUID(),text:'private task',assetIds:[]});
const manifest='a'.repeat(64);

it('binds the newly created original Session durably before dispatch, then deduplicates the same operation',async()=>{
 const {dir,owner}=await fixture(),request=start();
 const ensure=vi.fn(async()=>({target:'original-worker',sessionId:'original-session'}));
 const dispatch=vi.fn(async()=>{
  expect(await owner.readMobileIntent(request,manifest)).toMatchObject({sessionId:'original-session',status:'processing'});
  const path=join(dir,(await readdir(dir)).find(name=>name.endsWith('.json'))!);
  expect(JSON.parse(await readFile(path,'utf8'))).toMatchObject({adopted:true,assetsDigest:manifest,receipt:{sessionId:'original-session'}});
  return {accepted:true};
 });
 const input={request,manifestHash:manifest,begin:()=>owner.beginMobile(request,null),read:()=>owner.readMobileIntent(request,manifest),ensure,
  adopt:(value:typeof request,sessionId:string,hash:string)=>owner.bindHeadlessMobileStart(value,sessionId,hash),dispatch,
  releaseObservation:()=>owner.releaseMobileObservation(request),
  finish:(_value:typeof request,status:'accepted'|'rejected',sessionId:string,code:string|null)=>owner.finishMobile(request,status,sessionId,code)};
 expect(await admitHeadlessMobileStart(input)).toMatchObject({status:'accepted',sessionId:'original-session'});
 expect(await admitHeadlessMobileStart(input)).toMatchObject({status:'accepted',sessionId:'original-session'});
 expect(ensure).toHaveBeenCalledTimes(1);expect(dispatch).toHaveBeenCalledTimes(1);
});

it('binds exactly once and preserves the desktop prepared-session fence and immutable identity',async()=>{
 const {owner}=await fixture(),request=start();await owner.beginMobile(request,null);
 await expect(owner.adoptPrepared(request,'original-session',manifest)).rejects.toMatchObject({code:'REMOTE_OPERATION_CONFLICT'});
 for(const [value,sessionId,hash] of [[{...request,text:'changed'},'original-session',manifest],[request,'invalid/session',manifest],[request,'original-session','bad']] as const){
  await expect(owner.bindHeadlessMobileStart(value,sessionId,hash)).rejects.toBeDefined();
 }
 expect(await owner.readMobile(request.agentId,request.operationId)).toMatchObject({sessionId:null,status:'processing'});
 expect((await Promise.all([owner.bindHeadlessMobileStart(request,'original-session',manifest),owner.bindHeadlessMobileStart(request,'original-session',manifest)])).sort()).toEqual([false,true]);
 await expect(owner.bindHeadlessMobileStart(request,'another-session',manifest)).rejects.toMatchObject({code:'REMOTE_OPERATION_CONFLICT'});
 await expect(owner.bindHeadlessMobileStart(request,'original-session','b'.repeat(64))).rejects.toMatchObject({code:'REMOTE_OPERATION_CONFLICT'});
 await expect(owner.bindHeadlessMobileStart({...request,kind:'mobile.send',sessionId:'original-session'},'original-session',manifest)).rejects.toMatchObject({code:'REMOTE_OPERATION_CONFLICT'});
});

it('refuses desktop, reopened, or abandoned admissions without replacing their durable identity',async()=>{
 const desktop=await fixture('desktop'),desktopRequest=start();await desktop.owner.beginMobile(desktopRequest,null);
 await expect(desktop.owner.bindHeadlessMobileStart(desktopRequest,'session',manifest)).rejects.toMatchObject({code:'REMOTE_OPERATION_CONFLICT'});
 const {dir,owner}=await fixture(),request=start();await owner.beginMobile(request,null);
 const reopened=createRemoteReceiptOwner('host:fixture',dir);
 await expect(reopened.bindHeadlessMobileStart(request,'session',manifest)).rejects.toMatchObject({code:'REMOTE_ADMISSION_UNCONFIRMED'});
 await reopened.releaseMobileObservation(request); // Cannot release this owner's in-memory observation.
 expect(await owner.readMobile(request.agentId,request.operationId)).toMatchObject({status:'processing'});
 await owner.releaseMobileObservation(request);
 expect(await owner.beginMobile(request,null)).toMatchObject({fresh:false,receipt:{status:'unconfirmed',sessionId:null}});
 await expect(owner.bindHeadlessMobileStart(request,'session',manifest)).rejects.toMatchObject({code:'REMOTE_ADMISSION_UNCONFIRMED'});
});

it.each(['ensure','dispatch'] as const)('marks a lost %s observation unknown without recreating a Session or resending',async(stage)=>{
 const {owner}=await fixture(),request=start();
 const ensure=vi.fn(async()=>{if(stage==='ensure')throw new Error('lifecycle lost');return {target:'worker',sessionId:'original-session'}});
 const dispatch=vi.fn(async()=>{throw new Error('worker response lost')});
 const input={request,manifestHash:manifest,begin:()=>owner.beginMobile(request,null),read:()=>owner.readMobileIntent(request,manifest),ensure,
  adopt:(value:typeof request,sessionId:string,hash:string)=>owner.bindHeadlessMobileStart(value,sessionId,hash),dispatch,
  finish:vi.fn(),releaseObservation:()=>owner.releaseMobileObservation(request)};
 const expected={status:'unconfirmed',sessionId:stage==='ensure'?null:'original-session'};
 expect(await admitHeadlessMobileStart(input)).toMatchObject(expected);
 expect(await admitHeadlessMobileStart(input)).toMatchObject(expected);
 expect(ensure).toHaveBeenCalledTimes(1);expect(dispatch).toHaveBeenCalledTimes(stage==='ensure'?0:1);expect(input.finish).not.toHaveBeenCalled();
});

it('releases only its local heartbeat even when storage cannot be safely opened',async()=>{
 const {dir,owner}=await fixture(),request=start();await owner.beginMobile(request,null);
 await chmod(dir,0o755);
 try{await expect(owner.releaseMobileObservation(request)).resolves.toBeUndefined()}
 finally{await chmod(dir,0o700)}
 expect(await owner.beginMobile(request,null)).toMatchObject({fresh:false,receipt:{status:'unconfirmed',sessionId:null}});
});
