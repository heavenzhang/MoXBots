/** Explicit, ignored loopback acceptance. No account credentials or public binds. */
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(Number(process.versions.node.split('.')[0])<24)throw Error('Original Host requires Node24');
async function run(command,args,env,timeout=600_000){
  return new Promise((yes,no)=>{
    const child=spawn(command,args,{cwd:repo,env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
    child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>{stderr+=chunk;process.stderr.write(chunk);});
    const timer=setTimeout(()=>{child.kill('SIGTERM');},timeout);
    child.on('error',no);child.on('exit',(code,signal)=>{clearTimeout(timer);if(code===0)yes(stdout);else no(Error(`Owned command failed code=${code} signal=${signal}: ${stderr.slice(-1000)}`));});
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
const result=await run(mobile,['runtime::full_host_e2e_test::original_mobile_wss_host_chain','--ignored','--exact','--nocapture'],{...process.env,MOXBOTS_FULL_SERVICE_TEST_BIN:service,MOXBOTS_FULL_HOST_TEST_BIN:host,MOXBOTS_FULL_NODE:process.execPath},150_000);
process.stdout.write(result);
