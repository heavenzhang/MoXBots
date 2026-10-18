import type { TranscriptProjection } from './sessionTranscript';

/** Display-only projection of the latest accepted conversation turn. Runtime
 * and workflow owners still decide whether a new continuation can execute. */
export interface SessionContinuation {
  turnId: string;
  rootUserMessageId: string;
  status: 'running' | 'stopped' | 'interrupted';
}

export const SESSION_CONTINUATION_PROMPT = '请接着完成上一项尚未完成的任务，沿用本会话的目标、上下文和已有进度。先核对当前代码、文件、执行结果和已完成步骤，再从未完成处继续；不要从头重跑，不要重复已完成的写入、发送或发布。遇到尚未解决的权限或信息缺口时，明确指出。';

export function deriveSessionContinuation(projection: TranscriptProjection): SessionContinuation | undefined {
  const messages = [...projection.messages.values()];
  const lastUser = messages.filter(message => message.role === 'user'
    && !message.id.startsWith('task-notification-')).at(-1);
  if (!lastUser) return undefined;
  const lastTurn = [...projection.turns.values()].at(-1);
  if (!lastTurn || lastTurn.origin === 'collaboration'
    || lastTurn.rootUserMessageId !== lastUser.id
    || !['running', 'stopped', 'interrupted'].includes(lastTurn.status)) return undefined;
  return {
    turnId: lastTurn.id,
    rootUserMessageId: lastUser.id,
    status: lastTurn.status as SessionContinuation['status'],
  };
}

/** A stale sidebar intent cannot resume a different/newer user turn. */
export function matchesSessionContinuation(
  continuation: SessionContinuation | undefined,
  messages: ReadonlyArray<{ id: string; role: string; turnId?: string; deliveryStatus?: string; transcriptState?: string; messageKind?: string }>,
  expectedTurnId?: string,
): continuation is SessionContinuation {
  if (!continuation || (expectedTurnId && continuation.turnId !== expectedTurnId)) return false;
  const lastUser = messages.filter(message => message.role === 'user'
    && !message.id.startsWith('task-notification-')).at(-1);
  if (lastUser && (lastUser.deliveryStatus || lastUser.id !== continuation.rootUserMessageId)) return false;
  const answer = messages.findLast(message => message.role === 'assistant' && message.messageKind !== 'diagnostic'
    && message.turnId === continuation.turnId);
  // The live terminal may arrive before its list metadata projection. A success
  // must remove the action immediately, even while metadata is catching up.
  if (answer?.transcriptState === 'complete') return false;
  if (lastUser) return true;
  // Paginated history may omit the root input, but must still identify this
  // exact turn. Never infer incomplete work from message text or its title.
  return messages.at(-1)?.turnId === continuation.turnId;
}
