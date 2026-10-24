import { randomUUID } from 'node:crypto';
import type { SettledInterruptionReceipt } from '../openai-bridge/context-recovery';
import {
  MODEL_RECOVERY_WINDOW_MS,
  modelRecoveryDelay,
  validModelRecovery,
  type ModelRecoveryState,
} from '../../shared/modelRecovery';
import type { InferenceRecoveryHooks } from '../openai-bridge/model-failover';

export interface InferenceRecoveryFailure {
  status: number;
  attempt: number;
  retryAfterMs?: number;
  usingBackup: boolean;
  kind?: 'stream';
}

export interface SessionModelRecoveryOptions {
  read: () => ModelRecoveryState | undefined;
  write: (
    next: ModelRecoveryState | undefined,
    expected: ModelRecoveryState | undefined,
    live: () => boolean,
  ) => Promise<boolean>;
  current: () => {
    sdkSessionId: string;
    routeIdentity: string;
    turnId: string;
    goalId?: string;
  } | undefined;
  isLive: () => boolean;
  prepare: (request: Request) => Promise<void>;
  prepareSettledInterruption?: () => Promise<SettledInterruptionReceipt | undefined>;
  onState?: (state: ModelRecoveryState | null) => void;
  onInterrupted?: () => void;
  now?: () => number;
  /** Parent execution budget, never a replacement recovery window. */
  deadlineAt?: () => number | undefined;
}

function sameCheckpoint(left: ModelRecoveryState, right: ModelRecoveryState): boolean {
  return left.version === right.version && left.kind === right.kind && left.id === right.id
    && JSON.stringify(left.liveProof) === JSON.stringify(right.liveProof)
    && left.status === right.status
    && left.sdkSessionId === right.sdkSessionId
    && left.routeIdentity === right.routeIdentity
    && left.turnId === right.turnId
    && left.goalId === right.goalId
    && left.attempt === right.attempt
    && left.startedAt === right.startedAt
    && left.nextRetryAt === right.nextRetryAt
    && left.deadlineAt === right.deadlineAt
    && left.lastStatus === right.lastStatus;
}

/** Query-scoped, durable backoff for an inference request. It never re-enqueues a Session turn. */
export class SessionModelRecovery implements InferenceRecoveryHooks {
  private readonly now: () => number;
  private deadlineCeiling = Infinity;
  private epoch = 0;
  private readonly liveProofAuthority = randomUUID();
  private liveReceipt: SettledInterruptionReceipt | undefined;
  private liveProofReleased = false;
  private settledFailure: 'live_proof_unavailable' | 'checkpoint_owned' | 'budget_exhausted' | 'storage_or_cas_failed' | undefined;
  private pending: ModelRecoveryState | undefined;
  private pendingExpected: ModelRecoveryState | undefined;
  private persistedExpected: ModelRecoveryState | undefined;
  private localState: ModelRecoveryState | undefined;
  private waitInProgress = false;
  private boundRequest: Request | undefined;
  private boundEpoch: number | undefined;
  private completing: Promise<void> | undefined;
  private pauseInFlight: { key: string; promise: Promise<boolean> } | undefined;
  private readonly requestRecoveryIds = new WeakMap<Request, string>();

  constructor(private readonly options: SessionModelRecoveryOptions) {
    this.now = options.now ?? Date.now;
    try {
      const stored = options.read() as unknown;
      if (validModelRecovery(stored)) {
        this.localState = stored;
        if (stored.status === 'waiting') this.persistedExpected = stored;
      }
    } catch {
      // A constructor snapshot is advisory only. Admission still reads and
      // validates the authoritative checkpoint before allowing inference.
    }
  }

  private boundDeadline(deadline: number): number {
    const parent = this.options.deadlineAt?.();
    if (typeof parent === "number" && Number.isFinite(parent))
      this.deadlineCeiling = Math.min(this.deadlineCeiling, Math.floor(parent));
    return Math.min(deadline, this.deadlineCeiling);
  }

  isWaiting(): boolean {
    const state = this.localState;
    return (
      this.options.isLive()
      && !!state
      && state.status === 'waiting'
      &&
      this.now() < this.boundDeadline(state.deadlineAt) &&
      state.nextRetryAt > this.now()
      && this.matchesCurrent(state, false)
    );
  }

  readState(): ModelRecoveryState | undefined {
    return this.localState;
  }

  /** Begin a separately admitted turn after its owner has cleared persisted recovery state. */
  resetForNewTurn(): void {
    this.epoch += 1;
    this.deadlineCeiling = Infinity;
    this.localState = undefined;
    this.liveReceipt = undefined;
    this.liveProofReleased = false;
    this.pending = undefined;
    this.pendingExpected = undefined;
    this.persistedExpected = undefined;
    this.boundRequest = undefined;
    this.boundEpoch = undefined;
    this.pauseInFlight = undefined;
  }

  /** Admit only an exact, previously checkpointed recovery request after restoring its safety ledger. */
  async admit(request: Request): Promise<{ delayMs: number } | undefined> {
    if (this.waitInProgress) {
      throw new Error('Another inference recovery request owns this Session');
    }
    this.waitInProgress = true;
    try {
      // message_stop may already be visible to the SDK while the prior
      // request's durable clear is still pending. Serialize the next admit
      // behind that exact cleanup before inspecting the checkpoint.
      if (this.completing) await this.completing;
      if (this.boundRequest && this.boundRequest !== request) {
        throw new Error('Another inference recovery request owns this Session');
      }
      return await this.admitInner(request);
    } finally {
      this.waitInProgress = false;
    }
  }

  private async admitInner(request: Request,
  ): Promise<{ delayMs: number } | undefined> {
    if (!this.requestLive(request) || !this.options.isLive()) throw new Error('Inference recovery owner is no longer live');
    let stored: ModelRecoveryState | undefined;
    try {
      const raw = this.options.read() as unknown;
      if (raw !== undefined && !validModelRecovery(raw)) throw new Error('Persisted model recovery state is corrupt');
      stored = raw as ModelRecoveryState | undefined;
    } catch (error) {
      throw error instanceof Error ? error : new Error('Cannot read persisted model recovery state');
    }
    if (!stored) {
      if (this.now() >= this.boundDeadline(Infinity))
        throw new Error("Parent execution deadline expired");
      return undefined;
    }
    if (stored.liveProof && (!this.hasLiveProof(stored) || !this.liveProofReleased)) {
      await this.pause('Recovery requires the original live Query proof', stored);
      throw new Error('Recovery requires the original live Query proof; preserved progress needs explicit continuation');
    }
    if (stored.status === 'paused') throw new Error(stored.reason ?? 'Model recovery is paused');
    const owner = this.options.current();
    if (!owner || !this.sameHistoryAndRoute(stored, owner)) {
      await this.pause('Model recovery identity mismatch', stored);
      throw new Error('Persisted model recovery belongs to a different native history or route');
    }
    if (this.now() >= this.boundDeadline(stored.deadlineAt)) {
      await this.pause('Model recovery window expired', stored);
      throw new Error('Model recovery window expired');
    }

    this.boundRequest = request;
    this.boundEpoch = this.epoch;
    const epoch = this.epoch;
    const current = this.options.current();
    if (!current) {
      this.boundRequest = undefined;
      throw new Error('Model recovery Session identity is unavailable');
    }
    const reboundDeadline = this.boundDeadline(stored.deadlineAt);
    const rebound: ModelRecoveryState = { ...stored, turnId: current.turnId,
      deadlineAt: reboundDeadline,
      nextRetryAt: Math.min(stored.nextRetryAt, reboundDeadline),
    };
    this.pending = rebound;
    this.pendingExpected = stored;
    const live = () => this.epoch === epoch && this.requestLive(request) && this.options.isLive()
      && this.matchesCurrent(rebound, false);
    try {
      await this.options.prepare(request.clone());
      if (!live()) throw new Error('Inference recovery owner changed while restoring its safety ledger');
      const committed = await this.options.write(rebound, stored, live);
      if (!committed || !live()) {
        if (committed && this.epoch === epoch && request.signal.aborted) {
          await this.pause('Query ended during model recovery admission', rebound);
        }
        throw new Error('Could not durably rebind the model recovery checkpoint');
      }
      this.localState = rebound;
      this.pending = undefined;
      this.pendingExpected = undefined;
      this.persistedExpected = rebound;
      this.requestRecoveryIds.set(request, rebound.id);
      this.notify(rebound);
      if (this.now() >= this.boundDeadline(rebound.deadlineAt)) {
        await this.pause('Model recovery window expired', rebound);
        throw new Error('Model recovery window expired');
      }
      return { delayMs: Math.max(0, rebound.nextRetryAt - this.now()) };
    } catch (error) {
      if (this.epoch === epoch && this.localState?.status !== 'waiting') this.boundRequest = undefined;
      if (this.epoch === epoch) {
        this.pending = undefined;
        this.pendingExpected = undefined;
      }
      throw error instanceof Error ? error : new Error('Model recovery admission failed');
    }
  }

  async wait(request: Request, failure: InferenceRecoveryFailure): Promise<number | undefined> {
    if (this.waitInProgress || (this.boundRequest && this.boundRequest !== request)) return undefined;
    this.boundRequest ??= request;
    this.boundEpoch ??= this.epoch;
    this.waitInProgress = true;
    try {
      const delay = await this.waitInner(request, failure);
      if (delay === undefined && this.localState?.status !== 'waiting') this.boundRequest = undefined;
      return delay;
    } finally {
      this.waitInProgress = false;
    }
  }

  private async waitInner(request: Request, failure: InferenceRecoveryFailure,
  ): Promise<number | undefined> {
    if (!this.requestLive(request)) return undefined;
    const current = this.options.current();
    if (!current || !this.options.isLive()) return undefined;

    let stored: ModelRecoveryState | undefined;
    try {
      const raw = this.options.read() as unknown;
      if (raw !== undefined && !validModelRecovery(raw)) {
        this.epoch += 1;
        this.pending = undefined;
        this.pendingExpected = undefined;
        this.localState = undefined;
        this.notify(null);
        return undefined;
      }
      stored = raw as ModelRecoveryState | undefined;
    } catch {
      return undefined;
    }
    if (stored?.liveProof && !this.hasLiveProof(stored)) {
      await this.pause('Recovery requires the original live Query proof', stored);
      return undefined;
    }
    if (stored?.status === 'paused') {
      this.localState = stored;
      this.notify(stored);
      return undefined;
    }
    if (stored && !this.sameHistoryAndRoute(stored, current)) {
      await this.pause('Model recovery identity mismatch', stored);
      return undefined;
    }

    const epoch = this.epoch;
    const existing = stored;
    const startedAt = existing?.startedAt ?? this.now();
    const deadlineAt = this.boundDeadline(
      existing?.deadlineAt ?? startedAt + MODEL_RECOVERY_WINDOW_MS,
    );
    if (!existing && this.now() >= deadlineAt) return undefined;
    // Bridge attempt counts upstream calls (and may jump at failover); this
    // checkpoint counts durable wait rounds only and survives process restart.
    const attempt = (existing?.attempt ?? 0) + 1;
    const candidate: ModelRecoveryState = {
      version: existing?.version ?? 1,
      ...(failure.kind === 'stream' || existing?.kind === 'stream' ? { kind: 'stream' as const } : {}),
      ...(existing?.liveProof ? { liveProof: existing.liveProof } : {}),
      id: existing?.id ?? crypto.randomUUID(),
      status: 'waiting',
      sdkSessionId: current.sdkSessionId,
      routeIdentity: current.routeIdentity,
      turnId: current.turnId,
      ...(current.goalId ? { goalId: current.goalId } : {}),
      attempt,
      startedAt,
      nextRetryAt: startedAt,
      deadlineAt,
      lastStatus: failure.status,
    };
    this.pending = candidate;
    this.pendingExpected = existing;
    const live = () => this.epoch === epoch && this.requestLive(request)
      && this.options.isLive() && this.matchesCurrent(candidate, false) &&
      this.now() < this.boundDeadline(candidate.deadlineAt);
    if (this.now() >= deadlineAt) {
      await this.pause('Model recovery window expired', candidate);
      return undefined;
    }
    if (!live()) {
      this.pending = undefined;
      this.pendingExpected = undefined;
      return undefined;
    }

    if (!existing) {
      try {
        await this.options.prepare(request.clone());
      } catch {
        this.pending = undefined;
        this.pendingExpected = undefined;
        return undefined;
      }
      if (!live()) {
        this.pending = undefined;
        this.pendingExpected = undefined;
        return undefined;
      }
    }

    const delay = modelRecoveryDelay(attempt, Math.max(0, failure.retryAfterMs ?? 0));
    candidate.deadlineAt = this.boundDeadline(candidate.deadlineAt);
    const remaining = candidate.deadlineAt - this.now();
    if (delay <= 0 || delay > remaining) {
      await this.pause('Model recovery window expired', candidate);
      return undefined;
    }
    candidate.nextRetryAt = this.now() + delay;
    if (candidate.nextRetryAt > candidate.deadlineAt) candidate.nextRetryAt = candidate.deadlineAt;
    if (!live()) {
      this.pending = undefined;
      this.pendingExpected = undefined;
      return undefined;
    }
    let committed = false;
    try {
      committed = await this.options.write(candidate, existing, live);
    } catch {
      committed = false;
    }
    if (!committed || !live()) {
      this.pending = undefined;
      this.pendingExpected = undefined;
      if (committed && this.epoch === epoch && request.signal.aborted) {
        await this.pause('Query ended during model recovery wait', candidate);
      }
      return undefined;
    }
    this.localState = candidate;
    this.pending = undefined;
    this.pendingExpected = undefined;
    this.persistedExpected = candidate;
    this.requestRecoveryIds.set(request, candidate.id);
    this.notify(candidate);
    if (this.now() >= this.boundDeadline(candidate.deadlineAt)) {
      await this.pause('Model recovery window expired', candidate);
      return undefined;
    }
    return Math.max(0, candidate.nextRetryAt - this.now());
  }

  settledInterruptionFailure(): string | undefined { return this.settledFailure; }

  /** No synthetic HTTP request: only the native result owner can mint this live-only receipt. */
  async armSettledInterruption(): Promise<boolean> {
    this.settledFailure = 'live_proof_unavailable';
    if (this.now() >= this.boundDeadline(Infinity)) {
        this.settledFailure = 'budget_exhausted'; return false;
      }
    if (this.waitInProgress || this.completing || this.boundRequest || !this.options.isLive()
      || !this.options.prepareSettledInterruption) { this.settledFailure = 'checkpoint_owned'; return false; }
    const owner = this.options.current();
    if (!owner) return false;
    let stored: ModelRecoveryState | undefined;
    try {
      const raw = this.options.read();
      if (raw !== undefined && !validModelRecovery(raw)) return false;
      stored = raw;
    } catch { return false; }
    if (stored && (stored.status !== 'waiting' || stored.kind !== 'stream'
      || !this.matchesCurrent(stored, false) || (stored.liveProof && !this.hasLiveProof(stored)))) return false;
    const epoch = this.epoch;
    this.waitInProgress = true;
    try {
      const receipt = await this.options.prepareSettledInterruption();
      if (!receipt || !receipt.isCurrent() || this.epoch !== epoch || !this.options.isLive()) return false;
      const startedAt = Math.min(stored?.startedAt ?? receipt.interruptedAt, receipt.interruptedAt);
      const deadlineAt = this.boundDeadline(
        Math.min(stored?.deadlineAt ?? Infinity, startedAt + MODEL_RECOVERY_WINDOW_MS),
      );
      const attempt = (stored?.attempt ?? 0) + 1;
      const nextRetryAt = this.now() + modelRecoveryDelay(attempt);
      if (!Number.isSafeInteger(startedAt) || startedAt > this.now() || nextRetryAt >= deadlineAt) {
        this.settledFailure = 'budget_exhausted'; return false;
      }
      const candidate: ModelRecoveryState = { version: 2, kind: 'stream', id: stored?.id ?? randomUUID(),
        status: 'waiting', ...owner, startedAt, deadlineAt, nextRetryAt, attempt, lastStatus: 502,
        liveProof: { kind: 'settled-stream', authority: this.liveProofAuthority, receiptId: receipt.id } };
      const live = () => this.epoch === epoch && this.options.isLive() && receipt.isCurrent()
        && this.matchesCurrent(candidate, false) && !this.boundRequest && !this.completing &&
        this.now() < this.boundDeadline(candidate.deadlineAt);
      this.pending = candidate; this.pendingExpected = stored;
      if (!live()) return false;
      this.settledFailure = 'storage_or_cas_failed';
      if (!await this.options.write(candidate, stored, live) || !live()) return false;
      this.liveReceipt = receipt; this.liveProofReleased = false;
      this.localState = candidate; this.persistedExpected = candidate;
      this.settledFailure = undefined;
      this.notify(candidate); this.options.onInterrupted?.();
      return true;
    } catch { return false; }
    finally {
      if (this.epoch === epoch) { this.pending = undefined; this.pendingExpected = undefined; }
      this.waitInProgress = false;
    }
  }

  private hasLiveProof(state: ModelRecoveryState): boolean {
    return !state.liveProof || (state.liveProof.authority === this.liveProofAuthority
      && state.liveProof.receiptId === this.liveReceipt?.id);
  }

  /** A trusted bridge partial receipt arms the same durable chain before SDK termination. */
  async interrupted(request: Request): Promise<boolean> {
    const allowed = await this.wait(request, { status: 502, attempt: 1, usingBackup: false, kind: 'stream' }) !== undefined;
    if (allowed) this.options.onInterrupted?.();
    return allowed;
  }

  /** Only a marker-verified same-history continuation may retire the old HTTP binding. */
  releaseStreamBinding(): boolean {
    const state = this.localState;
    if (!state || state.kind !== 'stream' || state.status !== 'waiting'
      || !this.hasLiveProof(state) || (state.liveProof && !this.liveProofReleased && !this.liveReceipt?.isCurrent())
      || !this.options.isLive() || !this.matchesCurrent(state, false)
      || this.now() >= this.boundDeadline(state.deadlineAt) || this.now() < state.nextRetryAt) return false;
    try {
      const stored = this.options.read();
      if (!stored || !validModelRecovery(stored) || !sameCheckpoint(state, stored)) return false;
    } catch { return false; }
    this.boundRequest = undefined;
    this.boundEpoch = undefined;
    if (state.liveProof) this.liveProofReleased = true;
    return true;
  }

  /** An inference terminal is not a task terminal: retain the stream chain until its original turn ends. */
  async finishStreamTurn(): Promise<boolean> {
    const state = this.localState;
    if (!state || state.kind !== 'stream') return true;
    if (state.status !== 'waiting' || !this.options.isLive() || !this.matchesCurrent(state, false)) return false;
    const epoch = this.epoch;
    const live = () => this.epoch === epoch && this.options.isLive()
      && this.matchesCurrent(state, false) && this.localState === state;
    try {
      const stored = this.options.read();
      if (!stored || !sameCheckpoint(state, stored)) return false;
      if (!await this.options.write(undefined, state, live) || !live()) return false;
      this.localState = undefined;
      this.boundRequest = undefined;
      this.boundEpoch = undefined;
      this.persistedExpected = undefined;
      this.notify(null);
      return true;
    } catch { return false; }
  }

  async complete(request: Request): Promise<void> {
    if (this.completing) {
      await this.completing;
      return;
    }
    const operation = this.completeInner(request);
    this.completing = operation;
    try {
      await operation;
    } finally {
      if (this.completing === operation) this.completing = undefined;
    }
  }

  private async completeInner(request: Request): Promise<void> {
    const state = this.localState;
    if (!state || state.status !== 'waiting' || this.boundRequest !== request
      || this.requestRecoveryIds.get(request) !== state.id || !this.matchesCurrent(state, false)) return;
    const epoch = this.boundEpoch;
    if (epoch === undefined || epoch !== this.epoch || !this.options.isLive()) return;
    // `complete` is called only after the bridge delivered a trusted terminal
    // receipt. SDKs may abort the HTTP Request immediately after consuming it,
    // so the signal is deliberately not part of this narrow cleanup authority.
    const live = () => this.epoch === epoch && this.boundEpoch === epoch
      && this.boundRequest === request && this.options.isLive()
      && this.localState?.id === state.id
      && this.matchesCurrent(state, false);
    if (!live()) return;
    // Stream continuation owns a whole Product turn. Keep its original budget
    // through successful intermediate inference/tool cycles; Stop still sees it.
    if (state.kind === 'stream') {
      this.boundRequest = undefined;
      this.boundEpoch = undefined;
      this.requestRecoveryIds.delete(request);
      return;
    }
    try {
      const stored = this.options.read() as unknown;
      if (!validModelRecovery(stored) || stored.status !== 'waiting' || !sameCheckpoint(stored, state)) return;
      if (await this.options.write(undefined, state, live) && live()) {
        this.localState = undefined;
        this.boundRequest = undefined;
        this.boundEpoch = undefined;
        this.requestRecoveryIds.delete(request);
        this.notify(null);
      }
    } catch {
      // Retain durable recovery state; a later Query can safely resume it.
    }
  }

  /** Revalidate ownership and the persisted deadline immediately before inference resumes. */
  async validateResume(request: Request): Promise<boolean> {
    let state = this.localState;
    const epoch = this.boundEpoch;
    if (!state || state.status !== 'waiting' || this.boundRequest !== request
      || epoch === undefined || epoch !== this.epoch || !this.requestLive(request)
      || !this.options.isLive() || this.requestRecoveryIds.get(request) !== state.id
      || !this.matchesCurrent(state, false)) return false;
    if (this.now() >= this.boundDeadline(state.deadlineAt)) {
      await this.pause('Model recovery window expired', state);
      return false;
    }
    try {
      const stored = this.options.read() as unknown;
      if (validModelRecovery(stored) && sameCheckpoint(stored, state)) {
        const deadlineAt = this.boundDeadline(state.deadlineAt);
        if (deadlineAt < state.deadlineAt) {
          const prior = state;
          const tightened = {
            ...state,
            deadlineAt,
            nextRetryAt: Math.min(state.nextRetryAt, deadlineAt),
          };
          const live = () =>
            this.epoch === epoch &&
            this.localState === prior &&
            this.boundRequest === request &&
            this.requestLive(request) &&
            this.options.isLive() &&
            this.matchesCurrent(prior, false) &&
            this.now() < this.boundDeadline(deadlineAt);
          if (!(await this.options.write(tightened, prior, live)) || !live())
            return false;
          this.localState = tightened;
          this.persistedExpected = tightened;
          state = tightened;
          this.notify(tightened);
          return this.now() < this.boundDeadline(deadlineAt);
        }
      }
      return (
        validModelRecovery(stored) && stored.status === 'waiting'
        && sameCheckpoint(stored, state) && this.epoch === epoch
        && this.boundRequest === request && this.requestLive(request)
        && this.options.isLive() && this.matchesCurrent(state, false)
        && this.now() < this.boundDeadline(state.deadlineAt)
      );
    } catch { return false; }
  }

  async blocked(request: Request, reason: string): Promise<void> {
    if (!this.requestLive(request)) return;
    const state = this.pending ?? this.localState;
    if (!state || state.status !== 'waiting'
      || (this.boundRequest && this.boundRequest !== request)
      || (this.localState && this.requestRecoveryIds.get(request) !== state.id)
      || !this.matchesCurrent(state, false)) return;
    await this.pause(reason, state);
  }

  /** Revokes in-flight prepare/write authority synchronously before durable pause. */
  pause(reason: string, source = this.pending ?? this.localState,
  ): Promise<boolean> {
    const key = source ? JSON.stringify([
      source.id, source.sdkSessionId, source.routeIdentity, source.turnId, source.attempt,
    ]) : undefined;
    if (key && this.pauseInFlight?.key === key) return this.pauseInFlight.promise;

    const epoch = ++this.epoch;
    const wasPending = !!source && this.pending?.id === source.id;
    const expected = source
      ? (wasPending ? this.pendingExpected : (this.persistedExpected ?? source))
      : undefined;
    this.pending = undefined;
    this.pendingExpected = undefined;
    this.boundRequest = undefined;
    this.boundEpoch = undefined;
    if (!source) {
      this.localState = undefined;
      this.notify(null);
      // Do not cache an empty-owner stop: the next wait may establish a new
      // checkpoint that must be independently stoppable.
      return Promise.resolve(true);
    }
    const bounded = this.boundDeadline(source.deadlineAt);
    const paused: ModelRecoveryState = {
      ...source,
      ...(bounded > source.startedAt ? { deadlineAt: bounded } : {}),
      status: 'paused',
      nextRetryAt: source.startedAt,
      reason,
    };
    this.localState = paused;
    this.notify(paused);
    // The Query may already have been retired by Goal pause/stop. The store
    // writer performs the authoritative same-id/status/native-history CAS.
    const live = () => this.epoch === epoch;
    // Install the record before reading/writing so reentrant stop paths can
    // join this same durable fence rather than invalidating its epoch.
    const operation = Promise.resolve().then(async () => {
      try {
        const current = this.options.read();
        if (!current && expected) return true;
        if (current?.id === source.id && current.status === 'paused'
          && current.sdkSessionId === source.sdkSessionId
          && current.routeIdentity === source.routeIdentity) return true;
        // The original writer may have committed our exact pending candidate
        // before its Promise returns. Stop owns that candidate too; it must
        // fence the committed row instead of treating its own CAS as a successor.
        if (wasPending && current && sameCheckpoint(current, source)) {
          return await this.options.write(paused, current, live);
        }
        // A changed checkpoint belongs to a newer Query (or was already
        // superseded). It is safe to treat this local owner's stop as complete,
        // but never write the stale source over that checkpoint.
        if (current && (!expected || !sameCheckpoint(current, expected))) return true;
        return await this.options.write(paused, expected, live);
      } catch {
        // Local eligibility is already revoked; do not permit a late retry.
        return false;
      }
    });
    const tracked = operation.finally(() => {
      if (this.pauseInFlight?.promise === tracked) this.pauseInFlight = undefined;
    });
    if (key) this.pauseInFlight = { key, promise: tracked };
    return tracked;
  }

  private requestLive(request: Request): boolean {
    return !request.signal.aborted;
  }

  private matchesCurrent(state: ModelRecoveryState, allowTurnRebind: boolean): boolean {
    const current = this.options.current();
    return !!current && state.sdkSessionId === current.sdkSessionId
      && state.routeIdentity === current.routeIdentity
      && (allowTurnRebind || state.turnId === current.turnId)
      && state.goalId === current.goalId;
  }

  private sameHistoryAndRoute(state: ModelRecoveryState, current: NonNullable<ReturnType<SessionModelRecoveryOptions['current']>>): boolean {
    return state.sdkSessionId === current.sdkSessionId
      && state.routeIdentity === current.routeIdentity
      && state.goalId === current.goalId;
  }

  private notify(state: ModelRecoveryState | null): void {
    try { this.options.onState?.(state); } catch { /* notification does not own recovery */ }
  }
}

/** Fixed, non-secret copy. Hashes, requests and provider credentials never enter the user explanation. */
export function settledStreamFailureMessage(code: string): string {
  const messages: Record<string, string> = {
    history_uncertain: '历史工具结果仍不确定，需要先只读核对。',
    background_unsettled: '后台任务尚未获得精确终态，暂不能安全自动继续。',
    checkpoint_owned: '原恢复入口已被停止、占用或替换。',
    budget_exhausted: '原恢复时间预算已用尽。',
    storage_or_cas_failed: '恢复证据未能耐久保存或原执行身份已变化。',
    live_proof_unavailable: '未能核证所有请求与后台任务均已结清且中断请求未下发工具。',
  };
  return `自动继续已暂停：${messages[code] ?? messages.live_proof_unavailable}已完成的进度保留，不会重放原操作。`;
}
