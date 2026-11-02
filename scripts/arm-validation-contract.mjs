import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const profiles = Object.freeze({
  'hosted-macos15-arm': Object.freeze({ arch: 'arm64', xcode: 'Xcode 26.3', sdk: ['26.2', '26.2', '26.2'] }),
  'local-macos-arm-27.1': Object.freeze({ arch: 'arm64', xcode: 'Xcode 27.1\nBuild version 27A9275', sdk: ['27.0', '27.1', '27.1'] }),
});
export const rustHost = 'aarch64-apple-darwin';
export const requiredWorkflowFragments = Object.freeze([
  'node mobile/scripts/check-ios-native.mjs',
  'node scripts/prepare-cliproxy.mjs',
  "--lib 'cliproxy::'", "--lib 'workspace_files::watcher::tests'", "--lib 'agent_network::'", "--lib 'cli::'",
  '--features os-store\n', '--features os-store --all-targets -- -D warnings',
  'node --test scripts/prepare-moxbot-credential-reader.test.mjs',
  '--features os-store,fixed-macos-reader\n', '--features os-store,fixed-macos-reader --all-targets -- -D warnings',
  '--lib --features moxbot-credential-reader',
]);
export function validate(profile, observed) {
  const expected = profiles[profile];
  if (!expected) throw new Error('unsupported environment profile');
  if (observed.arch !== expected.arch || observed.xcode !== expected.xcode ||
      JSON.stringify(observed.sdk) !== JSON.stringify(expected.sdk) ||
      observed.rustRelease !== '1.92.0' || observed.rustHost !== rustHost || observed.nodeMajor !== '24') throw new Error('environment mismatch');
  if (!/^[0-9a-f]{40}$/.test(observed.source) || !/^[0-9a-f]{40}$/.test(observed.tree)) throw new Error('invalid source identity');
  if (!observed.clean || !observed.locksMatch) throw new Error('source or lockfiles changed');
  return true;
}
function read(command, args) { return execFileSync(command, args, { encoding: 'utf8' }).trim(); }
export function cleanStatus(status, { allowLocalPlaceholder = false, placeholder = 'src-tauri/resources/cli/.ci-placeholder' } = {}) {
  if (status === '') return true;
  if (!allowLocalPlaceholder || status !== '?? src-tauri/resources/cli/.ci-placeholder') return false;
  try {
    const stat = lstatSync(placeholder);
    return stat.isFile() && !stat.isSymbolicLink() && stat.size === 0;
  } catch { return false; }
}
export function observe(profile, { allowLocalPlaceholder = false } = {}) {
  const source = read('git', ['rev-parse', 'HEAD']);
  const tree = read('git', ['rev-parse', 'HEAD^{tree}']);
  const rust = read('rustc', ['+1.92.0', '-vV']);
  const locks = ['package-lock.json', 'src-tauri/Cargo.lock', 'src-tauri/document-worker/Cargo.lock', 'mobile/connection/Cargo.lock'];
  const locksMatch = locks.every(p => read('git', ['hash-object', p]) === read('git', ['rev-parse', `HEAD:${p}`]));
  const lockfiles = Object.fromEntries(locks.map(p => [p, createHash('sha256').update(readFileSync(p)).digest('hex')]));
  const status = read('git', ['status', '--porcelain']);
  const clean = cleanStatus(status, { allowLocalPlaceholder });
  const observed = { source, tree, lockfiles, arch: read('uname', ['-m']), xcode: read('xcodebuild', ['-version']), nodeMajor: process.versions.node.split('.')[0],
    sdk: ['macosx', 'iphoneos', 'iphonesimulator'].map(s => read('xcrun', ['--sdk', s, '--show-sdk-version'])),
    rustRelease: rust.match(/^release: (.+)$/m)?.[1], rustHost: rust.match(/^host: (.+)$/m)?.[1],
    clean, locksMatch };
  // Hosted Xcode patch build number is intentionally not part of its pre-existing contract.
  if (profile === 'hosted-macos15-arm') observed.xcode = observed.xcode.split('\n')[0];
  validate(profile, observed);
  const workflow = readFileSync('.github/workflows/test.yml', 'utf8');
  for (const fragment of requiredWorkflowFragments) if (!workflow.includes(fragment)) throw new Error(`missing workflow check: ${fragment}`);
  return observed;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) throw new Error('select exactly one supported profile');
  console.log(JSON.stringify({ profile: process.argv[2], observed: observe(process.argv[2]) }));
}
