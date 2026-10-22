import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionModelRecovery } from './model-recovery';
import { createBridgeHandler } from '../openai-bridge/handler';
import { ModelFailoverController } from '../openai-bridge/model-failover';
import { SameTurnStreamContinuation } from './stream-continuation';
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

async function harness(goalId?: string, activeTranscript = false) {
  const id = randomUUID();
  const native = randomUUID();
  if (activeTranscript) {
    await store.createSession(fixture.home, { id, sdkSessionId: native, title: 'recovery fixture' });
    await store.flushSessionTranscriptsForUpdate();
  } else {
    await store.saveSessionMetadata({ id, sdkSessionId: native, agentDir: fixture.home, title: 'recovery fixture',
      createdAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(), runtime: 'builtin' });
  }
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

  it.each(['false', 'throw'] as const)('fences failed automatic enqueue despite transcript flush %s and rejects cold recovery', async failure => {
    const h = await harness(undefined, true);
    const first = h.make();
    expect(await first.recovery.interrupted(h.request())).toBe(true);
    const saved = store.getBuiltinModelRecovery(h.id)!;
    const active = store.getActiveSessionTranscript(h.id)!;
    const flush = vi.spyOn(active.writer, 'flush');
    if (failure === 'throw') flush.mockRejectedValue(new Error('fixture transcript IO failure'));
    else flush.mockResolvedValue(false);
    const onFailure = vi.fn();
    const enqueue = vi.fn(() => false);
    const continuation = new SameTurnStreamContinuation({ recovery: first.recovery,
      rootId: () => 'original-turn', isLive: () => true, now: () => saved.nextRetryAt,
      advance: () => { throw new Error('failed admission must not advance inference'); },
      enqueue, observe: () => {}, onFailure });
    try {
      continuation.interrupted(); expect(continuation.schedule()).toBe(true);
      await vi.waitFor(() => expect(onFailure).toHaveBeenCalledOnce());
      expect(enqueue).toHaveBeenCalledOnce();
      const rows = JSON.parse(await readFile(join(fixture.home, '.myagents', 'sessions.json'), 'utf8'));
      expect(rows[0].modelRecovery).toMatchObject({ id: saved.id, status: 'waiting' });
      // A failed body flush must not block the existing independent control fence.
      expect(store.getBuiltinModelRecovery(h.id)).toMatchObject({ id: saved.id, status: 'paused' });
      flush.mockRestore(); await active.revoke();
      vi.resetModules(); store = await import('../SessionStore');
      expect(store.getBuiltinModelRecovery(h.id)).toMatchObject({ id: saved.id, status: 'paused' });
      await expect(h.make().recovery.admit(h.request())).rejects.toThrow('stopped');
    } finally { continuation.reset(); flush.mockRestore(); }
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


describe('native result settled-stream integration with the original writer and recovery owner', () => {
  it.each([undefined, 'same-goal'])('continues two namespaces on the same budget and rejects cold proof for %s', async goalId => {
    const id = randomUUID(); const native = randomUUID();
    await store.saveSessionMetadata({ id, sdkSessionId: native, agentDir: fixture.home, title: 'isolated proof',
      createdAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(), runtime: 'builtin' });
    let now = Date.now(); let generation = 0; let background = false; let active = true;
    let queued: { marker: string; reminder: string } | undefined;
    const scope = () => `original-root:${generation}`;
    const context = new ContextRecoveryController({ scope, isActive: () => active, canRecover: () => !background,
      protectStreaming: () => !background, recoveryOwner: { sessionId: id, sdkSessionId: native },
      backup: (value, metadata) => store.archiveBuiltinContextRequest(id, value, metadata, () => active),
      archiveSettledInterruption: (value, digest, scope, live) => store.archiveBuiltinSettledInterruption(id, value, { digest, scope }, () => active && live()),
      persistLedger: (value, live) => store.saveBuiltinContextLedger(id, native, value, () => active, live) });
    context.bindNoDispatchOwner({ sessionId: id, sdkSessionId: native, queryGeneration: 1, isCurrent: () => active });
    const prepare = async (request: Request) => context.protectInference(await request.json());
    const options = { read: () => store.getBuiltinModelRecovery(id),
      write: (next: import('../../shared/modelRecovery').ModelRecoveryState | undefined, expected: import('../../shared/modelRecovery').ModelRecoveryState | undefined, live: () => boolean) => store.updateBuiltinModelRecovery(id, native, next, expected, live, () => active),
      current: () => ({ sdkSessionId: native, routeIdentity: 'same-route', turnId: 'original-root', goalId }),
      isLive: () => active, prepare, prepareSettledInterruption: () => context.prepareSettledInterruption(() => active && !background),
      now: () => now, onInterrupted: () => continuation.interrupted() };
    const recovery = new SessionModelRecovery(options);
    const continuation = new SameTurnStreamContinuation({ recovery, rootId: () => 'original-root', isLive: () => active && !background,
      advance: value => { const protectedActions = context.prepareStreamContinuation(value); generation++; failover.endTurn(); return protectedActions; },
      enqueue: (permit, reminder) => { queued = { marker: permit.marker, reminder }; return true; }, observe: () => {} , now: () => now });
    const failover = new ModelFailoverController({ scope, isActive: () => active, canRetry: () => context.canRetryInference(),
      canSwitch: () => !background, resolveBackup: () => undefined, onSwitch: () => {}, retryDelaysMs: [0, 0, 0], recovery });
    const events = (partial = false) => [
      { type: 'message_start', message: { id: 'fixture', type: 'message', role: 'assistant', model: 'fixture', content: [], usage: { input_tokens: 1, output_tokens: 0 } } },
      ...(!partial ? [{ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } }, { type: 'message_stop' }] : []),
    ].map(value => `data: ${JSON.stringify(value)}\n\n`).join('');
    let partial = false; let dispatches = 0;
    const upstream = createServer(async (request, response) => {
      for await (const _chunk of request) { /* drain fixture input without storing it */ }
      dispatches++; response.writeHead(200, { 'content-type': 'text/event-stream' }); response.end(events(partial));
    });
    await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
    const address = upstream.address(); if (!address || typeof address === 'string') throw new Error('fixture listen failed');
    const handler = createBridgeHandler({ logger: null,
      getUpstreamConfig: () => ({ providerId: 'fixture', apiProtocol: 'anthropic', baseUrl: `http://127.0.0.1:${address.port}`, apiKey: 'fixture', contextRecovery: context, modelFailover: failover }) });
    try {
    const body: AnthropicRequest = { model: 'fixture', max_tokens: 16, stream: true, messages: [
      { role: 'user', content: 'Continue only from completed action.' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'historic-write', name: 'write_record', input: { record: 1 } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'historic-write', content: 'committed' }] },
    ] };
    const run = async (value: AnthropicRequest) => handler(new Request('http://localhost/v1/messages', { method: 'POST', body: JSON.stringify(value), headers: { 'content-type': 'application/json' } }));
    expect(await (await run(body)).text()).toContain('message_stop');
    background = true; partial = true;
    const backgroundBody = structuredClone(body); backgroundBody.messages.push({ role: 'user', content: 'background inference' });
    expect(await (await run(backgroundBody)).text()).toContain('automatic_replay_blocked');
    background = false;
    const next = structuredClone(body); next.messages.push({ role: 'user', content: 'foreground after background terminal' });
    expect((await run(next)).status).toBe(409);
    now = Date.now();
    expect(await recovery.armSettledInterruption()).toBe(true);
    const first = store.getBuiltinModelRecovery(id)!;
    const durableLedger = store.loadBuiltinContextLedger(id, native) as { streamArmedOnly: boolean };
    expect(durableLedger.streamArmedOnly).toBe(false);
    const coldContext = new ContextRecoveryController({ scope, initialLedger: durableLedger, isActive: () => true,
      backup: async () => 'unused' });
    expect(await coldContext.authorizeTool('write_record', { record: 1 }, 'cold-replay')).toContain('already completed');
    const disk = JSON.parse(await readFile(join(fixture.home, '.myagents', 'sessions.json'), 'utf8'));
    expect(disk[0].modelRecovery.liveProof).toEqual(first.liveProof);
    const proofPath = join(fixture.home, '.myagents', 'context-recovery', id, `${first.liveProof!.receiptId}.json`);
    const proof = JSON.parse(await readFile(proofPath, 'utf8'));
    expect(proof.request.kind).toBe('settled-stream-no-tool-dispatch');
    expect(proof.request.manifest.fingerprints).toHaveLength(2);
    now = first.nextRetryAt;
    expect(continuation.schedule()).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(queued).toBeDefined(); next.messages.push({ role: 'user', content: queued!.reminder });
    expect(continuation.authorizeRequest(next)).toBe(true);
    partial = true;
    expect(await (await run(next)).text()).toContain('automatic_replay_blocked');
    const second = store.getBuiltinModelRecovery(id)!;
    expect(second.id).toBe(first.id); expect(second.deadlineAt).toBe(first.deadlineAt);
    now = second.nextRetryAt; queued = undefined;
    expect(continuation.schedule()).toBe(true); await new Promise(resolve => setTimeout(resolve, 0));
    expect(queued).toBeDefined();
    const final = structuredClone(next); final.messages.push({ role: 'user', content: queued!.reminder });
    expect(continuation.authorizeRequest(final)).toBe(true);
    partial = false; expect(await (await run(final)).text()).toContain('message_stop');
    expect(store.getBuiltinModelRecovery(id)!.id).toBe(first.id);
    expect(await context.authorizeTool('write_record', { record: 1 }, 'replay-id')).toContain('already completed');
    const cold = new SessionModelRecovery(options);
    await expect(cold.admit(new Request('http://localhost/model'))).rejects.toThrow('live Query proof');
    expect(store.getBuiltinModelRecovery(id)!.status).toBe('paused');
    expect(dispatches).toBe(4);
    } finally {
      active = false; continuation.reset(); upstream.closeAllConnections();
      await new Promise<void>(resolve => upstream.close(() => resolve()));
    }
  });
});

it('Stop fences a settled checkpoint committed by the writer before arm has adopted its return value', async () => {
  const id = randomUUID(); const native = randomUUID(); const now = Date.now();
  await store.saveSessionMetadata({ id, sdkSessionId: native, agentDir: fixture.home, title: 'isolated Stop CAS',
    createdAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(), runtime: 'builtin' });
  let release!: () => void; let committed = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const options = { read: () => store.getBuiltinModelRecovery(id),
    write: async (next: import('../../shared/modelRecovery').ModelRecoveryState | undefined, expected: import('../../shared/modelRecovery').ModelRecoveryState | undefined, live: () => boolean) => {
      const accepted = await store.updateBuiltinModelRecovery(id, native, next, expected, live, () => true);
      if (accepted && next?.status === 'waiting') { committed = true; await gate; }
      return accepted;
    }, current: () => ({ sdkSessionId: native, routeIdentity: 'route', turnId: 'original-root', goalId: 'goal' }),
    isLive: () => true, prepare: async () => {}, now: () => now,
    prepareSettledInterruption: async () => ({ id: 'isolated-proof', archive: 'fixture-proof', interruptedAt: now, isCurrent: () => true }) };
  const recovery = new SessionModelRecovery(options);
  const arm = recovery.armSettledInterruption();
  try {
    await vi.waitFor(() => expect(committed).toBe(true));
    expect(await recovery.pause('user stopped')).toBe(true);
    expect(store.getBuiltinModelRecovery(id)).toMatchObject({ version: 2, status: 'paused' });
  } finally { release(); await arm; }
  const disk = JSON.parse(await readFile(join(fixture.home, '.myagents', 'sessions.json'), 'utf8'));
  expect(disk[0].modelRecovery.status).toBe('paused');
  await expect(new SessionModelRecovery(options).admit(new Request('http://localhost/model'))).rejects.toThrow();
});
