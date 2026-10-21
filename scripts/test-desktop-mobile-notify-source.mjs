#!/usr/bin/env node
// Isolated contract: actual dispatcher body/policy and actual queue. Platform,
// AppState and opaque claim are test adapters, NOT native authority acceptance.
// Uses explicit immutable Rust dependency inputs; never invokes Cargo or an App.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--expect-red') { options.red = true; continue; }
  if (!['--deps-dir', '--extern-manifest', '--dispatcher-source'].includes(args[i]) || !args[i + 1]) {
    throw Error('Use --deps-dir ABS_PATH [--extern-manifest JSON] [--dispatcher-source ABS_PATH] [--expect-red]');
  }
  options[args[i].slice(2)] = args[++i];
}
const deps = options['deps-dir'];
if (!deps || !path.isAbsolute(deps) || !fs.statSync(deps).isDirectory()) throw Error('Explicit dependency directory required');
const dependencyNames = ['serde', 'serde_json', 'sha2', 'uuid', 'jsonwebtoken', 'libc', 'chrono', 'myagents_agent_network_protocol'];
const declared = options['extern-manifest'] ? JSON.parse(fs.readFileSync(options['extern-manifest'], 'utf8')) : null;
if (declared && Object.keys(declared).some(name => !dependencyNames.includes(name))) throw Error('Unknown dependency');
const externs = [];
const evidence = [];
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
for (const name of dependencyNames) {
  const entry = declared?.[name];
  const candidates = fs.readdirSync(deps).filter(file => new RegExp(`^lib${name}-[a-f0-9]+\\.rlib$`).test(file));
  const file = entry?.file ?? (candidates.length === 1 ? candidates[0] : null);
  if (!file || path.basename(file) !== file || !candidates.includes(file)) throw Error(`Ambiguous/missing ${name}; supply exact --extern-manifest`);
  const source = path.join(deps, file);
  const stat = fs.lstatSync(source);
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error(`Invalid dependency ${name}`);
  const digest = sha256(fs.readFileSync(source));
  if (entry?.sha256 && entry.sha256 !== digest) throw Error(`Dependency digest changed: ${name}`);
  evidence.push({ name, file, sha256: digest });
  externs.push('--extern', `${name}=${source}`);
}
const dispatcherPath = options['dispatcher-source'] ?? path.join(root, 'src-tauri/src/notification.rs');
if (!path.isAbsolute(dispatcherPath)) throw Error('Dispatcher source must be absolute');
const dispatcher = fs.readFileSync(dispatcherPath, 'utf8');
const queuePath = path.join(root, 'src-tauri/src/agent_network/notification_source_queue.rs');
const queue = fs.readFileSync(queuePath);
function uniqueIndex(text, anchor) {
  const i = text.indexOf(anchor);
  if (i < 0 || text.indexOf(anchor, i + 1) >= 0) throw Error(`Changed/ambiguous production anchor: ${anchor}`);
  return i;
}
const declaration = uniqueIndex(dispatcher, 'pub struct SessionCompletionTurnOwner');
const typesStart = dispatcher.lastIndexOf('#[derive', declaration);
const typesEnd = uniqueIndex(dispatcher, 'fn should_show_session_completion');
const bodyStart = uniqueIndex(dispatcher, 'pub(crate) fn submit_session_completion');
const bodyEnd = uniqueIndex(dispatcher, '/// Send an OS notification.');
if (typesStart < 0 || !(typesStart < typesEnd && typesEnd < bodyStart && bodyStart < bodyEnd)
    || !dispatcher.slice(bodyStart, bodyEnd).includes('_claim: crate::sidecar::SessionCompletionClaim')) {
  throw Error('Production dispatcher layout/signature changed; review the adapter');
}
const adapters = String.raw`
#![allow(dead_code)]
use serde::Deserialize;
use std::sync::Arc;
trait Runtime {} struct TestRuntime; impl Runtime for TestRuntime {}
struct AppHandle<R:Runtime>{focused:bool,mobile:Arc<dyn Fn()+Send+Sync>,marker:std::marker::PhantomData<R>}
macro_rules! ulog_debug {($($args:tt)*)=>{let _=format_args!($($args)*);};}
mod sidecar {pub struct SessionCompletionClaim{_private:()} pub fn fixture_claim()->SessionCompletionClaim{SessionCompletionClaim{_private:()}}}
mod i18n {pub fn current_locale(){} pub fn t(_:&str,_:())->String{String::new()}}
mod notification_badge {pub enum NotificationBadgeTarget{Session{session_id:String,workspace_path:String}}}
struct NotificationBadgeIncrement{id:String,source:String,created_at:i64,target:notification_badge::NotificationBadgeTarget}
struct NotificationNavigation; impl NotificationNavigation{fn for_session(_:Option<String>,_:String,_:String)->Option<Self>{Some(Self)}}
fn show_with_navigation_target_and_badge<R:Runtime>(_:&AppHandle<R>,_:String,_:String,_:Option<NotificationNavigation>,_:Option<NotificationBadgeIncrement>){}
fn should_show_session_completion<R:Runtime>(app:&AppHandle<R>)->bool{!app.focused}
mod agent_network {
 #[derive(Debug)] pub struct NetworkError{pub code:String} impl NetworkError{pub fn new(code:&'static str)->Self{Self{code:code.into()}}}
 #[path=__QUEUE_PATH__] mod queue;
 pub mod notification_source {
  pub(crate) fn observe_claimed_completion<R:crate::Runtime>(app:&crate::AppHandle<R>,_:&crate::SessionCompletionTerminal,_:&crate::sidecar::SessionCompletionClaim){(app.mobile)();}
 }
 fn dispatch(focused:bool,owner:Option<&str>)->bool {
  use myagents_agent_network_protocol::{DeviceScope,ConnectionScope};
  let id=||uuid::Uuid::new_v4().to_string();
  let local=DeviceScope{service_id:id(),environment:"development".into(),network_id:id(),principal_id:id(),device_id:id(),key_generation:1};
  let connection=ConnectionScope{service_id:local.service_id.clone(),network_id:local.network_id.clone(),boot_epoch:id(),connection_epoch:id()};
  let root=std::env::temp_dir().join(format!("desktop-source-composition-{}",id()));
  let source=std::sync::Arc::new(queue::DesktopNotificationSource::new(Some(root.clone())));
  let active=queue::Activation{scope:queue::SourceScope{issuer:"https://desktop-source.test".into(),local,account_binding:id()},connection,generation:1};
  source.activate(active.clone()).unwrap();
  let session=id();let turn=id();let sink=source.clone();let captured=active.clone();let captured_session=session.clone();let workspace=root.clone();
  let app=crate::AppHandle::<crate::TestRuntime>{focused,mobile:std::sync::Arc::new(move||sink.observe(&captured,&captured_session,&workspace,"terminal:original-turn").unwrap()),marker:std::marker::PhantomData};
  crate::submit_session_completion(&app,crate::SessionCompletionTerminal{session_id:session,workspace_path:root.to_string_lossy().into(),turn_id:turn,
   turn_owner:owner.map(|kind|crate::SessionCompletionTurnOwner{kind:kind.into(),id:"original-owner".into()}),
   origin:crate::SessionCompletionOrigin{kind:"desktop".into(),surface:"launcher_input".into()},status:crate::SessionCompletionStatus::Complete},crate::sidecar::fixture_claim());
  let queued=source.peek(&active).unwrap().is_some();let _=std::fs::remove_dir_all(root);queued
 }
 #[test] fn claimed_completion_mobile_source_ignores_desktop_focus(){assert!(dispatch(true,None),"MOBILE_SOURCE_SUPPRESSED_BY_DESKTOP_FOCUS");}
 #[test] fn claimed_completion_mobile_source_preserves_background_path(){assert!(dispatch(false,None));}
 #[test] fn original_task_and_goal_eligibility_remains_closed(){assert!(!dispatch(false,Some("task")));assert!(!dispatch(true,Some("goal")));}
}
`;
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moxbots-desktop-source-contract-'));
const harness = path.join(directory, 'contract.rs');
const binary = path.join(directory, 'contract-tests');
fs.writeFileSync(harness, adapters.replace('__QUEUE_PATH__', JSON.stringify(queuePath)) + '\n'
  + dispatcher.slice(typesStart, typesEnd) + '\n' + dispatcher.slice(bodyStart, bodyEnd));
const compiled = spawnSync('rustc', ['--edition=2021', '--test', harness, '-L', `dependency=${deps}`, '-o', binary, ...externs],
  { cwd: root, encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
fs.writeFileSync(path.join(directory, 'compile.log'), `${compiled.stdout ?? ''}${compiled.stderr ?? ''}`);
if (compiled.error || compiled.status !== 0) throw Error(`Contract compilation failed; not RED: ${directory}`);
const run = spawnSync(binary, options.red
  ? ['--exact', 'agent_network::claimed_completion_mobile_source_ignores_desktop_focus', '--nocapture'] : ['--nocapture'],
  { cwd: directory, encoding: 'utf8', timeout: 20_000, maxBuffer: 4 * 1024 * 1024 });
const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
fs.writeFileSync(path.join(directory, 'tests.log'), output);
const passed = !run.error && (options.red
  ? run.status === 101 && output.includes('MOBILE_SOURCE_SUPPRESSED_BY_DESKTOP_FOCUS')
  : run.status === 0);
const report = { passed, expected: options.red ? 'RED' : 'GREEN', exit: run.status,
  dispatcherPath, dispatcherSha256: sha256(dispatcher), queueSha256: sha256(queue), dependencyArtifacts: evidence,
  boundaries: 'Actual dispatcher function/policy and queue; isolated platform/AppState/claim/error adapters. No native manager, App/Reader, cloud, provider, device or CI execution.', directory };
fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
if (!passed) process.exitCode = 1;
