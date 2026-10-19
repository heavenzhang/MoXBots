import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { expect, it, vi } from 'vitest';

it.skipIf(process.platform === 'win32').each([[false, false, false], [true, false, false], [true, true, false], [true, true, true]])(
  'retires the orphaned Unix group (ignores TERM: %s, draining first: %s, fast drain: %s)', async (ignoreTerm, drainingFirst, fastDrain) => {
  const scratch = await mkdtemp(join(tmpdir(), 'sidecar-parent-'));
  const receipt = join(scratch, 'retired.json');
  const ready = join(scratch, 'ready.json');
  const nativeReady = join(scratch, 'native.json');
  const toolReady = join(scratch, 'tool.json');
  const drainStarted = join(scratch, 'draining.json');
  const moduleUrl = new URL('./sidecar-parent.ts', import.meta.url).href;
  const toolScript = `
    import { writeFileSync } from 'node:fs';
    ${ignoreTerm ? "process.on('SIGTERM', () => {});" : ''}
    writeFileSync(${JSON.stringify(toolReady)}, JSON.stringify({ pid: process.pid }));
    setInterval(() => {}, 1000);
  `;
  const nativeScript = `
    import { spawn } from 'node:child_process';
    import { writeFileSync } from 'node:fs';
    spawn(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(toolScript)}], { stdio: 'ignore' });
    writeFileSync(${JSON.stringify(nativeReady)}, JSON.stringify({ pid: process.pid }));
    setInterval(() => {}, 1000);
  `;
  const workerScript = `
    import { retireOrphanedSidecar, signalOrphanedSidecarGroup, watchSidecarParent } from ${JSON.stringify(moduleUrl)};
    import { spawn } from 'node:child_process';
    import { writeFileSync } from 'node:fs';
    const parent = process.ppid;
    const hold = setInterval(() => {}, 1000);
    spawn(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(nativeScript)}], { stdio: 'ignore' });
    let shuttingDown = false;
    function beginShutdown(reason) {
      if (shuttingDown) return;
      shuttingDown = true;
      writeFileSync(${JSON.stringify(drainStarted)}, 'draining');
      setTimeout(() => {
        writeFileSync(${JSON.stringify(receipt)}, JSON.stringify({ parent, current: process.ppid }));
        clearInterval(hold);
        // All desktop shutdowns finish their exact group, even if parent loss
        // happened and this drain finished before the next monitor tick.
        signalOrphanedSidecarGroup('SIGKILL');
      }, ${fastDrain ? 400 : drainingFirst ? 1_600 : 200});
    }
    process.on('SIGTERM', () => { beginShutdown('SIGTERM'); });
    watchSidecarParent(String(parent), () => {
      retireOrphanedSidecar(() => {
        beginShutdown('parent-exit');
      });
    });
    writeFileSync(${JSON.stringify(ready)}, JSON.stringify({ pid: process.pid, parent }));
  `;
  const parentScript = `
    import { spawn } from 'node:child_process';
    // Rust spawn_tree creates this same process-group leader on Unix.
    spawn(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(workerScript)}], { stdio: 'ignore', detached: true });
    setInterval(() => {}, 1000);
  `;
  let parent: ChildProcess | undefined;
  let childPid: number | undefined;
  let nativePid: number | undefined;
  let toolPid: number | undefined;
  try {
    parent = spawn(process.execPath, ['--input-type=module', '-e', parentScript], { stdio: 'ignore' });
    await vi.waitFor(async () => {
      const identity = JSON.parse(await readFile(ready, 'utf8')) as { pid: number; parent: number };
      childPid = identity.pid;
      expect(identity.parent).toBe(parent?.pid);
      nativePid = JSON.parse(await readFile(nativeReady, 'utf8')).pid as number;
      toolPid = JSON.parse(await readFile(toolReady, 'utf8')).pid as number;
    }, { timeout: 5_000 });
    if (drainingFirst) {
      process.kill(childPid!, 'SIGTERM');
      await vi.waitFor(async () => { expect(await readFile(drainStarted, 'utf8')).toBe('draining'); });
    }
    const exited = once(parent, 'exit');
    parent.kill('SIGKILL');
    await exited;
    await vi.waitFor(async () => {
      const retired = JSON.parse(await readFile(receipt, 'utf8')) as { parent: number; current: number };
      expect(retired.parent).toBe(parent?.pid);
      expect(retired.current).not.toBe(retired.parent);
    }, { timeout: 4_000 });
    await vi.waitFor(() => {
      for (const pid of [childPid!, nativePid!, toolPid!]) {
        expect(() => process.kill(pid, 0)).toThrow();
      }
    }, { timeout: 3_000 });
  } finally {
    parent?.kill('SIGKILL');
    if (childPid) {
      try { process.kill(-childPid, 'SIGKILL'); } catch { /* already retired */ }
    }
    await rm(scratch, { recursive: true, force: true });
  }
});
