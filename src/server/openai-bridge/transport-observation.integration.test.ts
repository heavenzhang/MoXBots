import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { Agent, fetch } from 'undici';
import { createTransportObservation } from './transport-observation';

const servers: Server[] = [];
const agents: Agent[] = [];
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
