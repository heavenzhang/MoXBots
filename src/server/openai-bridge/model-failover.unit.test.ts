import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelFailoverController } from './model-failover';
import type { UpstreamConfig } from './types/bridge';
import { QueryRequestGuard } from './request-lifetime';

const primary: UpstreamConfig = { baseUrl: 'http://primary.invalid', providerId: 'primary', model: 'main' };
const backup: UpstreamConfig = { baseUrl: 'http://backup.invalid', providerId: 'backup', model: 'backup' };
const request = (signal?: AbortSignal) => new Request('http://127.0.0.1/bridge/fixture/v1/messages', { signal });
const transient = () => Response.json({ error: { message: 'temporarily overloaded' } }, { status: 503 });
const retryDelaysMs = [0, 0, 0] as const;

afterEach(() => vi.useRealTimers());

describe('owner-admitted partial stream continuation', () => {
  function fixture(interruptedResult: boolean | Error = true) {
    const owner = { active: true, safe: true, scope: 'root:0' };
    const recovery = {
      wait: vi.fn(async () => undefined), complete: vi.fn(async () => {}), blocked: vi.fn(async () => {}),
      interrupted: vi.fn(async () => {
        if (interruptedResult instanceof Error) throw interruptedResult;
        return interruptedResult;
      }),
    };
    const controller = new ModelFailoverController({ scope: () => owner.scope, isActive: () => owner.active,
      canRetry: () => owner.safe, canSwitch: () => owner.safe, resolveBackup: () => undefined,
      onSwitch: vi.fn(), retryDelaysMs, recovery });
    return { owner, recovery, controller };
  }
  it.each(['EOF', 'error event', 'malformed', 'read failure'])('offers %s exactly once, without replay or pausing its accepted checkpoint', async failure => {
    const h = fixture();
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const upstream = new ReadableStream<Uint8Array>({ start(value) { source = value; } });
    const execute = vi.fn(async () => new Response(upstream, { headers: { 'content-type': 'text/event-stream' } }));
    const response = await h.controller.run(request(), primary, execute, 'failed-input');
    const output = response.text();
    source.enqueue(new TextEncoder().encode('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"partial"}}\n\n'));
    if (failure === 'read failure') source.error(new Error('socket closed'));
    else {
      if (failure === 'error event') source.enqueue(new TextEncoder().encode('event: error\ndata: {"type":"error"}\n\n'));
      if (failure === 'malformed') source.enqueue(new TextEncoder().encode('data: invalid-json\n\n'));
      source.close();
    }
    expect(await output).toContain('automatic_replay_blocked');
    expect(h.recovery.interrupted).toHaveBeenCalledTimes(1);
    expect(h.recovery.blocked).not.toHaveBeenCalled();
    expect(h.recovery.complete).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
    expect((await h.controller.run(request(), primary, execute, 'different-input')).status).toBe(409);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it.each([false, new Error('cannot persist')])('pauses safely when the owner declines or throws (%s)', async answer => {
    const h = fixture(answer);
    const response = await h.controller.run(request(), primary, async () => new Response('', {
      headers: { 'content-type': 'text/event-stream' },
    }), 'failed-input');
    expect(await response.text()).toContain('automatic_replay_blocked');
    expect(h.recovery.interrupted).toHaveBeenCalledTimes(1);
    expect(h.recovery.blocked).toHaveBeenCalledTimes(1);
  });
  it.each(['consumer cancel', 'Stop', 'unsafe tools'])('never offers continuation after %s', async reason => {
    const h = fixture();
    const abort = new AbortController();
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const upstream = new ReadableStream<Uint8Array>({ start(value) { source = value; } });
    const response = await h.controller.run(request(abort.signal), primary, async () => new Response(upstream, {
      headers: { 'content-type': 'text/event-stream' },
    }), 'failed-input');
    if (reason === 'consumer cancel') await response.body!.cancel();
    else {
      const result = response.text().catch(() => 'cancelled');
      if (reason === 'Stop') {
        abort.abort();
        expect(() => source.close()).toThrow(); // held read was cancelled immediately
      } else {
        h.owner.safe = false;
        source.close();
      }
      await result;
    }
    expect(h.recovery.interrupted).not.toHaveBeenCalled();
  });
  it('does not classify an error after a recognized terminal as interrupted inference', async () => {
    const h = fixture();
    const response = await h.controller.run(request(), primary, async () => new Response(
      'event: message_stop\ndata: {"type":"message_stop"}\n\nevent: error\ndata: {"type":"error"}\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    ), 'post-terminal-error');
    await response.text();
    expect(h.recovery.interrupted).not.toHaveBeenCalled();
  });
  it('does not accept a late continuation grant after Stop revokes its exact request', async () => {
    const h = fixture();
    const abort = new AbortController();
    let grant!: () => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    h.recovery.interrupted.mockImplementation(async () => {
      entered();
      await new Promise<void>(resolve => { grant = resolve; });
      return true;
    });
    const response = await h.controller.run(request(abort.signal), primary, async () => new Response('', {
      headers: { 'content-type': 'text/event-stream' },
    }), 'stopped-during-grant');
    const result = response.text().catch(() => 'cancelled');
    await started;
    abort.abort();
    grant();
    expect(await result).toBe('cancelled');
    expect(h.recovery.interrupted).toHaveBeenCalledTimes(1);
    expect(h.recovery.complete).not.toHaveBeenCalled();
  });
  it('lets consumer cancellation pause a checkpoint while its continuation grant is awaiting storage', async () => {
    const h = fixture();
    let grant!: () => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    h.recovery.interrupted.mockImplementation(async () => {
      entered();
      await new Promise<void>(resolve => { grant = resolve; });
      return true;
    });
    const response = await h.controller.run(request(), primary, async () => new Response('', {
      headers: { 'content-type': 'text/event-stream' },
    }), 'cancelled-during-grant');
    const reader = response.body!.getReader();
    const reading = reader.read();
    await started;
    const cancellation = reader.cancel();
    grant();
    await cancellation;
    expect((await reading).done).toBe(true);
    expect(h.recovery.interrupted).toHaveBeenCalledTimes(1);
    expect(h.recovery.blocked).toHaveBeenCalledTimes(1);
    expect(h.recovery.complete).not.toHaveBeenCalled();
  });
});

describe('bounded Query request retries', () => {
  it.each([408, 429, 500, 502, 503, 504, 529])('retries HTTP %s three times without requiring a backup or foreground root', async status => {
    const controller = new ModelFailoverController({ scope: () => undefined, resolveBackup: () => undefined,
      onSwitch: vi.fn(), canSwitch: () => false, retryDelaysMs });
    const execute = vi.fn(async () => Response.json({ error: { message: 'temporarily unavailable' } }, { status }));
    const response = await controller.run(request(), primary, execute, `transient-${status}`);
    expect(response.status).toBe(status);
    expect(execute).toHaveBeenCalledTimes(4);
    expect((await controller.run(request(), primary, execute, `transient-${status}`)).status).toBe(status);
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it.each([400, 401, 402, 403, 404, 413, 422])('never retries a permanent HTTP %s', async status => {
    const switched = vi.fn();
    const controller = new ModelFailoverController({ scope: () => 'foreground', resolveBackup: () => backup,
      onSwitch: switched, retryDelaysMs });
    const execute = vi.fn(async () => Response.json({ error: { message: 'request rejected' } }, { status }));
    expect((await controller.run(request(), primary, execute, 'permanent')).status).toBe(status);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(switched).not.toHaveBeenCalled();
  });

  it('spends at most four primary and four backup attempts and retains one switch per root', async () => {
    const switched = vi.fn();
    const controller = new ModelFailoverController({ scope: () => 'foreground', resolveBackup: () => backup,
      onSwitch: switched, retryDelaysMs });
    const execute = vi.fn(async (_target: UpstreamConfig) => transient());
    expect((await controller.run(request(), primary, execute, 'exhausted')).status).toBe(503);
    expect(execute.mock.calls.map(call => call[0].providerId)).toEqual([
      'primary', 'primary', 'primary', 'primary', 'backup', 'backup', 'backup', 'backup',
    ]);
    expect(switched).toHaveBeenCalledTimes(1);
    expect((await controller.run(request(), primary, execute, 'exhausted')).status).toBe(503);
    expect(execute).toHaveBeenCalledTimes(8);
  });

  it('never promotes an admitted background request to foreground recovery when background work clears', async () => {
    let canSwitch = false;
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const switched = vi.fn();
    const controller = new ModelFailoverController({ scope: () => 'new-foreground-root',
      canSwitch: () => canSwitch, resolveBackup: () => backup, onSwitch: switched, retryDelaysMs });
    const execute = vi.fn(async (_target: UpstreamConfig) => { await pending; return transient(); });
    const result = controller.run(request(), primary, execute, 'background-at-birth');
    canSwitch = true;
    release();
    expect((await result).status).toBe(503);
    expect(execute.mock.calls.map(call => call[0].providerId)).toEqual(['primary', 'primary', 'primary', 'primary']);
    expect(switched).not.toHaveBeenCalled();
  });

  it('uses a cancellable 250/750/1500ms backoff rather than a hot retry loop', async () => {
    vi.useFakeTimers();
    const controller = new ModelFailoverController({ scope: () => 'foreground', resolveBackup: () => undefined, onSwitch: vi.fn() });
    const execute = vi.fn(async () => transient());
    const response = controller.run(request(), primary, execute, 'backoff');
    await vi.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(249);
    expect(execute).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(execute).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(750);
    expect(execute).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1500);
    expect(execute).toHaveBeenCalledTimes(4);
    expect((await response).status).toBe(503);
  });

  it.each(['abort', 'Query retirement', 'route change'] as const)('interrupts retry backoff on %s', async reason => {
    vi.useFakeTimers();
    const abort = new AbortController();
    let active = true;
    let identity = 'model-a';
    const controller = new ModelFailoverController({ scope: () => 'foreground', isActive: () => active,
      requestIdentity: () => identity, resolveBackup: () => backup, onSwitch: vi.fn() });
    const execute = vi.fn(async () => transient());
    const response = controller.run(request(abort.signal), primary, execute, 'cancel-backoff');
    await vi.advanceTimersByTimeAsync(0);
    if (reason === 'abort') abort.abort();
    else if (reason === 'Query retirement') active = false;
    else identity = 'model-b';
    await vi.advanceTimersByTimeAsync(50);
    expect((await response).status).toBe(499);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('rejects old-route output but admits a new model on the same Query token', async () => {
    let identity = 'model-a';
    let release!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => { release = resolve; });
    const controller = new ModelFailoverController({ scope: () => 'foreground', requestIdentity: () => identity,
      isActive: () => true, resolveBackup: () => undefined, onSwitch: vi.fn(), retryDelaysMs });
    const old = controller.run(request(), primary, async () => pending, 'old-model');
    identity = 'model-b';
    release(Response.json({ content: 'old unsafe output' }));
    expect((await old).status).toBe(499);
    const current = await controller.run(request(), { ...primary, model: 'model-b' }, async () => Response.json({ content: 'new model' }), 'new-model');
    expect(current.status).toBe(200);
    expect(await current.text()).toContain('new model');
  });

  it('reports fast recovery availability before arming a short headers timeout', () => {
    let scope: string | undefined = 'foreground';
    let active = true;
    let safe = true;
    const controller = new ModelFailoverController({ scope: () => scope, isActive: () => active,
      canRetry: () => safe, resolveBackup: () => backup, onSwitch: vi.fn() });
    expect(controller.fastRecoveryAuthorized()).toBe(true);
    safe = false;
    expect(controller.fastRecoveryAuthorized()).toBe(false);
    safe = true;
    active = false;
    expect(controller.fastRecoveryAuthorized()).toBe(false);
    active = true;
    scope = undefined;
    expect(controller.fastRecoveryAuthorized()).toBe(false);
    scope = 'foreground';
    controller.endTurn();
    expect(controller.fastRecoveryAuthorized()).toBe(false);
  });

  it('does not retry or switch after the tool owner reports an uncertain outcome', async () => {
    let safe = true;
    const switched = vi.fn();
    const controller = new ModelFailoverController({ scope: () => 'foreground', canRetry: () => safe,
      resolveBackup: () => backup, onSwitch: switched, retryDelaysMs });
    const execute = vi.fn(async () => { safe = false; return transient(); });
    expect((await controller.run(request(), primary, execute, 'uncertain-write')).status).toBe(503);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(switched).not.toHaveBeenCalled();
  });
});

describe('Query request safety evidence', () => {
  it('retains blocked and delivered evidence for ambiguous background ownership, while a new clear root is independent', () => {
    const guard = new QueryRequestGuard();
    const root = guard.begin('root-1', 'original', false)!;
    root.finish();
    expect(guard.begin(undefined, 'original', true)).toBeUndefined();
    root.block();
    expect(guard.begin(undefined, 'changed', true)).toBeUndefined();
    expect(guard.begin('root-2', 'original', false)).toBeDefined();
    expect(guard.begin('root-2', 'child', true)).toBeUndefined();
  });

  it('returns complete rejection evidence without reopening admission, but fences active and blocked rows', async () => {
    const guard = new QueryRequestGuard();
    const lease = guard.begin('root', 'rejected', false)!;
    await lease.reject(Response.json({ error: { message: 'invalid API key' } }, { status: 401 }));
    expect(guard.rejectedResponse('root', 'rejected')).toBeUndefined();
    lease.finish();
    expect(guard.begin('root', 'rejected', false)).toBeUndefined();
    const saved = guard.rejectedResponse('root', 'rejected')!;
    expect(saved.status).toBe(401);
    expect(saved.headers.get('x-should-retry')).toBe('false');
    expect(await saved.text()).toContain('invalid API key');
    expect(guard.rejectedResponse(undefined, 'rejected')).toBeUndefined();
    expect(guard.rejectedResponse('other-root', 'rejected')).toBeUndefined();
    lease.block();
    expect(guard.rejectedResponse('root', 'rejected')?.status).toBe(401);
    expect(guard.begin('root', 'rejected', false)).toBeUndefined();
  });

  it('bounds rejection snapshots without evicting admission evidence or retaining unsafe responses', async () => {
    const guard = new QueryRequestGuard();
    for (const status of [200, 499]) {
      const lease = guard.begin('root', `unsafe-${status}`, false)!;
      await lease.reject(new Response('evidence', { status }));
      lease.finish();
      expect(guard.rejectedResponse('root', `unsafe-${status}`)).toBeUndefined();
    }
    const partial = guard.begin('root', 'partial', false)!;
    await partial.reject(new Response('incomplete', { status: 503, headers: { 'x-moxbots-recovery': 'blocked' } }));
    partial.finish();
    expect(guard.rejectedResponse('root', 'partial')?.status).toBe(503);
    expect(guard.begin('root', 'partial', false)).toBeUndefined();
    for (let index = 0; index < 70; index++) {
      const lease = guard.begin('root', `failure-${index}`, false)!;
      await lease.reject(new Response('x'.repeat(16_384), { status: 503 }));
      lease.finish();
    }
    expect(guard.rejectedResponse('root', 'failure-0')?.status).toBe(503);
    expect(guard.rejectedResponse('root', 'failure-69')).toBeUndefined();
    expect(guard.begin('root', 'failure-69', false)).toBeUndefined();
  });

  it('fails closed at a fixed Query capacity instead of evicting replay evidence', () => {
    const guard = new QueryRequestGuard();
    const admitted = guard.begin('root-in-flight', 'healthy', false)!;
    for (let index = 0; index < 4095; index++) expect(guard.begin(`root-${index}`, 'history', false)).toBeDefined();
    expect(guard.begin('overflow', 'new-history', false)).toBeUndefined();
    expect(guard.begin(undefined, 'history', true)).toBeUndefined();
    expect(admitted.isBlocked()).toBe(false);
  });
});
