import type { SessionTaskLedger } from '../../shared/sessionTaskOrchestration';
import { isSessionPlanConfirmed, type SessionPlanProposal } from '../../shared/sessionPlanConfirmation';
import type { TurnOwner } from '../session-core/turn-queue';

/** Identity comes only from the original runtime queue, never CLI/source text. */
export type SessionPlanTurnScope = { queueId?: string; owner?: TurnOwner };
// Reserved by the existing plan continuation producer. Old/superseded queues
// retain their policy class instead of becoming ordinary scheduled Tasks.
export const SESSION_PLAN_QUEUE_PREFIX = 'session-plan:';
/** Server-stamped on the existing proposal; CLI content cannot supply this. */
export type SessionPlanWithOrigin = SessionPlanProposal & { originTurn?: SessionPlanTurnScope };

export function canDelegateForSessionPlan(sessionId: string, ledger: SessionTaskLedger | undefined,
  turn: SessionPlanTurnScope | null | undefined, activeClaimId?: string): boolean {
  if (!sessionId) return false;
  const start = ledger?.planStart;
  const planQueue = !!turn && (turn.queueId?.startsWith(SESSION_PLAN_QUEUE_PREFIX)
    || turn.owner?.id.startsWith(SESSION_PLAN_QUEUE_PREFIX)
    || !!start && (turn.queueId === start.queueId || turn.owner?.id === start.queueId));
  const proposal = ledger?.proposal as SessionPlanWithOrigin | undefined;
  if (!proposal) return !planQueue;
  // A native Task/Goal may continue independently of another owner's plan,
  // but cannot bypass a new draft it created itself. Legacy unknown origin
  // cannot prove independence and remains gated. No tool permission changes.
  const origin = proposal.originTurn;
  if (turn?.owner && !planQueue && origin
    && (!origin.owner || origin.owner.kind !== turn.owner.kind || origin.owner.id !== turn.owner.id)) return true;
  if (planQueue && (!start || turn?.queueId !== start.queueId || turn?.owner?.kind !== 'task'
    || turn.owner.id !== start.queueId)) return false;
  return proposal.sessionId === sessionId && isSessionPlanConfirmed(proposal)
    && start?.proposalId === proposal.id && start.revision === proposal.revision
    && start.purpose !== 'revision' && !!start.queueId && !!start.requestId
    && (start.state === 'dispatched' || start.state === 'claimed'
      && !!start.claimId && activeClaimId === start.claimId);
}
