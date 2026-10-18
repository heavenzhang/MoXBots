import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeSource } from './native-source.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [device, frameworkArgument, liveOrigin] = process.argv.slice(2);
if (process.platform !== 'darwin' || !device || !frameworkArgument || process.argv.length > 5) {
  throw new Error('Usage: node mobile/scripts/test-ios-native.mjs SIMULATOR_UUID XCFRAMEWORK [HTTPS_LIVE_ORIGIN]; macOS and full Xcode required');
}
if (!/^[A-F0-9-]{36}$/i.test(device)) throw new Error('Explicit simulator UUID required');
if (liveOrigin) {
  const url = new URL(liveOrigin);
  if (url.protocol !== 'https:' || url.origin !== liveOrigin || url.username || url.password) {
    throw new Error('Live opt-in must be a bare HTTPS origin without credentials/path');
  }
}
// Ambient settings never silently enable a public-service probe.
const env = { ...process.env };
delete env.MOXBOTS_LIVE_LOGIN_ORIGIN;
if (liveOrigin) env.MOXBOTS_LIVE_LOGIN_ORIGIN = liveOrigin;
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: repo, env, encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status}); see the retained native test log`);
  return result.stdout?.trim();
}
const devices = JSON.parse(run('xcrun', ['simctl', 'list', 'devices', 'booted', '-j']));
const actualDevice = Object.values(devices.devices).flat().find(item => item.udid === device);
if (!actualDevice?.isAvailable || actualDevice.state !== 'Booted') throw new Error('Named simulator must already be booted; no user device is changed');
const source = nativeSource(repo);
if (source.sourceDirty) throw new Error('Native source must be clean before reusing a framework');
const swiftInputs = ['SecureRecords.swift', 'NativeConnection.swift', 'NativeAttachments.swift']
  .map(name => `mobile/app/modules/moxbots-remote/ios/${name}`);
const harnessInputs = ['mobile/tests/ios-native/Host.swift', 'mobile/tests/ios-native/NativeOwnersTests.swift',
  'mobile/tests/ios-native/project.rb', 'mobile/scripts/test-ios-native.mjs', 'mobile/scripts/native-source.mjs'];
const inputHashes = () => Object.fromEntries([...swiftInputs, ...harnessInputs].map(file =>
  [file, createHash('sha256').update(readFileSync(path.join(repo, file))).digest('hex')]));
const inputs = inputHashes();
const framework = path.resolve(frameworkArgument, 'ios-arm64-simulator/MoxConnectionCore.framework');
const stamp = JSON.parse(readFileSync(path.join(framework, 'native-build.json'), 'utf8'));
const librarySha256 = createHash('sha256').update(readFileSync(path.join(framework, 'MoxConnectionCore'))).digest('hex');
if (stamp.target !== 'aarch64-apple-ios-sim' || stamp.sourceDirty || stamp.sourceDigest !== source.sourceDigest || stamp.librarySha256 !== librarySha256) {
  throw new Error('Framework must match current original native source and actual library bytes');
}
run('git', ['merge-base', '--is-ancestor', stamp.sourceCommit, 'HEAD']);
const output = mkdtempSync(path.join(tmpdir(), 'moxbots-ios-native-'));
const record = { version: 1, output, device: actualDevice, source, nativeBuild: stamp,
  compiledInputHashes: inputs,
  harnessGitStatus: run('git', ['status', '--porcelain', '--untracked-files=all', '--', ...swiftInputs, ...harnessInputs]),
  liveProbe: Boolean(liveOrigin), scope: 'Actual simulator native owners; no UI, physical phone, completed SSO, push or speech acceptance' };
writeFileSync(path.join(output, 'provenance.json'), JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
console.log(`Native XCTest output: ${output}`);
const ruby = process.env.MOX_MOBILE_RUBY || path.join(run('brew', ['--prefix', 'ruby']), 'bin/ruby');
env.GEM_HOME = process.env.MOX_MOBILE_GEM_HOME || path.join(run('brew', ['--prefix', 'cocoapods']), 'libexec');
run(ruby, [path.join(repo, 'mobile/tests/ios-native/project.rb'), repo, output, framework]);
const result = spawnSync('xcodebuild', ['test', '-project', path.join(output, 'NativeValidation.xcodeproj'),
  '-scheme', 'NativeOwnersTests', '-configuration', 'Release', '-sdk', 'iphonesimulator',
  '-destination', `id=${device}`, '-derivedDataPath', path.join(output, 'derived-data'),
  '-resultBundlePath', path.join(output, 'native-tests.xcresult'), '-parallel-testing-enabled', 'NO',
  'ARCHS=arm64', 'ONLY_ACTIVE_ARCH=YES'], { cwd: output, env, stdio: 'inherit' });
if (result.error) throw result.error;
const after = nativeSource(repo);
record.exitCode = result.status;
record.rustSourceUnchanged = after.sourceDigest === source.sourceDigest && !after.sourceDirty;
record.compiledInputsUnchanged = JSON.stringify(inputHashes()) === JSON.stringify(inputs);
record.resultBundle = path.join(output, 'native-tests.xcresult');
let resultsAccepted = false;
if (existsSync(record.resultBundle)) {
  try {
    const summary = JSON.parse(run('xcrun', ['xcresulttool', 'get', 'test-results', 'summary', '--path', record.resultBundle, '--compact']));
    const tests = JSON.parse(run('xcrun', ['xcresulttool', 'get', 'test-results', 'tests', '--path', record.resultBundle, '--compact']));
    record.testSummary = summary;
    writeFileSync(path.join(output, 'test-summary.json'), JSON.stringify(summary, null, 2) + '\n', { mode: 0o600 });
    writeFileSync(path.join(output, 'test-cases.json'), JSON.stringify(tests, null, 2) + '\n', { mode: 0o600 });
    const cases = [];
    function visit(node) {
      if (node.nodeType === 'Test Case') cases.push({ name: node.name.replace(/\(\)$/, ''), result: node.result });
      for (const child of node.children ?? []) visit(child);
    }
    for (const node of tests.testNodes ?? []) visit(node);
    record.cases = cases;
    const expected = ['testKeychainIsolationPersistenceProtectionAndOversizeAtomicity',
      'testOriginalSwiftCAbiLoadsAndRejectsUnauthenticatedOperationsOffline',
      'testOriginalImageAdmissionChunkBytesScopeAndPersistentIndex',
      'testExplicitOriginalIosLoginStartsAndCancelsWithoutAuthenticating'];
    resultsAccepted = summary.totalTestCount === 4 && summary.failedTests === 0 && summary.expectedFailures === 0 &&
      summary.passedTests === (liveOrigin ? 4 : 3) && summary.skippedTests === (liveOrigin ? 0 : 1) &&
      cases.length === expected.length && expected.every(name => cases.filter(item => item.name === name &&
        item.result === (!liveOrigin && name === expected[3] ? 'Skipped' : 'Passed')).length === 1);
  } catch { record.resultParseError = 'Unable to verify native XCTest counts and individual expected cases'; }
}
record.resultsAccepted = resultsAccepted;
writeFileSync(path.join(output, 'provenance.json'), JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
if (!record.rustSourceUnchanged || !record.compiledInputsUnchanged || result.status !== 0 || !resultsAccepted) {
  throw new Error(`Native XCTest failed or source changed; retained evidence: ${output}`);
}
console.log(`Native XCTest verified ${liveOrigin ? '4 passed/0 skipped' : '3 passed/only live skipped'}; ${record.resultBundle}`);
