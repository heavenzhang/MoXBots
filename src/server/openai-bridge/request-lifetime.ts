import { safeStreamFailure, type StreamFailureDiagnostic } from './stream-failure-diagnostic';
import { readBoundedErrorBody } from './read-error-body';
import type { AdmissionRejectionReason } from './recovery-causal-diagnostics';

type RejectedResponse = { status: number; body: string; headers: Record<string, string> };
const MAX_REJECTION_BYTES = 1_048_576;

export interface SettledScopeSnapshot {
  readonly revision: number;
  readonly scope: string;
  readonly interruptedAt: number;
  readonly fingerprints: readonly string[];
  readonly toolUseIds: readonly string[];
}

type AdmissionRow = { fingerprint: string; scope?: string; inFlight: boolean; rejection?: RejectedResponse;
  outcome?: 'delivered' | 'interrupted' | 'rejected'; interruptedAt?: number; toolUseIds: Set<string>; invalidToolIdentity?: boolean; diagnostic?: StreamFailureDiagnostic };

/** Query-owned admission evidence. Foreground completion never revokes an admitted request. */
export class QueryRequestGuard {
  private readonly requests = new Map<string, AdmissionRow>();
  private revision = 0;
  private readonly snapshots = new WeakSet<SettledScopeSnapshot>();
  private rejectionBytes = 0;
  private proofToolCount = 0;
  private proofDisabled = false;
  private readonly blocked = new Set<string | undefined>();
  private exhausted = false;

  constructor(private readonly onRejected?: (reason: AdmissionRejectionReason) => void) {}

  private rejectAdmission(reason: AdmissionRejectionReason): undefined {
    try {
      const observed: unknown = this.onRejected?.(reason);
      if (observed instanceof Promise) void observed.catch(() => {});
    } catch { /* A diagnostic cannot change this decision. */ }
    return undefined;
  }

  isBlocked(scope: string | undefined, ambiguous = false): boolean {
    return this.blocked.has(scope) || (ambiguous && this.blocked.size > 0);
  }

  get inFlightCount(): number {
    return [...this.requests.values()].filter(row => row.inFlight).length;
  }

  hasInterruptedScope(scope: string): boolean {
    return [...this.requests.values()].some(row => row.scope === scope && row.outcome === 'interrupted');
  }

  /** Read-only proof of a closed root. Old leases and fingerprints are never removed. */
  settledScope(scope: string): SettledScopeSnapshot | undefined {
    if (this.exhausted || this.proofDisabled || !this.blocked.has(scope) || this.inFlightCount !== 0) return undefined;
    const rows = [...this.requests.values()].filter(row => row.scope === scope);
    const interrupted = rows.filter(row => row.outcome === 'interrupted');
    if (!interrupted.length || rows.some(row => !row.outcome || row.outcome === 'rejected' || row.invalidToolIdentity
      || (row.outcome === 'interrupted' && row.toolUseIds.size !== 0))) return undefined;
    const toolUseIds = rows.flatMap(row => [...row.toolUseIds]);
    if (new Set(toolUseIds).size !== toolUseIds.length) return undefined;
    const snapshot = Object.freeze({ revision: this.revision, scope,
      interruptedAt: Math.min(...interrupted.map(row => row.interruptedAt!)),
      fingerprints: Object.freeze(rows.map(row => row.fingerprint).sort()), toolUseIds: Object.freeze(toolUseIds.sort()) });
    this.snapshots.add(snapshot);
    return snapshot;
  }

  isCurrentSnapshot(snapshot: SettledScopeSnapshot): boolean {
    return this.snapshots.has(snapshot) && snapshot.revision === this.revision && !!this.settledScope(snapshot.scope);
  }

  /** Return known rejection evidence only; this never grants another upstream call. */
  rejectedResponse(scope: string | undefined, fingerprint: string): Response | undefined {
    const row = this.requests.get(JSON.stringify([scope, fingerprint]));
    if (row?.inFlight || !row?.rejection) return undefined;
    // Closed scopes may read their exact terminal evidence; begin still denies
    // every new dispatch. Keep the original HTTP failure visible with its
    // safety terminal for Goal/Session owners. Returning a bare transient 503
    // here could let an outer scheduler redispatch the task after this Query's
    // inference budget was exhausted, despite never granting a new lease here.
    return Response.json({ type: 'error', error: { type: 'api_error', code: 'automatic_replay_blocked',
      message: `automatic_replay_blocked: Duplicate inference was not sent. Original HTTP ${row.rejection.status} rejection: ${row.rejection.body}` } },
      { status: row.rejection.status, headers: { ...row.rejection.headers, 'content-type': 'application/json',
        'x-moxbots-recovery': 'blocked' } });
  }

  /** Exact root only; diagnostics never change admission, revision or receipt evidence. */
  failureDiagnostic(scope: string | undefined): StreamFailureDiagnostic | undefined {
    if (!scope) return undefined; // Unknown ownership is not a shared diagnostic namespace.
    return [...this.requests.values()].find(row => row.scope === scope && row.diagnostic)?.diagnostic;
  }

  begin(scope: string | undefined, fingerprint: string, ambiguous: boolean): {
    recordFailureDiagnostic(diagnostic: StreamFailureDiagnostic): void;
    finish(): void;
    reject(response: Response): Promise<Response>;
    block(): void;
    isBlocked(): boolean;
    toolMayBeDelivered(id: unknown): void;
    delivered(): void;
    interrupted(observedAt?: number): void;
    unknownDelivery(): void;
  } | undefined {
    const key = JSON.stringify([scope, fingerprint]);
    // Unknown/background ownership must not escape a retired root's replay fence.
    // A distinct, unambiguous foreground root can intentionally infer from the same history.
    if (this.exhausted) return this.rejectAdmission('registry_exhausted');
    if (this.isBlocked(scope, ambiguous)) return this.rejectAdmission(
      this.blocked.has(scope) ? 'blocked_exact_scope' : 'blocked_ambiguous_scope');
    if (this.requests.has(key)) return this.rejectAdmission('duplicate_exact_key');
    if (ambiguous && [...this.requests.values()].some(row => row.fingerprint === fingerprint)) {
      return this.rejectAdmission('duplicate_ambiguous_fingerprint');
    }
    // Never evict safety evidence while a native Query can still replay it. The owner
    // releases this bounded registry with the Query, rather than silently reopening requests.
    if (this.requests.size >= 4096) { this.exhausted = true; return this.rejectAdmission('registry_capacity'); }
    const row: AdmissionRow = { fingerprint, scope, inFlight: true, toolUseIds: new Set() };
    this.requests.set(key, row);
    this.revision++;
    return {
      recordFailureDiagnostic: value => {
        if (!scope || !row.inFlight || this.failureDiagnostic(scope)) return;
        const diagnostic = safeStreamFailure(value);
        if (diagnostic) row.diagnostic = diagnostic;
      },
      finish: () => { if (row.inFlight) { row.inFlight = false; this.revision++; } },
      toolMayBeDelivered: id => {
        this.revision++; // Before the first byte can reach the native tool owner.
        if (typeof id !== 'string' || !id || id.length > 256 || row.toolUseIds.has(id)) row.invalidToolIdentity = true;
        else if (this.proofToolCount >= 4096) this.proofDisabled = true;
        else { row.toolUseIds.add(id); this.proofToolCount++; }
      },
      delivered: () => { row.outcome = 'delivered'; this.revision++; },
      interrupted: (observedAt = Date.now()) => {
        row.outcome = 'interrupted';
        row.interruptedAt ??= Number.isSafeInteger(observedAt) && observedAt <= Date.now() ? observedAt : Date.now();
        this.revision++;
      },
      unknownDelivery: () => { row.invalidToolIdentity = true; this.revision++; },
      reject: async response => {
        // A delivered/partial stream or unknown body is never replayable.
        // Retain complete HTTP terminal evidence, including a closed owner's error.
        // Keep the admission row even when this separate, bounded diagnostic budget fills.
        if (response.ok || response.status === 499
          || (response.status === 409 && response.headers.get('x-moxbots-recovery') === 'blocked')) return response;
        row.outcome = 'rejected'; this.revision++;
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
      block: () => { if (!this.blocked.has(scope)) { this.blocked.add(scope); this.revision++; } },
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
