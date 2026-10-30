import { createServer, type Server, type ServerResponse, type RequestListener } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createBridgeHandler } from './handler';

const servers: Server[] = [];
const secret = 'SYNTHETIC_PRIVATE_KEY_PROMPT_DO_NOT_LOG';
async function fixture(listener: RequestListener, timeoutMs = 1000, signal?: AbortSignal) {
  const server = createServer(listener); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('fixture did not bind');
  const logs: string[] = [];
  const handler = createBridgeHandler({ logger: message => logs.push(message), upstreamHeadersTimeoutMs: timeoutMs,
    getUpstreamConfig: () => ({ providerId: 'diagnostic-fixture', model: 'fixture', apiKey: secret,
      apiProtocol: 'anthropic', baseUrl: `http://127.0.0.1:${address.port}` }) });
  const response = handler(new Request('http://fixture.invalid/bridge/token/v1/messages', { method: 'POST', signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'fixture', max_tokens: 32, stream: true, messages: [{ role: 'user', content: secret }] }) }));
  return { response, logs };
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => { server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())); }));
});

describe('Anthropic forwarding diagnostics on actual loopback transport', () => {
  it('records the socket cause before headers while preserving the generic 502 body', async () => {
    const h = await fixture((req, res) => { req.resume(); res.destroy(); });
    const response = await h.response;
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { message: 'Upstream connection error' } });
    expect(h.logs.join('\n')).toContain('UND_ERR_SOCKET');
    expect(h.logs.join('\n')).toContain('"phase":"response_headers"');
    expect(h.logs.join('\n')).toContain('"mappedStatus":502');
    expect(h.logs.join('\n')).toContain('"requestHeadersStarted":true');
    expect(h.logs.join('\n')).toContain('"responseHeadersReceived":false');
    expect(h.logs.join('\n')).toContain('"connection":"fresh"');
    expect(h.logs.join('\n')).not.toContain(secret);
  });
  it('distinguishes a local header timeout from a connection error', async () => {
    const h = await fixture(req => req.resume(), 25);
    expect((await h.response).status).toBe(408);
    expect(h.logs.join('\n')).toContain('"timedOut":true');
    expect(h.logs.join('\n')).toContain('"mappedStatus":408');
    expect(h.logs.join('\n')).not.toContain(secret);
  });
  it('keeps Stop classified as cancellation rather than 502', async () => {
    const abort = new AbortController(); abort.abort();
    const h = await fixture(req => req.resume(), 1000, abort.signal);
    expect((await h.response).status).toBe(499);
    expect(h.logs.join('\n')).toContain('"cancelled":true');
    expect(h.logs.join('\n')).toContain('"mappedStatus":499');
  });
  it('records body failure after partial delivery without retrying or changing the committed status', async () => {
    let upstream!: ServerResponse; let calls = 0;
    const h = await fixture((req, res) => { calls++; req.resume(); upstream = res;
      res.writeHead(200, { 'content-type': 'text/event-stream', 'x-request-id': 'fixture-request-123' });
      res.write('event: ping\ndata: {"type":"ping"}\n\n');
    });
    const response = await h.response; const reader = response.body!.getReader();
    expect((await reader.read()).value!.byteLength).toBeGreaterThan(0);
    upstream.destroy();
    await expect(reader.read()).rejects.toThrow();
    expect(response.status).toBe(200); expect(calls).toBe(1);
    const diagnostic = h.logs.join('\n');
    expect(diagnostic).toContain('"phase":"response_body"');
    expect(diagnostic).toContain('UND_ERR_SOCKET'); expect(diagnostic).toContain('fixture-request-123');
    expect(diagnostic).toMatch(/"bytesDelivered":[1-9]/); expect(diagnostic).not.toContain(secret);
  });
  it('logs upstream HTTP 502 separately and preserves status without logging its body', async () => {
    const h = await fixture((req, res) => { req.resume(); res.writeHead(502, { 'content-type': 'application/json', 'x-request-id': 'upstream-502' });
      res.end(JSON.stringify({ error: { message: secret } })); });
    const response = await h.response;
    expect(response.status).toBe(502); await response.text();
    const diagnostic = h.logs.join('\n');
    expect(diagnostic).toContain('"status":502'); expect(diagnostic).toContain('upstream-502');
    expect(diagnostic).not.toContain('mappedStatus'); expect(diagnostic).not.toContain(secret);
  });
});
