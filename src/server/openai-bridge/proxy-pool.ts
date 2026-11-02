import { Client, Pool, ProxyAgent, type Dispatcher } from 'undici';
import { withConnectionEstablishmentProof } from './connection-retry';

function createProxyAgent(uri: string): Dispatcher {
  return new ProxyAgent({ uri, factory(origin, options) {
    // ProxyAgent supplies its native CONNECT + target TLS connector here.
    // Wrap its callback, retaining its TLS validation and proxy authentication.
    const opts = options as Pool.Options;
    const connect = opts.connect;
    const wrapped = typeof connect === 'function'
      ? { ...opts, connect: withConnectionEstablishmentProof(connect) } : opts;
    return opts.connections === 1 ? new Client(origin, wrapped) : new Pool(origin, wrapped);
  } });
}

/** Bound retained proxy configurations; graceful close drains already admitted requests. */
export class ProxyPool {
  private readonly agents = new Map<string, Dispatcher>();
  constructor(private readonly capacity = 8,
    private readonly create: (url: string) => Dispatcher = createProxyAgent) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Invalid proxy pool capacity');
  }

  get(url: string): Dispatcher {
    let agent = this.agents.get(url);
    if (agent) this.agents.delete(url);
    else agent = this.create(url);
    this.agents.set(url, agent);
    while (this.agents.size > this.capacity) {
      const oldest = this.agents.keys().next().value!;
      const retired = this.agents.get(oldest)!;
      this.agents.delete(oldest);
      // Never destroy an active stream when a different request changes proxy.
      void retired.close().catch(() => retired.destroy().catch(() => undefined));
    }
    return agent;
  }
}
