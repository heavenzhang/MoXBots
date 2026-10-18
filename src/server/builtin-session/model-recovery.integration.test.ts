import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionModelRecovery } from './model-recovery';
import { ContextRecoveryController } from '../openai-bridge/context-recovery';
import type { AnthropicRequest } from '../openai-bridge/types/anthropic';

const fixture = vi.hoisted(() => ({ home: '', failIndex: false }));
vi.mock('os', async original => ({ ...await original<typeof import('os')>(), homedir: () => fixture.home }));
vi.mock('fs', async original => {
  const actual = await original<typeof import('fs')>();
  return { ...actual, renameSync: (...args: Parameters<typeof actual.renameSync>) => {
    if (fixture.failIndex && String(args[1]).endsWith('sessions.json')) throw new Error('fixture metadata publication denied');
    return actual.renameSync(...args);
  } };
});
let store: typeof import('../SessionStore');

beforeEach(async () => {
  fixture.home = await mkdtemp(join(tmpdir(), 'moxbots-durable-model-'));
  fixture.failIndex = false;
  vi.resetModules();
  store = await import('../SessionStore');
});
afterEach(async () => {
  await store.drainSessionTranscripts();
  await rm(fixture.home, { recursive: true, force: true });
});

async function harness(goalId?: string) {
  const id = randomUUID();
  const native = randomUUID();
  await store.saveSessionMetadata({ id, sdkSessionId: native, agentDir: fixture.home, title: 'recovery fixture',
    createdAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(), runtime: 'builtin' });
  let turnId = 'original-turn';
  let now = 100_000;
  const body: AnthropicRequest = { model: 'fixture', max_tokens: 128, messages: [
    { role: 'user', content: 'Write exactly once, then report completion.' },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'first-id', name: 'write_record', input: { record: 1 } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'first-id', content: 'record committed successfully' }] },
  ] };
  const make = () => {
    const ledger = new ContextRecoveryController({ scope: () => turnId, isActive: () => true,
      initialLedger: store.loadBuiltinContextLedger(id, native),
      backup: (request, metadata) => store.archiveBuiltinContextRequest(id, request, metadata, () => true),
      persistLedger: value => store.saveBuiltinContextLedger(id, native, value, () => true) });
    const recovery = new SessionModelRecovery({
      read: () => store.getBuiltinModelRecovery(id),
      write: (next, expected, live) => store.updateBuiltinModelRecovery(id, native, next, expected, live, () => true),
      current: () => ({ sdkSessionId: native, routeIdentity: 'same-route', turnId, goalId }),
      isLive: () => true, prepare: async request => ledger.protectInference(await request.json()), now: () => now,
    });
    return { recovery, ledger };
  };
  const request = () => new Request('http://127.0.0.1/inference', { method: 'POST', body: JSON.stringify(body) });
  return { id, native, make, request, advance: () => { now += 15_000; turnId = 'restored-turn'; } };
}

describe('durable model recovery through the real SessionStore', () => {
  it.each([undefined, 'original-goal'])('restores native history and action evidence for owner %s', async goalId => {
    const h = await harness(goalId);
    const first = h.make();
    expect(await first.recovery.wait(h.request(), { status: 503, attempt: 4, usingBackup: false })).toBe(15_000);
    const saved = store.getSessionMetadata(h.id)!.modelRecovery!;
    expect(saved).toMatchObject({ status: 'waiting', sdkSessionId: h.native, turnId: 'original-turn' });
    expect(saved.goalId).toBe(goalId);
    const disk = JSON.parse(await readFile(join(fixture.home, '.myagents', 'sessions.json'), 'utf8'));
    expect(disk[0].modelRecovery).toEqual(saved);
    expect((await stat(join(fixture.home, '.myagents', 'context-recovery', h.id, `ledger-${h.native}.json`))).mode & 0o777).toBe(0o600);
    h.advance();
    // Reconstruct controllers from disk; native tool IDs are deliberately absent from the key.
    const restored = h.make();
    const request = h.request();
    expect(await restored.recovery.admit(request)).toEqual({ delayMs: 0 });
    expect(await restored.ledger.authorizeTool('write_record', { record: 1 })).toContain('already completed');
    expect(store.getSessionMetadata(h.id)!.modelRecovery).toMatchObject({
      id: saved.id, startedAt: saved.startedAt, deadlineAt: saved.deadlineAt, attempt: 1, turnId: 'restored-turn',
    });
    // A late controller from the old Query cannot pause the new binding.
    await first.recovery.pause('late old Query stop');
    expect(store.getSessionMetadata(h.id)!.modelRecovery!.status).toBe('waiting');
    await restored.recovery.complete(request);
    expect(store.getSessionMetadata(h.id)!.modelRecovery).toBeUndefined();
  });

  it('keeps explicit Stop durable and rejects an automatic cold restart', async () => {
    const h = await harness();
    const first = h.make();
    await first.recovery.wait(h.request(), { status: 429, attempt: 4, usingBackup: false });
    await first.recovery.pause('user stopped');
    const restored = h.make();
    await expect(restored.recovery.admit(h.request())).rejects.toThrow('stopped');
    expect(store.getSessionMetadata(h.id)!.modelRecovery).toMatchObject({ status: 'paused', reason: 'user stopped' });
  });

  it('rejects a lost-native-identity writer and leaves the checkpoint intact', async () => {
    const h = await harness();
    const first = h.make();
    await first.recovery.wait(h.request(), { status: 503, attempt: 4, usingBackup: false });
    const saved = store.getSessionMetadata(h.id)!.modelRecovery!;
    expect(await store.updateBuiltinModelRecovery(h.id, randomUUID(), undefined, saved, () => true, () => true)).toBe(false);
    expect(store.getSessionMetadata(h.id)!.modelRecovery).toEqual(saved);
  });

  it('keeps Stop authoritative when the sessions index cannot be rewritten', async () => {
    const h = await harness();
    const first = h.make();
    await first.recovery.wait(h.request(), { status: 503, attempt: 4, usingBackup: false });
    fixture.failIndex = true;
    expect(await first.recovery.pause('user stopped')).toBe(true);
    // The index is intentionally stale. The same Store's fsynced stop fence
    // prohibits restart even though its waiting metadata could not be changed.
    expect(store.getSessionMetadata(h.id)!.modelRecovery!.status).toBe('waiting');
    expect(store.getBuiltinModelRecovery(h.id)!.status).toBe('paused');
    await expect(h.make().recovery.admit(h.request())).rejects.toThrow('stopped');
    fixture.failIndex = false;
  });
});
