import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ home: '' }));
vi.mock('os', async original => ({ ...await original<typeof import('os')>(), homedir: () => fixture.home }));

let store: typeof import('../SessionStore');
let agent: typeof import('../agent-session');
let lifecycle: typeof import('../builtin-session/lifecycle');
let queue: typeof import('../builtin-session/queue');
let id: string;
let query: Parameters<typeof lifecycle.setQuerySession>[0];

beforeEach(async () => {
  fixture.home = await mkdtemp(join(tmpdir(), 'moxbots-review-idle-'));
  vi.resetModules();
  store = await import('../SessionStore');
  id = (await store.createSession('/fixture/workspace')).id;
  const binding = await import('../session-engine/product-session-binding');
  await binding.resetProductSessionBinding({ sessionId: id, allowLazySessionMaterialization: false });
  agent = await import('../agent-session');
  lifecycle = await import('../builtin-session/lifecycle');
  queue = await import('../builtin-session/queue');
  query = { close: vi.fn(), setMcpServers: vi.fn() } as never;
  lifecycle.setQuerySession(query);
  // A parked streaming iterator owns a warm SDK Query after the turn ends.
  lifecycle.setSessionProcessing(true);
});

afterEach(async () => {
  lifecycle.wakeGenerator(null);
  lifecycle.resetLifecycleForTest();
  queue.resetQueueForTest();
  await store.getActiveSessionTranscript(id)?.revoke();
  await rm(fixture.home, { recursive: true, force: true });
});

function parkReadyPrewarm() {
  lifecycle.lifecycleState.preWarming = true;
  lifecycle.setSdkControlReady(true);
  return lifecycle.waitForMessage(() => undefined);
}

it('reviews a cold restored ready pre-warm without sending the first user turn', async () => {
  const waiting = parkReadyPrewarm();
  await expect(agent.inspectBuiltinRecoveryActions()).resolves.toMatchObject({ sessionId: id, actions: [] });
  expect(lifecycle.hasMessageResolver()).toBe(true);
  expect(lifecycle.lifecycleState.preWarming).toBe(true);
  expect(query?.close).not.toHaveBeenCalled();
  expect(store.loadBuiltinContextLedger(id, id)).toBeUndefined();
  lifecycle.wakeGenerator(null);
  await expect(waiting).resolves.toBeNull();
});

it('refuses a ready pre-warm until its generator is actually parked', async () => {
  lifecycle.lifecycleState.preWarming = true;
  lifecycle.setSdkControlReady(true);
  await expect(agent.inspectBuiltinRecoveryActions()).rejects.toThrow('recovery_review_busy_or_owner_changed');
});

it('refuses a parked pre-warm before SDK control readiness', async () => {
  lifecycle.lifecycleState.preWarming = true;
  void lifecycle.waitForMessage(() => undefined);
  await expect(agent.inspectBuiltinRecoveryActions()).rejects.toThrow('recovery_review_busy_or_owner_changed');
});

it('does not adopt a previous Query generator as the new ready Query', async () => {
  void parkReadyPrewarm();
  lifecycle.setQuerySession({ close: vi.fn() } as never);
  lifecycle.setSdkControlReady(true);
  await expect(agent.inspectBuiltinRecoveryActions()).rejects.toThrow('recovery_review_busy_or_owner_changed');
});

it('refuses a warm Query after abort has been requested', async () => {
  lifecycle.requestAbort();
  await expect(agent.inspectBuiltinRecoveryActions()).rejects.toThrow('recovery_review_busy_or_owner_changed');
});

it('refuses a warm Query while its termination promise is still owned', async () => {
  lifecycle.setSessionTerminationPromise(Promise.resolve());
  await expect(agent.inspectBuiltinRecoveryActions()).rejects.toThrow('recovery_review_busy_or_owner_changed');
});

it('keeps background work protected even on a cold ready parked Query', async () => {
  void parkReadyPrewarm();
  lifecycle.replaceQueryBackgroundActivity(query!, [{ task_id: 'fixture-cold-child', task_type: 'local_agent', description: '' }]);
  await expect(agent.inspectBuiltinRecoveryActions()).rejects.toThrow('recovery_review_busy_or_owner_changed');
});

it('reviews an idle warm Query through the real builtin adapter without executing or writing', async () => {
  await expect(agent.inspectBuiltinRecoveryActions()).resolves.toMatchObject({
    sessionId: id, sdkSessionId: id, actions: [], resolvedCount: 0,
  });
  expect(lifecycle.lifecycleState.query).toBe(query);
  expect(store.loadBuiltinContextLedger(id, id)).toBeUndefined();
  expect(query?.close).not.toHaveBeenCalled();
});

it('still refuses a spawning iterator before it owns a Query', async () => {
  lifecycle.setQuerySession(null);
  await expect(agent.inspectBuiltinRecoveryActions()).rejects.toThrow('recovery_review_busy_or_owner_changed');
});

it('keeps the original durable ledger unchanged while reviewing a warm idle Query', async () => {
  const ledger = { version: 1, completed: [], uncertain: [], denied: ['a'.repeat(64)], blocked: false };
  await store.saveBuiltinContextLedger(id, id, ledger, () => true);
  await expect(agent.inspectBuiltinRecoveryActions()).resolves.toMatchObject({ sessionId: id, actions: [], resolvedCount: 0 });
  expect(store.loadBuiltinContextLedger(id, id)).toEqual(ledger);
  expect(query?.close).not.toHaveBeenCalled();
});

it('still refuses pre-warm setup even when a Query exists', async () => {
  lifecycle.lifecycleState.preWarming = true;
  await expect(agent.inspectBuiltinRecoveryActions()).rejects.toThrow('recovery_review_busy_or_owner_changed');
});

it('still refuses background work after the root turn becomes idle', async () => {
  lifecycle.replaceQueryBackgroundActivity(query!, [{ task_id: 'fixture-child', task_type: 'local_agent', description: '' }]);
  await expect(agent.inspectBuiltinRecoveryActions()).rejects.toThrow('recovery_review_busy_or_owner_changed');
});

it('still refuses a queued turn and leaves the queued item untouched', async () => {
  queue.pushMessage({ id: 'queued-turn', messageText: 'fixture input' } as never);
  await expect(agent.inspectBuiltinRecoveryActions()).rejects.toThrow('recovery_review_busy_or_owner_changed');
  expect(queue.snapshotQueue().messageQueue).toHaveLength(1);
});

it('still refuses a rewind boundary on the same Product Session', async () => {
  await store.updateSessionMetadata(id, { sdkResumeSessionAt: 'fixture-boundary' });
  await expect(agent.inspectBuiltinRecoveryActions()).rejects.toThrow('recovery_review_busy_or_owner_changed');
});
