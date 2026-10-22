import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Socket, type Server } from 'node:net';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { connectHostManagementIpc, hostOwnerAssetRequest, type InternalManagementOperation } from '../../host/management-ipc';

const authority={
 connection:{serviceId:'service',networkId:'network',bootEpoch:'boot',connectionEpoch:'connection'},
 peer:{serviceId:'service',environment:'production',networkId:'network',principalId:'peer-principal',deviceId:'peer-device',keyGeneration:3},
 peerEpoch:'peer-epoch',
 local:{serviceId:'service',environment:'production',networkId:'network',principalId:'host-principal',deviceId:'host-device',keyGeneration:4},
 accountBinding:'binding-1',managementBinding:'binding-1',
};
const sourceId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sessionId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('Host management IPC owner bridge',()=>{
 let host:{close():Promise<void>}|undefined;
 let server:Server|undefined;
 let socket:Socket|undefined;
 let directory:string|undefined;
 afterEach(async()=>{
  await host?.close();host=undefined;
  socket?.destroy();socket=undefined;
  if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));server=undefined;
  if(directory){await rm(directory,{recursive:true,force:true});directory=undefined;}
 });

 it.each(['legacy','rust-owner'] as const)('round-trips %s list and bounded read bytes without paths over authenticated Unix IPC',async(spelling)=>{
  directory=await mkdtemp(join(homedir(),'.host-owner-ipc-'));
  await chmod(directory,0o750);
  const socketPath=join(directory,'management.sock');
  server=createServer(peer=>{socket=peer;});
  const incoming=once(server,'connection') as Promise<[Socket]>;
  await new Promise<void>((resolve,reject)=>{server!.once('error',reject);server!.listen(socketPath,resolve);});
  await chmod(socketPath,0o660);
  const bytes=Buffer.from('private owner bytes');
  const chunkHash=(await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
  const observed: InternalManagementOperation[]=[];
  const dispatchInternal=async(_authority:unknown,operation:InternalManagementOperation)=>{
   observed.push(operation);
   const request=hostOwnerAssetRequest(operation);
   if(request?.agentId!=='agent-a'||request.sessionId!==sessionId)throw new Error('TEST_UNEXPECTED_OWNER');
   if(request.kind==='list')return {kind:'owner-page',agentId:'agent-a',sessionId,items:[{sourceId,name:'result.txt',mimeType:'text/plain',sizeBytes:bytes.length,sha256:chunkHash}],hasMore:false,nextBefore:null};
   if(request.kind==='read'&&request.artifactId===sourceId&&request.offset===0&&request.maxBytes===24*1024)return {kind:'owner-chunk',sourceId,offset:0,dataBase64:bytes.toString('base64'),sha256:chunkHash,eof:true};
   throw new Error('TEST_UNEXPECTED_OWNER_REQUEST');
  };

  host=await connectHostManagementIpc({socketPath,expectedUid:process.getuid!(),expectedGid:process.getgid!(),expectedDeviceId:'host-device',dispatch:async()=>({}),dispatchInternal,isShuttingDown:()=>false});
  const [client]=await incoming;socket=client;
  const pending:Buffer[]=[];
  client.on('data',data=>pending.push(Buffer.from(data)));
  const nextResponse=async()=>{
   const deadline=Date.now()+3000;
   while(Date.now()<deadline){
    const merged=Buffer.concat(pending);if(merged.length>=4){const size=merged.readUInt32BE(0);if(merged.length>=size+4){pending.splice(0,pending.length,merged.subarray(size+4));return JSON.parse(merged.subarray(4,size+4).toString('utf8')) as {kind:string;requestId:string;authority:unknown;result:unknown};}}
    await new Promise(resolve=>setTimeout(resolve,5));
   }
   throw new Error('Timed out waiting for owner bridge response');
  };
  const send=async(requestId:string,operation:unknown)=>{
   const body=Buffer.from(JSON.stringify({kind:'internal-request',requestId,authority,operation}));const frame=Buffer.alloc(4+body.length);frame.writeUInt32BE(body.length);body.copy(frame,4);client.write(frame);return nextResponse();
  };
  const listed=await send('cccccccc-cccc-4ccc-8ccc-cccccccccccc',spelling==='legacy'?{kind:'assets.request',request:{version:1,agentId:'agent-a',kind:'list',sessionId,limit:1}}:{kind:'asset.owner.list',agentId:'agent-a',sessionId,limit:1,before:null});
  expect(listed.result).toMatchObject({kind:'owner-page',sessionId,items:[{sourceId,name:'result.txt',sizeBytes:bytes.length}]});
  expect(JSON.stringify(listed.result)).not.toContain('sourcePath');
  const read=await send('dddddddd-dddd-4ddd-8ddd-dddddddddddd',spelling==='legacy'?{kind:'assets.request',request:{version:1,agentId:'agent-a',kind:'read',sessionId,artifactId:sourceId,offset:0,maxBytes:24*1024}}:{kind:'asset.owner.read',agentId:'agent-a',sessionId,sourceId,offset:0,maxBytes:24*1024});
  expect(read.result).toMatchObject({kind:'owner-chunk',sourceId,offset:0,dataBase64:bytes.toString('base64'),sha256:chunkHash,eof:true});
  expect(observed).toHaveLength(2);
  const denied=await send('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',{kind:'asset.owner.read',agentId:'agent-a',sessionId,sourceId,offset:-1,maxBytes:24*1024});
  expect(denied.result).toEqual({kind:'error',code:'INVALID_REQUEST'});
  expect(observed).toHaveLength(2);
 });
});
