import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelFailoverController, type InferenceRecoveryHooks } from './model-failover';
import type { UpstreamConfig } from './types/bridge';

const primary: UpstreamConfig = { baseUrl: 'http://primary.invalid', providerId: 'primary', model: 'main' };
const backup: UpstreamConfig = { baseUrl: 'http://backup.invalid', providerId: 'backup', model: 'backup' };
const request = (signal?: AbortSignal) => new Request('http://127.0.0.1/bridge/fixture/v1/messages', { signal });
const transient = (headers?: HeadersInit) => Response.json({ error: { message: 'overloaded' } }, { status: 503, headers });
const retryDelaysMs = [0, 0, 0] as const;
const hooks = (wait: InferenceRecoveryHooks['wait'] = async () => 0) => ({ wait: vi.fn(wait), complete: vi.fn(async () => {}), blocked: vi.fn(async () => {}) });
const makeController = (recovery: InferenceRecoveryHooks, extra = {}) => new ModelFailoverController({
  scope: () => 'root', resolveBackup: () => undefined, onSwitch: vi.fn(), retryDelaysMs, recovery, ...extra,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const sse = (events: string[]) => new Response(events.map(type => `event: ${type}\ndata: {"type":"${type}"}\n\n`).join(''),
  { headers: { 'content-type': 'text/event-stream' } });

afterEach(() => vi.useRealTimers());

describe('durable inference waiting on the original Query lease', () => {
  it('allows the independently authorized backup before durably waiting for a long Retry-After', async () => {
    const recovery = hooks();
    let calls = 0;
    const execute = vi.fn(async (_target: UpstreamConfig) => ++calls < 3
      ? transient({ 'retry-after': '60' }) : Response.json({ content: 'backup recovered' }));
    const response = await makeController(recovery, { resolveBackup: () => backup }).run(request(), primary, execute, 'cooldown-backup');
    await response.text();
    expect(execute.mock.calls.map(([target]) => target.providerId)).toEqual(['primary', 'backup', 'backup']);
    expect(recovery.wait.mock.calls[0][1]).toMatchObject({ attempt: 2, retryAfterMs: 60_000, usingBackup: true });
  });

  it.each(['no hooks', 'background'] as const)('retains the upstream cooldown without unauthorized long waiting for %s', async mode => {
    const recovery = hooks();
    const controller = makeController(recovery, mode === 'no hooks' ? { recovery: undefined } : { canSwitch: () => false });
    const execute = vi.fn(async () => transient({ 'retry-after': '60' }));
    expect((await controller.run(request(), primary, execute, 'bounded-cooldown')).status).toBe(503);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(recovery.wait).not.toHaveBeenCalled();
  });

  it.each(['admit', 'wait'] as const)('rechecks the durable deadline after a sleep during %s waiting', async mode => {
    vi.useFakeTimers();
    const deadlineAt = Date.now() + 500;
    const validateResume = vi.fn(async () => Date.now() < deadlineAt);
    const recovery = { ...hooks(async () => 100), validateResume,
      ...(mode === 'admit' ? { admit: async () => ({ delayMs: 100 }) } : {}) };
    const execute = vi.fn(async () => transient());
    const pending = makeController(recovery).run(request(), primary, execute, 'slept-past-deadline');
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(Date.now() + 1_000);
    await vi.advanceTimersByTimeAsync(50);
    expect((await pending).status).toBe(409);
    expect(validateResume).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(mode === 'admit' ? 0 : 4);
    expect(recovery.blocked).toHaveBeenCalledTimes(1);
    expect(recovery.complete).not.toHaveBeenCalled();
  });

  it.each(['admit', 'wait'] as const)('fails closed when durable validation throws after %s', async mode => {
    const recovery = { ...hooks(), validateResume: vi.fn(async (): Promise<boolean> => { throw new Error('durable owner unavailable'); }),
      ...(mode === 'admit' ? { admit: async () => ({ delayMs: 0 }) } : {}) };
    const execute = vi.fn(async () => transient());
    const response = await makeController(recovery).run(request(), primary, execute, 'validation-failed');
    expect(response.status).toBe(409);
    expect(execute).toHaveBeenCalledTimes(mode === 'admit' ? 0 : 4);
    expect(recovery.blocked).toHaveBeenCalledTimes(1);
  });

  it('revalidates a restored deadline before spending on a subsequent backup target', async () => {
    let authorized = true;
    const recovery = { ...hooks(), admit: async () => ({ delayMs: 0 }), validateResume: vi.fn(async () => authorized) };
    const execute = vi.fn(async (_target: UpstreamConfig) => { authorized = false; return transient(); });
    const response = await makeController(recovery, { resolveBackup: () => backup }).run(request(), primary, execute, 'expired-before-backup');
    expect(response.status).toBe(409);
    expect(execute.mock.calls.map(([target]) => target.providerId)).toEqual(['primary']);
    expect(recovery.validateResume).toHaveBeenCalledTimes(2);
    expect(recovery.blocked).toHaveBeenCalledTimes(1);
  });

  it('rejects a route revoked while asynchronous durable validation is in progress', async () => {
    const entered = deferred<void>();
    const release = deferred<boolean>();
    let route = 'model-a';
    const recovery = { ...hooks(), validateResume: vi.fn(async () => { entered.resolve(); return release.promise; }) };
    const execute = vi.fn(async () => transient());
    const pending = makeController(recovery, { requestIdentity: () => route }).run(request(), primary, execute, 'late-validation');
    await entered.promise;
    route = 'model-b';
    release.resolve(true);
    expect((await pending).status).toBe(499);
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it('respects a restored waiting checkpoint before its first upstream inference', async () => {
    vi.useFakeTimers();
    const recovery = { ...hooks(), admit: vi.fn(async () => ({ delayMs: 60_000 })) };
    const execute = vi.fn(async () => Response.json({ content: 'restored' }));
    const original = request();
    const pending = makeController(recovery).run(original, primary, execute, 'restored-wait');
    await vi.advanceTimersByTimeAsync(59_999);
    expect(execute).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await (await pending).text();
    expect(recovery.admit).toHaveBeenCalledExactlyOnceWith(original);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(recovery.wait).not.toHaveBeenCalled();
    expect(recovery.complete).toHaveBeenCalledExactlyOnceWith(original);
  });

  it.each(['abort', 'route', 'scope'] as const)('never calls upstream after %s during restored admission wait', async mode => {
    vi.useFakeTimers();
    let route = 'model-a';
    let scope = 'root';
    const abort = new AbortController();
    const recovery = { ...hooks(), admit: vi.fn(async () => ({ delayMs: 60_000 })) };
    const execute = vi.fn(async () => Response.json({ content: 'must not execute' }));
    const pending = makeController(recovery, { scope: () => scope, requestIdentity: () => route })
      .run(request(abort.signal), primary, execute, 'restored-abort');
    await vi.advanceTimersByTimeAsync(0);
    if (mode === 'abort') abort.abort();
    else if (mode === 'route') route = 'model-b';
    else scope = 'new-root';
    await vi.advanceTimersByTimeAsync(50);
    expect((await pending).status).toBe(499);
    expect(execute).not.toHaveBeenCalled();
    expect(recovery.complete).not.toHaveBeenCalled();
  });

  it('never calls upstream when restored checkpoint admission cannot commit', async () => {
    const recovery = { ...hooks(), admit: vi.fn(async (): Promise<undefined> => { throw new Error('paused checkpoint'); }) };
    const execute = vi.fn(async () => transient());
    expect((await makeController(recovery).run(request(), primary, execute, 'failed-admission')).status).toBe(409);
    expect(execute).not.toHaveBeenCalled();
    expect(recovery.blocked).toHaveBeenCalledTimes(1);
  });

  it('does not replenish fast retries after rejoining an existing durable wait', async () => {
    const recovery = { ...hooks(async () => undefined), admit: vi.fn(async () => ({ delayMs: 0 })) };
    const execute = vi.fn(async () => transient());
    const response = await makeController(recovery).run(request(), primary, execute, 'restored-budget');
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('automatic_replay_blocked');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(recovery.wait.mock.calls[0][1].attempt).toBe(1);
  });

  it('exhausts fast retries once and keeps long attempt counts increasing without replay admission', async () => {
    const recovery = hooks();
    const controller = makeController(recovery);
    let calls = 0;
    const execute = vi.fn(async () => ++calls < 7 ? transient() : Response.json({ content: 'resumed' }));
    const original = request();
    const response = await controller.run(original, primary, execute, 'same-inference');
    expect(recovery.wait.mock.calls.map(([, failure]) => failure.attempt)).toEqual([4, 5, 6]);
    expect(recovery.wait.mock.calls.every(([row, failure]) => row === original && !failure.usingBackup)).toBe(true);
    expect(execute).toHaveBeenCalledTimes(7);
    expect(recovery.complete).not.toHaveBeenCalled();
    expect(await response.text()).toContain('resumed');
    expect(recovery.complete).toHaveBeenCalledExactlyOnceWith(original);
    expect((await controller.run(request(), primary, execute, 'same-inference')).status).toBe(409);
    expect(execute).toHaveBeenCalledTimes(7);
  });

  it('preserves original backup switch and never replenishes its retry budget', async () => {
    const recovery = hooks();
    const onSwitch = vi.fn();
    const controller = makeController(recovery, { resolveBackup: () => backup, onSwitch });
    let calls = 0;
    const execute = vi.fn(async (_target: UpstreamConfig) => ++calls < 10 ? transient() : Response.json({ content: 'backup resumed' }));
    const response = await controller.run(request(), primary, execute, 'backup-recovery');
    expect(recovery.wait.mock.calls.map(([, failure]) => [failure.attempt, failure.usingBackup])).toEqual([[8, true], [9, true]]);
    expect(execute.mock.calls.map(([target]) => target.providerId)).toEqual([...Array(4).fill('primary'), ...Array(6).fill('backup')]);
    expect(onSwitch).toHaveBeenCalledTimes(1);
    await response.text();
  });

  it('does not call upstream until the durable checkpoint commit resolves', async () => {
    const commit = deferred<number | undefined>();
    const entered = deferred<void>();
    const recovery = hooks(async () => { entered.resolve(); return commit.promise; });
    let calls = 0;
    const execute = vi.fn(async () => ++calls < 5 ? transient() : Response.json({ content: 'ok' }));
    const pending = makeController(recovery).run(request(), primary, execute, 'durable-first');
    await entered.promise;
    expect(execute).toHaveBeenCalledTimes(4);
    commit.resolve(0);
    await (await pending).text();
    expect(execute).toHaveBeenCalledTimes(5);
  });

  it.each(['throw', 'undefined', 'invalid'] as const)('fails closed when wait returns %s', async mode => {
    const recovery = hooks(async () => {
      if (mode === 'throw') throw new Error('disk unavailable');
      return mode === 'invalid' ? Infinity : undefined;
    });
    const execute = vi.fn(async () => transient());
    const response = await makeController(recovery).run(request(), primary, execute, 'failed-commit');
    expect(response.status).toBe(mode === 'undefined' ? 503 : 409);
    expect((await response.json()).error.code).toBe('automatic_replay_blocked');
    expect(execute).toHaveBeenCalledTimes(4);
    expect(recovery.blocked).toHaveBeenCalledTimes(mode === 'undefined' ? 0 : 1);
    expect(recovery.complete).not.toHaveBeenCalled();
  });

  it.each(['abort', 'route', 'scope', 'endTurn', 'unsafe'] as const)('never resumes after %s changes during durable wait', async mode => {
    vi.useFakeTimers();
    const entered = deferred<void>();
    const abort = new AbortController();
    let route = 'model-a';
    let scope = 'root';
    let safe = true;
    const recovery = hooks(async () => { entered.resolve(); return 60_000; });
    const controller = makeController(recovery, { scope: () => scope, requestIdentity: () => route, canRetry: () => safe });
    const execute = vi.fn(async () => transient());
    const pending = controller.run(request(abort.signal), primary, execute, 'cancel-long-wait');
    await entered.promise;
    await vi.advanceTimersByTimeAsync(0);
    if (mode === 'abort') abort.abort();
    else if (mode === 'route') route = 'model-b';
    else if (mode === 'scope') scope = 'new-root';
    else if (mode === 'endTurn') controller.endTurn();
    else safe = false;
    await vi.advanceTimersByTimeAsync(50);
    expect((await pending).ok).toBe(false);
    expect(execute).toHaveBeenCalledTimes(4);
    expect(recovery.complete).not.toHaveBeenCalled();
  });

  it.each([undefined, 'root'] as const)('does not grant durable recovery to missing or ambiguous foreground scope %s', async scope => {
    const recovery = hooks();
    const controller = makeController(recovery, { scope: () => scope, canSwitch: () => false });
    const execute = vi.fn(async () => transient());
    expect((await controller.run(request(), primary, execute, 'background')).status).toBe(503);
    expect(execute).toHaveBeenCalledTimes(4);
    expect(recovery.wait).not.toHaveBeenCalled();
    expect(recovery.blocked).not.toHaveBeenCalled();
  });

  it.each([400, 401, 402, 403, 413, 422, 429])('never waits for permanent/billing HTTP %s', async status => {
    const recovery = hooks();
    const execute = vi.fn(async () => Response.json({ error: { code: 'quota_exhausted', message: 'insufficient balance' } }, { status }));
    const response = await makeController(recovery).run(request(), primary, execute, 'permanent');
    expect(response.status).toBe(status);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(recovery.wait).not.toHaveBeenCalled();
    expect(recovery.complete).not.toHaveBeenCalled();
    expect(recovery.blocked).not.toHaveBeenCalled();
  });

  it.each([
    ['12', 12_000], ['Wed, 21 Oct 2026 00:00:15 GMT', 15_000], ['9999999999', 86_400_000],
    ['Infinity', undefined], ['NaN', undefined], ['-3', undefined],
  ] as const)('passes bounded Retry-After %s to the durable owner', async (retryAfter, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T00:00:00Z'));
    const recovery = hooks(async () => undefined);
    const execute = vi.fn(async () => transient({ 'retry-after': retryAfter }));
    await makeController(recovery).run(request(), primary, execute, 'retry-after');
    expect(recovery.wait.mock.calls[0][1].retryAfterMs).toBe(expected);
  });

  it('keeps endTurn synchronous and nonthrowing if its observer fails', () => {
    const controller = makeController(hooks(), { onTurnEnd: () => { throw new Error('observer failed'); } });
    expect(() => controller.endTurn()).not.toThrow();
  });
});

describe('durable recovery response completion', () => {
  it.each(['abort', 'consumer-cancel'] as const)('keeps %s authoritative during a held stream failure checkpoint', async mode => {
    const entered = deferred<void>();
    const release = deferred<void>();
    const recovery = { ...hooks(), blocked: vi.fn(async () => { entered.resolve(); await release.promise; }) };
    const abort = new AbortController();
    const response = await makeController(recovery).run(request(abort.signal), primary,
      async () => sse(['error']), 'stop-during-stream-failure');
    const reader = response.body!.getReader();
    const reading = reader.read();
    // Attach before releasing the barrier so cancellation cannot become an
    // unhandled rejection while durable storage is deliberately held.
    const result = reading.then(value => ({ value }), error => ({ error: String(error) }));
    await entered.promise;
    if (mode === 'abort') abort.abort();
    else await reader.cancel();
    release.resolve();
    const observed = await result;
    if (mode === 'abort') {
      expect(observed).toEqual({ error: expect.stringContaining('superseded or cancelled') });
    } else expect(observed).toEqual({ value: { done: true, value: undefined } });
    expect(recovery.complete).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'abort'] as const)('queues message_stop before deferred checkpoint cleanup during %s', async mode => {
    const entered = deferred<void>();
    const commit = deferred<void>();
    const committed = deferred<void>();
    const abort = new AbortController();
    let cleared = false;
    const recovery = hooks();
    recovery.complete.mockImplementation(async () => {
      entered.resolve();
      await commit.promise;
      cleared = true;
      committed.resolve();
    });
    const response = await makeController(recovery).run(request(abort.signal), primary,
      async () => sse(['message_stop']), 'terminal-cleanup-race');
    const reader = response.body!.getReader();
    const reading = reader.read().then(next => ({ next }), error => ({ error }));
    await entered.promise;
    if (mode === 'cancel') await reader.cancel();
    else abort.abort();
    commit.resolve();
    await committed.promise;
    const delivered = await reading;
    expect(cleared).toBe(true);
    expect('next' in delivered && delivered.next.done).toBe(false);
    expect('next' in delivered && new TextDecoder().decode(delivered.next.value)).toContain('message_stop');
    expect(recovery.complete).toHaveBeenCalledTimes(1);
    expect(recovery.blocked).not.toHaveBeenCalled();
  });

  it('retains the checkpoint when a consumer cancels before any terminal chunk is queued', async () => {
    const recovery = hooks();
    const native = new ReadableStream<Uint8Array>();
    const response = await makeController(recovery).run(request(), primary, async () => new Response(native,
      { headers: { 'content-type': 'text/event-stream' } }), 'cancel-before-terminal');
    const reader = response.body!.getReader();
    const reading = reader.read();
    await reader.cancel();
    expect((await reading).done).toBe(true);
    expect(recovery.complete).not.toHaveBeenCalled();
    expect(recovery.blocked).toHaveBeenCalledTimes(1);
  });

  it('does not clear a checkpoint when request abort prevents the pending terminal chunk from being queued', async () => {
    const abort = new AbortController();
    const recovery = hooks();
    let output!: ReadableStreamDefaultController<Uint8Array>;
    const native = new ReadableStream<Uint8Array>({ start(controller) { output = controller; } });
    const response = await makeController(recovery).run(request(abort.signal), primary, async () => new Response(native,
      { headers: { 'content-type': 'text/event-stream' } }), 'abort-before-terminal');
    const reader = response.body!.getReader();
    const reading = reader.read();
    const cancelled = expect(reading).rejects.toThrow();
    abort.abort();
    // Cancellation now releases a held read immediately. A late producer
    // cannot queue its terminal into an already cancelled body.
    expect(() => output.enqueue(new TextEncoder().encode('event: message_stop\ndata: {"type":"message_stop"}\n\n'))).toThrow();
    await cancelled;
    expect(recovery.complete).not.toHaveBeenCalled();
  });

  it('does not create a recovery checkpoint for ordinary HTTP success without any inference body', async () => {
    const recovery = hooks();
    await makeController(recovery).run(request(), primary, async () => new Response(null, { status: 200 }), 'empty-success');
    expect(recovery.complete).not.toHaveBeenCalled();
    expect(recovery.blocked).not.toHaveBeenCalled();
  });

  it.each([400, 401, 402, 'missing body'] as const)('pauses an existing durable recovery when its next result is %s', async outcome => {
    const recovery = hooks();
    let calls = 0;
    const execute = vi.fn(async () => {
      if (++calls <= 4) return transient();
      return outcome === 'missing body' ? new Response(null) : Response.json({ error: { message: 'request rejected' } }, { status: outcome });
    });
    const response = await makeController(recovery).run(request(), primary, execute, 'permanent-after-wait');
    expect(response.status).toBe(outcome === 'missing body' ? 409 : outcome);
    expect(recovery.wait).toHaveBeenCalledTimes(1);
    expect(recovery.blocked).toHaveBeenCalledTimes(1);
    expect(recovery.complete).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(5);
  });

  it.each([400, 401, 402, 'missing body'] as const)('pauses a rebound checkpoint when its first result is %s', async outcome => {
    const recovery = { ...hooks(), admit: vi.fn(async () => ({ delayMs: 0 })) };
    const response = await makeController(recovery).run(request(), primary,
      async () => outcome === 'missing body' ? new Response(null) : Response.json({ error: { message: 'request rejected' } }, { status: outcome }), 'permanent-after-admit');
    expect(response.status).toBe(outcome === 'missing body' ? 409 : outcome);
    expect(recovery.blocked).toHaveBeenCalledTimes(1);
    expect(recovery.complete).not.toHaveBeenCalled();
  });

  it('clears at SSE message_stop even when the native reader cancels the open HTTP stream', async () => {
    const recovery = hooks();
    const native = new ReadableStream<Uint8Array>({ start(output) {
      output.enqueue(new TextEncoder().encode('event: message_stop\ndata: {"type":"message_stop"}\n\n'));
    } });
    const response = await makeController(recovery).run(request(), primary, async () => new Response(native,
      { headers: { 'content-type': 'text/event-stream' } }), 'complete-stream');
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(recovery.complete).toHaveBeenCalledTimes(1);
    expect(recovery.blocked).not.toHaveBeenCalled();
  });

  it.each(['partial', 'error'] as const)('retains checkpoint and forbids changed-history replay after %s SSE', async failure => {
    const recovery = hooks();
    const controller = makeController(recovery);
    const execute = vi.fn(async () => sse(failure === 'partial' ? ['content_block_delta'] : ['error', 'message_stop']));
    const response = await controller.run(request(), primary, execute, 'stream');
    await response.text().catch(() => undefined);
    expect(recovery.complete).not.toHaveBeenCalled();
    expect(recovery.blocked).toHaveBeenCalledTimes(1);
    expect((await controller.run(request(), primary, execute, 'changed-history')).status).toBe(409);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('fails closed if successful-delivery checkpoint cleanup cannot commit', async () => {
    const recovery = hooks();
    recovery.complete.mockRejectedValue(new Error('disk unavailable'));
    const controller = makeController(recovery);
    const execute = vi.fn(async () => Response.json({ content: 'finished' }));
    const response = await controller.run(request(), primary, execute, 'cleanup-failed');
    await expect(response.text()).rejects.toThrow('disk unavailable');
    expect((await controller.run(request(), primary, execute, 'changed-history')).status).toBe(409);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('never completes a stale owner while delivery awaits the next body chunk', async () => {
    const recovery = hooks();
    let active = true;
    let output!: ReadableStreamDefaultController<Uint8Array>;
    const native = new ReadableStream<Uint8Array>({ start(stream) { output = stream; } });
    const response = await makeController(recovery, { isActive: () => active }).run(request(), primary,
      async () => new Response(native), 'stale-stream');
    const reading = response.text();
    active = false;
    output.close();
    await expect(reading).rejects.toThrow();
    expect(recovery.complete).not.toHaveBeenCalled();
    expect(recovery.blocked).not.toHaveBeenCalled();
  });
});
