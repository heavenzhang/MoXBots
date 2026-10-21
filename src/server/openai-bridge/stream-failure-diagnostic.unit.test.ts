import { describe, expect, it, vi } from 'vitest';
import { safeStreamFailure, streamFailure, streamFailureMessage } from './stream-failure-diagnostic';
import { QueryRequestGuard } from './request-lifetime';
import { ContextRecoveryController } from './context-recovery';
import { ModelFailoverController } from './model-failover';
import type { StreamInterruptionObserver, UpstreamConfig } from './types/bridge';

const message = (error = false) => new Response(`data: ${JSON.stringify(error
  ? { type: 'error', error: { type: 'api_error', message: 'fixture' } }
  : { type: 'message_start', message: { content: [] } })}\n\n`
  + (error ? '' : 'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\ndata: {"type":"message_stop"}\n\n'),
{ headers: { 'content-type': 'text/event-stream' } });
const make = (signal?: AbortSignal) => new Request('http://fixture.invalid/v1/messages', { method: 'POST', body: '{}', signal });
const route: UpstreamConfig = { providerId: 'fixture', baseUrl: 'http://fixture.invalid' };

describe('bounded exact-scope diagnostic evidence', () => {
  it('keeps only two validated enums and never reflects arbitrary fields or codes', () => {
    expect(streamFailure('provider_terminal', 'secret')).toEqual({ origin: 'provider_terminal', category: 'unknown' });
    expect(streamFailure('provider_terminal', '__proto__').category).toBe('unknown');
    expect(safeStreamFailure({ origin: 'transport', category: 'authentication', message: 'secret' }))
      .toEqual({ origin: 'transport', category: 'unknown' });
    expect(safeStreamFailure({ origin: 'secret', category: 'server' })).toBeUndefined();
    expect(streamFailureMessage({ origin: 'secret', category: 'secret' } as never)).toBe('');
  });

  it('first terminal observation wins within exactly one scope, independent of row order or fingerprint reuse', () => {
    const guard = new QueryRequestGuard();
    const first = guard.begin('root-a', 'same-hash', false)!;
    const concurrent = guard.begin('root-a', 'other-hash', false)!;
    concurrent.recordFailureDiagnostic(streamFailure('protocol_validation'));
    first.recordFailureDiagnostic(streamFailure('provider_terminal', 'invalid_api_key'));
    expect(guard.failureDiagnostic('root-a')).toEqual(streamFailure('protocol_validation'));
    expect(guard.begin('root-b', 'same-hash', false)).toBeDefined();
    expect(guard.failureDiagnostic('root-b')).toBeUndefined();
    first.finish(); concurrent.finish();
    concurrent.recordFailureDiagnostic(streamFailure('provider_terminal', 'server_error'));
    expect(guard.failureDiagnostic('root-a')).toEqual(streamFailure('protocol_validation'));
  });

  it('does not share diagnostics between requests without an exact bound root', () => {
    const guard = new QueryRequestGuard();
    const unknown = guard.begin(undefined, 'first', true)!;
    unknown.recordFailureDiagnostic(streamFailure('provider_terminal', 'invalid_api_key'));
    expect(guard.failureDiagnostic(undefined)).toBeUndefined();
    unknown.block(); unknown.finish();
    expect(guard.begin(undefined, 'second', true)).toBeUndefined(); // Original protection unchanged.
    expect(guard.begin('new-bound-root', 'first', false)).toBeDefined();
    expect(guard.failureDiagnostic('new-bound-root')).toBeUndefined();
  });

  it('does not change settled proof revisions and does not grow beyond existing admission capacity', () => {
    const guard = new QueryRequestGuard();
    const lease = guard.begin('root', 'interrupted', false)!;
    lease.recordFailureDiagnostic(streamFailure('transport'));
    lease.interrupted(); lease.block(); lease.finish();
    const snapshot = guard.settledScope('root')!;
    lease.recordFailureDiagnostic(streamFailure('protocol_validation'));
    expect(guard.isCurrentSnapshot(snapshot)).toBe(true);
    expect(guard.failureDiagnostic('root')).toEqual(streamFailure('transport'));
    for (let i = 1; i < 4096; i++) guard.begin(`root-${i}`, `hash-${i}`, false)!.finish();
    expect(guard.begin('overflow', 'new', false)).toBeUndefined();
    expect(guard.failureDiagnostic('overflow')).toBeUndefined();
  });
});

describe('attempt and cancellation diagnostic ownership', () => {
  it('discards primary retry candidates when backup succeeds and ignores callbacks from retired attempts', async () => {
    let scope = 'root-a';
    const notifications: unknown[] = [];
    const controller = new ModelFailoverController({ scope: () => scope, isActive: () => true,
      resolveBackup: () => ({ ...route, providerId: 'backup' }), onSwitch: () => {}, retryDelaysMs: [0, 0, 0] });
    const oldCallbacks: StreamInterruptionObserver[] = [];
    const first = await controller.run(make(), { ...route, onStreamInterruption: (_cause, diagnostic) => {
      if (diagnostic) notifications.push(diagnostic);
    } }, async (target, _progress, notify) => {
      oldCallbacks.push(notify!);
      if (target.providerId === 'backup') return message();
      notify!('unproven', streamFailure('provider_terminal', 'invalid_api_key'));
      return new Response('fixture unavailable', { status: 503 });
    }, 'first');
    expect(await first.text()).not.toContain('首个失败');
    expect(notifications).toEqual([]);
    controller.endTurn(); scope = 'root-b';
    const next = await controller.run(make(), route, async (_target, _progress, notify) => {
      for (const old of oldCallbacks) old('unproven', streamFailure('provider_terminal', 'invalid_api_key'));
      notify!('unproven', streamFailure('provider_terminal', 'server_error'));
      return message(true);
    }, 'first'); // Same fingerprint in an independent root.
    const text = await next.text();
    expect(text).toContain('服务异常');
    expect(text).not.toContain('鉴权');
  });

  it('does not publish a cancelled or replaced owner candidate across durable blocked await', async () => {
    let scope = 'old-root';
    const abort = new AbortController();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let reached!: () => void;
    const entered = new Promise<void>(resolve => { reached = resolve; });
    const diagnostic = vi.fn();
    const controller = new ModelFailoverController({ scope: () => scope, isActive: () => true,
      resolveBackup: () => undefined, onSwitch: () => {}, recovery: {
        wait: async () => undefined, complete: async () => {}, blocked: async () => { reached(); await held; },
      } });
    const response = await controller.run(make(abort.signal), { ...route, onStreamInterruption: (_cause, value) => {
      if (value) diagnostic(value);
    } }, async (_target, _progress, notify) => {
      notify!('unproven', streamFailure('provider_terminal', 'invalid_api_key')); return message(true);
    }, 'old');
    const read = response.text().catch(() => 'cancelled');
    await entered;
    abort.abort(); scope = 'new-root'; release();
    await read;
    // The original single cause notification may carry a candidate; no stream
    // terminal/next-root diagnostic may be committed after cancellation.
    expect(diagnostic).toHaveBeenCalledTimes(1);
    const next = await controller.run(make(), route, async (_target, _progress, notify) => {
      notify!('unproven', streamFailure('provider_terminal', 'server_error')); return message(true);
    }, 'new');
    expect(await next.text()).not.toContain('鉴权');
  });

  it('ignores a Context request callback after consumer cancellation even if the Query stays live', async () => {
    const context = new ContextRecoveryController({ scope: () => 'root', isActive: () => true,
      backup: async () => 'unused' });
    let callback!: StreamInterruptionObserver;
    const body = { model: 'fixture', max_tokens: 16, stream: true, messages: [{ role: 'user' as const, content: 'read' }] };
    const response = await context.run(make(), body, async (_body, notify) => {
      callback = notify!;
      return new Response(new ReadableStream({ start(output) {
        output.enqueue(new TextEncoder().encode('data: {"type":"message_start","message":{"content":[]}}\n\n'));
      } }), { headers: { 'content-type': 'text/event-stream' } });
    });
    const reader = response.body!.getReader(); await reader.read(); await reader.cancel();
    callback('unproven', streamFailure('provider_terminal', 'invalid_api_key'));
    const refused = await context.run(make(), body, async () => { throw new Error('must never dispatch'); });
    expect(refused.status).toBe(409);
    expect(await refused.text()).not.toContain('鉴权');
  });

  it('keeps a Context candidate uncommitted when the final MF blocked await is aborted', async () => {
    let scope = 'old-root';
    const abort = new AbortController();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let reached!: () => void;
    const entered = new Promise<void>(resolve => { reached = resolve; });
    const context = new ContextRecoveryController({ scope: () => scope, isActive: () => true, backup: async () => 'unused' });
    const failover = new ModelFailoverController({ scope: () => scope, isActive: () => true,
      resolveBackup: () => undefined, onSwitch: () => {}, recovery: { wait: async () => undefined,
        complete: async () => {}, blocked: async () => { reached(); await held; } } });
    const old = make(abort.signal);
    const body = { model: 'fixture', max_tokens: 16, stream: true, messages: [{ role: 'user' as const, content: 'read' }] };
    const response = await context.run(old, body, async (_body, observer) => failover.run(old,
      { ...route, onStreamInterruption: observer }, async (_target, _progress, notify) => {
        notify!('unproven', streamFailure('provider_terminal', 'invalid_api_key')); return message(true);
      }, 'first'));
    const read = response.text().catch(() => 'cancelled');
    await entered; abort.abort(); release(); await read;
    // Same old root stays blocked, but its cancelled candidate was never a
    // delivered failure and must not become a persisted/displayed first cause.
    const denied = await context.run(make(), body, async () => { throw new Error('must not dispatch'); });
    expect(denied.status).toBe(409);
    expect(await denied.text()).not.toContain('鉴权');
    context.endTurn(); failover.endTurn(); scope = 'new-root';
    const nextRequest = make();
    const next = await context.run(nextRequest, body, async (_body, observer) => failover.run(nextRequest,
      { ...route, onStreamInterruption: observer }, async (_target, _progress, notify) => {
        notify!('unproven', streamFailure('provider_terminal', 'server_error')); return message(true);
      }, 'first'));
    const text = await next.text();
    expect(text).toContain('服务异常');
    expect(text).not.toContain('鉴权');
  });

});
