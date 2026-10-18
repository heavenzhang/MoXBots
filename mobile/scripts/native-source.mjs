import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Includes shared desktop modules compiled through #[path], not just mobile crates.
// AgentNet is deliberately a conservative superset of the imported source.
export const nativeInputs = [
  'mobile/connection', 'mobile/core', 'mobile/crypto',
  'src-tauri/agent-network-crypto', 'src-tauri/agent-network-protocol',
  'src-tauri/host-management-protocol', 'src-tauri/src/agent_network',
  'src-tauri/src/keyed_lifecycle.rs', 'src-tauri/src/network_diagnostics.rs',
  'src-tauri/src/local_http.rs',
];
export function nativeSource(repo) {
  const git = args => {
    const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    if (result.status !== 0) throw new Error('Cannot record native source provenance');
    return result.stdout;
  };
  const files = git(['ls-files', '-z', '--', ...nativeInputs]).split('\0').filter(Boolean).sort();
  if (!files.length) throw new Error('Native source inventory is empty');
  const digest = createHash('sha256');
  for (const file of files) digest.update(file).update('\0').update(createHash('sha256').update(readFileSync(path.join(repo, file))).digest());
  return {
    sourceScopeVersion: 2,
    sourceCommit: git(['rev-parse', 'HEAD']).trim(),
    sourceDirty: git(['status', '--porcelain', '--untracked-files=normal', '--', ...nativeInputs]).trim().length > 0,
    sourceDigest: digest.digest('hex'),
  };
}
