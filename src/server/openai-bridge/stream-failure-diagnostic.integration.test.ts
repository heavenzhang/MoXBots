import { createServer, type Server, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeHandler } from './handler';
import { ContextRecoveryController } from './context-recovery';
import { ModelFailoverController } from './model-failover';
import { formatApiErrorDetail } from '../../shared/terminalReason';

const servers: Server[] = [];
const frame = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`;
const secret = 'NEVER_EXPOSE_FIXTURE_PRIVATE_VALUE';

async function fixture(code: string, status = 'failed', controllers: 'both' | 'context' | 'failover' = 'both') {
  let calls = 0;
  let scope = 'original-native-root';
  const upstream = createServer((req, res: ServerResponse) => {
    req.resume();
    req.on('end', () => {
      calls++;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(frame({ type: 'response.created', response: { id: 'fixture', status: 'in_progress', output: [] } }));
      res.end(calls === 1
        ? frame({ type: 'response.failed', response: { id: 'fixture', status, output: [], error: { code, message: secret, diagnostic: { origin: 'transport', category: 'server' } } } })
        : frame({ type: 'response.completed', response: { id: 'fixture', status: 'completed', output: [], usage: { input_tokens: 1, output_tokens: 0 } } }));
    });
  });
  servers.push(upstream);
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const address = upstream.address();
  if (!address || typeof address === 'string') throw new Error('fixture not listening');
  const interrupted = vi.fn(async () => false);
  const context = new ContextRecoveryController({ scope: () => scope, isActive: () => true, protectStreaming: true,
    persistLedger: async () => {}, backup: async () => 'in-memory-only' });
  const failover = new ModelFailoverController({ scope: () => scope, isActive: () => true,
    canRetry: () => context.canRetryInference(), resolveBackup: () => undefined, onSwitch: () => {},
    recovery: { wait: async () => undefined, complete: async () => {}, interrupted, blocked: async () => {} } });
  const logs: string[] = [];
  const handler = createBridgeHandler({ logger: line => logs.push(line), getUpstreamConfig: () => ({ providerId: 'local-fixture',
    baseUrl: `http://127.0.0.1:${address.port}`, upstreamFormat: 'responses',
    ...(controllers !== 'failover' ? { contextRecovery: context } : {}),
    ...(controllers !== 'context' ? { modelFailover: failover } : {}) }) });
  const make = (content = 'Original Goal continuation') => new Request('http://fixture.invalid/v1/messages', { method: 'POST',
    body: JSON.stringify({ model: 'fixture', max_tokens: 16, stream: true, messages: [{ role: 'user', content }] }) });
  return { handler, make, interrupted, logs, calls: () => calls, newRoot: () => { context.endTurn(); failover.endTurn(); scope = 'independent-native-root'; } };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async server => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }));
});

describe('safe first stream failure across the actual handler and recovery guards', () => {
  it.each([['invalid_api_key', '鉴权'], ['server_error', '服务异常'], ['context_length_exceeded', '上下文超限']])(
    'retains only the safe category of %s in the original stream and later same-scope 409', async (code, category) => {
      const f = await fixture(code);
      const first = await f.handler(f.make());
      expect(first.status).toBe(200);
      const firstText = await first.text();
      expect(firstText).toContain('首个失败');
      expect(firstText).toContain('模型服务失败终态');
      expect(firstText).toContain(category);
      expect(firstText).not.toContain(secret);
      expect(firstText).not.toContain(code);
      for (const request of [f.make(), f.make('Changed SDK rescue fingerprint')]) {
        const response = await f.handler(request);
        expect(response.status).toBe(409);
        expect(response.headers.get('x-should-retry')).toBe('false');
        expect(response.headers.get('x-moxbots-recovery')).toBe('blocked');
        const text = await response.text();
        expect(text).toContain('首个失败');
        expect(text).toContain(category);
        expect(formatApiErrorDetail({ status: 409, rawMessage: JSON.parse(text).error.message })).toContain(category);
        expect(text).not.toContain(secret);
      }
      expect(f.calls()).toBe(1);
      expect(f.interrupted).not.toHaveBeenCalled();
      expect(f.logs.join(' ')).not.toContain(secret);
      f.newRoot();
      const independent = await f.handler(f.make()); // Same fingerprint, different explicit root.
      expect(independent.status).toBe(200);
      const healthy = await independent.text();
      expect(healthy).toContain('message_stop');
      expect(healthy).not.toContain('首个失败');
      expect(f.calls()).toBe(2);
    },
  );

  it('uses a fixed unknown category without exposing arbitrary code or message', async () => {
    const f = await fixture(secret);
    const text = await (await f.handler(f.make())).text();
    expect(text).toContain('模型服务失败终态');
    expect(text).toContain('未分类');
    expect(text).not.toContain(secret);
    expect(await (await f.handler(f.make())).text()).not.toContain(secret);
    expect(f.calls()).toBe(1);
  });

  it('classifies a contradictory terminal as protocol validation, not provider authentication', async () => {
    const f = await fixture('invalid_api_key', 'completed');
    const text = await (await f.handler(f.make())).text();
    expect(text).toContain('协议校验');
    expect(text).not.toContain('鉴权');
    expect(text).not.toContain(secret);
    const next = await f.handler(f.make());
    expect(next.status).toBe(409);
    expect(await next.text()).toContain('协议校验');
    expect(f.interrupted).not.toHaveBeenCalled();
    expect(f.calls()).toBe(1);
  });

  it.each(['context', 'failover'] as const)('preserves safe diagnostics when only %s owns the request', async owner => {
    const f = await fixture('invalid_api_key', 'failed', owner);
    expect(await (await f.handler(f.make())).text()).toContain('鉴权');
    const next = await f.handler(f.make());
    expect(next.status).toBe(409);
    expect(await next.text()).toContain('鉴权');
    expect(f.calls()).toBe(1);
  });
});
