/** Explicit local native fault matrix. Never part of the default test pool or release CI.
 * Child smokes own private HOME/workspaces and synthetic loopback providers; no paid inference.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { resolve, isAbsolute, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const usage = 'node scripts/verify-reliability-matrix.mjs --out ABSOLUTE_NEW_DIRECTORY [--rounds 1..10]';
let output; let rounds = 1;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') output = args[++i];
  else if (args[i] === '--rounds') rounds = Number(args[++i]);
  else throw new Error(usage);
}
if (!output || !isAbsolute(output) || !Number.isInteger(rounds) || rounds < 1 || rounds > 10) throw new Error(usage);
// Never overwrite an earlier evidence run.
await mkdir(output, { mode: 0o700 });
const cases = [
  ['stream-once', 'verify-stream-continuation-loopback.ts', []],
  ['stream-twice', 'verify-stream-continuation-loopback.ts', ['--twice']],
  ['synthetic-goal-twice', 'verify-stream-continuation-loopback.ts', ['--goal', '--twice']],
  ['stop-second-wait', 'verify-stream-continuation-loopback.ts', ['--twice', '--stop']],
  ['availability-query-restart', 'verify-model-recovery-loopback.ts', []],
  ['native-background-exit', 'verify-native-tool-error-loopback.ts', ['--background-at-failure']],
  ['native-receipt-write-failure', 'verify-native-tool-error-loopback.ts', ['--fail-success-persist']],
  ['provider-cooldown-sdk-repeat', 'verify-model-failover-loopback.ts', ['--retry-after']],
  ['delivered-stream-no-replay', 'verify-model-failover-loopback.ts', ['--stream-failure']],
  ['stop-fast-retry', 'verify-model-failover-loopback.ts', ['--stop-during-retry']],
];
const sources = [...new Set(cases.map(([, script]) => `scripts/${script}`)),
  'scripts/verify-reliability-matrix.mjs', 'src/server/openai-bridge/context-recovery.ts',
  'src/server/openai-bridge/native-operation-journal.ts', 'src/server/openai-bridge/model-failover.ts',
  'src/server/builtin-session/model-recovery.ts', 'src/server/builtin-session/stream-continuation.ts'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHashes = Object.fromEntries(await Promise.all(sources.map(async path => [path, sha(await readFile(join(root, path)))])));
const startedAt = new Date().toISOString();
const results = [];
async function save(status) {
  await writeFile(join(output, 'result.json'), JSON.stringify({ status, startedAt, updatedAt: new Date().toISOString(),
    rounds, planned: rounds * cases.length, finished: results.length, sourceHashes, results,
    boundary: 'Actual SDK/native MCP/shell, synthetic providers and compressed recovery clock. Fixture Goal/persistence; not signed app, real provider, Rust Goal or power-loss acceptance.' }, null, 2), { mode: 0o600 });
}
await save('RUNNING');
for (let round = 1; round <= rounds; round++) {
  for (const [name, script, flags] of cases) {
    const logPath = join(output, `${String(round).padStart(2, '0')}-${name}.log`);
    const log = await open(logPath, 'wx', 0o600);
    const began = Date.now();
    // Each child has its own internal abort/finally; this outer bound also catches
    // a broken fixture. Only this spawned fixture receives the termination signal.
    const exit = await new Promise(resolveExit => {
      const child = spawn(process.execPath, ['--import', 'tsx', `scripts/${script}`, ...flags], {
        cwd: root, stdio: ['ignore', log.fd, log.fd], timeout: 110_000, killSignal: 'SIGTERM',
      });
      child.once('error', error => resolveExit({ code: null, error: error.code ?? 'spawn_failed' }));
      child.once('close', (code, signal) => resolveExit({ code, signal }));
    });
    await log.close();
    const bytes = await readFile(logPath);
    const rows = bytes.toString('utf8').split('\n').flatMap(line => {
      try { const value = JSON.parse(line); return value && (value.passed === true || value.status === 'PASS') ? [value] : []; }
      catch { return []; }
    });
    const receipt = rows.at(-1);
    const passed = exit.code === 0 && receipt?.counter === 1;
    results.push({ round, name, passed, exit, durationMs: Date.now() - began, logPath, logSha256: sha(bytes), receipt });
    await save(passed ? 'RUNNING' : 'FAILED');
    console.log(JSON.stringify({ round, name, passed, finished: results.length, planned: rounds * cases.length }));
    if (!passed) process.exit(1); // Stop at first failed scenario; preserve every log.
  }
}
await save('PASS');
console.log(JSON.stringify({ status: 'PASS', completed: results.length, output }));
