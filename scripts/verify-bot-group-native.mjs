// Run: node --import tsx scripts/verify-bot-group-native.mjs
// Isolated source-level check, not a desktop build or live Tab acceptance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { verifySessionUserAction } from '../src/server/session-engine/user-action-proof.ts';
const repo = resolve(import.meta.dirname, '..');
const output = mkdtempSync(resolve(tmpdir(), 'moxbots-bot-group-native-'));
const source = resolve(repo, 'src-tauri/src/session_user_action.rs');
const lock = readFileSync(resolve(repo, 'src-tauri/Cargo.lock'), 'utf8');
const rustVersion = execFileSync('rustc', ['--version'], { cwd: repo, encoding: 'utf8' }).trim();
const pinnedVersion = readFileSync(resolve(repo, 'rust-toolchain.toml'), 'utf8').match(/channel\s*=\s*"([^"]+)"/)[1];
assert.ok(rustVersion.startsWith(`rustc ${pinnedVersion} `), 'Use the repository Rust toolchain');
const dependencies = Object.entries({ base64: '0.22.', p256: '0.13.', serde: '1.', serde_json: '1.', sha2: '0.10.', uuid: '1.' }).map(([name, prefix]) => {
  const version = lock.split('[[package]]').map(block => ({ name: block.match(/\nname = "([^"]+)"/)?.[1], version: block.match(/\nversion = "([^"]+)"/)?.[1] }))
    .find(pkg => pkg.name === name && pkg.version?.startsWith(prefix))?.version;
  assert.ok(version, `Missing locked dependency ${name}`);
  const features = { p256: ['ecdsa', 'pkcs8'], serde: ['derive'], uuid: ['v4'] }[name];
  return `${name} = ${features ? `{ version = "=${version}", features = ${JSON.stringify(features)} }` : `"=${version}"`}`;
});
writeFileSync(resolve(output, 'Cargo.toml'), ['[package]', 'name = "moxbots_group_native_check"', 'version = "0.0.0"', 'edition = "2021"', '[dependencies]', ...dependencies, ''].join('\n'));
mkdirSync(resolve(output, 'src'));
writeFileSync(resolve(output, 'src/lib.rs'), `#[path = ${JSON.stringify(source)}]\npub mod session_user_action;\n`);
writeFileSync(resolve(output, 'src/main.rs'), `use moxbots_group_native_check::session_user_action::{stamp_session_request, public_key_spki_base64};
fn main() {
 let body = r#"{"sessionId":"synthetic-group","requestId":"11111111-1111-4111-8111-111111111111","expectedRevision":0,"projectRevision":1,"title":"Test","memberBotIds":["a","b"]}"#;
 let path = "/api/session/task-orchestration/bot-group";
 let mut headers = None;
 stamp_session_request(&mut headers, "POST", path, Some(body), "synthetic-group", true).unwrap();
 println!("{}", serde_json::json!({"body":body,"path":path,"headers":headers,"publicKey":public_key_spki_base64()}));
}
`);
function cargo(command) {
  try { return execFileSync('cargo', [command, '--offline', '--quiet', '--manifest-path', resolve(output, 'Cargo.toml')], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) {
    writeFileSync(resolve(output, `${command}-failure.log`), `${error.stdout ?? ''}\n${error.stderr ?? ''}`);
    throw new Error(`Isolated native ${command} failed; evidence: ${output}`, { cause: error });
  }
}
console.log(`Checking actual native source in ${output}`);
writeFileSync(resolve(output, 'rust-tests.log'), cargo('test'));
const proof = JSON.parse(cargo('run'));
const oldKey = process.env.MYAGENTS_USER_ACTION_PUBLIC_KEY;
try {
  process.env.MYAGENTS_USER_ACTION_PUBLIC_KEY = proof.publicKey;
  const request = new Request(`http://local${proof.path}`, { method: 'POST', body: proof.body, headers: proof.headers });
  assert.equal(verifySessionUserAction(request, 'synthetic-group', proof.body), true);
  assert.equal(verifySessionUserAction(request, 'another-group', proof.body), false);
  assert.equal(verifySessionUserAction(request, 'synthetic-group', proof.body.replace('"b"', '"c"')), false);
  assert.equal(verifySessionUserAction(new Request('http://local/chat/send', { method: 'POST', body: proof.body, headers: proof.headers }), 'synthetic-group', proof.body), false);
} finally {
  if (oldKey === undefined) delete process.env.MYAGENTS_USER_ACTION_PUBLIC_KEY;
  else process.env.MYAGENTS_USER_ACTION_PUBLIC_KEY = oldKey;
}
const sha256 = value => createHash('sha256').update(value).digest('hex');
const result = { status: 'PASS', syntheticKeys: true, rustVersion, sourceSha256: sha256(readFileSync(source)), lockSha256: sha256(lock),
  checks: ['actual Rust signing module unit suite', 'actual Rust signature accepted by Node verifier', 'wrong Session/body/path rejected'], output };
writeFileSync(resolve(output, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
