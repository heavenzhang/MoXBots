import { randomUUID } from 'node:crypto';
import type { AnthropicRequest } from '../openai-bridge/types/anthropic';
import type { StreamRecoveryEvidence } from '../../shared/streamRecovery';
import type { SessionModelRecovery } from './model-recovery';

export interface StreamContinuationPermit {
  rootId: string;
  recoveryId: string;
  marker: string;
}

/** A Query-local admission capability of the original turn, not a second queue or persistence owner. */
export class SameTurnStreamContinuation {
  private pending: StreamContinuationPermit | undefined;
  private armed = false;
  private epoch = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private evidence: StreamRecoveryEvidence | undefined;

  constructor(private readonly options: {
    recovery: SessionModelRecovery;
    rootId: () => string | undefined;
    isLive: () => boolean;
    /** Synchronously validate native tool pairing/ledger and retire only the old inference scopes. */
    advance: (body: AnthropicRequest) => number;
    enqueue: (permit: StreamContinuationPermit, reminder: string) => boolean;
    observe: (evidence: StreamRecoveryEvidence) => void;
    onFailure?: (reason: 'budget_exhausted' | 'storage_failed' | 'uncertain_action', rootId: string) => void;
    now?: () => number;
  }) {}

  interrupted(): void {
    const state = this.options.recovery.readState();
    if (!this.options.isLive() || state?.kind !== 'stream' || state.status !== 'waiting'
      || state.turnId !== this.options.rootId()) return;
    this.epoch++;
    this.clearTimer();
    this.pending = undefined;
    this.armed = true;
    const now = this.now();
    this.evidence = { version: 1, interruptions: (this.evidence?.interruptions ?? 0) + 1,
      continuations: this.evidence?.continuations ?? 0, protectedActions: this.evidence?.protectedActions ?? 0,
      startedAt: this.evidence?.startedAt ?? now, updatedAt: now, status: 'waiting', reason: 'stream_interrupted' };
    this.publish();
  }

  /** Called only at a native result boundary, before the original turn is finalized. */
  schedule(): boolean {
    const state = this.options.recovery.readState();
    const rootId = this.options.rootId();
    if (!this.armed || this.pending || !rootId || !this.options.isLive()
      || state?.kind !== 'stream' || state.status !== 'waiting' || state.turnId !== rootId
      || this.now() >= state.deadlineAt) return false;
    const permit = { rootId, recoveryId: state.id, marker: `mox-stream-continuation:${randomUUID()}` };
    this.pending = permit;
    const resumeWhenDue = () => {
      this.timer = undefined;
      const current = this.options.recovery.readState();
      if (this.pending !== permit || !this.options.isLive() || this.options.rootId() !== rootId
        || current?.id !== state.id || current.status !== 'waiting' || this.now() >= current.deadlineAt) {
        if (this.pending === permit && this.options.rootId() === rootId
          && current?.id === state.id && current.status === 'waiting') {
          this.fail(this.now() >= current.deadlineAt ? 'budget_exhausted' : 'uncertain_action', rootId);
        }
        else this.stop('stopped');
        return;
      }
      // Node timer elapsed time is not the durable wall clock. An early tick
      // must retain the permit instead of waking an input which acceptsInput
      // will correctly reject as not due (and then leave the turn waiting).
      const remaining = current.nextRetryAt - this.now();
      if (remaining > 0) {
        this.timer = setTimeout(resumeWhenDue, remaining);
        return;
      }
      const reminder = `<system-reminder>${permit.marker}\nThe model response was interrupted. Continue the existing unfinished task from its native conversation and confirmed tool results. Do not restart the original user request. Do not repeat completed writes, sends, submissions or deployments. Verify uncertain outcomes read-only; if they cannot be verified, stop and explain. Preserve the user's goal and constraints.</system-reminder>`;
      if (!this.options.enqueue(permit, reminder)) {
        this.fail('storage_failed', rootId);
      }
    };
    this.timer = setTimeout(resumeWhenDue, Math.max(0, state.nextRetryAt - this.now()));
    return true;
  }

  acceptsInput(permit: StreamContinuationPermit): boolean {
    const state = this.options.recovery.readState();
    return this.pending === permit && this.options.isLive() && this.options.rootId() === permit.rootId
      && state?.id === permit.recoveryId && state.kind === 'stream' && state.turnId === permit.rootId
      && state.status === 'waiting' && this.now() >= state.nextRetryAt && this.now() < state.deadlineAt;
  }

  /** A fresh native request must contain the one-use reminder in its last user input. */
  authorizeRequest(body: AnthropicRequest): boolean {
    const permit = this.pending;
    if (!permit) return false;
    if (!Array.isArray(body.messages)) return false;
    const last = body.messages.findLast(message => message.role === 'user');
    const text = last?.role === 'user' ? typeof last.content === 'string' ? last.content
      : last.content.filter(block => block.type === 'text').map(block => block.text).join('\n') : '';
    if (!text.includes(permit.marker)) return false;
    if (!this.acceptsInput(permit)) throw new Error('automatic_replay_blocked: Stream continuation was stopped or superseded');
    if (!this.options.recovery.releaseStreamBinding()) throw new Error('automatic_replay_blocked: Stream continuation checkpoint is no longer authorized');
    const protectedActions = this.options.advance(body);
    this.pending = undefined;
    this.armed = false;
    this.clearTimer();
    if (this.evidence) {
      this.evidence = { ...this.evidence, continuations: this.evidence.continuations + 1,
        protectedActions, status: 'resuming', updatedAt: this.now() };
      this.publish();
    }
    return true;
  }

  finish(): void {
    this.epoch++;
    this.clearTimer();
    this.pending = undefined;
    this.armed = false;
    if (this.evidence) {
      this.evidence = { ...this.evidence, status: 'completed', updatedAt: this.now() };
      this.publish();
    }
  }

  stop(reason: NonNullable<StreamRecoveryEvidence['reason']> = 'stopped'): void {
    if (reason === 'stopped') this.epoch++;
    this.clearTimer();
    this.pending = undefined;
    this.armed = false;
    if (this.evidence) {
      this.evidence = { ...this.evidence, status: reason === 'stopped' ? 'stopped' : 'blocked', reason, updatedAt: this.now() };
      this.publish();
    }
  }

  reset(): void { this.epoch++; this.clearTimer(); this.pending = undefined; this.armed = false; this.evidence = undefined; }
  private fail(reason: 'budget_exhausted' | 'storage_failed' | 'uncertain_action', rootId: string): void {
    this.stop(reason);
    const epoch = this.epoch;
    void this.options.recovery.pause(reason === 'budget_exhausted'
      ? 'Stream continuation recovery window expired'
      : reason === 'uncertain_action' ? 'Stream continuation lost exclusive action authority' : 'Stream continuation input owner is unavailable')
      .then(persisted => {
        if (this.epoch !== epoch || this.options.rootId() !== rootId) return;
        const failure = persisted ? reason : 'storage_failed';
        this.stop(failure); this.options.onFailure?.(failure, rootId);
      }).catch(() => {
        if (this.epoch !== epoch || this.options.rootId() !== rootId) return;
        this.stop('storage_failed'); this.options.onFailure?.('storage_failed', rootId);
      });
  }
  private now(): number { return (this.options.now ?? Date.now)(); }
  private clearTimer(): void { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }
  private publish(): void { if (this.evidence) this.options.observe({ ...this.evidence }); }
}
