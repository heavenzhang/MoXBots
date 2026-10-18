/** Explicit original Host + real SessionEngine/SDK/native child loopback. No paid inference. */
import {strict as assert} from 'node:assert';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
import {createServer as httpServer,type ServerResponse} from 'node:http';
import {once} from 'node:events';
import {chmod,mkdir,writeFile,readFile,symlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {crc32,deflateSync} from 'node:zlib';


const repository=resolve(import.meta.dirname,'../..');
const root=resolve(process.argv[2]);
const mode=process.argv[3]??'text';assert(['text','assets'].includes(mode));
assert(root.startsWith('/'));
await chmod(root,0o700);
const state=join(root,'state'),home=join(state,'home'),workspace=join(state,'workspaces','default');
const ipcDirectory=join(root,'ipc'),socketPath=join(ipcDirectory,'management.sock');
const secret=randomBytes(32).toString('base64url');
const children:ChildProcess[]=[];
let diagnostics='',calls=0,seenAttachment=false,hostPid:number|undefined,hostBirth:string|undefined;
const evidence:string[]=[];
const supplierObservations:Array<{call:number;fileReference:boolean;images:Array<{mimeType:string;sizeBytes:number;sha256:string}>}>=[];
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
function fixturePng(){
  const width=128,height=128,rows=Buffer.alloc(height*(width*3+1));
  for(let y=0;y<height;y++)randomBytes(width*3).copy(rows,y*(width*3+1)+1);
  const chunk=(type:string,data:Buffer)=>{const tag=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);tag.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([tag,data])),data.length+8);return out;};
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
function imageBlocks(value:unknown):Array<{mimeType:string;sizeBytes:number;sha256:string}>{
  if(Array.isArray(value))return value.flatMap(imageBlocks);
  if(!value||typeof value!=='object')return [];
  const object=value as Record<string,unknown>;const source=object.source as Record<string,unknown>|undefined;
  if(object.type==='image'&&source?.type==='base64'&&typeof source.data==='string'&&typeof source.media_type==='string'){const bytes=Buffer.from(source.data,'base64');return [{mimeType:source.media_type,sizeBytes:bytes.length,sha256:digest(bytes)}];}
  return Object.values(object).flatMap(imageBlocks);
}
const descendants=new Map<number,{pid:number;ppid:number;pgid:number;birth:string;command:string}>();
function record(event:string,value:unknown={}) {const line=JSON.stringify({event,...value as object});evidence.push(line);console.log(line);}
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
    calls++;supplierObservations.push({call:calls,fileReference:JSON.stringify(body.messages).includes('@myagents_files/remote-mobile/'),images:imageBlocks(body.messages)});captureProcesses();reply(response);
  }catch{response.writeHead(500).end();}
});

process.once('SIGTERM',()=>{void writeFile(join(root,'stop'),'stop',{mode:0o600});});
async function control(path:string,body:unknown){
  const {request}=await import('node:http');
  return new Promise<Record<string,unknown>>((yes,no)=>{const call=request({socketPath:join(root,'control.sock'),path,method:'POST',headers:{'content-type':'application/json'}},response=>{let data='';response.on('data',c=>data+=c);response.on('end',()=>{try{const value=JSON.parse(data);assert(value.ok,JSON.stringify(value));yes(value.data);}catch(e){no(e);}});});call.on('error',no);call.end(JSON.stringify(body));});
}
try{
  assert(process.getuid!()>0);
  await symlink(join(repository,'node_modules'),join(root,'node_modules'));
  for(const directory of [home,workspace,join(root,'credentials'),ipcDirectory])await mkdir(directory,{recursive:true,mode:0o700});
  await chmod(state,0o700);await chmod(ipcDirectory,0o750);
  await writeFile(join(state,'host.lock'),'',{mode:0o600});
  if(mode==='assets'){
    const inputs=join(root,'fixture-inputs');await mkdir(inputs,{mode:0o700});
    const files=[{name:'fixture.txt',mimeType:'text/plain',bytes:Buffer.from('Original Host fixture attachment bytes.\n')},{name:'fixture.png',mimeType:'image/png',bytes:fixturePng()}];
    for(const file of files)await writeFile(join(inputs,file.name),file.bytes,{mode:0o600});
    await writeFile(join(inputs,'manifest.json'),JSON.stringify(files.map(({name,mimeType,bytes})=>({name,mimeType,sizeBytes:bytes.length,sha256:digest(bytes)}))),{mode:0o600});
  }
  const masterKey=randomBytes(32);
  await writeFile(join(root,'credentials','provider-key'),masterKey,{mode:0o600});
  await new Promise<void>(yes=>supplier.listen(0,'127.0.0.1',yes));
  const address=supplier.address();assert(address&&typeof address!=='string');
  const baseUrl=`http://127.0.0.1:${address.port}`;
  const require=createRequire(import.meta.url);await mkdir(join(root,'claude-agent-sdk'),{mode:0o700});
  const triple=process.platform==='darwin'?`darwin-${process.arch}`:`linux-${process.arch}`;
  await symlink(require.resolve(`@anthropic-ai/claude-agent-sdk-${triple}/claude`),join(root,'claude-agent-sdk','claude'));
  for(const [entry,target] of [['src/host/main.ts','host-main.mjs'],['src/server/host-session-worker.ts','host-session-worker.mjs']])await build({entryPoints:[join(repository,entry)],outfile:join(root,target),bundle:true,platform:'node',format:'esm',logLevel:'silent',banner:{js:'import {createRequire as __createRequire} from "module"; const require=__createRequire(import.meta.url);'},external:['playwright','playwright/*','playwright-core','playwright-core/*','@playwright/mcp','@playwright/mcp/*']});
  const entry=join(root,'host-main.mjs');const args=process.platform==='linux'?['--exclusive','--nonblock','--no-fork',join(state,'host.lock'),process.execPath,entry,'--serve']:[entry,'--serve'];
  const hostEnvironment={...env,MYAGENTS_HOST_STATE_DIR:state,MYAGENTS_HOST_SOCKET:join(root,'control.sock'),MYAGENTS_HOST_MANAGEMENT_IPC:socketPath,MYAGENTS_HOST_MANAGEMENT_NETWORK_UID:String(process.getuid!()),MYAGENTS_HOST_MANAGEMENT_GID:String(process.getgid!()),MYAGENTS_HOST_MODE:'1',CREDENTIALS_DIRECTORY:join(root,'credentials'),MYAGENTS_HOST_PROVIDER_KEY_CREDENTIAL:'provider-key'};
  async function startHost(management=true){
    const host=child(process.platform==='linux'?'/usr/bin/flock':process.execPath,args,management?hostEnvironment:{...hostEnvironment,MYAGENTS_HOST_MANAGEMENT_IPC:undefined,MYAGENTS_HOST_MANAGEMENT_NETWORK_UID:undefined,MYAGENTS_HOST_MANAGEMENT_GID:undefined});
    hostPid=host.pid;hostBirth=processRows().find(r=>r.pid===hostPid)?.birth;record('host-born',{pid:hostPid,pgid:hostPid,birth:hostBirth});
    const status=await wait('original Host socket',async()=>{if(host.exitCode!==null)throw Error('Host exited');try{return await control('/host/status',{});}catch{return undefined;}});
    return {host,status};
  }
  // Only original main creates and persists the synthetic Host ID. Stop it
  // before local encrypted credential setup to preserve its single writer.
  for(const path of [join(state,'host-identity.json'),join(home,'.myagents','config.json'),join(home,'.myagents','projects.json')])
    await assert.rejects(readFile(path),{code:'ENOENT'});
  const initial=await startHost(false);await wait('original bootstrap ready',async()=>diagnostics.includes('MyAgents Host ready')?true:undefined);
  const deviceId=initial.status.hostId;assert.equal(typeof deviceId,'string');
  assert.equal(initial.status.configured,false);assert.equal(initial.status.activeSession,null);assert.equal(calls,0);
  const originalIdentity=await readFile(join(state,'host-identity.json'));
  assert.equal(JSON.parse(originalIdentity.toString()).hostId,deviceId);
  assert.deepEqual(JSON.parse(await readFile(join(home,'.myagents','config.json'),'utf8')),{agents:[]});
  assert.deepEqual(JSON.parse(await readFile(join(home,'.myagents','projects.json'),'utf8')),[]);
  await stop(initial.host);assert.equal(initial.host.exitCode,0,'original bootstrap did not stop cleanly');
  // Operator configuration must follow original authority initialization. Never
  // seed a registry before its identity or weaken established-authority checks.
  const operator=child(process.execPath,['--import','tsx',join(repository,'src/test/fixtures/mobile-original-host-operator.ts'),workspace,baseUrl]);
  assert.equal((await once(operator,'exit'))[0],0,'operator setup failed');
  assert.deepEqual(await readFile(join(state,'host-identity.json')),originalIdentity);
  const configuredRegistry=await Promise.all(['config.json','projects.json'].map(name=>readFile(join(home,'.myagents',name))));
  const storePath=join(state,'provider-credentials');
  const {createHostProviderCredentialOwner}=await import('../../src/host/provider-credentials');
  const owner=createHostProviderCredentialOwner({hostId:deviceId as string,storePath,loadMasterKey:()=>Buffer.from(masterKey)});
  assert.equal((await owner.write({providerId:'original-host-fixture',credential:secret,expectedRevision:0,mutationId:randomUUID()})).status,'persisted');
  const restarted=await startHost();assert.equal(restarted.status.hostId,deviceId);
  assert.deepEqual(await readFile(join(state,'host-identity.json')),originalIdentity);
  assert.deepEqual(await Promise.all(['config.json','projects.json'].map(name=>readFile(join(home,'.myagents',name)))),configuredRegistry);
  await control('/host/configure',{providerId:'moonshot-coding',model:'k3',executionAuthorized:true,expectedRevision:0,mutationId:randomUUID()});
  await writeFile(join(root,'host-ready.json'),JSON.stringify({deviceId}),{mode:0o600});
  await wait('fixture completion',async()=>{try{await readFile(join(root,'stop'));return true;}catch{return undefined;}},150_000);
  const sessions=JSON.parse(await readFile(join(home,'.myagents','sessions.json'),'utf8').catch(()=>'[]'));
  const materialized:Array<{name:string;sizeBytes:number;sha256:string}>=[];
  if(mode==='assets'){
    const expected=JSON.parse(await readFile(join(root,'assets-expectation.json'),'utf8')) as {sessionId:string;operationId:string;textAssetId:string;imageAssetId:string};
    for(const id of Object.values(expected))assert.match(id,/^[0-9a-f-]{36}$/);
    for(const [name,path] of [['fixture.txt',join(workspace,'myagents_files','remote-mobile',expected.sessionId,expected.operationId,`${expected.textAssetId}.txt`)],['fixture.png',join(home,'.myagents','attachments',expected.sessionId,`${expected.operationId}-${expected.imageAssetId}.png`)]]){
      const actual=await readFile(path),original=await readFile(join(root,'fixture-inputs',name));assert.deepEqual(actual,original);materialized.push({name,sizeBytes:actual.length,sha256:digest(actual)});
    }
    assert.equal(calls,2);assert(supplierObservations[1]?.fileReference);const image=materialized.find(item=>item.name==='fixture.png')!;assert(supplierObservations[1]?.images.some(item=>item.mimeType==='image/png'&&item.sha256===image.sha256&&item.sizeBytes===image.sizeBytes));
  }
  await writeFile(join(root,'host-result.json'),JSON.stringify({calls,seenAttachment,sessions,supplierObservations,materialized}),{mode:0o600});
}catch(error){console.error(String(error));console.error(diagnostics.slice(-6000));process.exitCode=1;}
finally{captureProcesses();for(const c of children.reverse())await stop(c);
  for(const current of processRows()){const born=descendants.get(current.pid);if(born&&born.birth===current.birth)try{process.kill(current.pid,'SIGKILL');}catch{/* already exited */}}
  supplier.closeAllConnections();supplier.close();await writeFile(join(root,'diagnostics.private.log'),diagnostics,{mode:0o600});
}
