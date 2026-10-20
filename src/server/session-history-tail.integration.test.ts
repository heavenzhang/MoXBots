import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { readSessionHistoryTail } from './session-history-tail';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture(wire: string) {
  const root = await mkdtemp(join(tmpdir(), 'history-tail-'));
  roots.push(root);
  const path = join(root, 'session.jsonl');
  await writeFile(path, wire);
  return path;
}
const row = (id: number, content = '中文历史 😀') => ({ id: String(id), role: 'assistant', content, timestamp: 't' });

it.each(['\n', '\r\n', ''])('preserves exact newest rows with %j final delimiter and corrupt rows', async delimiter => {
  const messages = Array.from({ length: 130 }, (_, index) => row(index, '长中文😀'.repeat(index === 125 ? 30000 : 1)));
  const wire = messages.map(message => JSON.stringify(message)).join('\r\n') + '\n{broken\n \n' + delimiter;
  const path = await fixture(wire);
  expect(await readSessionHistoryTail(path, 20)).toEqual(messages.slice(-20));
  expect(await readFile(path, 'utf8')).toBe(wire);
});

it('handles missing final newline, an empty file and a file with fewer rows than the page', async () => {
  const messages = [row(1), row(2)];
  expect(await readSessionHistoryTail(await fixture(messages.map(message => JSON.stringify(message)).join('\n')), 20)).toEqual(messages);
  expect(await readSessionHistoryTail(await fixture(''), 20)).toEqual([]);
});

it('does not parse the older multi-megabyte prefix when opening a short newest page', async () => {
  const messages = Array.from({ length: 20 }, (_, index) => row(index));
  const path = await fixture('invalid older record '.repeat(500000) + '\n' + messages.map(message => JSON.stringify(message)).join('\n') + '\n');
  expect(await readSessionHistoryTail(path, 20)).toEqual(messages);
});
