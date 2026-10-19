#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Compile preflight only: no account, signing, simulator launch or SDK agreement acceptance.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (process.platform !== 'darwin') throw new Error('iOS preflight requires an installed Apple SDK on macOS');
function run(command, args, capture = false) {
  const result = spawnSync(command, args, { cwd: repo, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal})${capture ? ': ' + result.stderr : ''}`);
  return capture ? result.stdout.trim() : undefined;
}
const targets = [
  { rust: 'aarch64-apple-ios', sdk: 'iphoneos', swift: 'arm64-apple-ios16.4' },
  { rust: 'aarch64-apple-ios-sim', sdk: 'iphonesimulator', swift: 'arm64-apple-ios16.4-simulator' },
];
// Fail at normal SDK/permission checks before downloading targets. Do not accept
// licenses or switch the user's selected Xcode as part of a build check.
for (const target of targets) target.sdkPath = run('xcrun', ['--sdk', target.sdk, '--show-sdk-path'], true);
run(process.execPath, [path.join(repo, 'mobile/scripts/test-ios-speech-diagnostics.mjs')]);
const temp = mkdtempSync(path.join(tmpdir(), 'moxbots-ios-preflight-'));
try {
  const moduleDir = path.join(temp, 'MoxConnectionCore');
  mkdirSync(moduleDir);
  copyFileSync(path.join(repo, 'mobile/connection/include/mox_connection.h'), path.join(moduleDir, 'mox_connection.h'));
  writeFileSync(path.join(moduleDir, 'module.modulemap'), 'module MoxConnectionCore { header "mox_connection.h" export * }\n');
  const ownerDir = path.join(repo, 'mobile/app/modules/moxbots-remote/ios');
  // Expo's Module wrapper needs the full Pod/Xcode app build, which remains a
  // separate gate. These exact files use real Apple frameworks, no mock SDKs.
  const sources = readdirSync(ownerDir).filter(file => file.endsWith('.swift') && file !== 'MoxBotsRemoteModule.swift').sort().map(file => path.join(ownerDir, file));
  for (const target of targets) {
    run('xcrun', ['--sdk', target.sdk, 'swiftc', '-typecheck', '-swift-version', '5', '-sdk', target.sdkPath, '-target', target.swift, '-I', temp, ...sources]);
  }
  run('rustup', ['target', 'add', ...targets.map(target => target.rust)]);
  for (const target of targets) {
    run('cargo', ['check', '--locked', '--manifest-path', 'mobile/connection/Cargo.toml', '--target', target.rust]);
  }
  process.stdout.write('iOS device/simulator Rust targets and native Swift core typecheck passed; full Expo app, linking, signing and runtime remain separate gates.\n');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
