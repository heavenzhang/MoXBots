import type { TranscriptProjection, TranscriptTurn } from './sessionTranscript';

/** Display-only projection of unfinished terminal conversation work. Runtime
 * and workflow owners still decide whether a new continuation can execute. */
export interface SessionContinuation {
  turnId: string;
  rootUserMessageId: string;
  status: 'running' | 'stopped' | 'interrupted' | 'error';
}

export const SESSION_CONTINUATION_PROMPT = '请接着完成上一项尚未完成的任务，沿用本会话的目标、上下文和已有进度。先核对现有任务清单、代码、文件、工具结果和已完成步骤，再从最后一个已确认完成步骤之后继续；不要从头重跑，不要重新创建清单或重置已完成步骤，不要重复已完成的写入、发送或发布。对执行结果不明的操作，先只读核查实际状态；未确认前不要重复执行，无法核实时说明阻断。遇到尚未解决的权限或信息缺口时，明确指出。';

export function deriveSessionContinuation(projection: TranscriptProjection): SessionContinuation | undefined {
  const messages = [...projection.messages.values()];
  const lastUser = messages.filter(message => message.role === 'user'
    && !message.id.startsWith('task-notification-')).at(-1);
  if (!lastUser) return undefined;
  return continuationForTurn([...projection.turns.values()].at(-1), lastUser.id);
}

/** A canonical terminal event may update the display before list metadata is
 * flushed. It must still belong to the latest real user input. */
export function continuationForTurn(lastTurn: TranscriptTurn | undefined, lastUserMessageId: string): SessionContinuation | undefined {
  if (!lastTurn || lastTurn.origin === 'collaboration'
    || lastTurn.rootUserMessageId !== lastUserMessageId
    || !['stopped', 'interrupted', 'error'].includes(lastTurn.status)) return undefined;
  return {
    turnId: lastTurn.id,
    rootUserMessageId: lastUserMessageId,
    status: lastTurn.status as SessionContinuation['status'],
  };
}

/** A stale sidebar intent cannot resume a different/newer user turn. */
export function matchesSessionContinuation(
  continuation: SessionContinuation | undefined,
  messages: ReadonlyArray<{ id: string; role: string; turnId?: string; deliveryStatus?: string; transcriptState?: string; messageKind?: string }>,
  expectedTurnId?: string,
): continuation is SessionContinuation {
  // Older list metadata may advertise a live running turn. It is not a resume
  // candidate; cold recovery must first settle it through the execution owner.
  if (!continuation || continuation.status === 'running'
    || (expectedTurnId && continuation.turnId !== expectedTurnId)) return false;
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
