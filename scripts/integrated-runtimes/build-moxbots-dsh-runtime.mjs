#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const policyRoot = resolve(import.meta.dirname, 'source-patches');
const policyPath = resolve(policyRoot, 'moxbots-child-approval-context.json');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** Direct Node invocations do not receive npm's lifecycle environment. */
export function selectedNpmEntrypoint(execPath = process.execPath, env = process.env) {
  const candidates = [env.npm_execpath,
    resolve(dirname(execPath), 'node_modules/npm/bin/npm-cli.js'),
    resolve(dirname(execPath), '../lib/node_modules/npm/bin/npm-cli.js')];
  const entrypoint = candidates.find(path => path && existsSync(path));
  if (!entrypoint) throw new Error('npm JS entrypoint is missing from the selected Node toolchain');
  return entrypoint;
}

/** Rebuild owned Runtime source; immutable upstream handoffs are never rewritten. */
export function prepareMoxbotsDshSource({ out, source }) {
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
  const patch = readFileSync(resolve(policyRoot, policy.patch));
  if (sha256(patch) !== policy.patchSha256) throw new Error('DSH source patch digest mismatch');
  if (!isAbsolute(out) || existsSync(out)) throw new Error('--out must name a new absolute directory');
  if (source && (!isAbsolute(source) || !existsSync(source))) throw new Error('--source must name an existing absolute Git directory');
  mkdirSync(out, { recursive: true });
  const checkout = join(out, 'source');
  const git = (args, env) => execFileSync('git', args, {
    cwd: out, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: env ?? process.env,
  }).trim();
  git(['clone', '--no-hardlinks', '--no-checkout', ...(source ? [] : ['--filter=blob:none']), source ?? policy.repository, checkout]);
  git(['-C', checkout, 'checkout', '--detach', policy.baseCommit]);
  git(['-C', checkout, 'switch', '-c', `codex/moxbots-owned-source-${randomUUID()}`]);
  const patchPath = join(out, 'verified-source.patch');
  writeFileSync(patchPath, patch);
  git(['-C', checkout, 'apply', '--check', patchPath]);
  git(['-C', checkout, 'apply', patchPath]);
  git(['-C', checkout, 'add', '--', ...policy.changedPaths]);
  const hooks = join(out, 'empty-hooks');
  mkdirSync(hooks);
  git(['-C', checkout, '-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${hooks}`, 'commit',
    '-m', policy.commitSubject, '-m', policy.commitBody], {
    ...process.env,
    GIT_AUTHOR_NAME: policy.commitName, GIT_AUTHOR_EMAIL: policy.commitEmail, GIT_AUTHOR_DATE: policy.commitDate,
    GIT_COMMITTER_NAME: policy.commitName, GIT_COMMITTER_EMAIL: policy.commitEmail, GIT_COMMITTER_DATE: policy.commitDate,
  });
  const commit = git(['-C', checkout, 'rev-parse', 'HEAD']);
  if (commit !== policy.resultCommit || git(['-C', checkout, 'status', '--porcelain=v1']) !== '') {
    throw new Error('Patched DSH source differs from its pinned clean result commit');
  }
  const accepted = JSON.parse(readFileSync(join(checkout,
    'packages/product-profile/manifests/accepted-patched-dsh-artifact-v1.json'), 'utf8'));
  if (accepted.manifestSha256 !== policy.acceptedDshManifestSha256) throw new Error('Accepted native DSH dependency identity changed');
  return { checkout, sourceCommit: commit, patchSha256: policy.patchSha256 };
}

async function main() {
  const { values } = parseArgs({ options: {
    out: { type: 'string' }, source: { type: 'string' }, target: { type: 'string' },
    'source-only': { type: 'boolean', default: false },
    'full-checks': { type: 'boolean', default: false },
    'validate-native': { type: 'boolean', default: false },
  } });
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
  if (values.target && values.target !== `${process.platform}-${process.arch}`) {
    throw new Error(`Native runner is ${process.platform}-${process.arch}, requested ${values.target}`);
  }
  if (!values['source-only'] && process.version !== policy.nodeVersion) {
    throw new Error(`Runtime build requires Node ${policy.nodeVersion}; received ${process.version}`);
  }
  const prepared = prepareMoxbotsDshSource({ out: values.out ?? '', source: values.source });
  if (values['source-only']) return process.stdout.write(`${JSON.stringify(prepared)}\n`);
  const env = { ...process.env, PATH: `${dirname(process.execPath)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
    npm_execpath: selectedNpmEntrypoint(),
    // The official isolated verifier reads the lock's npmjs registry cache.
    // Host-specific registry mirrors must not warm a different metadata key.
    npm_config_registry: 'https://registry.npmjs.org/',
    NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/',
    npm_config_user_agent: `npm/${policy.npmVersion} node/${process.version} ${process.platform} ${process.arch}` };
  const { childCli } = await import(pathToFileURL(join(prepared.checkout, 'scripts/child-cli.mjs')).href);
  const run = (command, args) => {
    const invocation = childCli(command, args, env);
    return execFileSync(invocation.command, invocation.args, { cwd: prepared.checkout, env, stdio: 'inherit' });
  };
  const npm = 'npm';
  const npmInvocation = childCli(npm, ['--version'], env);
  const npmVersion = execFileSync(npmInvocation.command, npmInvocation.args,
    { cwd: prepared.checkout, env, encoding: 'utf8' }).trim();
  if (npmVersion !== policy.npmVersion) throw new Error(`Runtime build requires npm ${policy.npmVersion}; received ${npmVersion}`);
  run(process.execPath, ['scripts/setup.mjs']);
  run(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/child-approval-context.unit.test.ts',
    'tests/system-context.unit.test.ts', 'tests/product-permission-interaction.unit.test.ts',
    'tests/verified-dsh-install.unit.test.ts']);
  if (values['full-checks']) {
    for (const script of ['typecheck', 'lint', 'test', 'build']) run(npm, ['run', script]);
  }
  const work = join(values.out, 'native-build');
  if (values['validate-native']) {
    // Same official builder used by upstream native Release targets, with no tag or publication.
    process.env.PATH = env.PATH;
    process.env.npm_execpath = env.npm_execpath;
    process.env.npm_config_registry = env.npm_config_registry;
    process.env.NPM_CONFIG_REGISTRY = env.NPM_CONFIG_REGISTRY;
    process.env.npm_config_user_agent = env.npm_config_user_agent;
    const { buildNativeHandoff } = await import(pathToFileURL(join(prepared.checkout, 'scripts/build-native-handoff.mjs')).href);
    mkdirSync(work);
    buildNativeHandoff({ work, source: join(prepared.checkout, 'tmp/setup/sources/deepseek-harness'),
      piAiSource: join(prepared.checkout, 'tmp/setup/sources/pi'),
      artifact: join(prepared.checkout, 'tmp/setup/artifacts', policy.acceptedDshManifestSha256), validateNative: true });
  } else {
    run(process.execPath, ['scripts/build-local-handoff.mjs', '--out', work]);
  }
  const handoff = join(work, 'handoff');
  const handoffSha256 = sha256(readFileSync(join(handoff, 'batch-3-integration-handoff-v1.json')));
  const receipt = { ...prepared, target: `${process.platform}-${process.arch}`, handoff, handoffSha256,
    sourceChecks: values['full-checks'] ? 'full' : 'focused',
    claim: values['validate-native'] ? 'verified' : 'implementation-complete_pending-native-validation' };
  writeFileSync(join(values.out, 'moxbots-dsh-build-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
}
