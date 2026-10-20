import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { createBridgeHandler } from './handler';
import { ModelFailoverController } from './model-failover';
import { createBridgeProgressContext, lookupBridge, registerBridge, unregisterBridge } from './bridge-registry';

const encoder = new TextEncoder();
const providerFrame = (data: unknown) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
const chunk = (delta: Record<string, unknown>, finish_reason: string | null = null) => ({
  id: 'progress-fixture', object: 'chat.completion.chunk', created: 0, model: 'fixture',
  choices: [{ index: 0, delta, finish_reason }],
});

describe('buffered parallel-tool model progress', () => {
  it('keeps a response alive on accepted argument fragments without exposing partial tool blocks', async () => {
    const sourceChunks = [
      providerFrame(chunk({ tool_calls: [{ index: 3, id: 'call-progress', type: 'function',
        function: { name: 'lookup', arguments: '{"value":' } }] })),
      ...['1', '2', '3', '4', '5', '6', '7', '8'].map(value => providerFrame(chunk({ tool_calls: [
        { index: 3, function: { arguments: value } },
      ] }))),
      providerFrame(chunk({ tool_calls: [{ index: 3, function: { arguments: '}' } }] }, 'tool_calls')),
      encoder.encode('data: [DONE]\n\n'),
    ];
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      let index = 0;
      const writeNext = () => {
        const next = sourceChunks[index++];
        if (!next || response.destroyed) { if (!response.destroyed) response.end(); return; }
        setTimeout(() => { if (!response.destroyed) { response.write(next); writeNext(); } }, 15);
      };
      writeNext();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('failed to bind local Chat fixture');
    const recovery = { wait: vi.fn(async () => undefined), interrupted: vi.fn(async () => true),
      complete: vi.fn(async () => {}), blocked: vi.fn(async () => {}) };
    const owner = new ModelFailoverController({ scope: () => 'query-turn', resolveBackup: () => undefined,
      onSwitch: vi.fn(), bodyIdleTimeoutMs: 60, recovery });
    const context = createBridgeProgressContext();
    const observed: AbortSignal[] = [];
    const unsubscribe = context.subscribe(signal => observed.push(signal));
    try {
      const handler = createBridgeHandler({ logger: null, getUpstreamConfig: request => ({
        providerId: 'fixture', apiProtocol: 'openai', upstreamFormat: 'chat_completions',
        baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: 'fixture', model: 'fixture',
        modelFailover: owner,
        onModelProgress: () => { if (request) context.notify(request.signal); },
      }) });
      const request = new Request('http://fixture.invalid/v1/messages', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-test', max_tokens: 64,
          stream: true, messages: [{ role: 'user', content: 'lookup' }], tools: [{ name: 'lookup', description: 'lookup',
            input_schema: { type: 'object', properties: { value: { type: 'number' } } } }] }) });
      const response = await handler(request);
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(body).toContain('"type":"message_stop"');
      expect(body).toContain('"name":"lookup"');
      expect(body).toContain('"partial_json":"{\\"value\\":12345678}"');
      expect(observed.length).toBeGreaterThan(5); // Query watchdog plus ModelBodyReader are both fed.
      expect(recovery.complete).toHaveBeenCalledOnce();
      expect(recovery.interrupted).not.toHaveBeenCalled();
      expect(recovery.blocked).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
      context.retire();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it('notifies a token-owned Query observer for non-MF Responses argument progress', async () => {
    const context = createBridgeProgressContext();
    const observed: AbortSignal[] = [];
    const unsubscribe = context.subscribe(signal => observed.push(signal));
    const upstreamEvents = [
      { type: 'response.created', response: { id: 'resp', object: 'response', status: 'in_progress', model: 'fixture', output: [] } },
      { type: 'response.output_item.added', output_index: 0,
        item: { id: 'item', type: 'function_call', call_id: 'call', name: 'lookup', arguments: '' } },
      { type: 'response.function_call_arguments.delta', output_index: 0, delta: '{"value":' },
      { type: 'response.function_call_arguments.done', output_index: 0, arguments: '{"value":1}' },
      { type: 'response.output_item.done', output_index: 0,
        item: { id: 'item', type: 'function_call', call_id: 'call', name: 'lookup', arguments: '{"value":1}', status: 'completed' } },
      { type: 'response.completed', response: { id: 'resp', object: 'response', status: 'completed', model: 'fixture',
        output: [{ id: 'item', type: 'function_call', call_id: 'call', name: 'lookup', arguments: '{"value":1}', status: 'completed' }],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
    ].map(event => encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const event of upstreamEvents) response.write(event);
      response.end();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('failed to bind local Responses fixture');
    const token = 'no-mf-responses-token';
    registerBridge(token, request => ({
      providerId: 'fixture', apiProtocol: 'openai', upstreamFormat: 'responses',
      baseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'fixture', modelAliases: undefined,
      onModelProgress: () => { if (request) context.notify(request.signal); },
    }), 'session:no-mf-responses', context);
    try {
      const handler = createBridgeHandler({ logger: null, getUpstreamConfig: async request => {
        const config = await lookupBridge(token, request);
        if (!config) throw new Error('token fixture disappeared');
        return { ...config, baseUrl: `http://127.0.0.1:${address.port}/v1` };
      } });
      const request = new Request(`http://fixture.invalid/bridge/${token}/v1/messages`, { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-test', max_tokens: 64,
          stream: true, messages: [{ role: 'user', content: 'lookup' }], tools: [{ name: 'lookup', description: 'lookup',
            input_schema: { type: 'object', properties: { value: { type: 'number' } } } }] }) });
      const response = await handler(request);
      const body = await response.text();
      expect(response.status, body).toBe(200);
      expect(body).toContain('"type":"message_stop"');
      expect(observed).toEqual([request.signal]); // added/done/terminal metadata do not count as model progress.
    } finally {
      unsubscribe();
      unregisterBridge(token);
      context.retire();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
