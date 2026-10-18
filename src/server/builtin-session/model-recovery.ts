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
  onState?: (state: ModelRecoveryState | null) => void;
  now?: () => number;
}

function sameCheckpoint(left: ModelRecoveryState, right: ModelRecoveryState): boolean {
  return left.id === right.id
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
  private epoch = 0;
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

  isWaiting(): boolean {
    const state = this.localState;
    return this.options.isLive()
      && !!state
      && state.status === 'waiting'
      && state.nextRetryAt > this.now()
      && this.matchesCurrent(state, false);
  }

  readState(): ModelRecoveryState | undefined {
    return this.localState;
  }

  /** Begin a separately admitted turn after its owner has cleared persisted recovery state. */
  resetForNewTurn(): void {
    this.epoch += 1;
    this.localState = undefined;
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

  private async admitInner(request: Request): Promise<{ delayMs: number } | undefined> {
    if (!this.requestLive(request) || !this.options.isLive()) throw new Error('Inference recovery owner is no longer live');
    let stored: ModelRecoveryState | undefined;
    try {
      const raw = this.options.read() as unknown;
      if (raw !== undefined && !validModelRecovery(raw)) throw new Error('Persisted model recovery state is corrupt');
      stored = raw as ModelRecoveryState | undefined;
    } catch (error) {
      throw error instanceof Error ? error : new Error('Cannot read persisted model recovery state');
    }
    if (!stored) return undefined;
    if (stored.status === 'paused') throw new Error(stored.reason ?? 'Model recovery is paused');
    const owner = this.options.current();
    if (!owner || !this.sameHistoryAndRoute(stored, owner)) {
      await this.pause('Model recovery identity mismatch', stored);
      throw new Error('Persisted model recovery belongs to a different native history or route');
    }
    if (this.now() >= stored.deadlineAt) {
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
    const rebound: ModelRecoveryState = { ...stored, turnId: current.turnId };
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
      if (this.now() >= rebound.deadlineAt) {
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

  private async waitInner(request: Request, failure: InferenceRecoveryFailure): Promise<number | undefined> {
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
    const deadlineAt = existing?.deadlineAt ?? startedAt + MODEL_RECOVERY_WINDOW_MS;
    // Bridge attempt counts upstream calls (and may jump at failover); this
    // checkpoint counts durable wait rounds only and survives process restart.
    const attempt = (existing?.attempt ?? 0) + 1;
    const candidate: ModelRecoveryState = {
      version: 1,
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
      && this.options.isLive() && this.matchesCurrent(candidate, false);
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
    const remaining = deadlineAt - this.now();
    if (delay <= 0 || delay > remaining) {
      await this.pause('Model recovery window expired', candidate);
      return undefined;
    }
    candidate.nextRetryAt = this.now() + delay;
    if (candidate.nextRetryAt > deadlineAt) candidate.nextRetryAt = deadlineAt;
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
    if (this.now() >= candidate.deadlineAt) {
      await this.pause('Model recovery window expired', candidate);
      return undefined;
    }
    return Math.max(0, candidate.nextRetryAt - this.now());
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
    const state = this.localState;
    const epoch = this.boundEpoch;
    if (!state || state.status !== 'waiting' || this.boundRequest !== request
      || epoch === undefined || epoch !== this.epoch || !this.requestLive(request)
      || !this.options.isLive() || this.requestRecoveryIds.get(request) !== state.id
      || !this.matchesCurrent(state, false)) return false;
    if (this.now() >= state.deadlineAt) {
      await this.pause('Model recovery window expired', state);
      return false;
    }
    try {
      const stored = this.options.read() as unknown;
      return validModelRecovery(stored) && stored.status === 'waiting'
        && sameCheckpoint(stored, state) && this.epoch === epoch
        && this.boundRequest === request && this.requestLive(request)
        && this.options.isLive() && this.matchesCurrent(state, false)
        && this.now() < state.deadlineAt;
    } catch {
      return false;
    }
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
  pause(reason: string, source = this.pending ?? this.localState): Promise<boolean> {
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
    const paused: ModelRecoveryState = {
      ...source,
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
