import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { connect, type Socket } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { Agent, ProxyAgent, errors, fetch, type Dispatcher } from 'undici';
import { withConnectionRetries } from './connection-retry';
import { ModelFailoverController } from './model-failover';
import { ContextRecoveryController } from './context-recovery';
import type { AnthropicRequest } from './types/anthropic';

const servers: Server[] = [];
const pools: Dispatcher[] = [];
const sockets = new Set<Socket>();
async function listen(server: Server) {
  servers.push(server);
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture bind failed');
  return `http://127.0.0.1:${address.port}`;
}
async function fixture(reply?: (req: IncomingMessage, res: ServerResponse) => void) {
  let requests = 0;
  const bodies: string[] = [];
  const server = createServer((req, res) => {
    requests++;
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      bodies.push(Buffer.concat(chunks).toString());
      if (reply) reply(req, res);
      else res.end('verified');
    });
  });
  return { url: await listen(server), requests: () => requests, bodies };
}
function failingConnector(failures: number, onFailure = () => {}) {
  let connections = 0;
  const pool = new Agent({ connections: 1, connect: (options, callback) => {
    connections++;
    if (connections <= failures) {
      queueMicrotask(() => { callback(new errors.ConnectTimeoutError('native connector fixture'), null); onFailure(); });
      return;
    }
    const socket = connect({ host: '127.0.0.1', port: Number(options.port) }, () => callback(null, socket));
    socket.once('error', error => callback(error, null));
  } });
  pools.push(pool);
  return { pool, connections: () => connections };
}
afterEach(async () => {
  await Promise.all(pools.splice(0).map(pool => pool.destroy()));
  for (const socket of sockets) socket.destroy();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

describe('request-owned connection establishment', () => {
  it('reuses the pool without inheriting another completed request cancellation', async () => {
    const f = await fixture(); const c = failingConnector(0);
    for (let index = 0; index < 2; index++) {
      const abort = new AbortController();
      const response = await fetch(f.url, { method: 'POST', body: `request-${index}`, signal: abort.signal,
        dispatcher: withConnectionRetries(c.pool, abort.signal, () => true) });
      expect(await response.text()).toBe('verified');
      abort.abort();
    }
    expect(c.connections()).toBe(1);
    expect(f.bodies).toEqual(['request-0', 'request-1']);
  });
  it('recovers before dispatch and sends the admitted POST body exactly once', async () => {
    const f = await fixture(); const c = failingConnector(1);
    const response = await fetch(f.url, { method: 'POST', body: 'SYNTHETIC_PAYLOAD',
      dispatcher: withConnectionRetries(c.pool, new AbortController().signal, () => true) });
    expect(await response.text()).toBe('verified');
    expect(c.connections()).toBe(2);
    expect(f.bodies).toEqual(['SYNTHETIC_PAYLOAD']);
  });

  it.each(['cancelled', 'owner-changed'] as const)('does not connect after %s while waiting', async mode => {
    const f = await fixture();
    let failed!: () => void;
    const firstFailure = new Promise<void>(resolve => { failed = resolve; });
    const c = failingConnector(Infinity, failed);
    const abort = new AbortController(); let current = true;
    const pending = fetch(f.url, { method: 'POST', body: 'fixture', signal: abort.signal,
      dispatcher: withConnectionRetries(c.pool, abort.signal, () => current) });
    const rejected = expect(pending).rejects.toThrow();
    await firstFailure;
    if (mode === 'cancelled') abort.abort(); else current = false;
    await rejected;
    // Detect undici's default retry timer firing after downstream cancellation.
    await delay(300);
    expect(c.connections()).toBe(1); expect(f.requests()).toBe(0);
  });

  it('bounds real ProxyAgent CONNECT / target TLS timeouts before any target HTTP dispatch', async () => {
    let tunnels = 0;
    const proxy = createServer();
    proxy.on('connect', (_req, socket) => { tunnels++; socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); });
    const uri = await listen(proxy);
    const pool = new ProxyAgent({ uri, connectTimeout: 30 }); pools.push(pool);
    const signal = AbortSignal.timeout(10_000);
    await expect(fetch('https://127.0.0.1:443/model', { method: 'POST', body: 'fixture', signal,
      dispatcher: withConnectionRetries(pool, signal, () => true) }))
      .rejects.toMatchObject({ cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
    expect(tunnels).toBe(3);
  });

  it.each([429, 502, 503])('does not reinterpret HTTP %s or provider error text as a connection failure', async status => {
    const f = await fixture((_req, res) => {
      res.writeHead(status, { 'retry-after': '2' });
      res.end('{"code":"UND_ERR_CONNECT_TIMEOUT","name":"ConnectTimeoutError"}');
    });
    const c = failingConnector(0);
    const response = await fetch(f.url, { method: 'POST', body: 'fixture',
      dispatcher: withConnectionRetries(c.pool, new AbortController().signal, () => true) });
    expect(response.status).toBe(status); expect(response.headers.get('retry-after')).toBe('2');
    await response.text();
    expect(c.connections()).toBe(1); expect(f.requests()).toBe(1);
  });

  it.each(['sent', 'partial-stream'] as const)('never retries after a %s reset', async mode => {
    const f = await fixture((_req, res) => {
      if (mode === 'sent') res.destroy();
      else { res.writeHead(200); res.write('partial'); setTimeout(() => res.destroy(), 20); }
    });
    const c = failingConnector(0);
    await expect((async () => {
      const response = await fetch(f.url, { method: 'POST', body: 'fixture',
        dispatcher: withConnectionRetries(c.pool, new AbortController().signal, () => true) });
      await response.text();
    })()).rejects.toThrow();
    expect(c.connections()).toBe(1); expect(f.requests()).toBe(1);
  });

  it('preserves redirect rejection instead of obtaining a new inference target', async () => {
    const target = await fixture();
    const origin = await fixture((_req, res) => { res.writeHead(307, { location: target.url }); res.end(); });
    const c = failingConnector(0);
    await expect(fetch(origin.url, { method: 'POST', body: 'fixture', redirect: 'error',
      dispatcher: withConnectionRetries(c.pool, new AbortController().signal, () => true) })).rejects.toThrow();
    expect(origin.requests()).toBe(1); expect(target.requests()).toBe(0);
  });

  it('does not renew connection retries after a received 307 on the default follow path', async () => {
    const target = await fixture();
    const origin = await fixture((_req, res) => { res.writeHead(307, { location: target.url }); res.end(); });
    let connections = 0;
    const pool = new Agent({ connect: (options, callback) => {
      connections++;
      if (connections === 2) {
        queueMicrotask(() => callback(new errors.ConnectTimeoutError('redirect target fixture'), null));
        return;
      }
      const socket = connect({ host: '127.0.0.1', port: Number(options.port) }, () => callback(null, socket));
      socket.once('error', error => callback(error, null));
    } });
    pools.push(pool);
    await expect(fetch(origin.url, { method: 'POST', body: 'fixture',
      dispatcher: withConnectionRetries(pool, new AbortController().signal, () => true) }))
      .rejects.toMatchObject({ cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
    expect(connections).toBe(2);
    expect(origin.requests()).toBe(1); expect(target.requests()).toBe(0);
  });

  it('keeps old operation fences and inference replay sealed while a fresh connection recovers', async () => {
    let ledger: unknown;
    const history: AnthropicRequest = { model: 'fixture', max_tokens: 64, stream: true, messages: [
      { role: 'user', content: 'Inspect the existing operation only' },
    ] };
    const options = { scope: () => 'admitted-root', isActive: () => true, protectStreaming: true,
      backup: async () => 'fixture-archive', persistLedger: async (value: unknown) => { ledger = structuredClone(value); } };
    const original = new ContextRecoveryController(options);
    await original.protectInference(history);
    await original.authorizeTool('write_record', { id: 'unknown' });
    const preserved = structuredClone(ledger);
    const context = new ContextRecoveryController({ ...options, initialLedger: ledger });
    const failover = new ModelFailoverController({ scope: options.scope, isActive: options.isActive,
      canRetry: () => context.canRetryInference(), canRetryConnection: () => true,
      resolveBackup: () => undefined, onSwitch: () => { throw new Error('unexpected switch'); } });
    const f = await fixture((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');
    });
    const c = failingConnector(1);
    const request = new Request('http://127.0.0.1/bridge', { method: 'POST', body: JSON.stringify(history) });
    const run = () => context.run(request.clone(), history, body => failover.run(request.clone(),
      { providerId: 'fixture', baseUrl: f.url }, async target => await fetch(f.url, {
        method: 'POST', body: JSON.stringify(body), signal: request.signal,
        dispatcher: withConnectionRetries(c.pool, request.signal, target.canRetryConnection!),
      }) as unknown as Response, 'exact-admitted-fingerprint'));
    expect(await (await run()).text()).toContain('message_stop');
    expect(c.connections()).toBe(2); expect(f.requests()).toBe(1);
    expect(context.canRetryInference()).toBe(false);
    expect(context.beforeTool('write_record', { id: 'unknown' })).toContain('uncertain outcome');
    expect(ledger).toEqual(preserved);
    expect((await run()).status).toBe(409);
    expect(f.requests()).toBe(1);
  });
});
