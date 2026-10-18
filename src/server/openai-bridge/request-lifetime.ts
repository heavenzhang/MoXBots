/** Query-owned admission evidence. Foreground completion never revokes an admitted request. */
export class QueryRequestGuard {
  private readonly requests = new Map<string, { fingerprint: string; scope?: string; inFlight: boolean }>();
  private readonly blocked = new Set<string | undefined>();
  private exhausted = false;

  isBlocked(scope: string | undefined, ambiguous = false): boolean {
    return this.blocked.has(scope) || (ambiguous && this.blocked.size > 0);
  }

  get inFlightCount(): number {
    return [...this.requests.values()].filter(row => row.inFlight).length;
  }

  begin(scope: string | undefined, fingerprint: string, ambiguous: boolean): {
    finish(): void;
    block(): void;
    isBlocked(): boolean;
  } | undefined {
    const key = JSON.stringify([scope, fingerprint]);
    // Unknown/background ownership must not escape a retired root's replay fence.
    // A distinct, unambiguous foreground root can intentionally infer from the same history.
    if (this.exhausted || this.isBlocked(scope, ambiguous)
      || this.requests.has(key) || (ambiguous && [...this.requests.values()].some(row => row.fingerprint === fingerprint))) return undefined;
    // Never evict safety evidence while a native Query can still replay it. The owner
    // releases this bounded registry with the Query, rather than silently reopening requests.
    if (this.requests.size >= 4096) { this.exhausted = true; return undefined; }
    const row = { fingerprint, scope, inFlight: true };
    this.requests.set(key, row);
    return {
      finish: () => { row.inFlight = false; },
      block: () => { this.blocked.add(scope); },
      isBlocked: () => this.blocked.has(scope),
    };
  }
}

/** Backoff observes both HTTP abort and exact Query revocation, including while idle. */
export async function waitForRequestRetry(delayMs: number, signal: AbortSignal, isLive: () => boolean): Promise<boolean> {
  if (signal.aborted || !isLive()) return false;
  if (delayMs <= 0) return true;
  return new Promise(resolve => {
    const deadline = Date.now() + delayMs;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (live: boolean) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', aborted);
      resolve(live);
    };
    const aborted = () => finish(false);
    const tick = () => {
      if (signal.aborted || !isLive()) { finish(false); return; }
      const remaining = deadline - Date.now();
      if (remaining <= 0) { finish(true); return; }
      timer = setTimeout(tick, Math.min(remaining, 50));
    };
    signal.addEventListener('abort', aborted, { once: true });
    tick();
  });
}
