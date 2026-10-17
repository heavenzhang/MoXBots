/** Explicit test process: actual durable source owner + protected IPC, no executor. */
import {readFile,writeFile,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {HostNotificationSource} from '../../host/mobile-notify-source';
import {connectHostManagementIpc,type LocalSourceAuthority} from '../../host/management-ipc';
const root=process.argv[2]!;
const config=JSON.parse(await readFile(join(root,'node-config.json'),'utf8')) as {socket:string;deviceId:string;authority:LocalSourceAuthority;pointer:{agentId:string;sessionId:string;workerGeneration:string;observation:string}};
const source=new HostNotificationSource(join(root,'node-outbox'),async item=>item.agentId===config.pointer.agentId&&item.sessionId===config.pointer.sessionId&&item.workerGeneration===config.pointer.workerGeneration);
source.activate(config.authority);
if(process.argv[3]==='observe')await source.observe(config.authority,config.pointer);
let stopped=false;
let sessionExecutions=0;try{sessionExecutions=JSON.parse(await readFile(join(root,'execution-count.json'),'utf8')).count;}catch{/* first isolated start */}
await writeFile(join(root,'execution-count.json'),JSON.stringify({count:sessionExecutions}),{mode:0o600});
const client=await connectHostManagementIpc({socketPath:config.socket,expectedUid:process.getuid!(),expectedGid:process.getgid!(),expectedDeviceId:config.deviceId,isShuttingDown:()=>stopped,dispatch:async()=>{sessionExecutions++;await writeFile(join(root,'execution-count.json'),JSON.stringify({count:sessionExecutions}),{mode:0o600});throw Error('NO_SESSION_EXECUTOR_IN_FIXTURE');},dispatchLocalSource:async(authority,operation)=>{
  let mode='normal';try{mode=(await readFile(join(root,'ack-mode'),'utf8')).trim();}catch{/* default */}
  if(operation.kind==='source.ack'&&mode==='before')throw Error('SOURCE_ACK_LOST');
  const result=await source.request(authority,operation);
  if(operation.kind==='source.ack'&&mode==='after'){stopped=true;void client.close();throw Error('SOURCE_ACK_LOST');}
  return result;
}});
await writeFile(join(root,'node-ready'),JSON.stringify({pid:process.pid,sessionExecutions:0}));await chmod(join(root,'node-ready'),0o600);
const timer=setInterval(async()=>{try{await readFile(join(root,'node-stop'));stopped=true;clearInterval(timer);await client.close();process.exit(0);}catch{/* only local stop file */}},20);
