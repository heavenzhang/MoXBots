import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { expect, it, vi } from 'vitest';

it.skipIf(process.platform === 'win32')('retires an actual Unix child after its desktop parent is killed', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'sidecar-parent-'));
  const receipt = join(scratch, 'retired.json');
  const ready = join(scratch, 'ready.json');
  const moduleUrl = new URL('./sidecar-parent.ts', import.meta.url).href;
  const workerScript = `
    import { watchSidecarParent } from ${JSON.stringify(moduleUrl)};
    import { writeFileSync } from 'node:fs';
    const parent = process.ppid;
    const hold = setInterval(() => {}, 1000);
    watchSidecarParent(String(parent), () => {
      writeFileSync(${JSON.stringify(receipt)}, JSON.stringify({ parent, current: process.ppid }));
      clearInterval(hold);
      process.exit(0);
    });
    writeFileSync(${JSON.stringify(ready)}, JSON.stringify({ pid: process.pid, parent }));
  `;
  const parentScript = `
    import { spawn } from 'node:child_process';
    spawn(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(workerScript)}], { stdio: 'ignore' });
    setInterval(() => {}, 1000);
  `;
  let parent: ChildProcess | undefined;
  let childPid: number | undefined;
  try {
    parent = spawn(process.execPath, ['--input-type=module', '-e', parentScript], { stdio: 'ignore' });
    await vi.waitFor(async () => {
      const identity = JSON.parse(await readFile(ready, 'utf8')) as { pid: number; parent: number };
      childPid = identity.pid;
      expect(identity.parent).toBe(parent?.pid);
    }, { timeout: 5_000 });
    const exited = once(parent, 'exit');
    parent.kill('SIGKILL');
    await exited;
    await vi.waitFor(async () => {
      const retired = JSON.parse(await readFile(receipt, 'utf8')) as { parent: number; current: number };
      expect(retired.parent).toBe(parent?.pid);
      expect(retired.current).not.toBe(retired.parent);
    }, { timeout: 4_000 });
    await vi.waitFor(() => {
      expect(() => process.kill(childPid!, 0)).toThrow();
    }, { timeout: 3_000 });
  } finally {
    parent?.kill('SIGKILL');
    if (childPid) {
      try { process.kill(childPid, 'SIGKILL'); } catch { /* already retired */ }
    }
    await rm(scratch, { recursive: true, force: true });
  }
});
