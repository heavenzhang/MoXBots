import { mkdtemp, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ContextRecoveryController } from '../openai-bridge/context-recovery';
import type { AnthropicRequest } from '../openai-bridge/types/anthropic';

const state = vi.hoisted(() => ({ home: '' }));
vi.mock('os', async original => ({ ...await original<typeof import('os')>(), homedir: () => state.home }));
let store: typeof import('../SessionStore');
let id: string;
beforeEach(async () => {
  state.home = await mkdtemp(join(tmpdir(), 'moxbots-checkpoint-'));
  vi.resetModules();
  store = await import('../SessionStore');
  id = (await store.createSession('/workspace')).id;
});
afterEach(async () => {
  await store.getActiveSessionTranscript(id)?.revoke();
  await rm(state.home, { recursive: true, force: true });
});

it('backs up the exact request privately and commits a restart-safe identity-scoped ledger', async () => {
  const request = { messages: [{ role: 'user', content: 'synthetic evidence' }] };
  const digest = createHash('sha256').update(JSON.stringify(request)).digest('hex');
  const archive = await store.archiveBuiltinContextRequest(id, request, { digest, scope: 'goal-turn' }, () => true);
  expect(JSON.parse(await readFile(archive, 'utf8')).request).toEqual(request);
  if (process.platform !== 'win32') expect((await stat(archive)).mode & 0o777).toBe(0o600);
  const original = await readFile(archive, 'utf8');
  await store.archiveBuiltinContextRequest(id, request, { digest, scope: 'same-request-new-turn' }, () => true);
  expect(await readFile(archive, 'utf8')).toBe(original);
  const ledger = { version: 1, completed: [], uncertain: ['a'.repeat(64)], denied: [], blocked: false };
  await store.saveBuiltinContextLedger(id, id, ledger, () => true);
  expect(store.loadBuiltinContextLedger(id, id)).toEqual(ledger);
  expect(store.loadBuiltinContextLedger(id, 'different-sdk-history')).toBeUndefined();
  await expect(store.saveBuiltinContextLedger(id, 'different-sdk-history', ledger, () => true)).rejects.toThrow('owner changed');
  await store.getActiveSessionTranscript(id)?.revoke();
  vi.resetModules(); store = await import('../SessionStore');
  expect(store.loadBuiltinContextLedger(id, id)).toEqual(ledger);
  const ledgerPath = join(archive, '..', `ledger-${id}.json`);
  await unlink(ledgerPath);
  expect(() => store.loadBuiltinContextLedger(id, id)).toThrow('context_recovery_required');
  await writeFile(ledgerPath, '{invalid');
  expect(() => store.loadBuiltinContextLedger(id, id)).toThrow('context_recovery_required');
});

it('refuses cancelled archives and stale-owner ledger writes', async () => {
  await expect(store.archiveBuiltinContextRequest(id, {}, { digest: 'a'.repeat(64), scope: 'turn' }, () => false)).rejects.toThrow('changed');
  await expect(store.saveBuiltinContextLedger(id, id, {}, () => false)).rejects.toThrow('changed');
  await expect(store.saveBuiltinContextLedger(id, id, {}, () => true, () => false)).rejects.toThrow('changed');
  expect(store.loadBuiltinContextLedger(id, id)).toBeUndefined();
});

it('retains the real SessionStore ledger when a restored Session only reconciles read-only', async () => {
  const snapshot = await store.loadSessionTranscript(id);
  expect((await store.appendSessionMessages(id, snapshot.cursor, [{ id: 'fixture-user', role: 'user',
    content: 'Inspect the unfinished fixture task.', timestamp: new Date().toISOString() }])).ok).toBe(true);
  const body: AnthropicRequest = { model: 'fixture', max_tokens: 64, stream: true,
    messages: [{ role: 'user', content: 'Inspect the unfinished fixture task.' }] };
  const options = { scope: () => 'original-turn', isActive: () => true, protectStreaming: true,
    backup: (request: AnthropicRequest, metadata: { digest: string; scope: string }) =>
      store.archiveBuiltinContextRequest(id, request, metadata, () => true),
    persistLedger: (ledger: unknown) => store.saveBuiltinContextLedger(id, id, ledger, () => true) };
  const original = new ContextRecoveryController(options);
  await original.protectInference(body);
  await original.authorizeTool('write_record', { id: 'fixture-unknown' });
  const ledger = store.loadBuiltinContextLedger(id, id);
  await store.getActiveSessionTranscript(id)?.revoke();
  vi.resetModules(); store = await import('../SessionStore');
  const restored = new ContextRecoveryController({ ...options, scope: () => 'explicit-followup',
    initialLedger: store.loadBuiltinContextLedger(id, id) });
  const execute = vi.fn(async (request: AnthropicRequest) => {
    expect(request).toEqual(body);
    expect(restored.beforeTool('Read', { file_path: '/fixture/status.json' })).toBeUndefined();
    expect(restored.beforeTool('write_record', { id: 'fixture-other' })).toContain('read-only');
    return Response.json({ type: 'message', content: [{ type: 'text', text: 'Read-only evidence retained.' }] });
  });
  const response = await restored.run(new Request('http://127.0.0.1/fixture'), body, execute);
  expect(response.status, await response.clone().text()).toBe(200); await response.text();
  expect(execute).toHaveBeenCalledTimes(1);
  expect(store.loadBuiltinContextLedger(id, id)).toEqual(ledger);
  expect(restored.canRetryInference()).toBe(false);
});
