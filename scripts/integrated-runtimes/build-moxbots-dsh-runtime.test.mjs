import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { selectedNpmEntrypoint } from './build-moxbots-dsh-runtime.mjs';

test('direct Node builds preserve the official childCli npm context on both toolchain layouts', t => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-npm-context-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = path => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, '// fixture'); return path; };
  const windowsNpm = write(join(root, 'windows/node_modules/npm/bin/npm-cli.js'));
  assert.equal(selectedNpmEntrypoint(join(root, 'windows/node.exe'), {}), windowsNpm);
  const unixNpm = write(join(root, 'unix/lib/node_modules/npm/bin/npm-cli.js'));
  assert.equal(selectedNpmEntrypoint(join(root, 'unix/bin/node'), {}), unixNpm);
  assert.equal(selectedNpmEntrypoint(join(root, 'missing/node'), { npm_execpath: unixNpm }), unixNpm);
  assert.throws(() => selectedNpmEntrypoint(join(root, 'missing/node'), {}), /entrypoint is missing/);
});
