import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanStatus, profiles, requiredWorkflowFragments, validate } from './arm-validation-contract.mjs';
const base = { arch: 'arm64', xcode: profiles['local-macos-arm-27.1'].xcode, sdk: ['27.0','27.1','27.1'], rustRelease: '1.92.0', rustHost: 'aarch64-apple-darwin', nodeMajor: '24', source: 'a'.repeat(40), tree: 'b'.repeat(40), clean: true, locksMatch: true };
test('accepts exact local and hosted ARM environments only', () => {
  assert.equal(validate('local-macos-arm-27.1', base), true);
  assert.equal(validate('hosted-macos15-arm', { ...base, xcode: 'Xcode 26.3', sdk: ['26.2','26.2','26.2'] }), true);
});
test('rejects architecture, SDK, Xcode, Rust, dirty source and lock changes', () => {
  for (const change of [{arch:'x86_64'}, {xcode:'Xcode 27.1'}, {sdk:['27.0','27.0','27.0']}, {rustRelease:'1.94.1'}, {rustHost:'x86_64-apple-darwin'}, {nodeMajor:'22'}, {source:'abc'}, {tree:''}, {clean:false}, {locksMatch:false}]) {
    assert.throws(() => validate('local-macos-arm-27.1', { ...base, ...change }));
  }
  assert.throws(() => validate('arbitrary-sdk', base));
});
test('only a locally generated empty regular placeholder may remain after checks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arm-contract-test-'));
  try {
    const p = join(dir, 'placeholder');
    const status = '?? src-tauri/resources/cli/.ci-placeholder';
    assert.equal(cleanStatus('', {}), true);
    assert.equal(cleanStatus(status, { allowLocalPlaceholder: true, placeholder: p }), false);
    writeFileSync(p, '');
    assert.equal(cleanStatus(status, { placeholder: p }), false);
    assert.equal(cleanStatus(status, { allowLocalPlaceholder: true, placeholder: p }), true);
    assert.equal(cleanStatus(`${status}\n M src/app.ts`, { allowLocalPlaceholder: true, placeholder: p }), false);
    assert.equal(cleanStatus(`${status}\n?? extra`, { allowLocalPlaceholder: true, placeholder: p }), false);
    writeFileSync(p, 'unexpected');
    assert.equal(cleanStatus(status, { allowLocalPlaceholder: true, placeholder: p }), false);
    rmSync(p); symlinkSync('/dev/null', p);
    assert.equal(cleanStatus(status, { allowLocalPlaceholder: true, placeholder: p }), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('full hosted product check list remains present', () => {
  const workflow = readFileSync('.github/workflows/test.yml','utf8');
  for (const fragment of requiredWorkflowFragments) assert.ok(workflow.includes(fragment), fragment);
  for (const sdk of ['macosx', 'iphoneos', 'iphonesimulator']) assert.ok(workflow.includes(`test "$(xcrun --sdk ${sdk} --show-sdk-version)" = 26.2`));
});
test('local product checklist preserves each original workflow command', async () => {
  const { productSteps } = await import('./arm-validation-product-steps.mjs');
  const workflow = readFileSync('.github/workflows/test.yml','utf8');
  const steps = productSteps();
  assert.deepEqual(steps.map(([name]) => name), ['ios-native','cliproxy-input','lifecycle','watcher','network','cli','crypto-test','crypto-clippy','reader-node','reader-test','reader-clippy','routing']);
  for (const [name, argv] of steps) {
    let command = argv.join(' ');
    if (['lifecycle','watcher','network','cli'].includes(name)) {
      const index = argv.indexOf('--lib');
      command = `${argv.slice(0,index).join(' ')} --lib '${argv[index+1]}'`;
    }
    assert.ok(workflow.includes(command), `${name}: ${command}`);
  }
});
