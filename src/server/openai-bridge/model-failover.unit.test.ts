import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelFailoverController } from './model-failover';
import type { UpstreamConfig, StreamInterruptionCause } from './types/bridge';
import { QueryRequestGuard } from './request-lifetime';

const primary: UpstreamConfig = { baseUrl: 'http://primary.invalid', providerId: 'primary', model: 'main' };
const backup: UpstreamConfig = { baseUrl: 'http://backup.invalid', providerId: 'backup', model: 'backup' };
const request = (signal?: AbortSignal) => new Request('http://127.0.0.1/bridge/fixture/v1/messages', { signal });
const transient = () => Response.json({ error: { message: 'temporarily overloaded' } }, { status: 503 });
const retryDelaysMs = [0, 0, 0] as const;

afterEach(() => vi.useRealTimers());

describe('native connection retry ownership', () => {
  it.each(['abort', 'owner', 'route', 'background', 'deadline', 'end-turn', 'policy'] as const)(
    'revokes the exact pre-connect attempt on %s without granting inference replay', async change => {
      let active = true, switchable = true, permitted = true, identity = 'original';
      let deadline = Infinity;
      const abort = new AbortController();
      let release!: () => void, entered!: () => void;
      const pending = new Promise<void>(resolve => { release = resolve; });
      const started = new Promise<void>(resolve => { entered = resolve; });
      let mayConnect!: () => boolean;
      const controller = new ModelFailoverController({ scope: () => 'root', isActive: () => active,
        requestIdentity: () => identity, canSwitch: () => switchable, canRetry: () => false,
        canRetryConnection: () => permitted, deadlineAt: () => deadline,
        resolveBackup: () => undefined, onSwitch: () => { throw new Error('unexpected switch'); } });
      const run = controller.run(request(abort.signal), primary, async target => {
        mayConnect = target.canRetryConnection!; entered(); await pending; return Response.json({ ok: true });
      }, 'exact-request');
      await started;
      expect(mayConnect()).toBe(true);
      if (change === 'abort') abort.abort();
      if (change === 'owner') active = false;
      if (change === 'route') identity = 'replacement';
      if (change === 'background') switchable = false;
      if (change === 'deadline') deadline = Date.now() - 1;
      if (change === 'end-turn') controller.endTurn();
      if (change === 'policy') permitted = false;
      expect(mayConnect()).toBe(false);
      release();
      const response = await run;
      await response.text();
      active = true; switchable = true; permitted = true; identity = 'original'; deadline = Infinity;
      expect(mayConnect()).toBe(false);
    });
});

describe('asynchronous backup admission', () => {
  it.each(['Stop', 'end-turn', 'policy-revoked', 'retry-revoked'])('revalidates %s after request validation without a late switch', async (reason) => {
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const pending = new Promise<void>(resolve => { release = resolve; });
    const abort = new AbortController();
    let allowed = true;
    let safe = true;
    const switched = vi.fn();
    const controller = new ModelFailoverController({ scope: () => 'root', resolveBackup: () => (allowed ? backup : undefined),
      onSwitch: switched, canRetry: () => safe, retryDelaysMs, validateBackup: async () => { entered(); await pending; return true; },
      });
    const execute = vi.fn(async () => transient());
    const run = controller.run(request(abort.signal), primary, execute);
    await started;
    if (reason === 'Stop') abort.abort();
    if (reason === 'end-turn') controller.endTurn();
    if (reason === 'policy-revoked') allowed = false;
    if (reason === 'retry-revoked') safe = false;
    release();
    const response = await run;
    expect([499, 503]).toContain(response.status);
    expect(execute).toHaveBeenCalledTimes(4);
    expect(switched).not.toHaveBeenCalled();
  },
  );

  it('does not execute an already elected backup when retry authority is revoked during validation', async () => {
    let safe = true;
    let block = false;
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const pending = new Promise<void>(resolve => { release = resolve; });
    const switched = vi.fn();
    const controller = new ModelFailoverController({ scope: () => 'root', resolveBackup: () => backup,
      canRetry: () => safe, onSwitch: switched, retryDelaysMs,
      validateBackup: async () => { if (block) { entered(); await pending; } return true; } });
    const execute = vi.fn(async (target: UpstreamConfig) => target === primary ? transient() : Response.json({ ok: true }));
    expect((await controller.run(request(), primary, execute, 'first')).status).toBe(200);
    block = true;
    const run = controller.run(request(), primary, execute, 'second');
    await started;
    safe = false;
    release();
    expect((await run).status).toBe(409);
    expect(execute).toHaveBeenCalledTimes(5);
    expect(switched).toHaveBeenCalledOnce();
  });
});

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
  it.each(['EOF', 'error event', 'malformed', 'read failure'])('separates trusted transport from provider/protocol %s, without replay', async failure => {
    const h = fixture();
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const upstream = new ReadableStream<Uint8Array>({ start(value) { source = value; } });
    let notify: ((cause: StreamInterruptionCause) => void) | undefined;
    const execute = vi.fn(async (_target: UpstreamConfig, _progress?: () => boolean, onInterruption?: (cause: StreamInterruptionCause) => void) => {
      notify = onInterruption; return new Response(upstream, { headers: { 'content-type': 'text/event-stream' } });
    });
    const response = await h.controller.run(request(), primary, execute, 'failed-input');
    const output = response.text();
    source.enqueue(new TextEncoder().encode('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"partial"}}\n\n'));
    if (failure === 'read failure') { notify?.('transport'); source.error(new Error('socket closed')); }
    else {
      if (failure === 'error event') source.enqueue(new TextEncoder().encode('event: error\ndata: {"type":"error"}\n\n'));
      if (failure === 'malformed') source.enqueue(new TextEncoder().encode('data: invalid-json\n\n'));
      source.close();
    }
    expect(await output).toContain('automatic_replay_blocked');
    const trusted = failure === 'EOF' || failure === 'read failure';
    expect(h.recovery.interrupted).toHaveBeenCalledTimes(trusted ? 1 : 0);
    expect(h.recovery.blocked).toHaveBeenCalledTimes(trusted ? 0 : 1);
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

it('does not let a retired attempt label a later provider SSE error as transport', async () => {
  const interrupted = vi.fn(async () => true); const blocked = vi.fn(async () => {});
  const observed = vi.fn();
  const controller = new ModelFailoverController({ scope: () => 'root', isActive: () => true, canRetry: () => true, canSwitch: () => true,
    resolveBackup: () => undefined, onSwitch: () => {}, retryDelaysMs, recovery: { wait: async () => undefined,
      complete: async () => {}, interrupted, blocked } });
  let first: ((cause: StreamInterruptionCause) => void) | undefined; let attempt = 0;
  const response = await controller.run(request(), { ...primary, onStreamInterruption: observed }, async (_target, _progress, cause) => {
    attempt++;
    if (attempt === 1) { first = cause; return transient(); }
    first?.('transport'); // The first attempt no longer has authority.
    return new Response('data: {"type":"error","error":{"type":"authentication_error"}}\n\n', { headers: { 'content-type': 'text/event-stream' } });
  }, 'same-native-request');
  expect(await response.text()).toContain('automatic_replay_blocked');
  expect(attempt).toBe(2); expect(interrupted).not.toHaveBeenCalled(); expect(blocked).toHaveBeenCalledOnce();
  expect(observed).toHaveBeenCalledExactlyOnceWith('unproven', { origin: 'provider_terminal', category: 'authentication' });
});

describe("bounded same-tier candidate chain", () => {
  const targets = [
    backup,
    { ...backup, providerId: "c", model: "c", baseUrl: "http://c.invalid" },
    { ...backup, providerId: "d", model: "d", baseUrl: "http://d.invalid" },
  ];
  function chain(
    validateBackup?: (
      request: Request,
      target: UpstreamConfig,
    ) => Promise<boolean>,
  ) {
    let index = 0;
    const onSwitch = vi.fn();
    return {
      onSwitch,
      controller: new ModelFailoverController({
        scope: () => "chain",
        retryDelaysMs,
        resolveBackup: () => targets[index],
        advanceCandidate: () => ++index < targets.length,
        validateBackup,
        onSwitch,
      }),
    };
  }
  it("exhausts P and B then succeeds on C with three retries per target", async () => {
    const h = chain();
    const execute = vi.fn(async (target: UpstreamConfig) =>
      target.model === "c" ? Response.json({ ok: true }) : transient(),
    );
    const response = await h.controller.run(
      request(),
      primary,
      execute,
      "chain",
    );
    expect(response.status).toBe(200);
    expect(execute.mock.calls.map(([target]) => target.model)).toEqual([
      'main',
      'main',
      'main',
      'main',
      'backup',
      'backup',
      'backup',
      'backup',
      "c",
    ]);
    expect(h.onSwitch).toHaveBeenCalledTimes(2);
  });
  it("skips a revoked candidate before its first actual call", async () => {
    const h = chain(async (_request, target) => target.model !== 'backup');
    const execute = vi.fn(async (target: UpstreamConfig) => target === primary ? transient() : Response.json({ ok: true }));
    expect((await h.controller.run(request(), primary, execute)).status).toBe(
      200,
    );
    expect(execute.mock.calls.map(([target]) => target.model)).toEqual([
      'main',
      'main',
      'main',
      'main',
      "c",
    ]);
  });
  it("bounds all-bad chains to four total models", async () => {
    const h = chain();
    const execute = vi.fn(async () => transient());
    expect((await h.controller.run(request(), primary, execute)).status).toBe(
      503,
    );
    expect(execute).toHaveBeenCalledTimes(16);
    expect(h.onSwitch).toHaveBeenCalledTimes(3);
  });
  it("does not replenish the absolute root deadline when advancing", async () => {
    const h = chain();
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const execute = vi.fn(async (target: UpstreamConfig) => {
      if (target.model === 'backup') now = 30 * 60_000;
      return transient();
    });
    expect((await h.controller.run(request(), primary, execute)).status).toBe(
      503,
    );
    expect(execute).toHaveBeenCalledTimes(5);
    expect(h.onSwitch).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});

it("caps a long owner wait to the original absolute deadline and never calls another target afterwards", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const blocked = vi.fn(async () => {});
  const recovery = {
    complete: vi.fn(async () => {}),
    blocked,
    wait: vi.fn(async () => {
      vi.setSystemTime(30 * 60_000 - 5);
      return 60 * 60_000;
    }),
  };
  const execute = vi.fn(async () => transient());
  const controller = new ModelFailoverController({
    scope: () => "long-deadline",
    retryDelaysMs,
    resolveBackup: () => undefined,
    onSwitch: vi.fn(),
    recovery,
  });
  const result = controller.run(request(), primary, execute);
  await vi.advanceTimersByTimeAsync(0);
  expect(recovery.wait).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5);
  expect((await result).status).toBe(409);
  expect(execute).toHaveBeenCalledTimes(4);
  expect(blocked).toHaveBeenCalledTimes(1);
});

describe("parent execution recovery budget", () => {
  it('admits new inference after more than 30 minutes of successful same-root work without reopening old requests', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const execute = vi.fn(async () => Response.json({ ok: true }));
    const controller = new ModelFailoverController({ scope: () => 'long-running-task',
      resolveBackup: () => undefined, onSwitch: vi.fn() });
    for (const [minutes, fingerprint] of [[0, 'first'], [20, 'after-tools'], [33, 'after-compaction'], [91, 'next-step']] as const) {
      vi.setSystemTime(minutes * 60_000);
      const response = await controller.run(request(), primary, execute, fingerprint);
      expect(response.status).toBe(200);
      await response.text();
    }
    expect(execute).toHaveBeenCalledTimes(4);
    expect((await controller.run(request(), primary, execute, 'first')).status).toBe(409);
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it("gives a later logical root only the four minutes left by its parent", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    let scope = "first-root";
    const recovery = {
      wait: vi.fn(async () => 60 * 60_000),
      complete: vi.fn(async () => {}),
      blocked: vi.fn(async () => {}),
    };
    const execute = vi.fn(async () => transient())
      .mockImplementationOnce(async () => Response.json({ ok: true }));
    const controller = new ModelFailoverController({
      scope: () => scope,
      retryDelaysMs,
      recovery,
      deadlineAt: () => 30 * 60_000,
      resolveBackup: () => undefined,
      onSwitch: vi.fn(),
    });
    await (await controller.run(request(), primary, execute, 'first')).text();
    scope = "later-root";
    vi.setSystemTime(26 * 60_000);
    const result = controller.run(request(), primary, execute, 'second');
    await vi.advanceTimersByTimeAsync(0);
    expect(recovery.wait).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect((await result).status).toBe(409);
    expect(execute).toHaveBeenCalledTimes(5);
  });
  it("cannot extend a same-root parent deadline after successful inference", async () => {
    let now = 0;
    let deadline = 100;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const execute = vi.fn(async () => Response.json({ ok: true }));
    const controller = new ModelFailoverController({
      scope: () => "fixed-root",
      deadlineAt: () => deadline,
      resolveBackup: () => undefined,
      onSwitch: vi.fn(),
    });
    await (await controller.run(request(), primary, execute, 'first')).text();
    deadline = 1_000;
    now = 101;
    expect(
      (await controller.run(request(), primary, execute, 'second')).status,
    ).toBe(409);
    expect(execute).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
  it("rejects an expired parent before initial inference or recovery admission", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    const admit = vi.fn(async () => undefined);
    const wait = vi.fn(async () => undefined);
    const execute = vi.fn(async () => transient());
    const controller = new ModelFailoverController({
      scope: () => "expired-root",
      deadlineAt: () => 99,
      resolveBackup: () => backup,
      onSwitch: vi.fn(),
      recovery: { admit, wait, complete: vi.fn(async () => {}) },
    });
    expect((await controller.run(request(), primary, execute)).status).toBe(
      409,
    );
    expect(execute).not.toHaveBeenCalled();
    expect(admit).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
  });
  it("shortens a pending fast retry without sending after the parent deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const execute = vi.fn(async () => transient());
    const controller = new ModelFailoverController({
      scope: () => "short-root",
      deadlineAt: () => 10,
      resolveBackup: () => backup,
      onSwitch: vi.fn(),
    });
    const result = controller.run(request(), primary, execute);
    await vi.advanceTimersByTimeAsync(10);
    expect((await result).status).toBe(503);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
