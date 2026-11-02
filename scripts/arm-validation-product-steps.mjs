const host = 'aarch64-apple-darwin';
const config = `target.${host}.runner = ['env', 'DYLD_FALLBACK_LIBRARY_PATH=/usr/lib/swift']`;
const lib = name => ['cargo', 'test', '--manifest-path', 'src-tauri/Cargo.toml', '--locked', '--lib', name, '--config', config];
const crypto = ['--manifest-path', 'src-tauri/agent-network-crypto/Cargo.toml', '--locked'];
export function productSteps() { return [
  ['ios-native', ['node','mobile/scripts/check-ios-native.mjs']],
  ['cliproxy-input', ['node','scripts/prepare-cliproxy.mjs']],
  ['lifecycle', lib('cliproxy::')], ['watcher', lib('workspace_files::watcher::tests')],
  ['network', lib('agent_network::')], ['cli', lib('cli::')],
  ['crypto-test', ['cargo','test',...crypto,'--features','os-store']],
  ['crypto-clippy', ['cargo','clippy',...crypto,'--features','os-store','--all-targets','--','-D','warnings']],
  ['reader-node', ['node','--test','scripts/prepare-moxbot-credential-reader.test.mjs']],
  ['reader-test', ['cargo','test',...crypto,'--features','os-store,fixed-macos-reader']],
  ['reader-clippy', ['cargo','clippy',...crypto,'--features','os-store,fixed-macos-reader','--all-targets','--','-D','warnings']],
  ['routing', ['cargo','check','--manifest-path','src-tauri/Cargo.toml','--locked','--lib','--features','moxbot-credential-reader']],
]; }
