import { readBoundedErrorBody } from './read-error-body';

type RejectedResponse = { status: number; body: string; headers: Record<string, string> };
const MAX_REJECTION_BYTES = 1_048_576;

/** Query-owned admission evidence. Foreground completion never revokes an admitted request. */
export class QueryRequestGuard {
  private readonly requests = new Map<string, { fingerprint: string; scope?: string; inFlight: boolean; rejection?: RejectedResponse }>();
  private rejectionBytes = 0;
  private readonly blocked = new Set<string | undefined>();
  private exhausted = false;

  isBlocked(scope: string | undefined, ambiguous = false): boolean {
    return this.blocked.has(scope) || (ambiguous && this.blocked.size > 0);
  }

  get inFlightCount(): number {
    return [...this.requests.values()].filter(row => row.inFlight).length;
  }

  /** Return known rejection evidence only; this never grants another upstream call. */
  rejectedResponse(scope: string | undefined, fingerprint: string, ambiguous: boolean): Response | undefined {
    if (this.isBlocked(scope, ambiguous)) return undefined;
    const row = this.requests.get(JSON.stringify([scope, fingerprint]));
    if (row?.inFlight || !row?.rejection) return undefined;
    return new Response(row.rejection.body, { status: row.rejection.status, headers: row.rejection.headers });
  }

  begin(scope: string | undefined, fingerprint: string, ambiguous: boolean): {
    finish(): void;
    reject(response: Response): Promise<Response>;
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
    const row: { fingerprint: string; scope?: string; inFlight: boolean; rejection?: RejectedResponse } = { fingerprint, scope, inFlight: true };
    this.requests.set(key, row);
    return {
      finish: () => { row.inFlight = false; },
      reject: async response => {
        // A delivered/partial stream, local safety error or unknown body is never
        // replayable. Retain only complete HTTP rejection evidence. Keep the
        // admission row even when this separate, bounded diagnostic budget fills.
        if (response.ok || response.status === 499
          || response.headers.get('x-moxbots-recovery') === 'blocked') return response;
        const body = await readBoundedErrorBody(response.body);
        const headers = Object.fromEntries(response.headers);
        // fetch decompression and body reconstruction invalidate wire lengths.
        delete headers['content-length'];
        delete headers['content-encoding'];
        headers['x-should-retry'] = 'false';
        if (body === undefined) return new Response(JSON.stringify({ type: 'error', error: {
          type: 'api_error', message: 'Upstream error response was incomplete; automatic recovery stopped.' } }),
          { status: response.status, headers: { 'content-type': 'application/json', 'x-should-retry': 'false',
            'x-moxbots-recovery': 'blocked' } });
        const size = Buffer.byteLength(body) + Buffer.byteLength(JSON.stringify(headers));
        if (!row.rejection && this.rejectionBytes + size <= MAX_REJECTION_BYTES) {
          row.rejection = { status: response.status, body, headers };
          this.rejectionBytes += size;
        }
        return new Response(body, { status: response.status, headers });
      },
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
