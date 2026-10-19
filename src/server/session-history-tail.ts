import { open } from 'node:fs/promises';
import type { SessionMessage } from './types/session';

/** Display-only V1 tail. Never issues a writer cursor or repairs/migrates files. */
export async function readSessionHistoryTail(path: string, limit: number): Promise<SessionMessage[]> {
  const file = await open(path, 'r');
  try {
    let position = (await file.stat()).size;
    let suffix: Buffer[] = [];
    const messages: SessionMessage[] = [];
    const admit = (line: Buffer) => {
      if (!line.length) return;
      try {
        messages.push(JSON.parse(line.toString('utf8')) as SessionMessage);
      } catch {
        // Match the legacy reader's per-line corruption tolerance.
      }
    };
    while (position > 0 && messages.length < limit) {
      const start = Math.max(0, position - 64 * 1024);
      const chunk = Buffer.alloc(position - start);
      let offset = 0;
      while (offset < chunk.length) {
        const { bytesRead } = await file.read(chunk, offset, chunk.length - offset, start + offset);
        if (!bytesRead) throw new Error('Session history changed during tail read');
        offset += bytesRead;
      }
      position = start;
      let end = chunk.length;
      for (let index = chunk.length - 1; index >= 0; index--) {
        if (chunk[index] !== 10) continue;
        const head = chunk.subarray(index + 1, end);
        admit(suffix.length ? Buffer.concat([head, ...suffix.reverse()]) : head);
        suffix = [];
        end = index;
        if (messages.length >= limit) break;
      }
      // Accumulate fragments and concatenate once per row, including huge tool
      // results. Re-concatenating a growing suffix per chunk is quadratic.
      if (messages.length < limit) suffix.push(Buffer.from(chunk.subarray(0, end)));
    }
    if (position === 0 && messages.length < limit) admit(Buffer.concat(suffix.reverse()));
    return messages.reverse();
  } finally {
    await file.close();
  }
}
