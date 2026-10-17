/** Explicit, ignored loopback acceptance. No account credentials or public binds. */
import { spawn, execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, readFile, lstat, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
if(process.argv.slice(2).some(arg=>arg!=='--assets'))throw Error('Only --assets mode is supported');
const assetsMode=process.argv.includes('--assets');
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(Number(process.versions.node.split('.')[0])<24)throw Error('Original Host requires Node24');
const sleep=ms=>new Promise(yes=>setTimeout(yes,ms));
function birth(pid){try{return execFileSync('/bin/ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8'}).trim();}catch{return '';}}
function signalOwned(record,signal){if(record.pid>0&&record.birth&&birth(record.pid)===record.birth)try{process.kill(record.group?-record.pid:record.pid,signal);}catch{/* exited */}}
async function fixtureCleanup(stderr){
  const root=stderr.match(/^private-fixture-root=(.+)$/m)?.[1];if(!root)return;
  const parent=await realpath(homedir());
  if(!root.startsWith(join(parent,'.mxe-'))||dirname(root)!==parent)return;
  const meta=await lstat(root);if(!meta.isDirectory()||meta.isSymbolicLink()||meta.uid!==process.getuid?.()||(meta.mode&0o777)!==0o700||await realpath(root)!==root)throw Error('Fixture cleanup root identity mismatch');
  // Normal failure first asks the existing Node owner to stop/reap the Host/SDK.
  await writeFile(join(root,'stop'),'stop',{mode:0o600});await sleep(2500);
  const owned=[...stderr.matchAll(/^fixture-owned-process name=\S+ pid=(\d+) pgid=\d+ birth=(.+)$/gm)].map(m=>({pid:Number(m[1]),birth:m[2],group:true}));
  const log=await readFile(join(root,'node.log'),'utf8').catch(()=>'');
  for(const line of log.split('\n')){let event;try{event=JSON.parse(line);}catch{continue;}
    if(!event||typeof event!=='object')continue;
    if(event.event==='host-born')owned.push({pid:event.pid,birth:event.birth,group:true});
    if(event.event==='actual-host-process-tree')for(const process of event.processes)owned.push({pid:process.pid,birth:process.birth,group:false});
  }
  for(const record of owned.reverse())signalOwned(record,'SIGTERM');await sleep(1000);
  for(const record of owned)signalOwned(record,'SIGKILL');
}
async function run(command,args,env,timeout=600_000){
  return new Promise((yes,no)=>{
    const child=spawn(command,args,{cwd:repo,env,detached:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',timingOut=false;
    const owned={pid:child.pid,birth:birth(child.pid),group:true};
    child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>{stderr+=chunk;process.stderr.write(chunk);});
    const timer=setTimeout(async()=>{timingOut=true;try{await fixtureCleanup(stderr);}catch(error){process.stderr.write(`Owned cleanup failed: ${String(error)}\n`);}signalOwned(owned,'SIGTERM');await sleep(1000);signalOwned(owned,'SIGKILL');},timeout);
    child.on('error',error=>{clearTimeout(timer);no(error);});child.on('exit',async(code,signal)=>{clearTimeout(timer);if(code===0&&!timingOut)yes(stdout);else {if(!timingOut)try{await fixtureCleanup(stderr);}catch(error){process.stderr.write(`Owned failure cleanup failed: ${String(error)}\n`);}for(const line of stdout.split('\n')){try{const diagnostic=JSON.parse(line);if(diagnostic.reason==='compiler-message'&&diagnostic.message?.level==='error')process.stderr.write(diagnostic.message.rendered??diagnostic.message.message);}catch{/* ordinary stdout */}}
      no(Error(`Owned command failed code=${code} signal=${signal}: ${stderr.slice(-1000)}`));}});
  });
}
async function build(manifest,name,target){
  const env={...process.env};if(target)env.CARGO_TARGET_DIR=target;
  const output=await run('cargo',['test','--manifest-path',manifest,'--locked','--lib','--no-run','--message-format=json'],env);
  const artifacts=output.split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
  const executable=artifacts.find(a=>a.reason==='compiler-artifact'&&a.target?.name===name&&a.executable)?.executable;
  if(!executable)throw Error(`Original test binary absent: ${manifest}`);return executable;
}
const service=await build('services/agentnet/Cargo.toml','myagents_agentnet_service',process.env.MOXBOTS_FULL_SERVICE_TARGET);
const host=await build('src-tauri/headless-network/Cargo.toml','myagents_host_network',process.env.MOXBOTS_FULL_HOST_TARGET);
const mobile=await build('mobile/connection/Cargo.toml','mox_mobile_connection',process.env.MOXBOTS_FULL_MOBILE_TARGET);
const result=await run(mobile,['runtime::full_host_e2e_test::original_mobile_wss_host_chain','--ignored','--exact','--nocapture'],{...process.env,MOXBOTS_FULL_SERVICE_TEST_BIN:service,MOXBOTS_FULL_HOST_TEST_BIN:host,MOXBOTS_FULL_NODE:process.execPath,MOXBOTS_FULL_MODE:assetsMode?'assets':'text'},process.env.MOXBOTS_FULL_TIMEOUT_CHECK==='1'?10_000:150_000);
process.stdout.write(result);
