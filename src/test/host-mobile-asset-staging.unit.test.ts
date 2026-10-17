import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { HostMobileAssetStaging } from '../host/mobile-asset-staging';
import type { InternalManagementAuthority } from '../host/management-ipc';

const authority:InternalManagementAuthority={
  connection:{serviceId:'service',networkId:'network',bootEpoch:'boot',connectionEpoch:'epoch'},
  peer:{serviceId:'service',environment:'production',networkId:'network',principalId:'controller',deviceId:'controller-device',keyGeneration:1},
  peerEpoch:'peer-epoch',local:{serviceId:'service',environment:'production',networkId:'network',principalId:'host',deviceId:'host-device',keyGeneration:1},accountBinding:'binding',managementBinding:'binding',
};
const roots:string[]=[];
async function setup(){const root=await mkdtemp(path.join(tmpdir(),'mox-host-assets-'));roots.push(root);return new HostMobileAssetStaging(root);}
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});

describe('Host UID mobile asset staging',()=>{
  it('accepts idempotent 24 KiB chunks, verifies whole-file hash, and never returns a path',async()=>{
    const staging=await setup(),data=Buffer.from('private stage payload'),assetId=randomUUID(),sha256=createHash('sha256').update(data).digest('hex');
    const begin={kind:'asset.stage.begin' as const,agentId:'agent-1',sessionId:'session-1',assetId,name:'note.txt',mimeType:'text/plain',sizeBytes:data.length,sha256};
    expect(await staging.handle(authority,begin)).toMatchObject({receivedBytes:0,ready:false});
    const chunk={kind:'asset.stage.chunk' as const,agentId:begin.agentId,sessionId:begin.sessionId,assetId,offset:0,dataBase64:data.toString('base64'),sha256:createHash('sha256').update(data).digest('hex')};
    expect(await staging.handle(authority,chunk)).toMatchObject({receivedBytes:data.length});
    expect(await staging.handle(authority,chunk)).toMatchObject({receivedBytes:data.length});
    expect(await staging.handle(authority,{kind:'asset.stage.finish',agentId:begin.agentId,sessionId:begin.sessionId,assetId})).toMatchObject({ready:true});
    await staging.withReadyAssets(authority,{agentId:begin.agentId,sessionId:begin.sessionId,assetIds:[assetId]},async assets=>{
      expect(assets[0]).toMatchObject({name:'note.txt',sizeBytes:data.length,sha256});
      expect(await (await import('node:fs/promises')).readFile(assets[0].sourcePath)).toEqual(data);
    });
  });

  it('rejects conflicting retries and prevents cross-authority asset use',async()=>{
    const staging=await setup(),data=Buffer.from('owned'),assetId=randomUUID(),sha256=createHash('sha256').update(data).digest('hex');
    const begin={kind:'asset.stage.begin' as const,agentId:'agent-1',sessionId:'session-1',assetId,name:'note.txt',mimeType:'text/plain',sizeBytes:data.length,sha256};
    await staging.handle(authority,begin);
    const chunk={kind:'asset.stage.chunk' as const,agentId:begin.agentId,sessionId:begin.sessionId,assetId,offset:0,dataBase64:data.toString('base64'),sha256};
    await staging.handle(authority,chunk);
    const other=Buffer.from('other');await expect(staging.handle(authority,{...chunk,dataBase64:other.toString('base64'),sha256:createHash('sha256').update(other).digest('hex')})).rejects.toThrow('ASSET_CHUNK_CONFLICT');
    await expect(staging.withReadyAssets({...authority,peerEpoch:'different'},{agentId:begin.agentId,sessionId:begin.sessionId,assetIds:[assetId]},async()=>true)).rejects.toThrow('ASSET_UPLOAD_NOT_FOUND');
  });

  it('expires only bounded stale private staging records',async()=>{
    let now=1000;const root=await mkdtemp(path.join(tmpdir(),'mox-host-assets-'));roots.push(root);const staging=new HostMobileAssetStaging(root,()=>now);
    const data=Buffer.from('x'),assetId=randomUUID();await staging.handle(authority,{kind:'asset.stage.begin',agentId:'agent-1',sessionId:'session-1',assetId,name:'x.txt',mimeType:'text/plain',sizeBytes:1,sha256:createHash('sha256').update(data).digest('hex')});
    now+=60*60*1000+1;expect(await staging.expire()).toBe(1);
    await expect(staging.withReadyAssets(authority,{agentId:'agent-1',sessionId:'session-1',assetIds:[assetId]},async()=>true)).rejects.toThrow('ASSET_UPLOAD_NOT_FOUND');
  });

  it('initializes the private root for a text-only mobile send',async()=>{
    const root=path.join(tmpdir(),`mox-empty-mobile-${randomUUID()}`),staging=new HostMobileAssetStaging(root);roots.push(root);
    await staging.withReadyAssets(authority,{agentId:'agent-1',sessionId:'session-1',assetIds:[]},async assets=>expect(assets).toEqual([]));
    const {stat}=await import('node:fs/promises');expect((await stat(root)).isDirectory()).toBe(true);
  });

  it('reaps only bounded orphan UUID staging directories after restart',async()=>{
    const root=await mkdtemp(path.join(tmpdir(),'mox-orphan-stage-'));roots.push(root);
    const orphan=path.join(root,randomUUID());await (await import('node:fs/promises')).mkdir(orphan,{mode:0o700});
    await (await import('node:fs/promises')).writeFile(path.join(orphan,'data'),'partial',{mode:0o600});
    const staging=new HostMobileAssetStaging(root);
    await staging.withReadyAssets(authority,{agentId:'agent-1',sessionId:'session-1',assetIds:[]},async()=>undefined);
    await expect((await import('node:fs/promises')).stat(orphan)).rejects.toMatchObject({code:'ENOENT'});
  });
});
