import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createHostMobileAgentCatalog} from '../host/mobile-agent-catalog';
import {parseLocalSourceRequest,type LocalSourceAuthority} from '../host/management-ipc';
let root:string,home:string;
const agent=(id:string)=>({id,name:id,enabled:true,runtime:'builtin',channels:[]});
let agents:ReturnType<typeof agent>[],projects:Array<{id:string;name:string;agentId:string;path:string;archivedAt?:string}>;
let extra:Record<string,unknown>;
let a:LocalSourceAuthority;
beforeEach(async()=>{
  root=await realpath(await mkdtemp(join(tmpdir(),'host-catalog-')));home=join(root,'home');
  await mkdir(join(home,'.myagents'),{recursive:true,mode:0o700});await mkdir(join(root,'workspaces'),{mode:0o700});
  vi.stubEnv('HOME',home);vi.stubEnv('USERPROFILE',home);agents=[];projects=[];extra={};
  const binding=randomUUID();a={connection:{serviceId:'s',networkId:'n',bootEpoch:'boot',connectionEpoch:randomUUID()},local:{serviceId:'s',environment:'test',networkId:'n',principalId:'p',deviceId:randomUUID(),keyGeneration:1},accountBinding:binding,managementBinding:binding};
});
afterEach(async()=>{vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});});
async function add(id:string){const path=join(root,'workspaces',id);await mkdir(path);agents.push(agent(id));projects.push({id:'w-'+id,name:id,agentId:id,path});}
async function save(){await writeFile(join(home,'.myagents','config.json'),JSON.stringify({agents,...extra}));await writeFile(join(home,'.myagents','projects.json'),JSON.stringify(projects));}
async function workspacePath(path:string){const canonical=await realpath(path);if(!canonical.startsWith(join(root,'workspaces')+'/'))throw Error('OUTSIDE_ROOT');return canonical;}
async function collect(owner:ReturnType<typeof createHostMobileAgentCatalog>){
  const parts:Buffer[]=[];let cursor:string|undefined;let observation='';let pages=0;
  do{const page=await owner.request(a,cursor);expect(page.kind).toBe('catalog.chunk');expect(page.offset).toBe(parts.reduce((n,b)=>n+b.length,0));
    expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(48*1024);const bytes=Buffer.from(page.dataBase64,'base64');expect(bytes.length).toBeLessThanOrEqual(24*1024);parts.push(bytes);
    if(observation)expect(page.observation).toBe(observation);observation=page.observation;cursor=page.nextCursor??undefined;pages++;
  }while(cursor);
  const bytes=Buffer.concat(parts);expect(createHash('sha256').update(bytes).digest('hex')).toBe(observation);return {items:JSON.parse(bytes.toString()),pages};
}
it('projects the original ordinary enabled builtin registry without repair or secret fields',async()=>{
  for(const id of ['ordinary','disabled','private','archived','unsupported'])await add(id);
  agents[1]!.enabled=false;agents[4]!.runtime='codex';projects[3]!.archivedAt='2026-10-18';extra={providerApiKeys:{ordinary:'DO_NOT_EXPORT'},hostBotDelegationsV1:{bots:[{snapshot:{agent_id:'private'}}]}};
  await save();const before=await readFile(join(home,'.myagents','config.json'),'utf8');
  const result=await collect(createHostMobileAgentCatalog({workspacePath}));expect(result.items).toEqual([{localAgentId:'ordinary',localWorkspaceId:'w-ordinary',name:'ordinary',path:projects[0]!.path,lifecycle:'active',exposureRevision:0,icon:null}]);
  expect(await readFile(join(home,'.myagents','config.json'),'utf8')).toBe(before);expect(JSON.stringify(result.items)).not.toContain('DO_NOT_EXPORT');
});
it('preserves a legitimate item larger than one chunk and retries EOF without another source read',async()=>{
  await add('large');agents[0]!.name='\u0001'.repeat(4096);await save();let reads=0;
  const owner=createHostMobileAgentCatalog({workspacePath:async path=>{reads++;return workspacePath(path);}});
  const first=await owner.request(a);expect(first.nextCursor).not.toBeNull();const last=await owner.request(a,first.nextCursor!);expect(last.nextCursor).toBeNull();
  expect(await owner.request(a,first.nextCursor!)).toEqual(last);expect(reads).toBe(2);
  const result=await collect(createHostMobileAgentCatalog({workspacePath}));expect(result.pages).toBeGreaterThan(1);expect(result.items[0].name).toBe(agents[0]!.name);
});
it('rejects malformed persisted Agent name/enabled types through the original strict owner without coercion or repair',async()=>{
  await add('ordinary');await save();
  const configPath=join(home,'.myagents','config.json');const projectPath=join(home,'.myagents','projects.json');
  const projectBefore=await readFile(projectPath,'utf8');const verifier=vi.fn(workspacePath);
  const owner=createHostMobileAgentCatalog({workspacePath:verifier});
  const malformed=[
    {name:undefined},{name:null},{name:42},{name:{}},{name:[]},
    {enabled:undefined},{enabled:null},{enabled:'true'},{enabled:1},{enabled:{}},{enabled:[]},
    {name:{},enabled:false},
  ];
  for(const change of malformed){
    const bytes=JSON.stringify({agents:[{...agent('ordinary'),...change}]});await writeFile(configPath,bytes);
    await expect(owner.request(a)).rejects.toThrow('REGISTRY_CORRUPT');
    expect(await readFile(configPath,'utf8')).toBe(bytes);
    expect(await readFile(projectPath,'utf8')).toBe(projectBefore);
  }
  expect(verifier).not.toHaveBeenCalled();
  await save();expect((await collect(owner)).items[0].name).toBe('ordinary');
});
it('rejects partial/duplicate/missing/malformed/outside-root sources instead of publishing empty',async()=>{
  const owner=createHostMobileAgentCatalog({workspacePath});await expect(owner.request(a)).rejects.toThrow();
  await add('a');await save();await writeFile(join(home,'.myagents','projects.json'),'{bad');await expect(owner.request(a)).rejects.toThrow();
  await save();agents.push({...agents[0]!});await save();await expect(owner.request(a)).rejects.toThrow();agents.pop();
  projects[0]!.agentId='missing';await save();await expect(owner.request(a)).rejects.toThrow('CATALOG_PARTIAL');
  projects[0]!.agentId='a';projects[0]!.path=root;await save();await expect(owner.request(a)).rejects.toThrow('OUTSIDE_ROOT');
});
it('rejects source drift at EOF, cross-authority cursors, expiry and cold-owner resume',async()=>{
  await add('a');agents[0]!.name='\u0001'.repeat(4096);await save();let clock=0;
  const owner=createHostMobileAgentCatalog({workspacePath,now:()=>clock});const first=await owner.request(a);const cursor=first.nextCursor!;
  await expect(owner.request({...a,connection:{...a.connection,connectionEpoch:randomUUID()}},cursor)).rejects.toThrow('CATALOG_SCOPE_CHANGED');
  await expect(owner.request(a,first.observation+':1')).rejects.toThrow('CATALOG_CURSOR_INVALID');
  await expect(createHostMobileAgentCatalog({workspacePath}).request(a,cursor)).rejects.toThrow('CATALOG_UNAVAILABLE');
  clock=30_001;await expect(owner.request(a,cursor)).rejects.toThrow('CATALOG_EXPIRED');clock=0;
  const fresh=await owner.request(a);agents[0]!.name='changed';await save();await expect(owner.request(a,fresh.nextCursor!)).rejects.toThrow('CATALOG_CHANGED');
});
it('rejects original total-byte oversize without truncation',async()=>{
  for(let n=0;n<350;n++){await add('a'+n);agents[n]!.name='\u0001'.repeat(4096);}await save();
  await expect(createHostMobileAgentCatalog({workspacePath}).request(a)).rejects.toThrow('CATALOG_TOO_LARGE');
});
it('keeps the local query closed and accepts no caller paths, epoch, keys or oversized cursor',()=>{
  const request={kind:'local-source-request',requestId:randomUUID(),authority:a,operation:{kind:'catalog.snapshot'}};
  expect(parseLocalSourceRequest(request,a.local.deviceId)).not.toBeNull();
  for(const key of ['path','paths','items','connectionEpoch','catalogSeq','key'])expect(parseLocalSourceRequest({...request,operation:{...request.operation,[key]:'bad'}},a.local.deviceId)).toBeNull();
  expect(parseLocalSourceRequest({...request,operation:{...request.operation,cursor:'a'.repeat(129)}},a.local.deviceId)).toBeNull();
});
