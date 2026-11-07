import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const stress = 'agent_network::credential_slots::tests::real_process_commits_serialize_without_losing_routes';
const workflow = fs.readFileSync(new URL('../.github/workflows/test.yml', import.meta.url), 'utf8');
const lines = workflow.split('\n');
const begin = lines.findIndex((line) => line.includes('# BEGIN REQUIRED CREDENTIAL ROUTE STRESS ISOLATION'));
const end = lines.findIndex((line) => line.includes('# END REQUIRED CREDENTIAL ROUTE STRESS ISOLATION'));
assert.ok(begin >= 0 && end > begin);
assert.equal(lines[begin - 1].trim(), 'set -euo pipefail');
const script = lines.slice(begin - 1, end).map((line) => line.replace(/^          /, '')).join('\n');

function exercise(scenario, withRunnerTemp = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moxbot-rust-ci-isolation-'));
  const bin = path.join(root, 'bin');
  const temp = path.join(root, 'temp');
  const home = path.join(root, 'home');
  const trace = path.join(root, 'cargo.jsonl');
  for (const dir of [bin, temp, home]) fs.mkdirSync(dir, { mode: 0o700 });
  const mock = [
    '#!' + process.execPath,
    "const fs = require('node:fs');",
    'const args = process.argv.slice(2);',
    "fs.appendFileSync(process.env.CARGO_TRACE, JSON.stringify(args) + '\\n');",
    'const scenario = process.env.ISOLATION_SCENARIO;',
    "if (args.includes('--list')) {",
    "  if (scenario === 'discovery-failure') process.exit(17);",
    "  if (scenario === 'missing') console.log(process.env.STRESS_CASE + '_other: test');",
    '  else {',
    "    console.log(process.env.STRESS_CASE + ': test');",
    "    if (scenario === 'duplicate') console.log(process.env.STRESS_CASE + ': test');",
    '  }',
    "} else if (args.includes('--skip')) {",
    "  if (scenario === 'suite-failure') process.exit(19);",
    "} else if (args.includes('--exact')) {",
    "  if (scenario === 'stress-failure') process.exit(23);",
    '} else process.exit(91);',
  ].join('\n');
  const cargo = path.join(bin, 'cargo');
  fs.writeFileSync(cargo, mock, { mode: 0o700 });
  try {
    const env = {
      PATH: bin + ':/usr/bin:/bin', HOME: home, TMPDIR: temp, LANG: 'C',
      CARGO_TRACE: trace, ISOLATION_SCENARIO: scenario, STRESS_CASE: stress,
    };
    if (withRunnerTemp) env.RUNNER_TEMP = temp;
    const result = spawnSync('/bin/bash', ['-c', script], {
      env, encoding: 'utf8', timeout: 5000,
    });
    assert.ifError(result.error);
    const calls = fs.existsSync(trace) ? fs.readFileSync(trace, 'utf8').trim().split('\n').map(JSON.parse) : [];
    return { ...result, calls };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('all Rust targets run once outside the stress case, then the exact stress case is mandatory once', () => {
  const result = exercise('success');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, [
    ['test', '--manifest-path', 'src-tauri/Cargo.toml', '--locked', '--lib', stress, '--', '--exact', '--list'],
    ['test', '--manifest-path', 'src-tauri/Cargo.toml', '--locked', '--', '--skip', stress],
    ['test', '--manifest-path', 'src-tauri/Cargo.toml', '--locked', '--lib', stress, '--', '--exact'],
  ]);
});

for (const scenario of ['missing', 'duplicate']) {
  test('case discovery fails closed for ' + scenario + ' exact stress case', () => {
    const result = exercise(scenario);
    assert.notEqual(result.status, 0);
    assert.equal(result.calls.length, 1);
  });
}

test('cargo discovery failure propagates through the tee pipeline', () => {
  const result = exercise('discovery-failure');
  assert.equal(result.status, 17);
  assert.equal(result.calls.length, 1);
});

test('remaining suite failure stops before stress and is never retried', () => {
  const result = exercise('suite-failure');
  assert.equal(result.status, 19);
  assert.equal(result.calls.length, 2);
});

test('isolated stress failure fails the gate and is never retried', () => {
  const result = exercise('stress-failure');
  assert.equal(result.status, 23);
  assert.equal(result.calls.length, 3);
});

test('missing private runner temp fails before any cargo command', () => {
  const result = exercise('success', false);
  assert.notEqual(result.status, 0);
  assert.equal(result.calls.length, 0);
});
