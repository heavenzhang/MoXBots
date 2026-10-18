#!/usr/bin/env node
// Ad-hoc signed offline simulator artifact only; no Apple account or provisioning.
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = path.join(repo, 'mobile/app');
const ios = path.join(app, 'ios');
const output = path.join(repo, 'output/mobile-ios-simulator');
function run(command, args, cwd = repo, capture = false) {
  const result = spawnSync(command, args, { cwd, env: { ...process.env, CI: '1', EXPO_PUBLIC_MOBILE_QA: '0' },
    stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal}): ${capture ? result.stderr : 'see build log'}`);
  return result.stdout;
}
if (process.platform !== 'darwin') throw new Error('iOS simulator build requires a macOS Xcode runner');
run('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path']);
run('rustup', ['target', 'add', 'aarch64-apple-ios', 'aarch64-apple-ios-sim']);
run('node', ['mobile/scripts/build-native.mjs', 'ios']);
// Generate native project only through Expo and the committed config plugins.
run('npx', ['--no-install', 'expo', 'prebuild', '--platform', 'ios', '--no-install'], app);
run('pod', ['install'], ios);
function uniqueSuffix(directory, suffix) {
  const entries = readdirSync(directory).filter(name => name.endsWith(suffix));
  if (entries.length !== 1) throw new Error(`Expected one ${suffix} in ${directory}`);
  return entries[0];
}
const workspace = uniqueSuffix(ios, '.xcworkspace');
const project = uniqueSuffix(ios, '.xcodeproj');
const scheme = project.slice(0, -'.xcodeproj'.length);
const listing = JSON.parse(run('xcodebuild', ['-list', '-json', '-workspace', workspace], ios, true));
if (!listing.workspace?.schemes?.includes(scheme)) throw new Error('Generated application scheme is missing');
mkdirSync(output, { recursive: true });
const derived = path.join(output, 'derived-data');
run('xcodebuild', ['-workspace', workspace, '-scheme', scheme, '-configuration', 'Release',
  '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', derived,
  'ARCHS=arm64', 'ONLY_ACTIVE_ARCH=YES', 'CODE_SIGN_IDENTITY=-',
  'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGNING_REQUIRED=YES'], ios);
const products = path.join(derived, 'Build/Products/Release-iphonesimulator');
const product = uniqueSuffix(products, '.app');
const bundle = path.join(products, product);
if (statSync(path.join(bundle, 'main.jsbundle')).size === 0) throw new Error('Offline JavaScript bundle missing');
const info = run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', path.join(bundle, 'Info.plist')], repo, true).trim();
if (info !== 'com.moxbots.mobileinternal') throw new Error('Unexpected simulator application identity');
// Linker-only signatures omit simulator entitlements and can build/install while
// real Keychain operations fail. Require Xcode's complete simulator signing.
run('codesign', ['--verify', '--strict', bundle]);
const signature = spawnSync('codesign', ['-dvv', bundle], { encoding: 'utf8' });
if (signature.status !== 0 || !signature.stderr.includes('Signature=adhoc') ||
    signature.stderr.includes('linker-signed') || !signature.stderr.includes('Sealed Resources version=')) {
  throw new Error('Expected a complete ad-hoc simulator signature');
}
const executable = run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', path.join(bundle, 'Info.plist')], repo, true).trim();
const sections = run('otool', ['-l', path.join(bundle, executable)], repo, true);
if (!sections.includes('sectname __entitlements') || !sections.includes('sectname __ents_der')) {
  throw new Error('Simulator entitlements missing; do not distribute a linker-only signed application');
}
const sha = run('git', ['rev-parse', 'HEAD'], repo, true).trim();
writeFileSync(path.join(output, 'source-commit.txt'), sha + '\n');
writeFileSync(path.join(output, 'acceptance.txt'), 'Ad-hoc signed arm64 iOS simulator Release build with embedded JavaScript and simulator entitlements. No device signing, launch, Apple account, push, microphone, Host or daily-use acceptance is implied.\n');
run('tar', ['-czf', path.join(output, 'MoxBots-Mobile-Internal-simulator.tar.gz'), '-C', products, product]);
