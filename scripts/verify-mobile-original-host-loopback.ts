/** Explicit original Host + real SessionEngine/SDK/native child loopback. No paid inference. */
import {strict as assert} from 'node:assert';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {spawn,type ChildProcess} from 'node:child_process';
import {createServer as httpServer,type ServerResponse} from 'node:http';
import {createServer as unixServer,type Socket} from 'node:net';
import {once} from 'node:events';
import {chmod,mkdir,mkdtemp,writeFile,readFile,symlink,readdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import type {InternalManagementAuthority} from '../src/host/management-ipc';

const started=Date.now(), repository=resolve(import.meta.dirname,'..');
const root=await mkdtemp(join(homedir(),'.mox-original-host-'));
await chmod(root,0o700);
const state=join(root,'state'),home=join(state,'home'),workspace=join(state,'workspaces','default');
const ipcDirectory=join(root,'ipc'),socketPath=join(ipcDirectory,'management.sock');
const secret=randomBytes(32).toString('base64url');
const children:ChildProcess[]=[];
let diagnostics='',calls=0,seenAttachment=false;
const evidence:string[]=[];
function record(event:string,value:unknown={}) {const line=JSON.stringify({event,...value as object});evidence.push(line);console.log(line);}
const env:NodeJS.ProcessEnv={PATH:process.env.PATH,LANG:'en_US.UTF-8',HOME:home,USERPROFILE:home,TMPDIR:root,
  DEVELOPER_DIR:'/Library/Developer/CommandLineTools',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',CLAUDE_CODE_MAX_RETRIES:'0',
  ENABLE_CLAUDEAI_MCP_SERVERS:'false',MYAGENTS_MANAGEMENT_PORT:''};
function child(command:string,args:string[],environment=env) {
  const processChild=spawn(command,args,{cwd:root,env:environment,detached:true,stdio:['ignore','pipe','pipe']});
  children.push(processChild);
  for(const stream of [processChild.stdout,processChild.stderr])stream?.on('data',chunk=>{diagnostics+=String(chunk).split(secret).join('[redacted]');});
  return processChild;
}
async function wait<T>(name:string,read:()=>Promise<T|undefined>,timeout=60_000):Promise<T> {
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){const result=await read();if(result!==undefined)return result;await new Promise(r=>setTimeout(r,100));}
  throw Error(`FIXTURE_TIMEOUT:${name}`);
}
const frame=(event:string,data:unknown)=>`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
function reply(response:ServerResponse) {
  const text=`Original Host local supplier completion ${calls}.`;
  response.writeHead(200,{'content-type':'text/event-stream'});
  response.end(frame('message_start',{type:'message_start',message:{id:`fixture-${calls}`,type:'message',role:'assistant',model:'original-host-model',content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:100,output_tokens:0}}})
    +frame('content_block_start',{type:'content_block_start',index:0,content_block:{type:'text',text:''}})
    +frame('content_block_delta',{type:'content_block_delta',index:0,delta:{type:'text_delta',text}})
    +frame('content_block_stop',{type:'content_block_stop',index:0})
    +frame('message_delta',{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:20}})
    +frame('message_stop',{type:'message_stop'}));
}
const supplier=httpServer(async(request,response)=>{
  try{
    if(request.method!=='POST'||!request.url?.startsWith('/v1/messages')){response.writeHead(404).end();return;}
    const chunks:Buffer[]=[];let size=0;
    for await(const part of request){size+=part.length;if(size>8*1024*1024)throw Error('FIXTURE_REQUEST_TOO_LARGE');chunks.push(Buffer.from(part));}
    if(request.url.includes('count_tokens')){response.writeHead(200,{'content-type':'application/json'}).end('{"input_tokens":100}');return;}
    assert.equal(request.headers['x-api-key'],secret);
    const body=JSON.parse(Buffer.concat(chunks).toString()) as {model:string;messages:unknown};
    assert.equal(body.model,'original-host-model');
    seenAttachment ||= JSON.stringify(body.messages).includes('@myagents_files/remote-mobile/');
    calls++;reply(response);
  }catch{response.writeHead(500).end();}
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
  await writeFile(join(root,'credentials','provider-key'),randomBytes(32),{mode:0o600});
  await new Promise<void>(yes=>supplier.listen(0,'127.0.0.1',yes));
  const address=supplier.address();assert(address&&typeof address!=='string');
  const baseUrl=`http://127.0.0.1:${address.port}`;
  const operator=child(process.execPath,['--import','tsx',join(repository,'src/test/fixtures/mobile-original-host-operator.ts'),workspace,baseUrl]);
  assert.equal((await once(operator,'exit'))[0],0,'original local operator configuration failed');
  record('local-operator-configured');
  const require=createRequire(import.meta.url);
  await mkdir(join(root,'claude-agent-sdk'),{mode:0o700});
  const triple=process.platform==='darwin'?`darwin-${process.arch}`:`linux-${process.arch}`;
  await symlink(require.resolve(`@anthropic-ai/claude-agent-sdk-${triple}/claude`),join(root,'claude-agent-sdk','claude'));
  for(const [entry,target] of [['src/host/main.ts','host-main.mjs'],['src/server/host-session-worker.ts','host-session-worker.mjs']])await build({entryPoints:[join(repository,entry)],outfile:join(root,target),bundle:true,platform:'node',format:'esm',logLevel:'silent',
    banner:{js:'import {createRequire as __createRequire} from "module"; const require=__createRequire(import.meta.url);'},
    external:['playwright','playwright/*','playwright-core','playwright-core/*','@playwright/mcp','@playwright/mcp/*']});
  listener.listen(socketPath);await once(listener,'listening');await chmod(socketPath,0o660);
  const entry=join(root,'host-main.mjs');
  const hostArgs=process.platform==='linux'?['--exclusive','--nonblock','--no-fork',join(state,'host.lock'),process.execPath,entry,'--serve']:[entry,'--serve'];
  const host=child(process.platform==='linux'?'/usr/bin/flock':process.execPath,hostArgs,{...env,
    MYAGENTS_HOST_STATE_DIR:state,MYAGENTS_HOST_SOCKET:join(root,'control.sock'),MYAGENTS_HOST_MANAGEMENT_IPC:socketPath,
    MYAGENTS_HOST_MANAGEMENT_NETWORK_UID:String(process.getuid!()),MYAGENTS_HOST_MANAGEMENT_GID:String(process.getgid!()),MYAGENTS_HOST_MODE:'1',
    CREDENTIALS_DIRECTORY:join(root,'credentials'),MYAGENTS_HOST_PROVIDER_KEY_CREDENTIAL:'provider-key'});
  await wait('real Host startup',async()=>{if(host.exitCode!==null)throw Error('FIXTURE_HOST_EXITED');return peer&&diagnostics.includes('management IPC connected')?true:undefined;});
  const rejected=await management('config.provider.set',{provider:{id:'forbidden-loopback',name:'Forbidden portable loopback',apiProtocol:'anthropic',authType:'api_key',baseUrl},model:'original-host-model',workspace:{rootId:'workspaces',relativePath:'default'},executionAuthorized:true,expectedRevision:0,mutationId:randomUUID()});
  assert.equal((rejected.result as {kind:string}).kind,'error');
  const configured=await management('config.set',{providerId:'moonshot-coding',model:'k3',executionAuthorized:true,expectedRevision:0,mutationId:randomUUID()});
  assert.equal((configured.result as {status:string}).status,'persisted');
  const credential=await management('credential.provider.set',{providerId:'original-host-fixture',credential:secret,expectedRevision:0,mutationId:randomUUID()});
  assert.equal((credential.result as {status:string}).status,'persisted');
  const identity=JSON.parse(await readFile(join(state,'host-identity.json'),'utf8')) as {hostId:string};
  const binding=randomUUID(),connectionEpoch=randomUUID();
  const device={serviceId:'fixture-service',environment:'fixture',networkId:'fixture-network',principalId:'fixture-principal',deviceId:identity.hostId,keyGeneration:1};
  authority={connection:{serviceId:device.serviceId,networkId:device.networkId,bootEpoch:randomUUID(),connectionEpoch},local:device,
    peer:{...device,deviceId:randomUUID()},peerEpoch:randomUUID(),accountBinding:binding,managementBinding:binding};
  const operationId=randomUUID();
  const first=await mobile({kind:'mobile.start',operationId,text:'First original Host loopback turn.',assetIds:[]});
  record('mobile-start-receipt',first.result);
  const receipt=await wait('accepted start',async()=>{const r=(await mobile({kind:'mobile.receipt',operationId})).result as Record<string,unknown>;if(r.status==='rejected'||r.status==='unconfirmed')throw Error(`FIXTURE_START_${r.status}:${r.code}`);return r.status==='accepted'?r:undefined;});
  const sessionId=String(receipt.sessionId);assert.match(sessionId,/^[0-9a-f-]{36}$/);
  const completed=await wait('actual first terminal',async()=>{const s=await remote({kind:'get',sessionId,limit:30});return s.terminal==='complete'&&s.state==='idle'?s:undefined;});
  assert(JSON.stringify(completed.messages).includes('Original Host local supplier completion'));
  const hint=(await wait('original terminal notification',async()=>{const r=(await source()).result as Record<string,unknown>;return r.kind==='source.hint'?r:undefined;}));
  assert.equal(hint.agentId,'original-host-agent');assert.equal(hint.sessionId,sessionId);assert.equal(hint.connectionEpoch,connectionEpoch);
  assert.deepEqual(Object.keys(hint).sort(),['agentId','connectionEpoch','kind','sessionId','sourceEventId'].sort());
  assert.deepEqual((await source()).result,hint);record('original-terminal-generic-source',hint);
  const callsAfterStart=calls;assert.deepEqual((await mobile({kind:'mobile.start',operationId,text:'First original Host loopback turn.',assetIds:[]})).result,receipt);
  assert.equal(calls,callsAfterStart);record('start-retry-no-session-replay');
  const sendId=randomUUID(),assetId=randomUUID(),bytes=Buffer.from('Original Host fixture attachment bytes.\n');
  const sha256=createHash('sha256').update(bytes).digest('hex');
  for(const operation of [
    {kind:'asset.stage.begin',agentId:'original-host-agent',sessionId,assetId,name:'fixture.txt',mimeType:'text/plain',sizeBytes:bytes.length,sha256},
    {kind:'asset.stage.chunk',agentId:'original-host-agent',sessionId,assetId,offset:0,dataBase64:bytes.toString('base64'),sha256},
    {kind:'asset.stage.finish',agentId:'original-host-agent',sessionId,assetId},
  ]){const response=await internal(operation);assert.notEqual((response.result as {kind:string}).kind,'error');}
  await mobile({kind:'mobile.send',operationId:sendId,sessionId,text:'Second original Host turn with a real uploaded file.',assetIds:[assetId]});
  await wait('accepted send',async()=>{const r=(await mobile({kind:'mobile.receipt',operationId:sendId})).result as Record<string,unknown>;if(r.status==='rejected'||r.status==='unconfirmed')throw Error(`FIXTURE_SEND_${r.status}:${r.code}`);return r.status==='accepted'?r:undefined;});
  await wait('actual second terminal',async()=>{const s=await remote({kind:'get',sessionId,limit:30});return s.terminal==='complete'&&s.state==='idle'&&JSON.stringify(s.messages).includes('Second original Host turn')?s:undefined;});
  const materialized=join(workspace,'myagents_files','remote-mobile',sessionId,sendId,`${assetId}.txt`);
  assert.deepEqual(await readFile(materialized),bytes);assert(seenAttachment,'supplier did not see original worker attachment reference');
  const index=JSON.parse(await readFile(join(home,'.myagents','sessions.json'),'utf8')) as Array<{id:string;providerId:string;sdkSessionId?:string}>;
  assert.equal(index.filter(item=>item.id===sessionId).length,1);assert.equal(index.find(item=>item.id===sessionId)?.providerId,'original-host-fixture');
  record('real-session-and-file-persisted',{sessionId,attachmentBytes:bytes.length,sha256,supplierCalls:calls});
  const artifacts=await internal({kind:'assets.request',request:{version:1,kind:'list',agentId:'original-host-agent',sessionId,limit:30}});
  record('artifact-owner-projection',artifacts.result);
  record('PASS',{elapsedMs:Date.now()-started,scope:'actual main + worker + SessionEngine/Store + native SDK, synthetic loopback supplier; no WSS/provider/phone acceptance'});
}catch(error){record('FAIL',{error:error instanceof Error?error.message:'unknown',privateFixture:root});process.exitCode=1;}
finally{
  // Every owned process was born detached; signal only its exact birth PGID.
  for(const processChild of children.reverse())if(processChild.pid&&processChild.exitCode===null){try{process.kill(-processChild.pid,'SIGTERM');}catch{/* already exited */}await Promise.race([once(processChild,'exit').catch(()=>{}),new Promise(r=>setTimeout(r,1500))]);if(processChild.exitCode===null)try{process.kill(-processChild.pid,'SIGKILL');}catch{/* group exited */}}
  peer?.destroy();for(const waiter of pending.values()){clearTimeout(waiter.timer);waiter.reject(Error('FIXTURE_CLOSED'));}pending.clear();
  supplier.closeAllConnections();supplier.close();listener.close();
  await writeFile(join(root,'diagnostics.private.log'),diagnostics,{mode:0o600});
  await writeFile(join(root,'evidence.jsonl'),evidence.join('\n')+'\n',{mode:0o600});
  const sourceFiles=await readdir(join(state,'mobile-notify-source-v1')).catch(()=>[]);
  console.log(JSON.stringify({privateFixture:root,evidence:join(root,'evidence.jsonl'),sourceFiles:sourceFiles.length}));
}
