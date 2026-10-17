#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { normalizeReleaseSelection, parseReleaseManifest } from './prepare-dsh-runtime.mjs';

const root = resolve(import.meta.dirname, '../..');
const recipePath = 'scripts/integrated-runtimes/source-patches/moxbots-child-approval-context.json';
const selectionPath = 'scripts/integrated-runtimes/source-patches/moxbots-dsh-release-candidate.json';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const selection = () => normalizeReleaseSelection(readJson(join(root, selectionPath)));

export function createOwnedReleaseManifest(receipts, archiveBytes) {
  const selected = selection();
  const targets = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64'];
  if (receipts.length !== targets.length || new Set(receipts.map(item => item.target)).size !== targets.length) {
    throw new Error('Owned DSH candidate requires exactly four distinct verified targets');
  }
  const provenance = receipts[0]?.provenance;
  const assets = {};
  for (const receipt of receipts) {
    if (!targets.includes(receipt.target) || receipt.repository !== selected.repository
      || receipt.tag !== selected.tag || receipt.version !== selected.version
      || receipt.name !== selected.assetName.replace('{target}', receipt.target)
      || receipt.sourceCommit !== selected.sourceCommit || receipt.claim !== 'verified'
      || JSON.stringify(receipt.provenance) !== JSON.stringify(provenance)) {
      throw new Error('Owned DSH target receipts differ in source, publisher, provenance or native acceptance');
    }
  }
  for (const receipt of receipts) {
    const bytes = archiveBytes(receipt.name);
    if (bytes.length !== receipt.size || sha256(bytes) !== receipt.sha256) throw new Error('Owned DSH target archive integrity mismatch');
    const { name, size, handoffSha256, runtimeManifestSha256, compatibilitySha256, claim } = receipt;
    assets[receipt.target] = { name, size, sha256: receipt.sha256, handoffSha256, runtimeManifestSha256, compatibilitySha256, claim };
  }
  const manifest = { schemaVersion: 1, repository: selected.repository, version: selected.version,
    tag: selected.tag, sourceCommit: selected.sourceCommit, provenance, assets };
  return parseReleaseManifest(Buffer.from(JSON.stringify(manifest)), selected);
}

export async function packageOwnedTarget({ buildRoot, out, sourceRecipeCommit }) {
  const selected = selection();
  const recipeBytes = readFileSync(join(root, recipePath));
  const recipe = JSON.parse(recipeBytes);
  if (sha256(recipeBytes) !== selected.sourceRecipeSha256 || recipe.resultCommit !== selected.sourceCommit
    || recipe.patchSha256 !== selected.sourcePatchSha256) throw new Error('Owned DSH source recipe differs from candidate selection');
  if (!isAbsolute(buildRoot) || !isAbsolute(out) || existsSync(out)) throw new Error('Build root must be absolute and output must be a new absolute directory');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (sourceRecipeCommit !== head) throw new Error('Source recipe commit must identify this actual MoXBots checkout');
  for (const path of [recipePath, selectionPath, `scripts/integrated-runtimes/source-patches/${recipe.patch}`,
    'scripts/integrated-runtimes/build-moxbots-dsh-runtime.mjs',
    'scripts/integrated-runtimes/package-moxbots-dsh-runtime.mjs',
    'scripts/integrated-runtimes/prepare-dsh-runtime.mjs', '.github/workflows/dsh-owned-candidate.yml']) {
    const committed = execFileSync('git', ['show', `${head}:${path}`], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    if (!committed.equals(readFileSync(join(root, path)))) throw new Error('Source recipe and patch must already be committed without local edits');
  }
  const build = readJson(join(buildRoot, 'moxbots-dsh-build-receipt.json'));
  if (build.sourceCommit !== selected.sourceCommit || build.patchSha256 !== selected.sourcePatchSha256
    || build.claim !== 'verified' || build.sourceChecks !== 'full') {
    throw new Error('Full source gates and a native verified build receipt are required for packaging');
  }
  const checkoutHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: build.checkout, encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain=v1'], { cwd: build.checkout, encoding: 'utf8' }).trim();
  if (checkoutHead !== selected.sourceCommit || dirty) throw new Error('Runtime source checkout is not the pinned clean source');
  const runtime = readJson(join(build.handoff, 'runtime-artifact/runtime-artifact-v1.json'));
  if (runtime.protocol.version !== '6.2.0' || runtime.dsh.artifactManifestSha256 !== recipe.acceptedDshManifestSha256) {
    throw new Error('Runtime protocol or accepted native DSH dependency differs');
  }
  mkdirSync(out);
  const upstreamOutput = join(out, 'upstream-verified-package');
  mkdirSync(upstreamOutput);
  const { packageBatch3Release } = await import(pathToFileURL(join(build.checkout, 'scripts/package-batch-3-release.mjs')).href);
  const target = `${process.platform}-${process.arch}`;
  // Official packager runs full native verification before AND after archive roundtrip.
  const packaged = packageBatch3Release({ handoff: build.handoff, handoffSha256: build.handoffSha256,
    tag: `v${selected.version}`, target, out: upstreamOutput, sourceCommit: selected.sourceCommit });
  const name = selected.assetName.replace('{target}', target);
  renameSync(packaged.archivePath, join(out, name));
  const receipt = { schemaVersion: 1, repository: selected.repository, version: selected.version,
    tag: selected.tag, sourceCommit: selected.sourceCommit, target, name, size: packaged.archiveSize,
    sha256: packaged.archiveSha256, handoffSha256: packaged.handoffSha256,
    runtimeManifestSha256: packaged.runtimeManifestSha256, compatibilitySha256: packaged.compatibilitySha256, claim: 'verified',
    provenance: { upstreamSourceCommit: recipe.baseCommit, sourcePatchSha256: recipe.patchSha256,
      sourceRecipeSha256: sha256(recipeBytes), sourceRecipeCommit, sourceRecipePath: recipePath } };
  writeFileSync(join(out, `${target}.owned-dsh-target.json`), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  return receipt;
}

async function main() {
  const { values } = parseArgs({ options: { 'build-root': { type: 'string' }, out: { type: 'string' },
    'recipe-commit': { type: 'string' }, collect: { type: 'string' } } });
  if (values.collect) {
    const files = readdirSync(values.collect).filter(name => name.endsWith('.owned-dsh-target.json'));
    const manifest = createOwnedReleaseManifest(files.map(name => readJson(join(values.collect, name))),
      name => readFileSync(join(values.collect, name)));
    writeFileSync(join(values.collect, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    return process.stdout.write(`${JSON.stringify({ tag: manifest.tag, targets: Object.keys(manifest.assets) })}\n`);
  }
  process.stdout.write(`${JSON.stringify(await packageOwnedTarget({ buildRoot: values['build-root'] ?? '',
    out: values.out ?? '', sourceRecipeCommit: values['recipe-commit'] }))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
}
