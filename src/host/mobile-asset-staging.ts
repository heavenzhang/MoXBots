import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import type { InternalManagementAuthority, InternalManagementOperation } from './management-ipc';

type StageBegin = Extract<InternalManagementOperation,{kind:'asset.stage.begin'}>;
type StageChunk = Extract<InternalManagementOperation,{kind:'asset.stage.chunk'}>;
type StageFinish = Extract<InternalManagementOperation,{kind:'asset.stage.finish'}>;
type Entry = StageBegin & { path:string; scope:string; received:number; ready:boolean; touchedAt:number };
const MAX_ACTIVE=8, MAX_ENTRIES=1024, MAX_SCOPE_BYTES=160*1024*1024, MAX_TOTAL_BYTES=1024*1024*1024;

function safeLabel(value:string) { return value.length>0&&value.length<=256&&value!=='.'&&value!=='..'&&!/[\p{Cc}/\\]/u.test(value); }
function authorityKey(value:InternalManagementAuthority) {
  return createHash('sha256').update(JSON.stringify([value.connection,value.peer,value.peerEpoch,value.local,value.accountBinding,value.managementBinding])).digest('hex');
}
function same(begin:StageBegin, value:StageBegin) {
  return begin.agentId===value.agentId&&begin.sessionId===value.sessionId&&begin.assetId===value.assetId&&begin.name===value.name&&begin.mimeType===value.mimeType&&begin.sizeBytes===value.sizeBytes&&begin.sha256===value.sha256;
}

/** Host-UID-only staging. The protocol sees opaque IDs and acknowledgements;
 * generated paths are only exposed inside a bounded local callback. */
export class HostMobileAssetStaging {
  private readonly entries=new Map<string,Entry>();
  private initialized?:Promise<string>;
  constructor(private readonly root:string,private readonly now=()=>Date.now()) {}
  private init() {
    if(this.initialized)return this.initialized;
    this.initialized=(async()=>{
      await mkdir(this.root,{recursive:true,mode:0o700});
      const info=await lstat(this.root);
      if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)!==0)throw new Error('HOST_ASSET_STAGING_UNSAFE');
      return realpath(this.root);
    })();
    return this.initialized;
  }
  private key(scope:string,op:{agentId:string;sessionId:string;assetId:string}) { return `${scope}:${op.agentId}:${op.sessionId}:${op.assetId}`; }
  async handle(authority:InternalManagementAuthority, operation:InternalManagementOperation):Promise<{kind:'stage';assetId:string;receivedBytes:number;ready:boolean}> {
    const scope=authorityKey(authority), time=this.now();
    if(operation.kind==='asset.stage.begin') {
      await this.expire();
      if(!safeLabel(operation.name)||operation.sizeBytes<1||operation.sizeBytes>20*1024*1024||!(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(operation.mimeType)))throw new Error('ASSET_REQUEST_INVALID');
      const k=this.key(scope,operation),existing=this.entries.get(k);
      if(existing) {if(!same(existing,operation))throw new Error('ASSET_UPLOAD_CONFLICT');existing.touchedAt=time;return {kind:'stage',assetId:existing.assetId,receivedBytes:existing.received,ready:existing.ready};}
      const scoped=[...this.entries.values()].filter(e=>e.scope===scope);
      if(this.entries.size>=MAX_ENTRIES||scoped.length>=MAX_ACTIVE||scoped.reduce((sum,e)=>sum+e.sizeBytes,0)+operation.sizeBytes>MAX_SCOPE_BYTES||[...this.entries.values()].reduce((sum,e)=>sum+e.sizeBytes,0)+operation.sizeBytes>MAX_TOTAL_BYTES)throw new Error('ASSET_QUOTA_EXCEEDED');
      const root=await this.init(), directory=path.join(root,randomUUID());await mkdir(directory,{mode:0o700});
      const file=path.join(directory,'data'),fd=await open(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);await fd.close();
      const entry:Entry={...operation,path:file,scope,received:0,ready:false,touchedAt:time};this.entries.set(k,entry);
      return {kind:'stage',assetId:entry.assetId,receivedBytes:0,ready:false};
    }
    if(operation.kind==='asset.stage.chunk') {
      const entry=this.entries.get(this.key(scope,operation));if(!entry||entry.ready)throw new Error('ASSET_UPLOAD_NOT_FOUND');
      const bytes=Buffer.from(operation.dataBase64,'base64'),digest=createHash('sha256').update(bytes).digest('hex');
      if(bytes.length<1||bytes.length>24*1024||bytes.toString('base64')!==operation.dataBase64||digest!==operation.sha256)throw new Error('ASSET_CHUNK_INVALID');
      if(operation.offset<entry.received) {
        if(operation.offset+bytes.length>entry.received)throw new Error('ASSET_CHUNK_CONFLICT');
        const fd=await open(entry.path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));try{const old=Buffer.alloc(bytes.length);const got=await fd.read(old,0,old.length,operation.offset);if(got.bytesRead!==bytes.length||!old.equals(bytes))throw new Error('ASSET_CHUNK_CONFLICT');}finally{await fd.close()}
        entry.touchedAt=time;return {kind:'stage',assetId:entry.assetId,receivedBytes:entry.received,ready:false};
      }
      if(operation.offset!==entry.received||entry.received+bytes.length>entry.sizeBytes)throw new Error('ASSET_CHUNK_OFFSET_INVALID');
      const fd=await open(entry.path,constants.O_WRONLY|(constants.O_NOFOLLOW??0));try{await fd.write(bytes,0,bytes.length,entry.received);await fd.sync()}finally{await fd.close()}
      entry.received+=bytes.length;entry.touchedAt=time;return {kind:'stage',assetId:entry.assetId,receivedBytes:entry.received,ready:false};
    }
    if(operation.kind==='asset.stage.finish') {
      const entry=this.entries.get(this.key(scope,operation));if(!entry)throw new Error('ASSET_UPLOAD_NOT_FOUND');
      if(entry.ready)return {kind:'stage',assetId:entry.assetId,receivedBytes:entry.received,ready:true};
      const fd=await open(entry.path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));try{
        const stat=await fd.stat();if(stat.size!==entry.sizeBytes||entry.received!==entry.sizeBytes)throw new Error('ASSET_UPLOAD_INCOMPLETE');
        const hash=createHash('sha256'),buffer=Buffer.alloc(24*1024);let offset=0;
        while(offset<stat.size){const read=await fd.read(buffer,0,Math.min(buffer.length,stat.size-offset),offset);if(!read.bytesRead)throw new Error('ASSET_UPLOAD_INCOMPLETE');hash.update(buffer.subarray(0,read.bytesRead));offset+=read.bytesRead;}
        if(hash.digest('hex')!==entry.sha256)throw new Error('ASSET_UPLOAD_HASH_MISMATCH');
      }finally{await fd.close()}
      entry.ready=true;entry.touchedAt=time;return {kind:'stage',assetId:entry.assetId,receivedBytes:entry.received,ready:true};
    }
    throw new Error('ASSET_STAGE_OPERATION_UNSUPPORTED');
  }
  async withReadyAssets<T>(authority:InternalManagementAuthority,request:{agentId:string;sessionId:string;assetIds:string[]},run:(assets:Array<StageBegin&{sourcePath:string}>)=>Promise<T>):Promise<T> {
    const scope=authorityKey(authority),items=request.assetIds.map(id=>this.entries.get(this.key(scope,{...request,assetId:id})));
    if(items.some(item=>!item||!item.ready)||new Set(items).size!==items.length)throw new Error('ASSET_UPLOAD_NOT_FOUND');
    const assets=items as Entry[];
    try{return await run(assets.map(({path:sourcePath,scope:_,received:__,ready:___,touchedAt:____,...meta})=>({...meta,sourcePath})));}
    finally{for(const entry of assets){this.entries.delete(this.key(scope,entry));await rm(path.dirname(entry.path),{recursive:true,force:true})}}
  }
  async expire(maxAgeMs=60*60*1000) {
    const threshold=this.now()-maxAgeMs;let removed=0;
    for(const [key,entry] of this.entries){if(removed>=32)break;if(entry.touchedAt>=threshold)continue;this.entries.delete(key);await rm(path.dirname(entry.path),{recursive:true,force:true});removed++;}
    return removed;
  }
}
