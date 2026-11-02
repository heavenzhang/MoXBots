import { createServer } from 'node:http';
import { Agent, fetch } from 'undici';
import { describe, expect, it, vi } from 'vitest';
import { ProxyPool } from './proxy-pool';

describe('proxy pool retention', () => {
  it('lets an evicted pool finish an active response', async () => {
    let finish!: () => void;
    const server = createServer((req, res) => {
      req.resume(); res.writeHead(200); res.write('before'); finish = () => res.end('after');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const agents: Agent[] = [];
    try {
      const pool = new ProxyPool(1, () => { const a = new Agent(); agents.push(a); return a; });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('no address');
      const response = await fetch(`http://127.0.0.1:${address.port}`, { dispatcher: pool.get('old') });
      pool.get('new');
      finish();
      expect(await response.text()).toBe('beforeafter');
    } finally {
      await Promise.all(agents.map(a => a.close()));
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
  it('reuses recent configurations and gracefully retires older pools without destroying active work', async () => {
    const agents: Agent[] = [];
    const pool = new ProxyPool(2, () => {
      const agent = new Agent();
      vi.spyOn(agent, 'close'); vi.spyOn(agent, 'destroy');
      agents.push(agent); return agent;
    });
    const first = pool.get('a'); pool.get('b');
    expect(pool.get('a')).toBe(first);
    pool.get('c');
    expect(agents[1].close).toHaveBeenCalled();
    expect(agents[0].close).not.toHaveBeenCalled();
    expect(agents[1].destroy).not.toHaveBeenCalled();
    for (let n = 0; n < 100; n++) pool.get(`proxy-${n}`);
    expect(agents.filter(a => vi.mocked(a.close).mock.calls.length === 0)).toHaveLength(2);
    await Promise.all(agents.map(a => a.close()));
  });
});
