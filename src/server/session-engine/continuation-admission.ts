import { getActiveSessionTranscript, getSessionMetadata } from '../SessionStore';
import { deriveSessionContinuation, SESSION_CONTINUATION_PROMPT } from '../../shared/sessionContinuation';
import type { DispatchGuard, DispatchGuardResult } from '../session-core/turn-queue';
import type { DesktopAdmissionResult, DesktopMessageRequest, SessionEngine } from './types';

const STALE = '此会话的任务状态已变化，请查看当前进度后再继续。';
const BUSY = '此会话已有任务运行、排队或等待确认，请先查看当前进度。';
type Rejection = DesktopAdmissionResult & { success: false; code: NonNullable<DesktopAdmissionResult['code']> };

function reject(code: Rejection['code'], error = code === 'SESSION_CONTINUATION_BUSY' ? BUSY : STALE): Rejection {
  return { success: false, status: 409, code, error };
}

/** Reuse the Runtime queue's promotion and synchronous commit boundary. This
 * creates no additional lock/queue owner, and never infers work from text. */
export function prepareContinuationAdmission(engine: SessionEngine, request: DesktopMessageRequest) {
  if (request.continueFromTurnId === undefined) return undefined;
  // External guards currently do not honor validateAtCommit, and perform
  // asynchronous extension/process preparation after their guard. Fail closed.
  if (engine.kind !== 'builtin') return { accepted: false as const,
    result: reject('SESSION_CONTINUATION_STALE', '此运行环境暂不支持安全的一键继续，请打开会话后手动继续。') };
  const source = getActiveSessionTranscript(request.sessionId);
  const sourceGeneration = source?.writer.status.generation;
  let canceled = false;
  let failure: Rejection | undefined;
  const check = (entry: boolean, queueId = request.queueId): Rejection | undefined => {
    const current = getActiveSessionTranscript(request.sessionId);
    const continuation = current && deriveSessionContinuation(current.writer.projection);
    const identity = engine.getRuntimeIdentity();
    if (canceled || !source || current !== source || current.hasPendingMutation
      || current.writer.status.generation !== sourceGeneration
      || !continuation || continuation.turnId !== request.continueFromTurnId
      || continuation.status === 'running' || request.asyncQuestionReply
      || (identity.boundSessionId ?? identity.sessionId) !== request.sessionId) {
      return reject('SESSION_CONTINUATION_STALE');
    }
    const live = engine.getLiveSessionState();
    // Only explicitly acknowledged exact shell runs may outlive the stopped
    // turn without blocking continuation; all other non-ambient work blocks.
    // Runtimes without a classified snapshot keep the conservative gate.
    const backgroundBlocksContinuation = live.backgroundWorkBlocksContinuation
      ?? (live.backgroundWorkActive || live.hasBackgroundWork);
    // Builtin enqueue itself projects starting/running before promotion, while
    // the guarded user input remains invisible. At dispatch, the unchanged
    // canonical stopped turn proves this is still preparation, not a new turn.
    if ((entry && (engine.isBusy() || live.sessionState !== 'idle'))
      || (!entry && !['idle', 'starting', 'running'].includes(live.sessionState))
      || live.waitingForUser || backgroundBlocksContinuation
      || engine.getQueueStatus().some(item => item.id !== queueId)
      || engine.getStreamReplaySnapshot().pendingInteractiveRequests.length > 0) {
      return reject('SESSION_CONTINUATION_BUSY');
    }
    return undefined;
  };
  const initial = check(true);
  if (initial) return { accepted: false as const, result: initial };
  // The fixed product action already means "continue this unfinished task".
  // Capture its original definition here, after the transcript owner check;
  // a raw request flag or model text is never a substitute for this proof.
  // The latest interrupted turn may belong to a different unclassified task;
  // only its exact human receipt can bind it to this execution. Legacy or
  // unmatched roots retain semantic classification, never inherit an old task.
  const execution = getSessionMetadata(request.sessionId)?.taskOrchestration?.execution;
  const stopped = source && deriveSessionContinuation(source.writer.projection);
  const root = stopped && source?.writer.projection.messages.get(stopped.rootUserMessageId);
  const executionIntent = root?.metadata?.clientRequestId === execution?.requestId
    && request.text === SESSION_CONTINUATION_PROMPT
    && !request.images?.length && !request.agentMentions?.length
    && !request.primaryContext && !request.queryPrimaryContext
    && execution?.intent.kind === 'execute'
    ? { ...execution.intent, continuationOf: execution.id }
    : undefined;
  // Preserve the captured transcript generation across async classification,
  // while composing the execution owner's newly allocated queue and guard.
  const wrapGuard = (prior: DispatchGuard | undefined, queueId = request.queueId): DispatchGuard => {
    const remember = (result: Rejection): DispatchGuardResult => {
      failure = result;
      return { accepted: false, code: result.code, error: result.error };
    };
    const rollback = (): Promise<void> => Promise.resolve(prior?.cancel?.());
    const guard: DispatchGuard = async () => {
      const stale = check(false, queueId);
      if (stale) return { ...remember(stale), rollbackBeforeReject: rollback() };
      const preceding = await prior?.() ?? { accepted: true };
      if (!preceding.accepted) return preceding;
      const after = check(false, queueId);
      if (after) return { ...remember(after), rollbackBeforeReject: rollback() };
      return {
        ...preceding,
        validateAtCommit: () => {
          // Reject a changed transcript before committing execution authority.
          const changed = check(false, queueId);
          if (changed) return { ...remember(changed), rollbackBeforeReject: rollback() };
          const result = preceding.validateAtCommit?.() ?? { accepted: true };
          if (!result.accepted) return result;
          const after = check(false, queueId);
          return after ? { ...remember(after), rollbackBeforeReject: rollback() } : result;
        },
      };
    };
    guard.cancel = () => { canceled = true; return prior?.cancel?.(); };
    return guard;
  };
  return {
    accepted: true as const,
    executionIntent,
    guard: wrapGuard(request.beforeDispatch),
    wrapGuard,
    revalidateEntry: () => check(true),
    rejection: (error?: string): DesktopAdmissionResult => failure ?? reject('SESSION_CONTINUATION_STALE', error ?? STALE),
  };
}
