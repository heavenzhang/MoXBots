import { spawnSync, execFileSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join } from 'node:path';
import { observe } from './arm-validation-contract.mjs';

// Independent evidence only: never edits or passes a GitHub check run.
const [expectedSource, evidenceDir, targetDir] = process.argv.slice(2);
if (process.argv.length !== 5 || !/^[a-f0-9]{40}$/.test(expectedSource) || !isAbsolute(evidenceDir) || !isAbsolute(targetDir)) throw new Error('expected exact source, absolute new evidence and target directories');
const observed = observe('local-macos-arm-27.1');
if (observed.source !== expectedSource) throw new Error('candidate source mismatch');
const targets = execFileSync('rustup', ['target', 'list', '--installed', '--toolchain', '1.92.0'], { encoding: 'utf8' }).trim().split('\n');
if (!['aarch64-apple-ios', 'aarch64-apple-ios-sim'].every(target => targets.includes(target))) throw new Error('required Rust targets must already be installed');
mkdirSync(evidenceDir, { recursive: false });
mkdirSync(targetDir, { recursive: false });
const fd = openSync(join(evidenceDir, 'control.json'), 'wx', 0o600);
closeSync(fd);
import { productSteps } from './arm-validation-product-steps.mjs';
const steps = productSteps();
const state = { source: expectedSource, observed, state: 'RUNNING', pid: process.pid, steps: [] };
function save() { writeFileSync(join(evidenceDir, 'control.json'), JSON.stringify(state, null, 2) + '\n', { mode: 0o600 }); }
save();
const env = { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}`, RUSTUP_TOOLCHAIN: '1.92.0', CARGO_TARGET_DIR: targetDir, CARGO_NET_OFFLINE: 'true' };
const resources = 'src-tauri/resources';
try {
for (const name of ['claude-agent-sdk','sharp-runtime','tsx-runtime','nodejs','speech-inference','cli','document-processing','integrated-runtimes/dsh','playwright-control/@playwright/mcp','playwright-control/playwright','playwright-control/playwright-core']) {
  const dir = join(resources, name); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, '.ci-placeholder'), '', { flag: 'wx' });
}
for (const name of ['server-dist.js','plugin-bridge-dist.mjs']) writeFileSync(join(resources, name), '', { flag: 'wx' });
for (const [name, [command, ...args]] of steps) {
  state.current = name; save();
  const out = openSync(join(evidenceDir, `${name}.log`), 'wx', 0o600);
  const childEnv = name === 'routing' ? { ...env, MYAGENTS_BUILD_PROFILE: 'moxbot', MOXBOTS_CREDENTIAL_WRITER_FAMILY: 'developer-id-v2' } : env;
  const result = spawnSync(command, args, { env: childEnv, stdio: ['ignore', out, out] }); closeSync(out);
  const sha256 = createHash('sha256').update(readFileSync(join(evidenceDir, `${name}.log`))).digest('hex');
  state.steps.push({ name, command: [command, ...args], exit: result.status, signal: result.signal, sha256 }); save();
  if (result.error || result.status !== 0) { state.state = 'FAILED_PRESERVED'; save(); process.exit(1); }
}
  const final = observe('local-macos-arm-27.1', { allowLocalPlaceholder: true });
  if (final.source !== observed.source || final.tree !== observed.tree || JSON.stringify(final.lockfiles) !== JSON.stringify(observed.lockfiles)) throw new Error('source changed during tests');
  state.state = 'COMPLETE_LOCAL_ARM_ONLY'; delete state.current; save();
} catch (error) { state.state = 'FAILED_PRESERVED'; state.error = String(error); save(); process.exit(1); }
