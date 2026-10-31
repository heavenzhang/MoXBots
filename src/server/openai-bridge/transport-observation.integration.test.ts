import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { Agent, ProxyAgent, fetch } from 'undici';
import { connect } from 'node:net';
import { createTransportObservation } from './transport-observation';

const servers: Server[] = [];
const agents: (Agent | ProxyAgent)[] = [];
async function fixture() {
  let count = 0;
  const server = createServer((req, res) => {
    count++;
    req.resume();
    req.on('end', () => {
      if (req.url === '/reset') { res.destroy(); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture bind failed');
  const agent = new Agent({ connections: 1 }); agents.push(agent);
  return { url: `http://127.0.0.1:${address.port}`, agent, count: () => count };
}
afterEach(async () => {
  await Promise.all(agents.splice(0).map(agent => agent.destroy()));
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.closeAllConnections(); server.close(() => resolve());
  })));
});

describe('request-scoped transport observations', () => {
  it('distinguishes a real fresh socket from a reused socket without serializing payloads', async () => {
    const f = await fixture();
    for (const connection of ['fresh', 'reused']) {
      const trace = createTransportObservation();
      const response = await trace.run(() => fetch(`${f.url}/secret-path`, { dispatcher: f.agent, method: 'POST',
        headers: { authorization: 'PRIVATE_CREDENTIAL' }, body: 'PRIVATE_BODY' }));
      await response.text();
      expect(trace.snapshot()).toMatchObject({ requestCreated: true, requestHeadersStarted: true,
        requestBodySent: true, responseHeadersReceived: true, connection });
      const serialized = JSON.stringify(trace.snapshot());
      expect(serialized).not.toMatch(/PRIVATE_|secret-path|127\.0\.0\.1/);
    }
    expect(f.count()).toBe(2);
  });
  it('records a reset after sending separately from connection establishment failure, without retry', async () => {
    const f = await fixture(); const trace = createTransportObservation();
    await expect(trace.run(() => fetch(`${f.url}/reset`, { dispatcher: f.agent, method: 'POST', body: '{}' }))).rejects.toThrow();
    expect(trace.snapshot()).toMatchObject({ requestCreated: true, requestHeadersStarted: true,
      responseHeadersReceived: false, connection: 'fresh' });
    expect(f.count()).toBe(1);
  });
  it('records connection refusal before any request headers are sent', async () => {
    const f = await fixture();
    await new Promise<void>(resolve => servers[0].close(() => resolve()));
    const trace = createTransportObservation();
    await expect(trace.run(() => fetch(f.url, { dispatcher: f.agent }))).rejects.toThrow();
    expect(trace.snapshot()).toMatchObject({ requestCreated: true, requestHeadersStarted: false,
      requestBodySent: false, responseHeadersReceived: false, connection: 'unobserved' });
    expect(f.count()).toBe(0);
  });
  it('isolates concurrent success and failure observations', async () => {
    const a = await fixture(); const b = await fixture();
    const success = createTransportObservation(); const failure = createTransportObservation();
    const results = await Promise.allSettled([
      success.run(async () => { const r = await fetch(a.url, { dispatcher: a.agent }); await r.text(); }),
      failure.run(() => fetch(`${b.url}/reset`, { method: 'POST', body: '{}', dispatcher: b.agent })),
    ]);
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(success.snapshot().responseHeadersReceived).toBe(true);
    expect(failure.snapshot().responseHeadersReceived).toBe(false);
  });
  it('keeps an uninstrumented or pre-cancelled call unknown', async () => {
    const trace = createTransportObservation();
    const controller = new AbortController(); controller.abort();
    await expect(trace.run(() => fetch('http://127.0.0.1:1', { signal: controller.signal }))).rejects.toThrow();
    expect(trace.snapshot()).toMatchObject({ requestCreated: false, requestHeadersStarted: false, connection: 'unobserved' });
  });
});


it('does not mistake CONNECT tunnel bytes for target request delivery when target TLS resets', async () => {
  let tunnels = 0;
  const proxy = createServer(); servers.push(proxy);
  proxy.on('connect', (_req, socket) => {
    tunnels++;
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    socket.once('data', () => socket.destroy());
  });
  await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const address = proxy.address(); if (!address || typeof address === 'string') throw new Error('proxy bind failed');
  const agent = new ProxyAgent(`http://127.0.0.1:${address.port}`); agents.push(agent);
  const trace = createTransportObservation();
  await expect(trace.run(() => fetch(`https://127.0.0.1:${address.port}/v1/messages`, { dispatcher: agent,
    method: 'POST', body: 'SYNTHETIC_PRIVATE_BODY', signal: AbortSignal.timeout(2000) }))).rejects.toThrow();
  expect(tunnels).toBe(1);
  expect(trace.snapshot()).toMatchObject({ requestCreated: true, requestHeadersStarted: false,
    requestBodySent: false, responseHeadersReceived: false, connection: 'unobserved' });
  expect(JSON.stringify(trace.snapshot())).not.toMatch(/SYNTHETIC_PRIVATE_BODY|fixture.invalid|127\.0\.0\.1/);
});

it('observes target requests independently of a successful proxy tunnel and retains real connection reuse', async () => {
  const target = await fixture(); const targetUrl = new URL(target.url);
  let tunnels = 0;
  const proxy = createServer(); servers.push(proxy);
  proxy.on('connect', (_req, client) => {
    tunnels++;
    const upstream = connect({ host: '127.0.0.1', port: Number(targetUrl.port) }, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      client.pipe(upstream); upstream.pipe(client);
    });
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
    upstream.on('close', () => client.destroy());
    client.on('close', () => upstream.destroy());
  });
  await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const address = proxy.address(); if (!address || typeof address === 'string') throw new Error('proxy bind failed');
  const agent = new ProxyAgent({ uri: `http://127.0.0.1:${address.port}`, connections: 1 }); agents.push(agent);
  for (const connection of ['fresh', 'reused']) {
    const trace = createTransportObservation();
    const response = await trace.run(() => fetch(target.url, { dispatcher: agent, method: 'POST', body: 'fixture' }));
    await response.text();
    expect(trace.snapshot()).toMatchObject({ requestCreated: true, requestHeadersStarted: true,
      requestBodySent: true, responseHeadersReceived: true, connection });
  }
  expect(tunnels).toBe(1); expect(target.count()).toBe(2);
});
