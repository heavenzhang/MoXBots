import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createBridgeHandler } from './handler';

let server: Server;
afterEach(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
});
const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
async function open(mode: 'ping' | 'progress' | 'silent') {
  let closed = false;
  server = createServer((req, res) => {
    req.resume();
    res.writeHead(200, { 'content-type': 'text/event-stream' }); res.flushHeaders();
    let n = 0;
    const timer = setInterval(() => {
      if (mode === 'ping') res.write(frame({ type: 'ping' }));
      if (mode === 'progress') {
        res.write(frame({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hello' } }));
        if (++n === 20) res.end();
      }
    }, 10);
    res.on('close', () => { closed = true; clearInterval(timer); });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no port');
  const handler = createBridgeHandler({ getUpstreamConfig: () => ({ providerId: 'fixture',
    baseUrl: `http://127.0.0.1:${addr.port}`, apiProtocol: 'anthropic' }),
    upstreamBodyIdleTimeoutMs: 80, logger: null });
  const response = await handler(new Request('http://localhost/v1/messages', { method: 'POST',
    body: JSON.stringify({ model: 'fixture', max_tokens: 32, messages: [], stream: true }) }));
  return { response, closed: () => closed };
}
describe('native forwarding without recovery wrappers', () => {
  it.each(['ping', 'silent'] as const)('bounds %s and releases the real connection', async mode => {
    const { response, closed } = await open(mode);
    await expect(response.text()).rejects.toThrow('idle deadline');
    await expect.poll(closed).toBe(true);
  });
  it('allows a progressing response longer than the idle budget', async () => {
    const { response, closed } = await open('progress');
    expect((await response.text()).match(/hello/g)).toHaveLength(20);
    await expect.poll(closed).toBe(true);
  });
  it('cancels a pending read and releases its connection', async () => {
    const { response, closed } = await open('silent');
    const reader = response.body!.getReader();
    const pending = reader.read();
    await reader.cancel();
    await pending;
    await expect.poll(closed).toBe(true);
  });
});
