import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createOwnedReleaseManifest } from './package-moxbots-dsh-runtime.mjs';

const selected = JSON.parse(readFileSync(new URL('./source-patches/moxbots-dsh-release-candidate.json', import.meta.url)));
const bytes = Buffer.from('bounded synthetic archive');
const fixtures = () => ['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64'].map(target => ({
  schemaVersion: 1, repository: selected.repository, version: selected.version, tag: selected.tag,
  sourceCommit: selected.sourceCommit, target, name: selected.assetName.replace('{target}', target),
  size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
  handoffSha256: 'a'.repeat(64), runtimeManifestSha256: 'b'.repeat(64), compatibilitySha256: 'c'.repeat(64), claim: 'verified',
  provenance: { upstreamSourceCommit: selected.upstreamSourceCommit, sourcePatchSha256: selected.sourcePatchSha256,
    sourceRecipeSha256: selected.sourceRecipeSha256, sourceRecipeCommit: 'd'.repeat(40),
    sourceRecipePath: 'scripts/integrated-runtimes/source-patches/moxbots-child-approval-context.json' },
}));

test('owned candidate collection requires every verified native target and exact archive bytes', () => {
  const receipts = fixtures();
  const manifest = createOwnedReleaseManifest(receipts, () => bytes);
  assert.deepEqual(Object.keys(manifest.assets), receipts.map(item => item.target));
  assert.throws(() => createOwnedReleaseManifest(receipts.slice(1), () => bytes), /exactly four/);
  assert.throws(() => createOwnedReleaseManifest([...receipts.slice(1), receipts[1]], () => bytes), /distinct/);
  assert.throws(() => createOwnedReleaseManifest(receipts, () => Buffer.from('corrupt')), /integrity/);
  for (const mutate of [
    x => { x.claim = 'implementation-complete_pending-native-validation'; },
    x => { x.sourceCommit = 'e'.repeat(40); },
    x => { x.provenance.sourceRecipeCommit = 'f'.repeat(40); },
    x => { x.name = '../private-file'; },
  ]) {
    const invalid = fixtures();
    mutate(invalid[0]);
    let read = false;
    assert.throws(() => createOwnedReleaseManifest(invalid, () => { read = true; return bytes; }));
    assert.equal(read, false);
  }
});
