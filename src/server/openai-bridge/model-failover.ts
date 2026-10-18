import { isModelFailoverStatus } from '../../shared/modelFailover';
import type { UpstreamConfig } from './types/bridge';
import { classifyOpenAiUpstreamFailure } from './translate/errors';
import { readBoundedErrorBody } from './read-error-body';
import { SSEParser } from './utils/sse-parser';
import { QueryRequestGuard, waitForRequestRetry } from './request-lifetime';

export interface BridgeModelFailover {
  run(request: Request, primary: UpstreamConfig,
    execute: (target: UpstreamConfig) => Promise<Response>, requestKey?: string): Promise<Response>;
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
  }) {}

  endTurn(): void {
    const scope = this.state?.scope ?? this.options.scope();
    this.retiredScope = scope;
    if (this.state) this.state.retired = true;
    this.state = undefined;
    this.options.onTurnEnd?.();
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
    const lease = this.guard.begin(scope, requestKey ?? `unfingerprinted-${++this.sequence}`, ambiguous);
    if (!lease) return replayBlocked();
    // Only root-owned recovery may change provider. Ordinary primary inference and
    // its bounded pre-delivery retries remain valid across a parent turn boundary.
    const rootLive = () => queryLive() && !!state && !state.retired && this.state === state
      && this.options.scope() === scope && this.options.canSwitch?.() !== false;
    let usingBackup = state?.backup === true && !ambiguous;
    const live = () => queryLive() && !lease.isBlocked();
    const delays = this.options.retryDelaysMs ?? [250, 750, 1500];
    let streamOwnsFinish = false;
    const finish = () => lease.finish();
    const cancelResponse = (response: Response) => { void response.body?.cancel().catch(() => undefined); };
    const runTarget = async (backup: boolean): Promise<Response> => {
      const retryLive = () => live() && this.options.canRetry?.() !== false && (!backup || rootLive());
      // Four attempts per inference/provider: initial call plus three safe retries.
      // An SDK replay enters the admission guard instead of acquiring another budget.
      for (let attempt = 0; ; attempt++) {
        if (!live()) return cancelled();
        const target = backup ? (rootLive() ? this.options.resolveBackup() : undefined) : primary;
        if (!target) return unavailableBackup();
        const response = await execute(target);
        if (!live()) { cancelResponse(response); return cancelled(); }
        const inspected = await inspectFailure(response);
        if (!live()) { cancelResponse(inspected.response); return cancelled(); }
        if (!inspected.recoverable || attempt >= delays.length || !retryLive()) return inspected.response;
        const retry = await waitForRequestRetry(delays[attempt], request.signal, retryLive);
        if (!retry) {
          if (!live()) { cancelResponse(inspected.response); return cancelled(); }
          return inspected.response;
        }
        cancelResponse(inspected.response);
      }
    };
    try {
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
      if (!response.ok || !response.body) return response;
      const reader = response.body.getReader();
      const isSse = response.headers.get('content-type')?.includes('text/event-stream') === true;
      const parser = new SSEParser();
      const decoder = new TextDecoder();
      let terminal = false;
      const stream = new ReadableStream<Uint8Array>({
        async pull(output) {
          try {
            if (!live()) throw new Error('Model request superseded or cancelled');
            const next = await reader.read();
            if (!live()) throw new Error('Model request superseded or cancelled');
            if (next.done) { if (isSse && !terminal) lease.block(); finish(); output.close(); return; }
            if (isSse) for (const event of parser.feed(decoder.decode(next.value, { stream: true }))) {
              let type = event.event;
              try { const payload = JSON.parse(event.data); if (typeof payload?.type === 'string') type = payload.type; } catch { /* use SSE event name */ }
              if (type === 'message_stop') terminal = true;
              if (type === 'error') lease.block();
            }
            output.enqueue(next.value);
          } catch (error) {
            if (!terminal) lease.block();
            void reader.cancel().catch(() => undefined);
            finish(); output.error(error);
          }
        },
        async cancel(reason) {
          if (!terminal && isSse) lease.block();
          finish();
          try { await reader.cancel(reason); } catch { /* transport may already be aborted */ }
        },
      });
      streamOwnsFinish = true;
      return new Response(stream, { status: response.status, headers: response.headers });
    } catch {
      if (!queryLive()) return cancelled();
      lease.block();
      return replayBlocked();
    } finally {
      if (!streamOwnsFinish) finish();
    }
  }
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
    message: 'This model request was already delivered, failed, or reached the Query safety limit. Progress is preserved; automatic replay is blocked.' } }),
  { status: 409, headers: { 'content-type': 'application/json', 'x-should-retry': 'false' } });
}

function unavailableBackup(): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type: 'api_error',
    message: 'The selected backup model is no longer authorized or available. Progress is preserved; automatic replay is blocked.' } }),
  { status: 409, headers: { 'content-type': 'application/json', 'x-should-retry': 'false' } });
}

function cancelled(): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Model request superseded or cancelled' } }),
    { status: 499, headers: { 'content-type': 'application/json', 'x-should-retry': 'false' } });
}
