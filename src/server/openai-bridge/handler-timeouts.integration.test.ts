import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { createBridgeHandler } from './handler';
import type { AnthropicRequest } from './types/anthropic';
import { ModelFailoverController } from './model-failover';

const requestBody: AnthropicRequest = {
  model: 'claude-sonnet-4-6',
  messages: [{ role: 'user', content: 'hello' }],
  max_tokens: 32,
};

describe('OpenAI bridge timeout ownership', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (!server) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });

  it('keeps a bounded timeout for response headers', async () => {
    server = createServer((req) => {
      req.resume();
      // Deliberately never send response headers. The bridge must abort this
      // connection using the headers-only timeout, independently of stream
      // body lifetime.
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('failed to bind test upstream');

    const handler = createBridgeHandler({
      getUpstreamConfig: () => ({
        providerId: 'timeout-fixture',
        baseUrl: `http://127.0.0.1:${address.port}`,
        apiKey: 'test-key',
      }),
      upstreamHeadersTimeoutMs: 25,
      logger: null,
    });
    const response = await handler(new Request('http://127.0.0.1/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    }));

    expect(response.status).toBe(408);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'Upstream request timed out' },
    });
  });

  it('evaluates a per-route headers timeout getter and falls back to the default bound', async () => {
    server = createServer((req) => {
      req.resume();
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('failed to bind test upstream');

    const handler = createBridgeHandler({
      getUpstreamConfig: () => ({
        providerId: 'dynamic-timeout-fixture',
        baseUrl: `http://127.0.0.1:${address.port}`,
        apiKey: 'test-key',
        // Recovery is fenced for this request, so the fast timer is not armed.
        headersTimeoutMs: () => undefined,
      }),
      upstreamHeadersTimeoutMs: 25,
      logger: null,
    });
    const response = await handler(new Request('http://127.0.0.1/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    }));

    expect(response.status).toBe(408);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'Upstream request timed out', code: 'upstream_headers_timeout' },
    });
  });

  it('does not apply the headers-only timer to a response body', async () => {
    server = createServer((req, res) => {
      req.resume();
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('event: message_start\ndata: {"type":"message_start"}\n\n');
      setTimeout(() => {
        res.write('event: message_stop\ndata: {"type":"message_stop"}\n\n');
        res.end();
      }, 120);
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('failed to bind test upstream');

    const handler = createBridgeHandler({
      getUpstreamConfig: () => ({
        providerId: 'streaming-fixture',
        baseUrl: `http://127.0.0.1:${address.port}`,
        apiKey: 'test-key',
        apiProtocol: 'anthropic',
      }),
      upstreamHeadersTimeoutMs: 25,
      logger: null,
    });
    const response = await handler(new Request('http://127.0.0.1/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...requestBody, stream: true }),
    }));

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('message_stop');
  });

  it('stops the headers timer before reading a non-2xx response body', async () => {
    server = createServer((req, res) => {
      req.resume();
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.flushHeaders();
      setTimeout(() => {
        res.end(JSON.stringify({ error: { message: 'late upstream failure' } }));
      }, 100);
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('failed to bind test upstream');

    const handler = createBridgeHandler({
      getUpstreamConfig: () => ({
        providerId: 'slow-error-body-fixture',
        baseUrl: `http://127.0.0.1:${address.port}`,
        apiKey: 'test-key',
      }),
      upstreamHeadersTimeoutMs: 25,
      logger: null,
    });
    const response = await handler(new Request('http://127.0.0.1/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'late upstream failure' },
    });
  });

  it.each([
    ['chat_completions', 'ping'], ['responses', 'ping'],
    ['responses', 'empty text'], ['anthropic', 'empty text'],
  ] as const)('releases a real %s connection with %s but no model progress', async (upstreamFormat, heartbeatKind) => {
    let connections = 0;
    let closed!: () => void;
    const connectionClosed = new Promise<void>(resolve => { closed = resolve; });
    server = createServer((req, res) => {
      connections++;
      req.resume();
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.flushHeaders();
      const heartbeatFrame = heartbeatKind === 'ping' ? 'event: ping\ndata: {}\n\n'
        : upstreamFormat === 'anthropic'
          ? `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '' } })}\n\n`
          : `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: '' })}\n\n`;
      const heartbeat = setInterval(() => res.write(heartbeatFrame), 20);
      res.on('close', () => { clearInterval(heartbeat); closed(); });
    });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('failed to bind test upstream');
    let recoveryRequests = 0;
    let completed = 0;
    const modelFailover = new ModelFailoverController({
      scope: () => 'original-native-turn', resolveBackup: () => undefined, onSwitch: () => {},
      bodyIdleTimeoutMs: 100,
      recovery: { wait: async () => undefined, complete: async () => { completed++; },
        interrupted: async () => { recoveryRequests++; return true; } },
    });
    const handler = createBridgeHandler({ logger: null, getUpstreamConfig: () => ({
      providerId: 'held-body-fixture', baseUrl: `http://127.0.0.1:${address.port}`,
      apiKey: 'fixture-only', apiProtocol: upstreamFormat === 'anthropic' ? 'anthropic' : 'openai',
      upstreamFormat: upstreamFormat === 'anthropic' ? undefined : upstreamFormat, modelFailover,
    }) });
    const response = await handler(new Request('http://127.0.0.1/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...requestBody, stream: true }),
    }));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('automatic_replay_blocked');
    expect(body).not.toContain('message_stop');
    await connectionClosed;
    expect(connections).toBe(1);
    expect(recoveryRequests).toBe(1);
    expect(completed).toBe(0);
  });
});
