import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createBridgeHandler } from './handler';

let server: Server | undefined;
afterEach(async () => {
  if (!server) return;
  server.closeAllConnections();
  await new Promise<void>(resolve => server!.close(() => resolve()));
  server = undefined;
});

describe('bridge request body ownership', () => {
  it('keeps the body readable for the live session recovery admission resolver', async () => {
    let upstreamCalls = 0;
    server = createServer((req, res) => {
      upstreamCalls++;
      req.resume();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'qa', type: 'message', role: 'assistant', model: 'fixture',
        content: [{ type: 'text', text: 'accepted' }], stop_reason: 'end_turn',
        stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }));
    });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing fixture port');
    const body = { model: 'fixture', max_tokens: 32, stream: false,
      messages: [{ role: 'user', content: 'one controlled action' }] };
    let admitted: unknown;
    const handler = createBridgeHandler({ logger: null, getUpstreamConfig: async request => {
      // The production session resolver reads this clone for durable action admission.
      admitted = await request.clone().json();
      return { providerId: 'fixture', apiKey: 'fixture', apiProtocol: 'anthropic',
        baseUrl: `http://127.0.0.1:${address.port}` };
    } });
    const response = await handler(new Request('http://localhost/bridge/fixture/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    expect(response.status).toBe(200);
    expect(admitted).toEqual(body);
    expect(upstreamCalls).toBe(1);
    await expect(response.json()).resolves.toMatchObject({ content: [{ text: 'accepted' }] });
  });

  it('does not invoke admission or an upstream for malformed JSON', async () => {
    let resolves = 0;
    const handler = createBridgeHandler({ logger: null, getUpstreamConfig: () => {
      resolves++;
      throw new Error('must not resolve');
    } });
    const response = await handler(new Request('http://localhost/bridge/fixture/v1/messages', {
      method: 'POST', body: '{invalid' }));
    expect(response.status).toBe(400);
    expect(resolves).toBe(0);
  });
});
