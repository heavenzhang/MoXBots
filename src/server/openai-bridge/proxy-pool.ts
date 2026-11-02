import { ProxyAgent, type Dispatcher } from 'undici';

/** Bound retained proxy configurations; graceful close drains already admitted requests. */
export class ProxyPool {
  private readonly agents = new Map<string, Dispatcher>();
  constructor(private readonly capacity = 8,
    private readonly create: (url: string) => Dispatcher = url => new ProxyAgent(url)) {
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
