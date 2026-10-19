import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelRecoveryState } from '../../shared/modelRecovery';
import { SessionModelRecovery } from './model-recovery';

const request = () => new Request('http://localhost/model', { method: 'POST', body: '{}' });
const failure = (attempt = 1, extra: Partial<{ status: number; retryAfterMs: number; usingBackup: boolean }> = {}) => ({
  status: 503,
  attempt,
  usingBackup: false,
  ...extra,
});

function harness() {
  let now = 10_000;
  let state: ModelRecoveryState | undefined;
  let current: { sdkSessionId: string; routeIdentity: string; turnId: string; goalId?: string } | undefined = {
    sdkSessionId: 'native-1', routeIdentity: 'route-1', turnId: 'turn-1', goalId: 'goal-1',
  };
  let live = true;
  const prepare = vi.fn<(request: Request) => Promise<void>>(async () => {});
  const write = vi.fn(async (
    next: ModelRecoveryState | undefined,
    expected: ModelRecoveryState | undefined,
    isLive: () => boolean,
  ) => {
    if (!isLive() || state !== expected) return false;
    state = next;
    return true;
  });
  const create = () => new SessionModelRecovery({
    read: () => state,
    write,
    current: () => current,
    isLive: () => live,
    prepare,
    now: () => now,
  });
  return {
    create,
    prepare,
    write,
    read: () => state,
    setState: (value: ModelRecoveryState | undefined) => { state = value; },
    setNow: (value: number) => { now = value; },
    setCurrent: (value: typeof current) => { current = value; },
    setLive: (value: boolean) => { live = value; },
  };
}

describe('SessionModelRecovery', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('persists the recovery checkpoint before granting a retry delay', async () => {
    const h = harness();
    const recovery = h.create();
    const delay = await recovery.wait(request(), failure());
    expect(delay).toBe(15_000);
    expect(h.read()).toMatchObject({ status: 'waiting', attempt: 1, lastStatus: 503 });
    expect(h.prepare).toHaveBeenCalledOnce();
    expect(recovery.isWaiting()).toBe(true);
  });

  it('admits a cold-start continuation only after restoring its ledger and preserves nextRetryAt', async () => {
    const h = harness();
    const seed = h.create();
    await seed.wait(request(), failure());
    const saved = h.read()!;
    h.setNow(saved.nextRetryAt - 4_000);
    h.setCurrent({ sdkSessionId: 'native-1', routeIdentity: 'route-1', turnId: 'turn-restored', goalId: 'goal-1' });
    const restored = h.create();
    const req = request();
    await expect(restored.admit(req)).resolves.toEqual({ delayMs: 4_000 });
    expect(h.prepare).toHaveBeenCalledTimes(2);
    expect(h.read()).toMatchObject({
      id: saved.id,
      attempt: saved.attempt,
      startedAt: saved.startedAt,
      deadlineAt: saved.deadlineAt,
      nextRetryAt: saved.nextRetryAt,
      turnId: 'turn-restored',
    });
    await restored.complete(req);
    expect(h.read()).toBeUndefined();
  });

  it('allows normal first-attempt admission when no recovery checkpoint exists', async () => {
    const h = harness();
    const recovery = h.create();
    await expect(recovery.admit(request())).resolves.toBeUndefined();
    expect(h.prepare).not.toHaveBeenCalled();
  });

  it('fails closed on an expired cold-start checkpoint', async () => {
    const h = harness();
    const seed = h.create();
    await seed.wait(request(), failure());
    h.setNow(h.read()!.deadlineAt);
    const restored = h.create();
    await expect(restored.admit(request())).rejects.toThrow('Model recovery window expired');
    expect(h.read()).toMatchObject({ status: 'paused', reason: 'Model recovery window expired' });
  });

  it('does not grant inference retry when durable persistence fails', async () => {
    const h = harness();
    h.write.mockResolvedValueOnce(false);
    const recovery = h.create();
    await expect(recovery.wait(request(), failure())).resolves.toBeUndefined();
    expect(h.read()).toBeUndefined();
    expect(recovery.isWaiting()).toBe(false);
  });

  it('returns the remaining delay after a slow durable checkpoint write', async () => {
    const h = harness();
    h.write.mockImplementationOnce(async (next, expected, isLive) => {
      h.setNow(17_000);
      if (!isLive() || h.read() !== expected) return false;
      h.setState(next);
      return true;
    });
    const recovery = h.create();
    await expect(recovery.wait(request(), failure())).resolves.toBe(8_000);
    expect(h.read()!.nextRetryAt).toBe(25_000);
  });

  it('pauses after a successful admission write that reaches the deadline', async () => {
    const h = harness();
    const seed = h.create();
    await seed.wait(request(), failure());
    const saved = h.read()!;
    h.setCurrent({ sdkSessionId: 'native-1', routeIdentity: 'route-1', turnId: 'restored', goalId: 'goal-1' });
    h.write.mockImplementationOnce(async (next, expected, isLive) => {
      if (!isLive() || h.read() !== expected) return false;
      h.setState(next);
      h.setNow(saved.deadlineAt);
      return true;
    });
    const restored = h.create();
    await expect(restored.admit(request())).rejects.toThrow('Model recovery window expired');
    expect(h.read()).toMatchObject({ status: 'paused', reason: 'Model recovery window expired' });
  });

  it('revokes resume permission if time reaches the deadline during a long wait', async () => {
    const h = harness();
    const recovery = h.create();
    const req = request();
    await recovery.wait(req, failure());
    h.setNow(h.read()!.deadlineAt);
    await expect(recovery.validateResume(req)).resolves.toBe(false);
    expect(h.read()).toMatchObject({ status: 'paused', reason: 'Model recovery window expired' });
    expect(recovery.isWaiting()).toBe(false);
  });

  it('reports a failed durable pause while retaining local revocation', async () => {
    const h = harness();
    const recovery = h.create();
    await recovery.wait(request(), failure());
    h.write.mockResolvedValueOnce(false);
    await expect(recovery.pause('stop')).resolves.toBe(false);
    expect(recovery.isWaiting()).toBe(false);
    expect(h.read()).toMatchObject({ status: 'waiting' });
  });

  it('coalesces duplicate pauses while a durable stop write is held', async () => {
    const h = harness();
    const recovery = h.create();
    await recovery.wait(request(), failure());
    let release!: () => void;
    h.write.mockImplementationOnce(async (next, expected, isLive) => new Promise<boolean>(resolve => {
      release = () => {
        const committed = isLive() && h.read() === expected;
        if (committed) h.setState(next);
        resolve(committed);
      };
    }));
    const first = recovery.pause('interrupt stop');
    expect(recovery.isWaiting()).toBe(false);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const second = recovery.pause('abort stop');
    expect(second).toBe(first);
    release();
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(h.write).toHaveBeenCalledTimes(2); // initial checkpoint plus one shared pause write
    expect(h.read()).toMatchObject({ status: 'paused', reason: 'interrupt stop' });
  });

  it('detaches a held old pause when a new turn is explicitly reset', async () => {
    const h = harness();
    const recovery = h.create();
    await recovery.wait(request(), failure());
    let release!: () => void;
    h.write.mockImplementationOnce(async (next, expected, isLive) => new Promise<boolean>(resolve => {
      release = () => {
        const committed = isLive() && h.read() === expected;
        if (committed) h.setState(next);
        resolve(committed);
      };
    }));
    const oldPause = recovery.pause('old turn stopped');
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));

    h.setState(undefined); // Explicit owner CAS-cleared the paused checkpoint.
    recovery.resetForNewTurn();
    h.setCurrent({ sdkSessionId: 'native-1', routeIdentity: 'route-1', turnId: 'turn-new', goalId: 'goal-1' });
    await recovery.wait(request(), failure());
    const newCheckpoint = h.read()!;
    await expect(recovery.pause('new turn stopped')).resolves.toBe(true);
    const newPaused = h.read()!;
    release();
    await expect(oldPause).resolves.toBe(false);
    expect(h.read()).toEqual(newPaused);
    expect(h.read()).toMatchObject({ id: newCheckpoint.id, turnId: 'turn-new', status: 'paused' });
  });

  it('rejects a concurrent different Request for the same owner', async () => {
    const h = harness();
    let release!: () => void;
    h.prepare.mockImplementationOnce(() => new Promise<undefined>(resolve => {
      release = () => resolve(undefined);
    }));
    const recovery = h.create();
    const first = recovery.wait(request(), failure());
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await expect(recovery.wait(request(), failure())).resolves.toBeUndefined();
    release();
    await first;
    expect(h.prepare).toHaveBeenCalledOnce();
  });

  it('pause during prepare invalidates its late completion and persists paused state', async () => {
    const h = harness();
    let release!: () => void;
    h.prepare.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const recovery = h.create();
    const waiting = recovery.wait(request(), failure());
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await recovery.pause('user paused');
    release();
    await expect(waiting).resolves.toBeUndefined();
    expect(h.read()).toMatchObject({ status: 'paused', reason: 'user paused' });
    expect(recovery.isWaiting()).toBe(false);
  });

  it('pause during a pending write wins over the late write completion', async () => {
    const h = harness();
    let finishWrite!: () => void;
    h.write.mockImplementationOnce(async (next, expected, isLive) => new Promise<boolean>(resolve => {
      finishWrite = () => {
        if (isLive() && h.read() === expected) h.setState(next);
        resolve(isLive());
      };
    }));
    const recovery = h.create();
    const waiting = recovery.wait(request(), failure());
    await vi.waitFor(() => expect(finishWrite).toBeTypeOf('function'));
    await recovery.pause('user paused');
    finishWrite();
    await expect(waiting).resolves.toBeUndefined();
    expect(h.read()).toMatchObject({ status: 'paused', reason: 'user paused' });
  });

  it('persists a pause after the live Query identity has already disappeared', async () => {
    const h = harness();
    const recovery = h.create();
    await recovery.wait(request(), failure());
    h.setCurrent(undefined);
    await recovery.pause('goal stopped');
    expect(h.read()).toMatchObject({ status: 'paused', reason: 'goal stopped' });
  });

  it('pauses a persisted checkpoint from a fresh owner before its first HTTP admission', async () => {
    const h = harness();
    const seed = h.create();
    await seed.wait(request(), failure());
    const restoredOwner = h.create(); // Constructor snapshots the durable waiting checkpoint.
    await expect(restoredOwner.pause('stopped before first admission')).resolves.toBe(true);
    expect(h.read()).toMatchObject({ status: 'paused', reason: 'stopped before first admission' });
    expect(restoredOwner.isWaiting()).toBe(false);
  });

  it.each([
    ['rebound turn', 'successor-turn'],
    ['same turn', 'turn-1'],
  ])('persists stop during held admission prepare for a %s', async (_label, turnId) => {
    const h = harness();
    const seed = h.create();
    await seed.wait(request(), failure());
    const saved = h.read()!;
    h.setCurrent({ sdkSessionId: 'native-1', routeIdentity: 'route-1', turnId, goalId: 'goal-1' });
    let release!: () => void;
    h.prepare.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const recovery = h.create();
    const req = request();
    const admission = recovery.admit(req);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));

    await expect(recovery.pause('stop during cold admission')).resolves.toBe(true);
    expect(h.read()).toMatchObject({
      id: saved.id,
      status: 'paused',
      reason: 'stop during cold admission',
      attempt: saved.attempt,
      turnId,
    });
    release();
    await expect(admission).rejects.toThrow();
    const reopened = h.create();
    await expect(reopened.admit(request())).rejects.toThrow('stop during cold admission');
    expect(h.read()).toMatchObject({ status: 'paused', reason: 'stop during cold admission' });
  });

  it('does not let a stale constructor snapshot pause a successor turn checkpoint', async () => {
    const h = harness();
    const seed = h.create();
    await seed.wait(request(), failure());
    const staleOwner = h.create();
    const saved = h.read()!;
    const successor = {
      ...saved,
      turnId: 'successor-turn',
      attempt: saved.attempt + 1,
      nextRetryAt: saved.nextRetryAt + 15_000,
    };
    h.setState(successor);
    h.setCurrent({ sdkSessionId: 'native-1', routeIdentity: 'route-1', turnId: 'successor-turn', goalId: 'goal-1' });
    h.write.mockClear();
    await expect(staleOwner.pause('old owner stop')).resolves.toBe(true);
    expect(h.read()).toEqual(successor);
    expect(h.write).not.toHaveBeenCalled();
  });

  it('does not pause over a same-id checkpoint rebound by a newer Query', async () => {
    const h = harness();
    const recovery = h.create();
    await recovery.wait(request(), failure());
    const saved = h.read()!;
    const rebound = {
      ...saved,
      turnId: 'new-query-turn',
      attempt: saved.attempt + 1,
      nextRetryAt: saved.nextRetryAt + 15_000,
    };
    h.setState(rebound);
    h.setCurrent({ sdkSessionId: 'native-1', routeIdentity: 'route-1', turnId: rebound.turnId, goalId: 'goal-1' });
    h.write.mockClear();
    await expect(recovery.pause('old Query paused late')).resolves.toBe(true);
    expect(h.read()).toEqual(rebound);
    expect(h.write).not.toHaveBeenCalled();
  });

  it('does not pause over a newer rebind while an older wait is preparing', async () => {
    const h = harness();
    const recovery = h.create();
    const req = request();
    await recovery.wait(req, failure());
    const prior = h.read()!;
    let release!: () => void;
    h.write.mockImplementationOnce(async (next, expected, isLive) => new Promise<boolean>(resolve => {
      release = () => {
        if (isLive() && h.read() === expected) h.setState(next);
        resolve(isLive());
      };
    }));
    h.setCurrent({ sdkSessionId: 'native-1', routeIdentity: 'route-1', turnId: 'older-next-turn', goalId: 'goal-1' });
    const oldWait = recovery.wait(req, failure(2));
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const rebound = {
      ...prior,
      turnId: 'newer-turn',
      attempt: prior.attempt + 1,
      nextRetryAt: prior.nextRetryAt + 15_000,
    };
    h.setState(rebound);
    h.setCurrent({ sdkSessionId: 'native-1', routeIdentity: 'route-1', turnId: rebound.turnId, goalId: 'goal-1' });
    h.write.mockClear();
    await expect(recovery.pause('older wait cancellation')).resolves.toBe(true);
    release();
    await expect(oldWait).resolves.toBeUndefined();
    expect(h.read()).toEqual(rebound);
    expect(h.write).not.toHaveBeenCalled();
  });

  it('reset invalidates a late wait even if Query liveness is restored, then accepts a new turn', async () => {
    const h = harness();
    let release!: () => void;
    h.prepare.mockImplementationOnce(() => new Promise<undefined>(resolve => {
      release = () => resolve(undefined);
    }));
    const recovery = h.create();
    const oldWait = recovery.wait(request(), failure());
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    h.setState(undefined); // The explicit owner CAS-cleared the paused checkpoint.
    recovery.resetForNewTurn();
    release();
    await expect(oldWait).resolves.toBeUndefined();
    await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledOnce());
    const nextDelay = await recovery.wait(request(), failure());
    expect(nextDelay).toBe(15_000);
    expect(h.read()).toMatchObject({ status: 'waiting', turnId: 'turn-1', attempt: 1 });
  });

  it('complete cannot clear a concurrently paused checkpoint', async () => {
    const h = harness();
    const recovery = h.create();
    await recovery.wait(request(), failure());
    const completing = recovery.complete(request());
    await recovery.pause('stop');
    await completing;
    expect(h.read()).toMatchObject({ status: 'paused', reason: 'stop' });
  });

  it('serializes the next admission behind a pending successful completion write', async () => {
    const h = harness();
    const recovery = h.create();
    const first = request();
    await recovery.wait(first, failure());
    let release!: () => void;
    h.write.mockImplementationOnce(async (next, expected, isLive) => new Promise<boolean>(resolve => {
      release = () => {
        const committed = isLive() && h.read() === expected;
        if (committed) h.setState(next);
        resolve(committed);
      };
    }));
    const completing = recovery.complete(first);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const next = request();
    let admitted = false;
    const admission = recovery.admit(next).then(value => { admitted = true; return value; });
    await Promise.resolve();
    expect(admitted).toBe(false);
    release();
    await completing;
    await expect(admission).resolves.toBeUndefined();
    expect(admitted).toBe(true);
    expect(h.read()).toBeUndefined();
  });

  it('clears a delivered terminal receipt even if the SDK then aborts its HTTP request', async () => {
    const h = harness();
    const recovery = h.create();
    const controller = new AbortController();
    const req = new Request('http://localhost/model', { method: 'POST', body: '{}', signal: controller.signal });
    await recovery.wait(req, failure());
    let release!: () => void;
    h.write.mockImplementationOnce(async (next, expected, isLive) => new Promise<boolean>(resolve => {
      release = () => {
        const committed = isLive() && h.read() === expected;
        if (committed) h.setState(next);
        resolve(committed);
      };
    }));
    const completing = recovery.complete(req);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    controller.abort('SDK consumed the terminal receipt');
    release();
    await completing;
    expect(h.read()).toBeUndefined();
  });

  it('does not resurrect a checkpoint when pause races a pending completion', async () => {
    const h = harness();
    const recovery = h.create();
    const first = request();
    await recovery.wait(first, failure());
    let release!: () => void;
    h.write.mockImplementationOnce(async (next, expected, isLive) => new Promise<boolean>(resolve => {
      release = () => {
        const committed = isLive() && h.read() === expected;
        if (committed) h.setState(next);
        resolve(committed);
      };
    }));
    const completing = recovery.complete(first);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await recovery.pause('stop during cleanup');
    release();
    await completing;
    expect(h.read()).toMatchObject({ status: 'paused', reason: 'stop during cleanup' });
    await expect(recovery.validateResume(first)).resolves.toBe(false);
  });

  it('restores a same-history checkpoint without refreshing its original window', async () => {
    const h = harness();
    const first = h.create();
    await first.wait(request(), failure());
    const original = h.read()!;
    h.setNow(original.nextRetryAt);
    // A process-local Query may be rebound to a new turn while native history and route remain exact.
    h.setCurrent({ sdkSessionId: 'native-1', routeIdentity: 'route-1', turnId: 'turn-2', goalId: 'goal-1' });
    const restored = h.create();
    expect(await restored.wait(request(), failure(1))).toBe(30_000);
    expect(h.read()).toMatchObject({
      id: original.id,
      startedAt: original.startedAt,
      deadlineAt: original.deadlineAt,
      turnId: 'turn-2',
      attempt: 2,
    });
    expect(h.prepare).toHaveBeenCalledOnce();
  });

  it('pauses when the recovery deadline is exhausted', async () => {
    const h = harness();
    const recovery = h.create();
    const req = request();
    await recovery.wait(req, failure());
    h.setNow(h.read()!.deadlineAt - 1);
    await expect(recovery.wait(req, failure(2))).resolves.toBeUndefined();
    h.setNow(h.read()!.deadlineAt);
    expect(h.read()).toMatchObject({ status: 'paused', reason: 'Model recovery window expired' });
  });

  it('does not retry earlier than a Retry-After longer than the remaining window', async () => {
    const h = harness();
    const recovery = h.create();
    const req = request();
    await recovery.wait(req, failure());
    const prior = h.read()!;
    h.setNow(prior.deadlineAt - 1_000);
    await expect(recovery.wait(req, failure(2, { retryAfterMs: 600_000 }))).resolves.toBeUndefined();
    expect(h.read()).toMatchObject({ status: 'paused', reason: 'Model recovery window expired' });
  });

  it.each([
    [{ sdkSessionId: 'different-native', routeIdentity: 'route-1', turnId: 'turn-2', goalId: 'goal-1' }],
    [{ sdkSessionId: 'native-1', routeIdentity: 'different-route', turnId: 'turn-2', goalId: 'goal-1' }],
  ])('does not inherit a checkpoint for a different native history or route', async current => {
    const h = harness();
    const first = h.create();
    await first.wait(request(), failure());
    h.setCurrent(current);
    const recovery = h.create();
    await expect(recovery.wait(request(), failure())).resolves.toBeUndefined();
    expect(h.read()).toMatchObject({ status: 'paused', reason: 'Model recovery identity mismatch' });
    expect(recovery.isWaiting()).toBe(false);
  });

  it('does not revive an explicitly paused persisted checkpoint', async () => {
    const h = harness();
    const recovery = h.create();
    await recovery.wait(request(), failure());
    await recovery.pause('manual pause');
    const restored = h.create();
    await expect(restored.wait(request(), failure(2))).resolves.toBeUndefined();
    expect(h.read()).toMatchObject({ status: 'paused', reason: 'manual pause' });
  });

  it.each([undefined, 'goal-1'])('retains a stream chain across inference completion and 503 until original-turn completion (%s)', async goalId => {
    const h = harness();
    h.setCurrent({ sdkSessionId: 'native-1', routeIdentity: 'route-1', turnId: 'turn-1', goalId });
    const recovery = h.create();
    const first = request();
    await expect(recovery.interrupted(first)).resolves.toBe(true);
    const original = h.read()!;
    expect(original).toMatchObject({ kind: 'stream', attempt: 1, turnId: 'turn-1' });
    expect(original.goalId).toBe(goalId);
    h.setNow(original.nextRetryAt);
    expect(recovery.releaseStreamBinding()).toBe(true);
    const continued = request();
    await expect(recovery.admit(continued)).resolves.toEqual({ delayMs: 0 });
    await recovery.complete(continued);
    expect(h.read()).toMatchObject({ id: original.id, kind: 'stream', attempt: 1,
      startedAt: original.startedAt, deadlineAt: original.deadlineAt, turnId: 'turn-1' });

    const next = request();
    await recovery.admit(next);
    await expect(recovery.wait(next, failure())).resolves.toBe(30_000);
    expect(h.read()).toMatchObject({ id: original.id, kind: 'stream', attempt: 2,
      startedAt: original.startedAt, deadlineAt: original.deadlineAt, lastStatus: 503 });
    h.setNow(h.read()!.nextRetryAt);
    await expect(recovery.interrupted(next)).resolves.toBe(true);
    expect(h.read()).toMatchObject({ id: original.id, kind: 'stream', attempt: 3,
      startedAt: original.startedAt, deadlineAt: original.deadlineAt, lastStatus: 502 });
    await recovery.complete(next);
    expect(h.read()).toBeDefined();
    await expect(recovery.finishStreamTurn()).resolves.toBe(true);
    expect(h.read()).toBeUndefined();
  });

  it('releases only an eligible waiting stream binding with exact durable ownership', async () => {
    const h = harness(); const recovery = h.create(); const req = request();
    expect(recovery.releaseStreamBinding()).toBe(false);
    await recovery.interrupted(req);
    const original = h.read()!;
    expect(recovery.releaseStreamBinding()).toBe(false); // backoff not yet due
    h.setNow(original.nextRetryAt);
    h.setState({ ...original, attempt: original.attempt + 1 });
    expect(recovery.releaseStreamBinding()).toBe(false);
    h.setState(original); h.setLive(false);
    expect(recovery.releaseStreamBinding()).toBe(false);
    h.setLive(true);
    h.setCurrent({ sdkSessionId: 'native-1', routeIdentity: 'route-1', turnId: 'new-root', goalId: 'goal-1' });
    expect(recovery.releaseStreamBinding()).toBe(false);
    h.setCurrent({ sdkSessionId: 'native-1', routeIdentity: 'route-1', turnId: 'turn-1', goalId: 'goal-1' });
    h.setNow(original.deadlineAt);
    expect(recovery.releaseStreamBinding()).toBe(false);
    h.setNow(original.nextRetryAt);
    expect(recovery.releaseStreamBinding()).toBe(true);
    await recovery.pause('user stopped');
    expect(recovery.releaseStreamBinding()).toBe(false);
  });

  it('does not release an ordinary inference-retry binding as a stream continuation', async () => {
    const h = harness(); const recovery = h.create();
    await recovery.wait(request(), failure()); h.setNow(h.read()!.nextRetryAt);
    expect(recovery.releaseStreamBinding()).toBe(false);
  });

  it('does not resume a stopped stream checkpoint after reopening', async () => {
    const h = harness(); const recovery = h.create();
    await recovery.interrupted(request()); await recovery.pause('user stopped stream');
    const reopened = h.create();
    await expect(reopened.admit(request())).rejects.toThrow('user stopped stream');
    await expect(reopened.interrupted(request())).resolves.toBe(false);
    expect(reopened.releaseStreamBinding()).toBe(false);
    await expect(reopened.finishStreamTurn()).resolves.toBe(false);
    expect(h.read()).toMatchObject({ kind: 'stream', status: 'paused', reason: 'user stopped stream' });
  });

  it('Stop wins a held finishStreamTurn durable-clear CAS race', async () => {
    const h = harness(); const recovery = h.create();
    await recovery.interrupted(request());
    let release!: () => void;
    h.write.mockImplementationOnce(async (next, expected, isLive) => new Promise<boolean>(resolve => {
      release = () => {
        const committed = isLive() && h.read() === expected;
        if (committed) h.setState(next);
        resolve(committed);
      };
    }));
    const finishing = recovery.finishStreamTurn();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await expect(recovery.pause('stop before task terminal persisted')).resolves.toBe(true);
    release();
    await expect(finishing).resolves.toBe(false);
    expect(h.read()).toMatchObject({ kind: 'stream', status: 'paused', reason: 'stop before task terminal persisted' });
    await expect(recovery.finishStreamTurn()).resolves.toBe(false);
    expect(recovery.releaseStreamBinding()).toBe(false);
  });
});
