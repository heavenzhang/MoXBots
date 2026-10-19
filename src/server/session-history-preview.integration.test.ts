import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { applyTranscriptOperation, createTranscriptProjection } from '../shared/sessionTranscript';
import { TranscriptFile } from './session-transcript/file';

const state = vi.hoisted(() => ({ home: '' }));
vi.mock('os', async original => ({ ...await original<typeof import('os')>(), homedir: () => state.home }));
let store: typeof import('./SessionStore');
let data: string;
const rows = Array.from({ length: 90 }, (_, index) => ({ id: String(index), role: 'assistant' as const, content: `正文😀${index}`, timestamp: 't' }));
beforeAll(async () => {
  state.home = await mkdtemp(join(tmpdir(), 'history-preview-store-'));
  data = join(state.home, '.myagents');
  await mkdir(join(data, 'sessions'), { recursive: true });
  await mkdir(join(data, 'sessions-v2'));
  await writeFile(join(data, 'sessions.json'), JSON.stringify(['v1', 'v2', 'legacy'].map(id => ({
    id, agentDir: '/synthetic', title: 'History', runtime: 'builtin', createdAt: 't', lastActiveAt: 't',
    ...(id === 'v2' ? { transcriptFormat: 2 } : {}),
  }))));
  await writeFile(join(data, 'sessions/v1.jsonl'), rows.map(row => JSON.stringify(row)).join('\n'));
  await writeFile(join(data, 'sessions/legacy.json'), JSON.stringify({ messages: rows }));
  const projection = createTranscriptProjection();
  for (const message of rows) applyTranscriptOperation(projection, { kind: 'message-create', message });
  const file = new TranscriptFile({ sessionId: 'v2', filePath: join(data, 'sessions-v2/v2.jsonl'), generation: 'g1', allowCreate: true, withLock: run => run() });
  await file.replace({ generation: 'g1', revision: 0 }, projection, 0);
  store = await import('./SessionStore');
});
afterAll(async () => { await rm(state.home, { recursive: true, force: true }); });

it.each(['v1', 'v2', 'legacy'])('reads the exact display tail for %s without activating a writer or migrating history', async id => {
  const source = join(data, id === 'v2' ? 'sessions-v2/v2.jsonl' : `sessions/${id}.${id === 'legacy' ? 'json' : 'jsonl'}`);
  const before = await readFile(source);
  expect((await store.getSessionDisplayHistory(id, 20)).map(row => ({ id: row.id, content: row.content })))
    .toEqual(rows.slice(-20).map(row => ({ id: row.id, content: row.content })));
  expect(store.getActiveSessionTranscript(id)).toBeUndefined();
  expect(await readFile(source)).toEqual(before);
  expect(await readdir(join(data, 'sessions'))).not.toContain('legacy.jsonl');
});

it('rejects conflicting V2 files rather than displaying a legacy fallback', async () => {
  await writeFile(join(data, 'sessions/v2.jsonl'), JSON.stringify(rows[0]));
  await expect(store.getSessionDisplayHistory('v2', 20)).rejects.toThrow('conflict');
});
