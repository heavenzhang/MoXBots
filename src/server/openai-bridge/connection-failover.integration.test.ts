import { createServer as httpServer } from 'node:http';
import { connect, createServer as tcpServer, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeHandler } from './handler';
import { ContextRecoveryController } from './context-recovery';
import { ModelFailoverController } from './model-failover';
import type { AnthropicRequest } from './types/anthropic';
import type { UpstreamConfig } from './types/bridge';

const network = vi.hoisted(() => ({ proxy: undefined as string | undefined }));
vi.mock('../proxy-state', async importOriginal => ({
  ...await importOriginal<typeof import('../proxy-state')>(),
  getProxyForProviderUrl: (provider: string) => provider === 'primary' ? network.proxy : undefined,
}));
const servers: Server[] = [];
const sockets = new Set<Socket>();
function track(socket: Socket) { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); }
async function listen(server: Server): Promise<string> {
  servers.push(server); server.on('connection', track);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture bind failed');
  return `http://127.0.0.1:${address.port}`;
}
async function tunnel(url?: string) {
  const proxy = httpServer();
  proxy.on('connect', (req, client, head) => {
    const destination = new URL(url ?? `http://${req.url}`);
    if (destination.hostname !== '127.0.0.1') { client.destroy(); return; }
    const upstream = connect({ host: '127.0.0.1', port: Number(destination.port) }, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      client.pipe(upstream).pipe(client);
    });
    track(upstream);
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
    client.on('close', () => upstream.destroy());
    upstream.on('close', () => client.destroy());
  });
  return listen(proxy);
}
type Protocol = 'anthropic' | 'chat_completions' | 'responses';
function config(baseUrl: string, providerId: string, protocol: Protocol): UpstreamConfig {
  return { baseUrl, providerId, model: 'fixture', apiKey: 'fixture', headersTimeoutMs: 5_000,
    apiProtocol: protocol === 'anthropic' ? 'anthropic' : 'openai',
    upstreamFormat: protocol === 'anthropic' ? undefined : protocol };
}
function completed(protocol: Protocol) {
  const usage = { input_tokens: 1, output_tokens: 1 };
  if (protocol === 'anthropic') return { id: 'message', type: 'message', role: 'assistant', model: 'fixture',
    content: [{ type: 'text', text: 'recovered' }], stop_reason: 'end_turn', usage };
  if (protocol === 'responses') return { id: 'response', object: 'response', status: 'completed', model: 'fixture',
    output: [{ id: 'message', type: 'message', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text: 'recovered', annotations: [] }] }], usage };
  return { id: 'completion', object: 'chat.completion', model: 'fixture',
    choices: [{ index: 0, message: { role: 'assistant', content: 'recovered' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
}
function request(text = 'Continue the independent step') {
  return new Request('http://127.0.0.1/v1/messages', { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'fixture', max_tokens: 16, messages: [{ role: 'user', content: text }] }) });
}
async function unknownContext() {
  let ledger: unknown;
  const options = { scope: () => 'root', isActive: () => true, protectStreaming: true,
    backup: async () => 'fixture-archive', persistLedger: async (value: unknown) => { ledger = structuredClone(value); } };
  const original = new ContextRecoveryController(options);
  const history: AnthropicRequest = { model: 'fixture', max_tokens: 16, messages: [{ role: 'user', content: 'old task' }] };
  await original.protectInference(history);
  await original.authorizeTool('write_record', { id: 'old-operation' });
  const preserved = structuredClone(ledger);
  const context = new ContextRecoveryController({ ...options, initialLedger: ledger });
  return { context, unchanged: () => expect(ledger).toEqual(preserved) };
}
afterEach(async () => {
  network.proxy = undefined;
  for (const socket of sockets) socket.destroy();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

describe.each(['direct', 'proxy'] as const)('native connection recovery through %s', route => {
  it.each(['chat_completions', 'responses'] as const)(
    'does not treat a %s redirect followed by a TLS failure as an unsent inference', async protocol => {
      let calls = 0, handshakes = 0;
      const failed = await listen(tcpServer(socket => socket.once('data', () => { handshakes++; socket.destroy(); })));
      const redirected = await listen(httpServer((req, res) => {
        calls++; req.resume(); res.writeHead(307, { location: failed.replace('http:', 'https:') }); res.end();
      }));
      if (route === 'proxy') network.proxy = await tunnel();
      const switched = vi.fn();
      const controller = new ModelFailoverController({ scope: () => 'root', canRetry: () => false,
        canRetryConnection: () => true, resolveBackup: () => config(redirected, 'backup', protocol), onSwitch: switched });
      const handler = createBridgeHandler({ logger: null, getUpstreamConfig: () => ({
        ...config(redirected, 'primary', protocol), modelFailover: controller,
      }) });
      const result = await handler(request());
      expect(result.status).toBe(502); await result.text();
      expect(calls).toBe(1); expect(handshakes).toBe(1); expect(switched).not.toHaveBeenCalled();
    });

  it.each(['anthropic', 'chat_completions', 'responses'] as const)(
    'hands an exhausted TLS handshake to an existing %s candidate without replaying old work', async protocol => {
      let handshakes = 0, receivedHTTP = 0, backupCalls = 0;
      const failed = await listen(tcpServer(socket => socket.once('data', data => {
        handshakes++;
        if (data[0] !== 22) receivedHTTP++;
        socket.destroy();
      })));
      if (route === 'proxy') network.proxy = await tunnel(failed);
      const backupUrl = await listen(httpServer((req, res) => {
        backupCalls++; req.resume();
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(completed(protocol)));
      }));
      const h = await unknownContext();
      const switched = vi.fn(), wait = vi.fn(async () => undefined);
      const controller = new ModelFailoverController({ scope: () => 'root', isActive: () => true,
        canRetry: () => h.context.canRetryInference(), canRetryConnection: () => true, canUsePinnedRoute: () => true,
        resolveBackup: () => config(backupUrl, 'backup', protocol), onSwitch: switched, retryDelaysMs: [0, 0, 0],
        recovery: { wait, complete: async () => {} } });
      const handler = createBridgeHandler({ logger: null, getUpstreamConfig: () => ({
        ...config(failed.replace('http:', 'https:'), 'primary', protocol), modelFailover: controller,
      }) });
      const result = await handler(request());
      expect(result.status).toBe(200); expect(await result.text()).toContain('recovered');
      expect(handshakes).toBe(3); expect(receivedHTTP).toBe(0); expect(backupCalls).toBe(1);
      expect(switched).toHaveBeenCalledOnce(); expect(wait).not.toHaveBeenCalled();
      expect(h.context.canRetryInference()).toBe(false);
      expect(h.context.beforeTool('write_record', { id: 'old-operation' })).toContain('uncertain outcome');
      h.unchanged();
      const duplicate = await handler(request());
      expect(duplicate.status).toBe(409); await duplicate.text();
      const next = await handler(request('A new independent step'));
      expect(next.status).toBe(200); await next.text();
      expect(backupCalls).toBe(2); expect(handshakes).toBe(3); h.unchanged();
    });

  it.each(['anthropic', 'chat_completions', 'responses'] as const)(
    'does not retry or switch a %s connection reset after the target receives the POST', async protocol => {
      let calls = 0;
      const failed = await listen(httpServer((req, res) => { calls++; req.resume(); req.on('end', () => res.destroy()); }));
      if (route === 'proxy') network.proxy = await tunnel(failed);
      const switched = vi.fn();
      const controller = new ModelFailoverController({ scope: () => 'root', canRetry: () => false, canRetryConnection: () => true,
        resolveBackup: () => config(failed, 'backup', protocol), onSwitch: switched, retryDelaysMs: [0, 0, 0] });
      const handler = createBridgeHandler({ logger: null, getUpstreamConfig: () => ({
        ...config(failed, 'primary', protocol), modelFailover: controller,
      }) });
      const result = await handler(request());
      expect(result.status).toBe(502); await result.text();
      expect(calls).toBe(1); expect(switched).not.toHaveBeenCalled();
    });
});
