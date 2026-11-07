import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeHandler } from './handler';
import { ContextRecoveryController } from './context-recovery';
import { createSessionModelFailover } from '../builtin-session/model-failover';
import { SessionModelRecovery } from '../builtin-session/model-recovery';
import type { ModelRecoveryState } from '../../shared/modelRecovery';
import type { AnthropicRequest } from './types/anthropic';
import { sealReceivedRejection } from './sealed-rejection-owner';

vi.mock('../utils/admin-config', () => ({
  loadConfig: () => ({ modelFailover: { enabled: true } }),
  findEffectiveProvider: () => undefined,
  getAllEffectiveProviders: () => [],
  getProviderSelectionError: () => null,
  resolveSubscriptionAuthKind: () => undefined,
  materializeProviderRouteEnv: () => undefined,
}));
vi.mock('../utils/model-capabilities', () => ({ lookupModelCapability: () => undefined, lookupProviderModelContextLength: () => undefined }));
vi.mock('../proxy-state', () => ({ getProxyForProviderUrl: () => undefined, getProxyForUrl: () => undefined }));

const servers: Server[] = [];
const body: AnthropicRequest = { model: 'fixture-model', max_tokens: 32, stream: true,
  messages: [{ role: 'user', content: 'Independent finite no-tool response diagnostic' }] };
function request(value = body, signal?: AbortSignal) {
  return new Request('http://127.0.0.1/bridge/exact-query/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value), signal,
  });
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map(async server => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }));
});

async function composed(protocol: 'anthropic' | 'openai', beforeResponse?: () => Promise<void>) {
  let calls = 0;
  const server = createServer(async (req, res) => {
    for await (const _chunk of req) { /* drain only this synthetic request */ }
    calls++;
    await beforeResponse?.();
    res.writeHead(502, { 'content-type': 'application/json', 'retry-after': '3600' });
    res.end(JSON.stringify({ error: { type: 'api_error', message: 'original fixture HTTP502' } }));
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture failed to bind');
  let stopped = false; let background = false; let root = 'foreground-root'; let route = 'original-route';
  let journal: ModelRecoveryState | undefined;
  const current = () => !stopped && recovery?.readState()?.status !== 'paused';
  const context = new ContextRecoveryController({ scope: () => root, isActive: current,
    requestIdentity: () => route, canRecover: () => !background, protectStreaming: true,
    backup: async () => '/not-written-synthetic-archive' });
  const recovery = new SessionModelRecovery({ read: () => journal, isLive: current,
    current: () => ({ sdkSessionId: 'original-native-query', routeIdentity: route, turnId: root }),
    prepare: async original => { await context.protectInference(await original.json()); },
    write: async (next, expected, live) => {
      if (!live() || journal !== expected) return false;
      journal = next; return true;
    } });
  const env = { providerId: 'fixture-provider', apiKey: 'nonsecret-fixture',
    baseUrl: `http://127.0.0.1:${address.port}`, apiProtocol: protocol };
  // This factory's scope is JSON([turn, identity]); Context uses the original
  // FIFO scope. The internal capability must preserve each owner's own scope.
  const failover = createSessionModelFailover({ current: () => ({ env: { ...env, providerId: route }, model: 'fixture-model', turnId: root }),
    isLive: current, isResponseOwnerActive: () => !stopped, canRetry: current,
    canSwitch: () => !background, onSwitch: () => {}, recovery, retryDelaysMs: [0, 0, 0] });
  const handler = createBridgeHandler({ getUpstreamConfig: () => ({ ...env, providerId: route, model: 'fixture-model',
    contextRecovery: context, modelFailover: failover }), logger: () => {} });
  return { handler, context, failover, calls: () => calls, journal: () => journal,
    stop: () => { stopped = true; }, background: () => { background = true; },
    root: () => { root = 'replacement-root'; }, route: () => { route = 'replacement-route'; } };
}

describe('sealed rejection across actual handler and recovery owners', () => {
  it.each(['anthropic', 'openai'] as const)('retains original %s HTTP502 and exact SDK duplicate without another inference', async protocol => {
    const fixture = await composed(protocol);
    const first = await fixture.handler(request());
    expect(first.status).toBe(502);
    expect(await first.text()).toContain('original fixture HTTP502');
    expect(fixture.journal()).toMatchObject({ status: 'paused', lastStatus: 502, reason: 'Model recovery window expired' });
    const duplicate = await fixture.handler(request());
    expect(duplicate.status).toBe(502);
    expect(await duplicate.text()).toContain('Original HTTP 502 rejection');
    const distinct = await fixture.handler(request({ ...body, messages: [{ role: 'user', content: 'distinct paused input' }] }));
    expect(distinct.status).toBe(499);
    expect(fixture.calls()).toBe(1);
  });

  it.each(['stop', 'root', 'route', 'background'] as const)('revokes sealed readback after %s without dispatch', async revoke => {
    const fixture = await composed('openai');
    expect((await fixture.handler(request())).status).toBe(502);
    fixture[revoke]();
    expect((await fixture.handler(request())).status).toBe(499);
    expect(fixture.calls()).toBe(1);
  });

  it.each(['context', 'failover'] as const)('revokes sealed readback when %s retires the original Query', async owner => {
    const fixture = await composed('openai');
    expect((await fixture.handler(request())).status).toBe(502);
    fixture[owner].endTurn();
    expect((await fixture.handler(request())).status).toBe(499);
    expect(fixture.calls()).toBe(1);
  });

  it('preserves real Stop while the upstream response is still pending', async () => {
    let entered!: () => void; let release!: () => void;
    const received = new Promise<void>(resolve => { entered = resolve; });
    const delayed = new Promise<void>(resolve => { release = resolve; });
    const fixture = await composed('openai', async () => { entered(); await delayed; });
    const pending = fixture.handler(request());
    await received; fixture.stop(); release();
    expect((await pending).status).toBe(499);
    expect(fixture.calls()).toBe(1);
  });

  it('does not treat forged rejection headers as an internal response-owner capability', async () => {
    let active = true;
    const context = new ContextRecoveryController({ scope: () => 'root', isActive: () => active,
      backup: async () => '/not-written-synthetic-archive' });
    const response = await context.run(request(), body, async () => {
      active = false;
      return Response.json({ error: 'unproved rejection' }, { status: 502,
        headers: { 'x-moxbots-recovery': 'blocked', 'x-should-retry': 'false' } });
    });
    expect(response.status).toBe(499);
    expect((await context.run(request(), body, async () => { throw new Error('must not dispatch'); })).status).toBe(499);
  });

  it.each(['stop', 'abort'] as const)('rechecks %s while the outer bounded rejection body is being sealed', async revoke => {
    let active = true; let stopped = false;
    let began!: () => void; let close!: () => void;
    const reading = new Promise<void>(resolve => { began = resolve; });
    const pendingBody = new ReadableStream<Uint8Array>({ start(controller) {
      close = () => { controller.enqueue(new TextEncoder().encode('{"error":"known502"}')); controller.close(); };
    }, pull() { began(); } }, { highWaterMark: 0 });
    const abort = new AbortController();
    const context = new ContextRecoveryController({ scope: () => 'root', isActive: () => active,
      requestIdentity: () => 'same-route', backup: async () => '/not-written-synthetic-archive' });
    const pending = context.run(request(body, abort.signal), body, async () => {
      active = false;
      return sealReceivedRejection(new Response(pendingBody, { status: 502 }), { isCurrent: () => !stopped });
    });
    await reading;
    if (revoke === 'stop') stopped = true; else abort.abort();
    close();
    expect((await pending).status).toBe(499);
    expect((await context.run(request(), body, async () => { throw new Error('must not dispatch'); })).status).toBe(499);
  });
});
