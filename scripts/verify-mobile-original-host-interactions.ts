/** Actual original Host permission/stop and tool-generated artifact loopback. */
import {strict as assert} from 'node:assert';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
import {createServer as httpServer,request as httpRequest,type ServerResponse} from 'node:http';
import {createServer as unixServer,type Socket} from 'node:net';
import {once} from 'node:events';
import {chmod,mkdir,mkdtemp,writeFile,readFile,symlink,readdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import type {InternalManagementAuthority} from '../src/host/management-ipc';

const started=Date.now(), repository=resolve(import.meta.dirname,'..');
const root=await mkdtemp(join(homedir(),'.mox-host-interactions-'));
await chmod(root,0o700);
const state=join(root,'state'),home=join(state,'home'),workspace=join(state,'workspaces','default');
const ipcDirectory=join(root,'ipc'),socketPath=join(ipcDirectory,'management.sock');
const secret=randomBytes(32).toString('base64url');
const children:ChildProcess[]=[];
let diagnostics='',calls=0,hostPid:number|undefined,hostBirth:string|undefined;
const evidence:string[]=[];
const descendants=new Map<number,{pid:number;ppid:number;pgid:number;birth:string;command:string}>();
function record(event:string,value:unknown={}) {const line=JSON.stringify({event,...value as object}).split(secret).join('[redacted]');evidence.push(line);console.log(line);}
function processRows(){
  return execFileSync('/bin/ps',['-axo','pid=,ppid=,pgid=,lstart=,comm='],{encoding:'utf8'}).trim().split('\n').map(line=>{
    const fields=line.trim().split(/\s+/);
    return {pid:Number(fields[0]),ppid:Number(fields[1]),pgid:Number(fields[2]),birth:fields.slice(3,8).join(' '),command:fields.slice(8).join(' ')};
  });
}
function captureProcesses(){
  if(!hostPid)return;
  const rows=processRows();
  if(!hostBirth||rows.find(row=>row.pid===hostPid)?.birth!==hostBirth)return;
  const owned=new Set([hostPid]);let changed=true;
  while(changed){changed=false;for(const row of rows)if(owned.has(row.ppid)&&!owned.has(row.pid)){owned.add(row.pid);changed=true;}}
  const selected=rows.filter(row=>owned.has(row.pid));
  for(const row of selected)descendants.set(row.pid,row);
  record('actual-host-process-tree',{processes:selected});
}
const env:NodeJS.ProcessEnv={PATH:process.env.PATH,LANG:'en_US.UTF-8',HOME:home,USERPROFILE:home,TMPDIR:root,
  DEVELOPER_DIR:'/Library/Developer/CommandLineTools',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',CLAUDE_CODE_MAX_RETRIES:'0',
  ENABLE_CLAUDEAI_MCP_SERVERS:'false',MYAGENTS_MANAGEMENT_PORT:''};
function child(command:string,args:string[],environment=env) {
  const processChild=spawn(command,args,{cwd:root,env:environment,detached:true,stdio:['ignore','pipe','pipe']});
  children.push(processChild);
  for(const stream of [processChild.stdout,processChild.stderr])stream?.on('data',chunk=>{diagnostics+=String(chunk).split(secret).join('[redacted]');});
  return processChild;
}
async function stop(processChild:ChildProcess){
  const alive=()=>processChild.exitCode===null&&processChild.signalCode===null;
  if(!processChild.pid||!alive())return;
  try{process.kill(-processChild.pid,'SIGTERM');}catch{/* already exited */}
  await Promise.race([once(processChild,'exit').catch(()=>{}),new Promise(r=>setTimeout(r,1500))]);
  if(alive())try{process.kill(-processChild.pid,'SIGKILL');}catch{/* group exited */}
}
async function wait<T>(name:string,read:()=>Promise<T|undefined>,timeout=60_000):Promise<T> {
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){const result=await read();if(result!==undefined)return result;await new Promise(r=>setTimeout(r,100));}
  throw Error(`FIXTURE_TIMEOUT:${name}`);
}
const frame=(event:string,data:unknown)=>`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
type Phase='deny'|'allow'|'stop';
let phase:Phase='deny';
const issued=new Set<Phase>();let readIssued=false;
const pngBase64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const png=Buffer.from(pngBase64,'base64');
const generated=(name:Phase)=>join(workspace,'myagents_files','generated',`${name}.png`);
const shellQuote=(s:string)=>"'"+s.replaceAll("'", "'\\''")+"'";
function writeInput(name:Phase){
  const js=`const f=require("fs");f.mkdirSync("myagents_files/generated",{recursive:true});f.writeFileSync("myagents_files/generated/${name}.png",Buffer.from("${pngBase64}","base64"))`;
  const input={command:shellQuote(process.execPath)+' -e '+shellQuote(js),description:'Write isolated fixture PNG',timeout:10000};
  assert(JSON.stringify(input).length<500,'fixture review exceeds original complete-review limit');return input;
}
function reply(response:ServerResponse,tool?:{name:string;input:unknown;id:string}){
  const text=`Original interaction fixture ${phase} completed.`;
  response.writeHead(200,{'content-type':'text/event-stream'});
  response.end(frame('message_start',{type:'message_start',message:{id:`fixture-${calls}`,type:'message',role:'assistant',model:'original-host-model',content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:100,output_tokens:0}}})
    +frame('content_block_start',{type:'content_block_start',index:0,content_block:tool?{type:'tool_use',id:tool.id,name:tool.name,input:{}}:{type:'text',text:''}})
    +frame('content_block_delta',{type:'content_block_delta',index:0,delta:tool?{type:'input_json_delta',partial_json:JSON.stringify(tool.input)}:{type:'text_delta',text}})
    +frame('content_block_stop',{type:'content_block_stop',index:0})
    +frame('message_delta',{type:'message_delta',delta:{stop_reason:tool?'tool_use':'end_turn',stop_sequence:null},usage:{output_tokens:20}})
    +frame('message_stop',{type:'message_stop'}));
}
const supplier=httpServer(async(request,response)=>{
  try{
    if(request.method!=='POST'||!request.url?.startsWith('/v1/messages')){response.writeHead(404).end();return;}
    const chunks:Buffer[]=[];let size=0;
    for await(const part of request){size+=part.length;if(size>8*1024*1024)throw Error('FIXTURE_REQUEST_TOO_LARGE');chunks.push(Buffer.from(part));}
    if(request.url.includes('count_tokens')){response.writeHead(200,{'content-type':'application/json'}).end('{"input_tokens":100}');return;}
    if(request.headers['x-api-key']!==secret)throw Error('FIXTURE_PROVIDER_AUTH_MISMATCH');
    const body=JSON.parse(Buffer.concat(chunks).toString()) as {model:string;messages:unknown};assert.equal(body.model,'original-host-model');
    calls++;captureProcesses();
    if(!issued.has(phase)){issued.add(phase);record('supplier-real-tool-use',{phase,tool:'Bash'});reply(response,{name:'Bash',id:`toolu_fixture_${phase}`,input:writeInput(phase)});}
    else if(phase==='allow'&&!readIssued){readIssued=true;record('supplier-real-tool-use',{phase,tool:'Read'});reply(response,{name:'Read',id:'toolu_fixture_read',input:{file_path:generated('allow')}});}
    else{record('supplier-real-tool-result',{phase,resultObserved:JSON.stringify(body.messages).includes('tool_result')});reply(response);}
  }catch(error){record('supplier-request-rejected',{error:error instanceof Error?error.message:'unknown'});response.writeHead(500).end();}
});
let peer:Socket|undefined;
const pending=new Map<string,{resolve:(value:Record<string,unknown>)=>void;reject:(reason:Error)=>void;timer:NodeJS.Timeout}>();
const listener=unixServer(socket=>{
  peer=socket;let buffer=Buffer.alloc(0);
  socket.on('data',chunk=>{
    buffer=Buffer.concat([buffer,chunk]);
    while(buffer.length>=4){const size=buffer.readUInt32BE();if(size>64*1024){socket.destroy();return;}if(buffer.length<size+4)return;
      const value=JSON.parse(buffer.subarray(4,4+size).toString()) as Record<string,unknown>;buffer=buffer.subarray(4+size);
      const waiter=pending.get(String(value.requestId));if(waiter){pending.delete(String(value.requestId));clearTimeout(waiter.timer);waiter.resolve(value);}
    }
  });
});
async function request(value:Record<string,unknown>){
  assert(peer&&!peer.destroyed,'private IPC unavailable');const requestId=randomUUID();
  const body=Buffer.from(JSON.stringify({...value,requestId}));const bytes=Buffer.alloc(body.length+4);bytes.writeUInt32BE(body.length);body.copy(bytes,4);
  const response=new Promise<Record<string,unknown>>((yes,no)=>{const timer=setTimeout(()=>{pending.delete(requestId);no(Error('FIXTURE_IPC_TIMEOUT'));},40_000);pending.set(requestId,{resolve:yes,reject:no,timer});});
  peer.write(bytes);return response;
}
const management=(method:string,params:Record<string,unknown>)=>request({kind:'request',method,params});
let authority:InternalManagementAuthority;
const internal=(operation:Record<string,unknown>)=>request({kind:'internal-request',authority,operation});
const mobile=(request:Record<string,unknown>)=>internal({kind:'mobile.request',request:{version:1,agentId:'original-host-agent',...request}});
const remote=async(request:Record<string,unknown>)=>{
  const response=await management('session.remote',{remoteSession:{agentId:'original-host-agent',...request}});
  return (response.result as {data:Record<string,unknown>}).data;
};
const source=()=>request({kind:'local-source-request',authority:{connection:authority.connection,local:authority.local,accountBinding:authority.accountBinding,managementBinding:authority.managementBinding},operation:{kind:'source.peek'}});
try{
  assert(process.getuid!()>0,'dedicated non-root fixture required');
  await symlink(join(repository,'node_modules'),join(root,'node_modules'));
  for(const directory of [home,workspace,join(root,'credentials')])await mkdir(directory,{recursive:true,mode:0o700});
  await chmod(state,0o700);await writeFile(join(state,'host.lock'),'',{mode:0o600});
  await mkdir(ipcDirectory,{mode:0o750});await chmod(ipcDirectory,0o750);
  const require=createRequire(import.meta.url);
  await mkdir(join(root,'claude-agent-sdk'),{mode:0o700});
  const triple=process.platform==='darwin'?`darwin-${process.arch}`:`linux-${process.arch}`;
  await symlink(require.resolve(`@anthropic-ai/claude-agent-sdk-${triple}/claude`),join(root,'claude-agent-sdk','claude'));
  for(const [entry,target] of [['src/host/main.ts','host-main.mjs'],['src/server/host-session-worker.ts','host-session-worker.mjs']])await build({entryPoints:[join(repository,entry)],outfile:join(root,target),bundle:true,platform:'node',format:'esm',logLevel:'silent',
    banner:{js:'import {createRequire as __createRequire} from "module"; const require=__createRequire(import.meta.url);'},
    external:['playwright','playwright/*','playwright-core','playwright-core/*','@playwright/mcp','@playwright/mcp/*']});
  const entry=join(root,'host-main.mjs');
  const hostArgs=process.platform==='linux'?['--exclusive','--nonblock','--no-fork',join(state,'host.lock'),process.execPath,entry,'--serve']:[entry,'--serve'];
  const hostCommand=process.platform==='linux'?'/usr/bin/flock':process.execPath;
  // The real startup owner must establish fresh authority before the original
  // operator changes registry data. Never seed identity or registry fixtures.
  const bootstrapEnvironment={...env,MYAGENTS_HOST_STATE_DIR:state,
    MYAGENTS_HOST_SOCKET:join(root,'control.sock'),MYAGENTS_HOST_MODE:'1'};
  for(const path of [join(state,'host-identity.json'),join(home,'.myagents','config.json'),join(home,'.myagents','projects.json')])
    await assert.rejects(readFile(path),{code:'ENOENT'});
  const bootstrapOffset=diagnostics.length;
  const bootstrap=child(hostCommand,hostArgs,bootstrapEnvironment);
  await wait('original Host fresh bootstrap',async()=>{
    if(bootstrap.exitCode!==null||bootstrap.signalCode!==null)throw Error('FIXTURE_BOOTSTRAP_EXITED');
    return diagnostics.slice(bootstrapOffset).includes('MyAgents Host ready (private Unix control;')?true:undefined;
  });
  const bootstrapStatus=await new Promise<{hostId:string;configured:boolean;activeSession:unknown;stopping:boolean}>((resolveStatus,reject)=>{
    // Read the same private status contract as doctor without a second bundled
    // CLI's startup/lifetime becoming part of this readiness observation.
    const call=httpRequest({socketPath:join(root,'control.sock'),path:'/host/status',method:'POST',agent:false},response=>{
      const chunks:Buffer[]=[];let size=0;
      response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>8192)response.destroy(Error('FIXTURE_BOOTSTRAP_STATUS_TOO_LARGE'));else chunks.push(chunk);});
      response.on('error',reject);
      response.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString());assert.equal(value.ok,true);resolveStatus(value.data);}catch{reject(Error('FIXTURE_BOOTSTRAP_STATUS_INVALID'));}});
    });
    call.setTimeout(2000,()=>call.destroy(Error('FIXTURE_BOOTSTRAP_STATUS_TIMEOUT')));
    call.on('error',reject);call.end('{}');
  });
  const identityBytes=await readFile(join(state,'host-identity.json'));
  assert.equal(bootstrapStatus.hostId,JSON.parse(identityBytes.toString()).hostId);
  assert.equal(bootstrapStatus.configured,false);assert.equal(bootstrapStatus.activeSession,null);assert.equal(bootstrapStatus.stopping,false);
  assert.equal(await readFile(join(home,'.myagents','config.json'),'utf8'),'{"agents":[]}\n');
  assert.equal(await readFile(join(home,'.myagents','projects.json'),'utf8'),'[]\n');
  await stop(bootstrap);
  assert.equal(bootstrap.exitCode,0,'fresh Host bootstrap must exit normally');assert.equal(bootstrap.signalCode,null);
  assert.equal(calls,0);assert.equal(peer,undefined);
  record('original-host-bootstrap-ready-and-stopped',{emptyRegistry:true,noManagement:true,noSupplierCalls:true});
  await writeFile(join(root,'credentials','provider-key'),randomBytes(32),{mode:0o600});
  await new Promise<void>(yes=>supplier.listen(0,'127.0.0.1',yes));
  const address=supplier.address();assert(address&&typeof address!=='string');
  const baseUrl=`http://127.0.0.1:${address.port}`;
  const operator=child(process.execPath,['--import','tsx',join(repository,'src/test/fixtures/mobile-original-host-operator.ts'),workspace,baseUrl]);
  assert.equal((await once(operator,'exit'))[0],0,'original local operator configuration failed');
  record('local-operator-configured');
  assert.deepEqual(await readFile(join(state,'host-identity.json')),identityBytes);
  const configuredRegistry=await Promise.all(['config.json','projects.json'].map(name=>readFile(join(home,'.myagents',name))));
  listener.listen(socketPath);await once(listener,'listening');await chmod(socketPath,0o660);
  const hostEnvironment={...env,
    MYAGENTS_HOST_STATE_DIR:state,MYAGENTS_HOST_SOCKET:join(root,'control.sock'),MYAGENTS_HOST_MANAGEMENT_IPC:socketPath,
    MYAGENTS_HOST_MANAGEMENT_NETWORK_UID:String(process.getuid!()),MYAGENTS_HOST_MANAGEMENT_GID:String(process.getgid!()),MYAGENTS_HOST_MODE:'1',
    CREDENTIALS_DIRECTORY:join(root,'credentials'),MYAGENTS_HOST_PROVIDER_KEY_CREDENTIAL:'provider-key'};
  const host=child(hostCommand,hostArgs,hostEnvironment);
  hostPid=host.pid;hostBirth=processRows().find(row=>row.pid===hostPid)?.birth;
  record('host-born',{pid:hostPid,pgid:hostPid,birth:hostBirth,node:process.version});
  await wait('real Host startup',async()=>{if(host.exitCode!==null)throw Error('FIXTURE_HOST_EXITED');return peer&&diagnostics.includes('management IPC connected')?true:undefined;});
  assert.deepEqual(await readFile(join(state,'host-identity.json')),identityBytes);
  assert.deepEqual(await Promise.all(['config.json','projects.json'].map(name=>readFile(join(home,'.myagents',name)))),configuredRegistry);
  record('original-host-reused-bootstrap-identity-and-operator-registry');
  const rejected=await management('config.provider.set',{provider:{id:'forbidden-loopback',name:'Forbidden portable loopback',apiProtocol:'anthropic',authType:'api_key',baseUrl},model:'original-host-model',workspace:{rootId:'workspaces',relativePath:'default'},executionAuthorized:true,expectedRevision:0,mutationId:randomUUID()});
  assert.equal((rejected.result as {kind:string}).kind,'error');
  assert.equal((rejected.result as {code:string}).code,'INVALID_REQUEST');
  const configured=await management('config.set',{providerId:'moonshot-coding',model:'k3',executionAuthorized:true,expectedRevision:0,mutationId:randomUUID()});
  assert.equal((configured.result as {status:string}).status,'persisted');
  const credential=await management('credential.provider.set',{providerId:'original-host-fixture',credential:secret,expectedRevision:0,mutationId:randomUUID()});
  assert.equal((credential.result as {status:string}).status,'persisted');
  const identity=JSON.parse(await readFile(join(state,'host-identity.json'),'utf8')) as {hostId:string};
  const binding=randomUUID(),connectionEpoch=randomUUID();
  const device={serviceId:'fixture-service',environment:'fixture',networkId:'fixture-network',principalId:'fixture-principal',deviceId:identity.hostId,keyGeneration:1};
  authority={connection:{serviceId:device.serviceId,networkId:device.networkId,bootEpoch:randomUUID(),connectionEpoch},local:device,
    peer:{...device,deviceId:randomUUID()},peerEpoch:randomUUID(),accountBinding:binding,managementBinding:binding};
  type Interaction={requestId:string;generation:string;turnId:string;interaction:'permission'|'question'|'plan';actionable:boolean;title:string};
  type Snapshot={generation:string;turnId:string;state:string;terminal:string;interactions:Interaction[];revision:string};
  let sessionId='';
  const snapshot=async()=>await remote({kind:'get',sessionId,limit:30}) as unknown as Snapshot;
  const exists=async(path:string)=>{try{await readFile(path);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}};
  const readMutation=async(operationId:string)=>await remote({kind:'receipt',operationId});
  async function mutation(request:Record<string,unknown>,expected:'accepted'|'rejected'){
    const operationId=randomUUID();await remote({...request,sessionId,operationId});
    const result=await wait('original remote control receipt',async()=>{const r=await readMutation(operationId);return r.status!=='processing'?r:undefined;});
    assert.equal(result.status,expected,JSON.stringify(result));return result;
  }
  async function pending(){
    return wait('original actionable permission',async()=>{
      const s=await snapshot();
      if(s.terminal==='error')throw Error('FIXTURE_TOOL_TURN_FAILED');
      const item=s.interactions.find(i=>i.interaction==='permission');
      if(!item)return undefined;
      assert.equal(s.state,'waiting_user_action');assert(item.actionable,'original remote review is not complete/actionable');
      assert.equal(item.generation,s.generation);assert.equal(item.turnId,s.turnId);
      return {snapshot:s,interaction:item};
    });
  }
  const respond=(i:Interaction,approved:boolean)=>mutation({kind:'respond',generation:i.generation,turnId:i.turnId,requestId:i.requestId,interaction:i.interaction,approved},'accepted');
  const firstOperation=randomUUID();
  const start=(await mobile({kind:'mobile.start',operationId:firstOperation,text:'Interaction fixture deny phase.',assetIds:[]})).result as Record<string,unknown>;
  const startReceipt=start.status==='accepted'?start:await wait('accepted original start',async()=>{const r=(await mobile({kind:'mobile.receipt',operationId:firstOperation})).result as Record<string,unknown>;if(r.status==='unconfirmed'||r.status==='rejected')throw Error(`FIXTURE_START_${r.status}`);return r.status==='accepted'?r:undefined;});
  sessionId=String(startReceipt.sessionId);
  const denied=await pending();assert.equal(await exists(generated('deny')),false);
  record('real-pending-permission',{phase,sessionId,generation:denied.interaction.generation,turnId:denied.interaction.turnId,requestId:denied.interaction.requestId,actionable:true});
  const callsAtWait=calls;
  const waitingHint=await wait('original waiting permission generic source',async()=>{const r=(await source()).result as Record<string,unknown>;return r.kind==='source.hint'?r:undefined;});
  assert.equal(waitingHint.sessionId,sessionId);assert.equal(waitingHint.agentId,'original-host-agent');assert.equal(calls,callsAtWait);
  assert.deepEqual(Object.keys(waitingHint).sort(),['kind','sourceEventId','connectionEpoch','agentId','sessionId'].sort());
  record('actual-waiting-interaction-generic-source',waitingHint);
  const wrong=await mutation({kind:'respond',generation:randomUUID(),turnId:denied.interaction.turnId,requestId:denied.interaction.requestId,interaction:'permission',approved:true},'rejected');
  assert.equal(wrong.code,'REMOTE_SESSION_INTERACTION_EXPIRED');assert.equal(await exists(generated('deny')),false);
  for(const patch of [{turnId:randomUUID()},{requestId:'perm_fixture_missing'}]){
    const rejected=await mutation({kind:'respond',generation:denied.interaction.generation,turnId:denied.interaction.turnId,requestId:denied.interaction.requestId,interaction:'permission',approved:true,...patch},'rejected');
    assert.equal(rejected.code,'REMOTE_SESSION_INTERACTION_EXPIRED');assert.equal(await exists(generated('deny')),false);
  }
  const fresh=await pending();assert.equal(fresh.interaction.requestId,denied.interaction.requestId);
  await respond(fresh.interaction,false);
  await wait('denied turn settled',async()=>{const s=await snapshot();return s.state==='idle'&&s.terminal==='complete'?s:undefined;});
  assert.equal(await exists(generated('deny')),false);record('wrong-generation-rejected-and-real-denial-no-write');
  async function send(next:Phase){
    phase=next;const operationId=randomUUID();
    await mobile({kind:'mobile.send',operationId,sessionId,text:`Interaction fixture ${next} phase.`,assetIds:[]});
    await wait('accepted original mobile send',async()=>{const r=(await mobile({kind:'mobile.receipt',operationId})).result as Record<string,unknown>;if(r.status==='unconfirmed'||r.status==='rejected')throw Error(`FIXTURE_SEND_${r.status}`);return r.status==='accepted'?r:undefined;});
  }
  await send('allow');const allowed=await pending();assert.equal(await exists(generated('allow')),false);
  const freshAllow=await pending();assert.equal(freshAllow.interaction.requestId,allowed.interaction.requestId);assert.equal(freshAllow.interaction.generation,denied.interaction.generation);
  await respond(freshAllow.interaction,true);
  await wait('real tool-generated artifact',async()=>{
    const s=await snapshot();
    // If native Read requires separate permission, approve only its original
    // fresh complete review through the same owner, never a session grant.
    for(const i of s.interactions){if(i.interaction==='permission'){assert(i.actionable);assert.equal(i.title,'Read');await respond(i,true);}}
    return s.state==='idle'&&s.terminal==='complete'?s:undefined;
  });
  assert.deepEqual(await readFile(generated('allow')),png);
  const page=await wait('original persisted artifact projection',async()=>{
    const r=(await internal({kind:'assets.request',request:{version:1,kind:'list',agentId:'original-host-agent',sessionId,limit:30}})).result as {kind:string;items?:Array<{sourceId:string;sha256:string;sizeBytes:number}>};
    assert.equal(r.kind,'owner-page');return r.items?.length?r:undefined;
  });
  const artifact=page.items![0]!;
  assert.equal(page.items!.length,1);
  const chunk=(await internal({kind:'assets.request',request:{version:1,kind:'read',agentId:'original-host-agent',sessionId,artifactId:artifact.sourceId,offset:0,maxBytes:24*1024}})).result as {kind:string;dataBase64:string;sha256:string;eof:boolean};
  assert.equal(chunk.kind,'owner-chunk');assert.deepEqual(Buffer.from(chunk.dataBase64,'base64'),png);assert(chunk.eof);
  assert.equal(artifact.sha256,createHash('sha256').update(png).digest('hex'));assert.equal(artifact.sizeBytes,png.length);
  assert.equal(chunk.sha256,artifact.sha256);
  record('actual-tool-artifact-list-read',{artifactId:artifact.sourceId,sizeBytes:png.length,sha256:artifact.sha256});
  const callsBeforeStale=calls;
  const expired=await mutation({kind:'respond',generation:allowed.interaction.generation,turnId:allowed.interaction.turnId,requestId:allowed.interaction.requestId,interaction:'permission',approved:true},'rejected');
  assert.equal(expired.code,'REMOTE_SESSION_INTERACTION_EXPIRED');assert.equal(calls,callsBeforeStale);record('settled-interaction-cannot-be-approved-again');
  await send('stop');const stopped=await pending();assert.equal(await exists(generated('stop')),false);
  const callsAtStop=calls;
  await mutation({kind:'stop',generation:stopped.interaction.generation,turnId:stopped.interaction.turnId},'accepted');
  await wait('actual stopped terminal',async()=>{const s=await snapshot();return s.state==='idle'&&s.terminal==='stopped'?s:undefined;});
  const afterStop=await mutation({kind:'respond',generation:stopped.interaction.generation,turnId:stopped.interaction.turnId,requestId:stopped.interaction.requestId,interaction:'permission',approved:true},'rejected');
  assert.equal(afterStop.code,'REMOTE_SESSION_INTERACTION_EXPIRED');assert.equal(await exists(generated('stop')),false);
  assert.equal(calls,callsAtStop);
  record('exact-stop-expires-real-pending-without-write');
  record('PASS',{elapsedMs:Date.now()-started,supplierCalls:calls,scope:'actual original Host/worker/SDK permissions, tool generation and artifact bytes; synthetic loopback supplier only'});
}catch(error){record('FAIL',{error:error instanceof Error?error.message:'unknown',supplierCalls:calls,elapsedMs:Date.now()-started,privateFixture:root});process.exitCode=1;}
finally{
  captureProcesses();
  // Every owned process was born detached; signal only its exact birth PGID.
  for(const processChild of children.reverse())await stop(processChild);
  // SDK descendants normally inherit the Host group. A recorded detached
  // descendant is cleaned only if its exact PID/birth identity still matches.
  for(const current of processRows()){const born=descendants.get(current.pid);if(born&&born.birth===current.birth)try{process.kill(current.pid,'SIGKILL');}catch{/* already exited */}}
  peer?.destroy();for(const waiter of pending.values()){clearTimeout(waiter.timer);waiter.reject(Error('FIXTURE_CLOSED'));}pending.clear();
  supplier.closeAllConnections();supplier.close();listener.close();
  await writeFile(join(root,'diagnostics.private.log'),diagnostics,{mode:0o600});
  await writeFile(join(root,'evidence.jsonl'),evidence.join('\n')+'\n',{mode:0o600});
  const sourceFiles=await readdir(join(state,'mobile-notify-source-v1')).catch(()=>[]);
  console.log(JSON.stringify({privateFixture:root,evidence:join(root,'evidence.jsonl'),sourceFiles:sourceFiles.length}));
}
