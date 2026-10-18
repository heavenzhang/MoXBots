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

describe('bounded Query request retries', () => {
  it.each([408, 429, 500, 502, 503, 504, 529])('retries HTTP %s three times without requiring a backup or foreground root', async status => {
    const controller = new ModelFailoverController({ scope: () => undefined, resolveBackup: () => undefined,
      onSwitch: vi.fn(), canSwitch: () => false, retryDelaysMs });
    const execute = vi.fn(async () => Response.json({ error: { message: 'temporarily unavailable' } }, { status }));
    const response = await controller.run(request(), primary, execute, `transient-${status}`);
    expect(response.status).toBe(status);
    expect(execute).toHaveBeenCalledTimes(4);
    expect((await controller.run(request(), primary, execute, `transient-${status}`)).status).toBe(409);
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
    expect((await controller.run(request(), primary, execute, 'exhausted')).status).toBe(409);
    expect(execute).toHaveBeenCalledTimes(8);
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

  it('fails closed at a fixed Query capacity instead of evicting replay evidence', () => {
    const guard = new QueryRequestGuard();
    const admitted = guard.begin('root-in-flight', 'healthy', false)!;
    for (let index = 0; index < 4095; index++) expect(guard.begin(`root-${index}`, 'history', false)).toBeDefined();
    expect(guard.begin('overflow', 'new-history', false)).toBeUndefined();
    expect(guard.begin(undefined, 'history', true)).toBeUndefined();
    expect(admitted.isBlocked()).toBe(false);
  });
});
