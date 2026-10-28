/** Explicit-path, read-only forensic report. No default HOME, network, repair or execution. */
import { open } from 'node:fs/promises';
import { inspectRecoveryLedger } from '../src/server/builtin-session/recovery-ledger-inspection';

async function boundedRead(path: string, limit: number): Promise<string> {
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > limit) throw new Error('Inspection file is not regular or exceeds its limit');
    const buffer = Buffer.alloc(Math.min(stat.size + 1, limit + 1));
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    const after = await file.stat();
    if (offset > stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) {
      throw new Error('Inspection source changed during read; use a consistent private snapshot');
    }
    return buffer.subarray(0, offset).toString('utf8');
  } finally { await file.close(); }
}
try {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--ledger' || args[2] !== '--native-history') {
    throw new Error('Usage: node --import tsx/esm scripts/inspect-recovery-ledger.ts --ledger FILE --native-history FILE');
  }
  const ledger = JSON.parse(await boundedRead(args[1], 16 * 1024 * 1024));
  const text = await boundedRead(args[3], 128 * 1024 * 1024);
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length > 100_000) throw new Error('Native record inspection limit exceeded');
  const records = lines.map(line => JSON.parse(line) as unknown);
  console.log(JSON.stringify(inspectRecoveryLedger(ledger, records), null, 2));
} catch {
  // Parse errors can contain private command/result fragments; never echo the raw exception.
  console.error('Recovery inspection failed. Check explicit paths, size, JSON, identity, digest and snapshot consistency. No files were changed.');
  process.exitCode = 1;
}
