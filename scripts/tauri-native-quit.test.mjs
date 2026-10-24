import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = file => readFileSync(resolve(root, file), 'utf8');
const digest = source => createHash('sha256').update(source).digest('hex');

// Verify every original packaged file, with a narrow allowlist for the paired
// projection repair. This keeps an unrelated framework change out of the vendor.
for (const [name, expected] of [
  ['tao', ['src/event.rs', 'src/platform_impl/macos/app_delegate.rs']],
  ['tauri-runtime-wry', ['src/lib.rs']],
]) test(`${name}: provenance limits changes to the native request projection`, () => {
  const originals = JSON.parse(read(`vendor/${name}/UPSTREAM_FILES.json`));
  const changed = Object.entries(originals)
    .filter(([file, sha]) => digest(readFileSync(resolve(root, 'vendor', name, file))) !== sha)
    .map(([file]) => file).sort();
  assert.deepEqual(changed, expected);
});

test('Cargo selects both native projection crates with the event lifetime patch', () => {
  const cargo = read('src-tauri/Cargo.toml').split('[patch.crates-io]')[1];
  const lock = read('src-tauri/Cargo.lock');
  for (const [name, version] of [['tauri', '2.11.2'], ['tao', '0.35.3'], ['tauri-runtime-wry', '2.11.4']]) {
    assert.ok(cargo.includes(`${name} = { path = "../vendor/${name}" }`));
    const block = lock.split(`name = "${name}"\n`)[1]?.split('[[package]]')[0];
    assert.ok(block?.startsWith(`version = "${version}"\n`));
    assert.ok(!block.includes('source = '), `${name} must resolve to the local reviewed crate`);
  }
});
