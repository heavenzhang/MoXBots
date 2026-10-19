import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Pure counters/error projections only: does not open a microphone, account or device.
if (process.platform !== 'darwin') throw new Error('Native Swift speech tests require macOS');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temp = mkdtempSync(path.join(tmpdir(), 'moxbots-speech-diagnostics-'));
const executable = path.join(temp, 'speech-diagnostics-tests');
function run(command, args) {
  const result = spawnSync(command, args, { cwd: repo, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal})`);
}
try {
  run('xcrun', ['swiftc', '-swift-version', '5', 'mobile/app/modules/moxbots-remote/ios/SpeechCaptureDiagnostics.swift', 'mobile/app/tests/native/SpeechCaptureDiagnosticsTests.swift', '-o', executable]);
  run(executable, []);
} finally { rmSync(temp, { recursive: true, force: true }); }
