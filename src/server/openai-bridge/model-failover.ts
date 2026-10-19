import { isModelFailoverStatus } from '../../shared/modelFailover';
import type { UpstreamConfig } from './types/bridge';
import { classifyOpenAiUpstreamFailure } from './translate/errors';
import { readBoundedErrorBody } from './read-error-body';
import { SSEParser } from './utils/sse-parser';
import { modelStreamEventType } from './utils/model-stream-event';
import { formatReplayBlockedStreamError, formatSSEFrame } from './utils/sse-writer';
import { QueryRequestGuard, waitForRequestRetry } from './request-lifetime';

export interface BridgeModelFailover {
  run(request: Request, primary: UpstreamConfig,
    execute: (target: UpstreamConfig) => Promise<Response>, requestKey?: string): Promise<Response>;
}

/** The Session owner commits its checkpoint before authorizing another inference. */
export interface InferenceRecoveryHooks {
  /** Rebind an already committed waiting checkpoint after Query reconstruction. */
  admit?(request: Request): Promise<{ delayMs: number } | undefined>;
  /** Revalidate the durable deadline/owner after a timer (including system sleep). */
  validateResume?(request: Request): Promise<boolean>;
  wait(request: Request, failure: { status: number; attempt: number; retryAfterMs?: number; usingBackup: boolean }): Promise<number | undefined>;
  complete(request: Request): Promise<void>;
  blocked?(request: Request, reason: string): Promise<void>;
  /** Ask the original turn owner to continue from native history, never replay this request. */
  interrupted?(request: Request): Promise<boolean>;
}

type Root = { scope: string; backup?: boolean; retired?: boolean };

/** Query-token owned; never re-enqueues input or invokes tools. */
export class ModelFailoverController implements BridgeModelFailover {
  private state: Root | undefined;
  private readonly guard = new QueryRequestGuard();
  private retiredScope: string | undefined;
  private sequence = 0;

  constructor(private readonly options: {
    /** Foreground recovery identity. Missing identity does not revoke an ordinary Query request. */
    scope: () => string | undefined;
    resolveBackup: () => UpstreamConfig | undefined;
    onSwitch: (target: UpstreamConfig, status: number) => void;
    onTurnEnd?: () => void;
    canSwitch?: () => boolean;
    /** Exact Query/token/route authorization, independent of foreground idle. */
    isActive?: () => boolean;
    /** Captured per request so supported in-place model changes can admit the next request. */
    requestIdentity?: () => string;
    /** A known uncertain tool outcome or recovery fence prohibits inference replay. */
    canRetry?: () => boolean;
    retryDelaysMs?: readonly [number, number, number];
    recovery?: InferenceRecoveryHooks;
  }) {}

  /**
   * True when a pre-header failure could still be retried or switched right
   * now. Callers arm a short headers timeout only while this holds; otherwise
   * the short timer would turn normal upstream latency into an unrecoverable
   * error even though automatic recovery is fenced off.
   */
  fastRecoveryAuthorized(): boolean {
    const scope = this.options.scope();
    return !!scope && scope !== this.retiredScope && this.options.isActive?.() !== false
      && this.options.canRetry?.() !== false;
  }

  endTurn(): void {
    const scope = this.state?.scope ?? this.options.scope();
    this.retiredScope = scope;
    if (this.state) this.state.retired = true;
    this.state = undefined;
    // Turn finalization is synchronous and must release the root even if a
    // diagnostic observer fails. Durable stop belongs to the Session owner.
    try { this.options.onTurnEnd?.(); } catch { /* observer cannot retain a root */ }
  }

  async run(request: Request, primary: UpstreamConfig,
    execute: (target: UpstreamConfig) => Promise<Response>, requestKey?: string): Promise<Response> {
    const requestIdentity = this.options.requestIdentity?.();
    const queryLive = () => !request.signal.aborted && this.options.isActive?.() !== false
      && this.options.requestIdentity?.() === requestIdentity;
    if (!queryLive()) return cancelled();
    const candidateScope = this.options.scope();
    const scope = candidateScope && candidateScope !== this.retiredScope ? candidateScope : undefined;
    if (scope && scope !== this.state?.scope) this.state = { scope };
    const state = scope ? this.state : undefined;
    const ambiguous = !scope || this.options.canSwitch?.() === false;
    const fingerprint = requestKey ?? `unfingerprinted-${++this.sequence}`;
    const lease = this.guard.begin(scope, fingerprint, ambiguous);
    if (!lease) return this.guard.rejectedResponse(scope, fingerprint) ?? replayBlocked();
    // Only root-owned recovery may change provider. Ordinary primary inference and
    // its bounded pre-delivery retries remain valid across a parent turn boundary.
    // A request admitted with ambiguous ownership cannot acquire a foreground root
    // merely because the background registry clears during a network await.
    const rootLive = () => !ambiguous && queryLive() && !!state && !state.retired && this.state === state
      && this.options.scope() === scope && this.options.canSwitch?.() !== false;
    let usingBackup = state?.backup === true && !ambiguous;
    const live = () => queryLive() && !lease.isBlocked();
    const delays = this.options.retryDelaysMs ?? [250, 750, 1500];
    let streamOwnsFinish = false;
    const finish = () => lease.finish();
    const cancelResponse = (response: Response) => { void response.body?.cancel().catch(() => undefined); };
    const recovery = !ambiguous ? this.options.recovery : undefined;
    const recoveryLive = () => live() && rootLive() && this.options.canRetry?.() !== false;
    let inferenceAttempts = 0;
    let restoredWaiting = false;
    let hasDurableRecovery = false;
    let durableStopped = false;
    let recoverySettled = false;
    let interruptionAttempted = false;
    const blockRecovery = async (reason: string) => {
      lease.block();
      if (recoverySettled) return;
      recoverySettled = true;
      // A stale stream cannot resurrect a stopped or replaced owner checkpoint.
      if (rootLive()) await recovery?.blocked?.(request, reason);
    };
    const completeRecovery = async () => {
      if (recoverySettled || !recovery || !rootLive() || !live()) return;
      await recovery.complete(request);
      recoverySettled = true;
    };
    const interruptRecovery = async (reason: string, isConsumerCancelled: () => boolean) => {
      if (!interruptionAttempted && !recoverySettled && !isConsumerCancelled() && recoveryLive()) {
        interruptionAttempted = true;
        try {
          if (await recovery?.interrupted?.(request) && !recoverySettled && !isConsumerCancelled() && recoveryLive()) {
            // The old lease remains sealed. The original owner alone may
            // admit a different native continuation under its durable chain.
            recoverySettled = true;
            lease.block();
            return;
          }
        } catch { /* failed continuation admission retains the existing pause */ }
      }
      await blockRecovery(reason);
    };
    const validateRecoveryResume = async () => {
      const allowed = recovery?.validateResume ? await recovery.validateResume(request) : true;
      if (!recoveryLive()) return false;
      if (allowed !== true) {
        await blockRecovery('Model recovery deadline or durable owner no longer permits inference');
        throw new Error('Model recovery resume was not authorized');
      }
      return true;
    };
    const runTarget = async (backup: boolean): Promise<Response> => {
      const retryLive = () => live() && this.options.canRetry?.() !== false && (!backup || rootLive());
      // Four attempts per inference/provider: initial call plus three safe retries.
      // An SDK replay enters the admission guard instead of acquiring another budget.
      for (let attempt = 0; ; attempt++) {
        if (!live()) return cancelled();
        if (restoredWaiting) {
          if (!await validateRecoveryResume()) return rootLive() ? replayBlocked() : cancelled();
          if (!recoveryLive()) return cancelled();
        }
        const target = backup ? (rootLive() ? this.options.resolveBackup() : undefined) : primary;
        if (!target) return unavailableBackup();
        inferenceAttempts++;
        const response = await execute(target);
        if (!live()) { cancelResponse(response); return cancelled(); }
        const inspected = await inspectFailure(response);
        if (!live()) { cancelResponse(inspected.response); return cancelled(); }
        if (!inspected.recoverable || restoredWaiting || attempt >= delays.length || !retryLive()) return inspected.response;
        // A provider's longer cooldown must pass the durable waiting boundary,
        // rather than being violated by this request's non-persistent fast loop.
        const retryAfterMs = parseRetryAfter(inspected.response.headers.get('retry-after'));
        if (recovery && rootLive() && retryAfterMs !== undefined && retryAfterMs > delays[attempt]) return inspected.response;
        const retry = await waitForRequestRetry(delays[attempt], request.signal, retryLive);
        if (!retry) {
          if (!live()) { cancelResponse(inspected.response); return cancelled(); }
          return inspected.response;
        }
        cancelResponse(inspected.response);
      }
    };
    try {
      if (recovery?.admit && recoveryLive()) {
        const pending = await recovery.admit(request);
        if (!recoveryLive()) return cancelled();
        if (pending) {
          restoredWaiting = true;
          hasDurableRecovery = true;
          if (!Number.isFinite(pending.delayMs) || pending.delayMs < 0) throw new Error('Invalid recovery admission wait');
          if (!await waitForRequestRetry(pending.delayMs, request.signal, recoveryLive)) return cancelled();
          if (!recoveryLive()) return cancelled();
        }
      }
      let response = await runTarget(usingBackup);
      if (!live()) { cancelResponse(response); return cancelled(); }
      // The exhausted primary response remains a real upstream error when background
      // ownership is ambiguous or no backup is configured; do not manufacture a 499.
      if (!usingBackup && rootLive() && this.options.canRetry?.() !== false) {
        const inspected = await inspectFailure(response);
        response = inspected.response;
        if (!live()) { cancelResponse(response); return cancelled(); }
        if (inspected.recoverable && rootLive()) {
          if (state!.backup) {
            usingBackup = true;
            cancelResponse(response);
            response = await runTarget(true);
          } else {
            const backup = this.options.resolveBackup();
            if (backup && rootLive()) {
              state!.backup = true;
              usingBackup = true;
              const status = response.status;
              cancelResponse(response);
              this.options.onSwitch(backup, status);
              response = await runTarget(true);
            }
          }
        }
      }
      if (!live()) { cancelResponse(response); return cancelled(); }
      // Exhaust the existing primary/backup policy first. Long recovery retains
      // this exact admission lease and never replenishes either fast-retry budget.
      while (recovery && recoveryLive() && !response.ok) {
        const inspected = await inspectFailure(response);
        response = inspected.response;
        if (!recoveryLive()) { cancelResponse(response); return cancelled(); }
        if (!inspected.recoverable) break;
        const delay = await recovery.wait(request, { status: response.status, attempt: inferenceAttempts,
          retryAfterMs: parseRetryAfter(response.headers.get('retry-after')), usingBackup });
        if (!recoveryLive()) { cancelResponse(response); return cancelled(); }
        if (delay === undefined) { durableStopped = true; break; }
        hasDurableRecovery = true;
        // Invalid durable-hook results must never create a hot/unbounded loop.
        if (!Number.isFinite(delay) || delay < 0) throw new Error('Invalid recovery wait');
        if (!await waitForRequestRetry(delay, request.signal, recoveryLive)) { cancelResponse(response); return cancelled(); }
        if (!recoveryLive()) { cancelResponse(response); return cancelled(); }
        if (!await validateRecoveryResume()) {
          cancelResponse(response);
          return rootLive() ? replayBlocked() : cancelled();
        }
        if (!recoveryLive()) { cancelResponse(response); return cancelled(); }
        const target = usingBackup ? this.options.resolveBackup() : primary;
        if (!target) { cancelResponse(response); response = unavailableBackup(); break; }
        cancelResponse(response);
        inferenceAttempts++;
        response = await execute(target);
        if (!recoveryLive()) { cancelResponse(response); return cancelled(); }
      }
      if (!live()) { cancelResponse(response); return cancelled(); }
      if (!response.ok) {
        if (hasDurableRecovery) await blockRecovery('Model inference stopped before successful delivery');
        if (durableStopped) {
          // A declined/exhausted durable owner must pause safely, but its known
          // upstream cause must survive both this terminal and SDK repetition.
          await lease.reject(response);
          if (!queryLive()) return cancelled();
          lease.block();
          finish();
          return this.guard.rejectedResponse(scope, fingerprint) ?? replayBlocked();
        }
        return await lease.reject(response);
      }
      if (!response.body) {
        if (hasDurableRecovery) {
          await blockRecovery('Model response had no consumable inference body');
          return replayBlocked();
        }
        return response;
      }
      const reader = response.body.getReader();
      const isSse = response.headers.get('content-type')?.includes('text/event-stream') === true;
      const parser = new SSEParser();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let terminal = false;
      let terminalQueued = false;
      let consumerCancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        async pull(output) {
          try {
            if (!live()) throw new Error('Model request superseded or cancelled');
            const next = await reader.read();
            if (!live()) throw new Error('Model request superseded or cancelled');
            if (next.done) {
              if (isSse && !terminalQueued) {
                await interruptRecovery('Model stream ended without message_stop', () => consumerCancelled);
                if (consumerCancelled || !queryLive()) throw new Error('Model request superseded or cancelled');
                output.enqueue(encoder.encode(formatReplayBlockedStreamError()));
              } else await completeRecovery();
              finish(); output.close(); return;
            }
            let frames = '';
            if (isSse) for (const event of parser.feed(decoder.decode(next.value, { stream: true }))) {
              const type = modelStreamEventType(event);
              if (!type) continue;
              if (type === 'error') {
                if (!terminal) await interruptRecovery('Model stream delivered an error event', () => consumerCancelled);
                else await blockRecovery('Model stream delivered an error after its terminal');
                if (consumerCancelled || !queryLive()) throw new Error('Model request superseded or cancelled');
                output.enqueue(encoder.encode(formatReplayBlockedStreamError()));
                void reader.cancel().catch(() => undefined);
                finish(); output.close(); return;
              }
              frames += formatSSEFrame(event);
              // The protocol terminal ends this inference. Never parse provider trailers or
              // wait for socket EOF; either can turn a completed response into a fake failure.
              if (type === 'message_stop') { terminal = true; break; }
            }
            if (consumerCancelled || !queryLive()) throw new Error('Model request superseded or cancelled');
            if (!isSse) output.enqueue(next.value);
            else if (frames) output.enqueue(encoder.encode(frames));
            // Protocol termination counts as delivered only after the terminal
            // bytes enter the downstream queue. Durable cleanup may then await
            // IO without erasing a checkpoint for an unobserved message_stop.
            if (terminal) {
              terminalQueued = true;
              await completeRecovery();
              void reader.cancel().catch(() => undefined);
              finish();
              if (!consumerCancelled) output.close();
            }
          } catch (error) {
            if (!terminalQueued || (recovery && !recoverySettled)) {
              try {
                const reason = queryLive() ? 'Model response delivery failed' : 'Model response delivery was cancelled';
                if (!terminal) await interruptRecovery(reason, () => consumerCancelled);
                else await blockRecovery(reason);
              } catch { /* fail closed */ }
            }
            void reader.cancel().catch(() => undefined);
            finish();
            if (isSse && !terminalQueued && !consumerCancelled && queryLive()) {
              // A socket error would lose its message across HTTP. Deliver a
              // protocol error so the native SDK/Goal owner can pause safely.
              output.enqueue(encoder.encode(formatReplayBlockedStreamError()));
              output.close();
            } else output.error(error);
          }
        },
        async cancel(reason) {
          consumerCancelled = true;
          try {
            if (!terminalQueued && (isSse || recovery)) await blockRecovery('Model response consumer cancelled before completion');
          } finally {
            finish();
            try { await reader.cancel(reason); } catch { /* transport may already be aborted */ }
          }
        },
      });
      streamOwnsFinish = true;
      return new Response(stream, { status: response.status, headers: response.headers });
    } catch {
      if (!queryLive()) return cancelled();
      try { await blockRecovery('Model recovery checkpoint could not be committed'); } catch { /* fail closed */ }
      return replayBlocked();
    } finally {
      if (!streamOwnsFinish) finish();
    }
  }
}

/** Retry-After is advisory and bounded before crossing the persistence boundary. */
function parseRetryAfter(value: string | null): number | undefined {
  if (!value?.trim()) return undefined;
  const text = value.trim();
  const seconds = /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : undefined;
  if (seconds === undefined && !/^[A-Za-z]{3,9}[, ]/.test(text)) return undefined;
  const delay = seconds === undefined ? Date.parse(text) - Date.now() : seconds * 1000;
  if (!Number.isFinite(delay) || delay < 0) return undefined;
  return Math.min(delay, 24 * 60 * 60 * 1000);
}

async function inspectFailure(response: Response): Promise<{ response: Response; recoverable: boolean }> {
  if (!isModelFailoverStatus(response.status) || response.headers.get('x-moxbots-recovery') === 'blocked') return { response, recoverable: false };
  const body = await readBoundedErrorBody(response.body);
  return { response: new Response(body ?? JSON.stringify({ type: 'error', error: {
    type: 'api_error', message: 'Upstream error response was incomplete; automatic recovery stopped.' } }),
  { status: response.status, headers: body === undefined
    ? { ...Object.fromEntries(response.headers), 'x-moxbots-recovery': 'blocked' } : response.headers }),
  recoverable: body !== undefined && classifyOpenAiUpstreamFailure(response.status, body).kind !== 'permanent_billing' };
}

function replayBlocked(): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error',
    code: 'automatic_replay_blocked',
    message: 'automatic_replay_blocked: This model request was already delivered, failed, or reached the Query safety limit. Progress is preserved; automatic replay is blocked.' } }),
  { status: 409, headers: { 'content-type': 'application/json', 'x-should-retry': 'false',
    'x-moxbots-recovery': 'blocked' } });
}

function unavailableBackup(): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type: 'api_error',
    code: 'automatic_replay_blocked',
    message: 'automatic_replay_blocked: The selected backup model is no longer authorized or available. Progress is preserved; automatic replay is blocked.' } }),
  { status: 409, headers: { 'content-type': 'application/json', 'x-should-retry': 'false',
    'x-moxbots-recovery': 'blocked' } });
}

function cancelled(): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Model request superseded or cancelled' } }),
    { status: 499, headers: { 'content-type': 'application/json', 'x-should-retry': 'false' } });
}
