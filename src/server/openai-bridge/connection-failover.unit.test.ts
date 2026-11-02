import { describe, expect, it, vi } from 'vitest';
import type { Socket } from 'node:net';
import { isConnectionEstablishmentFailure, withConnectionEstablishmentProof } from './connection-retry';
import { ModelFailoverController } from './model-failover';
import type { UpstreamConfig } from './types/bridge';

const primary: UpstreamConfig = { providerId: 'primary', baseUrl: 'https://primary.invalid' };
const backup: UpstreamConfig = { providerId: 'backup', baseUrl: 'https://backup.invalid' };
const failure = () => Response.json({ error: { message: 'upstream connection failed' } }, { status: 502 });
const request = (signal?: AbortSignal) => new Request('http://127.0.0.1/bridge', { signal });
function connectorError(code = 'ECONNRESET', connected = false) {
  const error = Object.assign(new Error('fixture'), { code });
  withConnectionEstablishmentProof((_options, callback) => {
    if (connected) callback(null, {} as Socket);
    callback(error, null);
  })({ hostname: 'fixture.invalid', protocol: 'https:', port: '443' }, () => {});
  return new TypeError('fetch failed', { cause: error });
}

describe('connection establishment proof and attempt ownership', () => {
  it.each(['ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN'])(
    'accepts %s only from a connector before socket handoff', code => {
      expect(isConnectionEstablishmentFailure(connectorError(code))).toBe(true);
      expect(isConnectionEstablishmentFailure(connectorError(code, true))).toBe(false);
      expect(isConnectionEstablishmentFailure(Object.assign(new Error('same text'), { code }))).toBe(false);
    });
  it.each(['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID', 'ENOTFOUND'])(
    'never retries certificate or permanent configuration failure %s', code => {
      expect(isConnectionEstablishmentFailure(connectorError(code))).toBe(false);
    });

  it.each(['abort', 'owner', 'route', 'background', 'policy', 'end-turn', 'deadline'] as const)(
    'revokes connection fallback after asynchronous candidate validation on %s', async change => {
      let active = true, permitted = true, foreground = true, route = 'original', deadline = Infinity;
      let entered!: () => void, release!: () => void;
      const started = new Promise<void>(resolve => { entered = resolve; });
      const pending = new Promise<void>(resolve => { release = resolve; });
      const abort = new AbortController(), switched = vi.fn();
      const controller = new ModelFailoverController({ scope: () => 'root', isActive: () => active,
        requestIdentity: () => route, deadlineAt: () => deadline, canSwitch: () => foreground,
        canRetry: () => false, canRetryConnection: () => permitted,
        resolveBackup: () => backup, validateBackup: async () => { entered(); await pending; return true; },
        onSwitch: switched, retryDelaysMs: [0, 0, 0] });
      const execute = vi.fn(async (target: UpstreamConfig) => {
        target.onConnectionFailure?.(connectorError()); return failure();
      });
      const run = controller.run(request(abort.signal), primary, execute, 'exact');
      await started;
      expect(execute).toHaveBeenCalledOnce();
      if (change === 'abort') abort.abort();
      if (change === 'owner') active = false;
      if (change === 'route') route = 'replacement';
      if (change === 'background') foreground = false;
      if (change === 'policy') permitted = false;
      if (change === 'end-turn') controller.endTurn();
      if (change === 'deadline') deadline = Date.now() - 1;
      release(); await (await run).text();
      expect(execute).toHaveBeenCalledOnce(); expect(switched).not.toHaveBeenCalled();
    });

  it('does not reuse an earlier connector proof or late callback for a dispatched backup failure', async () => {
    let oldProof: UpstreamConfig['onConnectionFailure'];
    const advance = vi.fn(() => true), wait = vi.fn(async () => undefined), switched = vi.fn();
    const execute = vi.fn(async (target: UpstreamConfig) => {
      if (target.providerId === 'primary') {
        oldProof = target.onConnectionFailure; oldProof?.(connectorError());
      } else oldProof?.(connectorError());
      return failure();
    });
    const controller = new ModelFailoverController({ scope: () => 'root', canRetry: () => false,
      canRetryConnection: () => true, resolveBackup: () => backup, advanceCandidate: advance,
      onSwitch: switched, recovery: { wait, complete: async () => {} }, retryDelaysMs: [0, 0, 0] });
    expect((await controller.run(request(), primary, execute, 'exact')).status).toBe(502);
    expect(execute).toHaveBeenCalledTimes(2); expect(switched).toHaveBeenCalledOnce();
    expect(advance).not.toHaveBeenCalled(); expect(wait).not.toHaveBeenCalled();
    // The guard preserves the failed upstream status while sealing SDK replay.
    const duplicate = await controller.run(request(), primary, execute, 'exact');
    expect(duplicate.status).toBe(502);
    expect(await duplicate.text()).toContain('automatic_replay_blocked');
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('does not multiply the exhausted socket budget by HTTP retries when ordinary retry is allowed', async () => {
    const execute = vi.fn(async (target: UpstreamConfig) => {
      if (target.providerId === 'backup') return Response.json({ ok: true });
      target.onConnectionFailure?.(connectorError()); return failure();
    });
    const controller = new ModelFailoverController({ scope: () => 'root', canRetry: () => true,
      canRetryConnection: () => true, resolveBackup: () => backup, onSwitch: vi.fn(), retryDelaysMs: [0, 0, 0] });
    expect((await controller.run(request(), primary, execute, 'exact')).status).toBe(200);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('does not accept a local 502 or a forged reset error as connector proof', async () => {
    const switched = vi.fn();
    const execute = vi.fn(async (target: UpstreamConfig) => {
      target.onConnectionFailure?.(Object.assign(new Error('Client network socket disconnected before secure TLS connection was established'), { code: 'ECONNRESET' }));
      return failure();
    });
    const controller = new ModelFailoverController({ scope: () => 'root', canRetry: () => false,
      canRetryConnection: () => true, resolveBackup: () => backup, onSwitch: switched, retryDelaysMs: [0, 0, 0] });
    expect((await controller.run(request(), primary, execute, 'exact')).status).toBe(502);
    expect(execute).toHaveBeenCalledOnce(); expect(switched).not.toHaveBeenCalled();
  });
});
