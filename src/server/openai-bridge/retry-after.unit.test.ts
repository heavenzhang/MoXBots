import { afterEach, expect, it, vi } from 'vitest';
import { ModelFailoverController } from './model-failover';
import type { RecoveryCausalDiagnostic } from './recovery-causal-diagnostics';
import type { UpstreamConfig } from './types/bridge';
const primary = { providerId: 'fixture', model: 'fixture', baseUrl: 'http://fixture.invalid' };
const request = (signal?: AbortSignal) => new Request('http://localhost/fixture', { signal });
const response = (status: number, value: string) => Response.json({ error: { message: 'fixture unavailable' } }, { status, headers: { 'retry-after': value } });
afterEach(() => vi.useRealTimers());

it('waits out a proven rejection cooldown within the admitted request while old operations remain fenced', async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const wait = vi.fn(async () => 0);
  const controller = new ModelFailoverController({ scope: () => 'root', canRetry: () => false,
    canRetryRejectedResponse: () => true, resolveBackup: () => undefined, onSwitch: () => {},
    retryDelaysMs: [0, 0, 0], recovery: { wait, complete: async () => {} } });
  const execute = vi.fn(async (target: UpstreamConfig) => {
    if (execute.mock.calls.length > 1) return Response.json({ ok: true });
    target.onRejectedResponse?.(502); return response(502, '60');
  });
  let settled = false;
  const pending = controller.run(request(), primary, execute, 'exact').then(r => { settled = true; return r; });
  await vi.advanceTimersByTimeAsync(0);
  expect(settled).toBe(false); expect(execute).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(59_999); expect(execute).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await (await pending).json()).toEqual({ ok: true });
  expect(execute).toHaveBeenCalledTimes(2); expect(wait).not.toHaveBeenCalled();
  expect((await controller.run(request(), primary, execute, 'exact')).status).toBe(409);
  expect(execute).toHaveBeenCalledTimes(2);
});

it('tries the allowed backup first and waits only after the candidate chain cannot advance', async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const backup = { ...primary, providerId: 'backup', baseUrl: 'http://backup.invalid' };
  let backupCalls = 0;
  const controller = new ModelFailoverController({ scope: () => 'root', canRetry: () => false,
    canRetryRejectedResponse: () => true, resolveBackup: () => backup, onSwitch: () => {}, retryDelaysMs: [0, 0, 0] });
  const execute = vi.fn(async (target: UpstreamConfig) => {
    if (target.providerId === 'backup' && ++backupCalls > 1) return Response.json({ ok: true });
    target.onRejectedResponse?.(502); return response(502, '60');
  });
  const pending = controller.run(request(), primary, execute, 'exact');
  await vi.advanceTimersByTimeAsync(0);
  expect(execute.mock.calls.map(([target]) => target.providerId)).toEqual(['fixture', 'backup']);
  await vi.advanceTimersByTimeAsync(60_000);
  expect((await pending).status).toBe(200);
  expect(execute.mock.calls.map(([target]) => target.providerId)).toEqual(['fixture', 'backup', 'backup']);
});

it('spends only the remaining per-target attempts when cooldown appears after a short retry', async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const wait = vi.fn(async () => 0);
  const controller = new ModelFailoverController({ scope: () => 'root', canRetry: () => false,
    canRetryRejectedResponse: () => true, resolveBackup: () => undefined, onSwitch: () => {},
    retryDelaysMs: [0, 0, 0], recovery: { wait, complete: async () => {} } });
  const execute = vi.fn(async (target: UpstreamConfig) => {
    target.onRejectedResponse?.(502); return response(502, execute.mock.calls.length === 1 ? '0' : '60');
  });
  const pending = controller.run(request(), primary, execute, 'exact');
  await vi.advanceTimersByTimeAsync(0); expect(execute).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(60_000); expect(execute).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(60_000); expect(execute).toHaveBeenCalledTimes(4);
  expect((await pending).status).toBe(502); expect(wait).not.toHaveBeenCalled();
  const repeated = await controller.run(request(), primary, execute, 'exact');
  expect(repeated.status).toBe(502); expect(await repeated.text()).toContain('automatic_replay_blocked');
  expect(execute).toHaveBeenCalledTimes(4);
});

it.each(['abort', 'owner', 'route', 'background', 'policy', 'deadline', 'end-turn'] as const)(
  'revokes a known rejection cooldown on %s without another provider request', async change => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    let active = true, allowed = true, foreground = true, identity = 'original', deadline = Infinity;
    const abort = new AbortController();
    const controller = new ModelFailoverController({ scope: () => 'root', canRetry: () => false,
      canRetryRejectedResponse: () => allowed, isActive: () => active, canSwitch: () => foreground,
      requestIdentity: () => identity, deadlineAt: () => deadline,
      resolveBackup: () => undefined, onSwitch: () => {}, retryDelaysMs: [0, 0, 0] });
    const execute = vi.fn(async (target: UpstreamConfig) => { target.onRejectedResponse?.(502); return response(502, '60'); });
    let settled = false;
    const pending = controller.run(request(abort.signal), primary, execute, 'exact').then(r => { settled = true; return r; });
    await vi.advanceTimersByTimeAsync(0); expect(settled).toBe(false);
    if (change === 'abort') abort.abort();
    if (change === 'owner') active = false;
    if (change === 'route') identity = 'replaced';
    if (change === 'background') foreground = false;
    if (change === 'policy') allowed = false;
    if (change === 'deadline') deadline = 25;
    if (change === 'end-turn') controller.endTurn();
    await vi.advanceTimersByTimeAsync(50);
    expect(settled).toBe(true);
    expect((await pending).ok).toBe(false); expect(execute).toHaveBeenCalledTimes(1);
  });

it.each(['60', '9999999999'])('does not shorten an unfit cooldown (%s) to dispatch before the deadline', async value => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const controller = new ModelFailoverController({ scope: () => 'root', canRetry: () => false,
    canRetryRejectedResponse: () => true, deadlineAt: () => 30_000,
    resolveBackup: () => undefined, onSwitch: () => {}, retryDelaysMs: [0, 0, 0] });
  const execute = vi.fn(async (target: UpstreamConfig) => { target.onRejectedResponse?.(502); return response(502, value); });
  const result = await controller.run(request(), primary, execute, 'exact');
  expect(result.status).toBe(502); expect(result.headers.get('retry-after')).toBe(value);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(execute).toHaveBeenCalledTimes(1);
});

it('rechecks authority when backup validation finishes after cooldown', async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  let allowed = true;
  let validated!: (value: boolean) => void;
  const validation = new Promise<boolean>(resolve => { validated = resolve; });
  const backup = { ...primary, providerId: 'backup', baseUrl: 'http://backup.invalid' };
  const controller = new ModelFailoverController({ scope: () => 'root', canRetry: () => false,
    canRetryRejectedResponse: () => allowed, resolveBackup: () => backup, onSwitch: () => {},
    validateBackup: async () => Date.now() === 0 ? true : validation, retryDelaysMs: [0, 0, 0] });
  const execute = vi.fn(async (target: UpstreamConfig) => { target.onRejectedResponse?.(502); return response(502, '60'); });
  const pending = controller.run(request(), primary, execute, 'exact');
  await vi.advanceTimersByTimeAsync(60_000);
  expect(execute.mock.calls.map(([target]) => target.providerId)).toEqual(['fixture', 'backup']);
  allowed = false; validated(true);
  expect((await pending).status).toBe(502);
  expect(execute).toHaveBeenCalledTimes(2);
});

it('does not reuse cooldown rejection proof after a synthetic connection failure', async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const controller = new ModelFailoverController({ scope: () => 'root', canRetry: () => false,
    canRetryRejectedResponse: () => true, resolveBackup: () => undefined, onSwitch: () => {}, retryDelaysMs: [0, 0, 0] });
  const execute = vi.fn(async (target: UpstreamConfig) => {
    if (execute.mock.calls.length === 1) target.onRejectedResponse?.(502);
    return response(502, '60');
  });
  const pending = controller.run(request(), primary, execute, 'exact');
  await vi.advanceTimersByTimeAsync(60_000);
  expect((await pending).status).toBe(502); expect(execute).toHaveBeenCalledTimes(2);
});

it.each([429, 503, 529])('does not hammer HTTP %s during cooldown without a durable wait owner', async status => {
  for (const background of [false, true]) {
    const events: RecoveryCausalDiagnostic[] = [];
    const waiting = vi.fn(async () => undefined);
    const controller = new ModelFailoverController({ scope: () => background ? undefined : 'root',
      resolveBackup: () => undefined, onSwitch: () => {}, retryDelaysMs: [0, 0, 0],
      recovery: background ? { wait: waiting, complete: async () => {} } : undefined,
      onDiagnostic: e => { events.push(e); } });
    const execute = vi.fn(async () => response(status, '60'));
    const result = await controller.run(request(), primary, execute, 'same-inference');
    expect(result.status).toBe(status); expect(result.headers.get('retry-after')).toBe('60');
    expect(await result.text()).toContain('fixture unavailable');
    expect(execute).toHaveBeenCalledTimes(1); expect(waiting).not.toHaveBeenCalled();
    expect(events).toEqual([{ event: 'inference_retry_deferred', reason: 'provider_cooldown', status,
      attempt: 1, retryAfterMs: 60_000, usingBackup: false, durableOwnerAvailable: false }]);
    const repeated = await controller.run(request(), primary, execute, 'same-inference');
    expect(repeated.status).toBe(status); expect(await repeated.text()).toContain('automatic_replay_blocked');
    expect(execute).toHaveBeenCalledTimes(1);
  }
});
it.each(['60', 'Thu, 29 Oct 2026 00:01:00 GMT', '9999999999'])('honors valid cooldown %s before short retry', async value => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-29T00:00:00Z'));
  const controller = new ModelFailoverController({ scope: () => 'root', resolveBackup: () => undefined,
    onSwitch: () => {}, retryDelaysMs: [0, 0, 0] });
  const execute = vi.fn(async () => response(503, value));
  expect((await controller.run(request(), primary, execute, 'fixture')).status).toBe(503);
  expect(execute).toHaveBeenCalledTimes(1);
});
it.each(['', '-1', 'NaN', 'not a date', 'Wed, 28 Oct 2026 00:00:00 GMT', '0'])('keeps bounded retries when cooldown is invalid or elapsed (%s)', async value => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-29T00:00:00Z'));
  const controller = new ModelFailoverController({ scope: () => undefined, resolveBackup: () => undefined,
    onSwitch: () => {}, retryDelaysMs: [0, 0, 0] });
  const execute = vi.fn(async () => response(503, value));
  expect((await controller.run(request(), primary, execute, 'fixture')).status).toBe(503);
  expect(execute).toHaveBeenCalledTimes(4);
});
it.each(['success', 'Stop', 'deadline', 'unknown-operation'])('preserves %s during a short permitted cooldown', async outcome => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  let safe = true;
  const abort = new AbortController();
  const controller = new ModelFailoverController({ scope: () => 'root', resolveBackup: () => undefined,
    onSwitch: () => {}, retryDelaysMs: [1000, 1000, 1000], canRetry: () => safe,
    deadlineAt: () => outcome === 'deadline' ? 500 : 30_000 });
  const execute = vi.fn(async () => execute.mock.calls.length === 1 ? response(429, '1') : Response.json({ ok: true }));
  const pending = controller.run(request(abort.signal), primary, execute, 'fixture');
  await vi.advanceTimersByTimeAsync(0); expect(execute).toHaveBeenCalledTimes(1);
  if (outcome === 'Stop') abort.abort();
  if (outcome === 'unknown-operation') safe = false;
  await vi.advanceTimersByTimeAsync(999); expect(execute).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect((await pending).status).toBe(outcome === 'success' ? 200 : outcome === 'Stop' ? 499 : 429);
  expect(execute).toHaveBeenCalledTimes(outcome === 'success' ? 2 : 1);
});
it('uses an independent allowed candidate while respecting the primary cooldown', async () => {
  const backup = { ...primary, baseUrl: 'http://backup.invalid', providerId: 'backup' };
  const switched = vi.fn();
  const controller = new ModelFailoverController({ scope: () => 'root', resolveBackup: () => backup,
    onSwitch: switched, retryDelaysMs: [0, 0, 0] });
  const execute = vi.fn(async target => target === primary ? response(503, '60') : Response.json({ ok: true }));
  expect((await controller.run(request(), primary, execute, 'fixture')).status).toBe(200);
  expect(execute.mock.calls.map(([target]) => target.providerId)).toEqual(['fixture', 'backup']);
  expect(switched).toHaveBeenCalledOnce();
});

it.each(['disabled', 'throws'])('diagnostic observer %s does not change cooldown or expose raw headers', async mode => {
  const events: RecoveryCausalDiagnostic[] = [];
  const controller = new ModelFailoverController({ scope: () => 'root', resolveBackup: () => undefined,
    onSwitch: () => {}, retryDelaysMs: [0, 0, 0], onDiagnostic: mode === 'disabled' ? false : event => {
      events.push(event); throw new Error('observer only');
    } });
  const execute = vi.fn(async () => response(503, '60'));
  expect((await controller.run(request(), primary, execute, 'private-request-identity')).status).toBe(503);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(events)).not.toContain('private-request');
  expect(JSON.stringify(events)).not.toContain('fixture.invalid');
});
