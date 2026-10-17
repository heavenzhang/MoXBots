/** Read-only original identity projection. No Agent registration or execution. */
import {createHash} from 'node:crypto';
import {lstatSync} from 'node:fs';
import {join} from 'node:path';
import {catalogSchema,NETWORK_BUDGETS,type CatalogItem} from '@myagents/agent-network-protocol';
import {APP_DATA_DIR_NAME} from '../shared/appProfile';
import {resolveAgentWorkspaceProjections} from '../shared/agentWorkspaceIdentity';
import {isProjectArchived,isProjectVisibleToUser} from '../shared/config-types';
import {resolveAgentRuntimePreference,runtimeTypeForAgentRuntimePreference} from '../shared/integrated-runtimes/identity';
import {workspacePathsEqual} from '../shared/workspacePath';
import {remoteSessionRequestSchema} from '../shared/remoteSession';
import {loadConfig,loadProjects,withAgentConfigIntentLock} from '../server/utils/admin-config';
import {getHomeDirOrNull} from '../server/utils/platform';
import {assertOrdinaryRemoteAgent,HostRemoteError} from './remote-session';
import type {LocalSourceAuthority} from './management-ipc';

const CHUNK=24*1024,TTL=30_000;
const digest=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const fail=(code:string):never=>{throw Error(code);};
type Options={workspacePath:(path:string)=>Promise<string>;now?:()=>number};
type Snapshot={bytes:Buffer;hash:string;authority:string;created:number;verified:boolean};
function scope(a:LocalSourceAuthority){return digest(JSON.stringify([a.connection.serviceId,a.connection.networkId,a.connection.bootEpoch,a.connection.connectionEpoch,
  a.local.serviceId,a.local.environment,a.local.networkId,a.local.principalId,a.local.deviceId,a.local.keyGeneration,a.accountBinding,a.managementBinding]));}

export function createHostMobileAgentCatalog(options:Options){
  let cached:Snapshot|undefined;
  let tail:Promise<unknown>=Promise.resolve();
  const now=options.now??(()=>performance.now());
  async function read(){
    return withAgentConfigIntentLock(async()=>{
      const home=getHomeDirOrNull();if(!home)fail('CATALOG_UNAVAILABLE');
      // Missing files are not an authoritative empty registry. Original strict
      // readers reject malformed/symlink authorities and never use .bak fallback.
      for(const name of ['config.json','projects.json'])if(!lstatSync(join(home!,APP_DATA_DIR_NAME,name)).isFile())fail('CATALOG_UNAVAILABLE');
      const config=loadConfig({strict:true}),projects=loadProjects({strict:true});
      if(!Array.isArray(config.agents))fail('CATALOG_PARTIAL');
      const agents=config.agents!;
      const projection=resolveAgentWorkspaceProjections(projects,agents);
      if(projection.diagnostics.length)fail('CATALOG_PARTIAL');
      for(const p of projects)if(isProjectVisibleToUser(p)&&!isProjectArchived(p)&&(!p.agentId||!agents.some(a=>a.id===p.agentId)))fail('CATALOG_PARTIAL');
      const before=JSON.stringify([config,projects]);
      const items:CatalogItem[]=[];
      const privateLedger=config.hostBotDelegationsV1;
      // Do not reinterpret corrupt private-owner evidence as an ordinary Agent.
      if(privateLedger!==undefined){
        assertOrdinaryRemoteAgent('',privateLedger);
        const bots=(privateLedger as {bots:Array<{snapshot:{agent_id?:unknown}}>}).bots;
        if(bots.some(b=>!remoteSessionRequestSchema.safeParse({kind:'capabilities',agentId:b.snapshot.agent_id}).success))fail('CATALOG_PRIVATE_OWNER_UNAVAILABLE');
      }
      for(const selected of projection.agentProjections){
        const {agent,project}=selected;
        if(!agent.enabled)continue;
        try{assertOrdinaryRemoteAgent(agent.id,privateLedger);}catch(error){if(error instanceof HostRemoteError&&error.code==='REMOTE_SESSION_PRIVATE')continue;throw error;}
        const runtimeConfig=agent.runtimeConfig;
        const runtimeSource=runtimeConfig&&typeof runtimeConfig==='object'&&'source' in runtimeConfig?runtimeConfig.source:undefined;
        const preference=resolveAgentRuntimePreference({runtimePreference:agent.runtimePreference,runtime:agent.runtime,runtimeSource,providerId:agent.providerId});
        if(preference?runtimeTypeForAgentRuntimePreference(preference)!=='builtin':agent.runtimePreference!==undefined||(agent.runtime!==undefined&&agent.runtime!=='builtin'))continue;
        const ownerProject=project??fail('CATALOG_PARTIAL');
        if(selected.association!=='project-linked')fail('CATALOG_PARTIAL');
        if(!isProjectVisibleToUser(ownerProject)||isProjectArchived(ownerProject))continue;
        if(!remoteSessionRequestSchema.safeParse({kind:'capabilities',agentId:agent.id}).success)fail('CATALOG_INVALID');
        const path=await options.workspacePath(selected.workspacePath);
        if(!workspacePathsEqual(path,selected.workspacePath))fail('CATALOG_CHANGED');
        items.push({localAgentId:agent.id,localWorkspaceId:ownerProject.id,name:String(agent.name),path,
          lifecycle:'active',exposureRevision:ownerProject.agentNetworkExposureRevision??0,icon:ownerProject.icon??null});
      }
      items.sort((a,b)=>a.localAgentId<b.localAgentId?-1:a.localAgentId>b.localAgentId?1:0);
      if(new Set(items.map(i=>i.localAgentId)).size!==items.length||new Set(items.map(i=>i.localWorkspaceId)).size!==items.length)fail('CATALOG_DUPLICATE');
      if(before!==JSON.stringify([loadConfig({strict:true}),loadProjects({strict:true})]))fail('CATALOG_CHANGED');
      const full=catalogSchema.parse({version:1,connectionEpoch:'00000000-0000-4000-8000-000000000001',catalogSeq:1,items});
      if(Buffer.byteLength(JSON.stringify(full))>NETWORK_BUDGETS.catalogBytes)fail('CATALOG_TOO_LARGE');
      return Buffer.from(JSON.stringify(items));
    });
  }
  return {
    request(authority:LocalSourceAuthority,cursor?:string){
      const captured=scope(authority);
      const task=tail.then(async()=>{
        let offset=0;
        if(cursor===undefined){
          cached=undefined;
          const created=now(),bytes=await read();
          cached={bytes,hash:digest(bytes),authority:captured,created,verified:false};
        }else{
          const match=/^([a-f0-9]{64}):([1-9][0-9]{0,7})$/.exec(cursor);
          if(!match||cursor.length>128)fail('CATALOG_CURSOR_INVALID');
          if(!cached)fail('CATALOG_UNAVAILABLE');
          if(cached!.authority!==captured)fail('CATALOG_SCOPE_CHANGED');
          if(match![1]!==cached!.hash)fail('CATALOG_CHANGED');
          offset=Number(match![2]);
          if(offset%CHUNK!==0||offset>=cached!.bytes.length)fail('CATALOG_CURSOR_INVALID');
        }
        const snapshot=cached!;
        if(snapshot.authority!==captured)fail('CATALOG_SCOPE_CHANGED');
        if(now()-snapshot.created>=TTL){cached=undefined;fail('CATALOG_EXPIRED');}
        const end=Math.min(offset+CHUNK,snapshot.bytes.length);
        if(end===snapshot.bytes.length&&!snapshot.verified){
          try{if(digest(await read())!==snapshot.hash)fail('CATALOG_CHANGED');snapshot.verified=true;}
          catch(error){cached=undefined;throw error;}
          if(now()-snapshot.created>=TTL){cached=undefined;fail('CATALOG_EXPIRED');}
        }
        return {kind:'catalog.chunk' as const,observation:snapshot.hash,offset,dataBase64:snapshot.bytes.subarray(offset,end).toString('base64'),nextCursor:end===snapshot.bytes.length?null:`${snapshot.hash}:${end}`};
      });
      tail=task.catch(()=>{});return task;
    },
  };
}
