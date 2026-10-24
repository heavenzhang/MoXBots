import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

if (process.platform !== 'darwin') throw new Error('Native AppKit quit regression requires macOS.');
const repo = resolve(import.meta.dirname, '..');
const directory = mkdtempSync(resolve(tmpdir(), 'myagents-native-quit-'));
mkdirSync(resolve(directory, 'src'));
copyFileSync(resolve(repo, 'scripts/fixtures/native-quit/main.rs'), resolve(directory, 'src/main.rs'));
copyFileSync(resolve(repo, 'rust-toolchain.toml'), resolve(directory, 'rust-toolchain.toml'));
copyFileSync(resolve(repo, 'src-tauri/Cargo.lock'), resolve(directory, 'Cargo.lock'));
// A reference run changes only the native request-projection dependencies.
const upstream = process.argv.includes('--upstream');
const localPatches = (upstream ? ['tauri'] : ['tauri', 'tao', 'tauri-runtime-wry'])
  .map(name => `${name} = { path = ${JSON.stringify(resolve(repo, 'vendor', name))} }`).join('\n');
writeFileSync(resolve(directory, 'Cargo.toml'), `[package]
name = "myagents-native-quit-smoke"
version = "0.0.0"
edition = "2021"
[dependencies]
tauri = { version = "=2.11.2", features = ["test", "devtools", "macos-private-api", "unstable"] }
serde_json = "1"
dispatch2 = "0.3.1"
objc2 = "0.6"
objc2-app-kit = { version = "0.3.2", features = ["NSApplication"] }
[patch.crates-io]
${localPatches}
[profile.dev]
debug = "line-tables-only"
`);
const target = resolve(process.env.MOXBOTS_NATIVE_FIXTURE_TARGET_DIR ?? resolve(repo, 'src-tauri/target'));
// Keep opt-in fixture compilation bounded; never run the product build here.
const jobs = '2';
console.log(`Native quit regression artifacts: ${directory}; dependencies=${upstream ? 'upstream-reference' : 'patched-pair'}`);
const compiled = spawnSync('cargo', ['build', '--offline', '--jobs', jobs, '--manifest-path', resolve(directory, 'Cargo.toml'), '--target-dir', target], { cwd: repo, stdio: 'inherit' });
if (compiled.error) throw compiled.error;
if (compiled.status !== 0) process.exit(compiled.status ?? 1);
let failed = false;
for (const mode of ['native', 'cancel-confirm', 'native-reentrant', 'last-window', 'explicit', 'restart']) {
  const result = resolve(directory, `${mode}.json`);
  const run = spawnSync(resolve(target, 'debug/myagents-native-quit-smoke'), [mode, result], { cwd: directory, stdio: 'inherit', timeout: 30000, killSignal: 'SIGKILL' });
  const evidence = existsSync(result)
    ? JSON.parse(readFileSync(result, 'utf8'))
    : { mode, success: false, status: run.status, signal: run.signal, error: run.error?.message ?? 'Fixture exited without evidence' };
  if (!existsSync(result)) writeFileSync(result, `${JSON.stringify(evidence)}\n`);
  console.log(JSON.stringify(evidence));
  if (run.status !== 0 || !evidence.success) failed = true;
}
process.exitCode = failed ? 1 : 0;
