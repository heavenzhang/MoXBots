import { createContext, useContext } from 'react';
import type { SessionTaskView } from '../../../shared/sessionTaskOrchestration';

export interface TaskReviewTarget {
  sessionId: string;
  taskId: string;
  attemptId: string;
}

export interface SessionTaskActions {
  disabled: boolean;
  onInspect: (toolUseId: string) => void;
  onReview: (targets: readonly TaskReviewTarget[]) => Promise<boolean>;
  onComposeRework: (targets: readonly TaskReviewTarget[]) => void;
}

/** Feedback may address a failure; an acceptance request may only review a returned result. */
export function resolveTaskActionTargets(tasks: readonly SessionTaskView[], targets: readonly TaskReviewTarget[], sessionId: string | null,
  purpose: 'review' | 'feedback' = 'review'): SessionTaskView[] | null {
  if (!sessionId || !targets.length || targets.some(target => target.sessionId !== sessionId)) return null;
  const selected = targets.map(target => tasks.find(task => task.id === target.taskId && (task.reviewAttemptId ?? 'main') === target.attemptId
    && (task.phase === 'awaiting_review' || purpose === 'feedback' && ['failed', 'interrupted', 'unknown', 'rework'].includes(task.phase))));
  return selected.every(task => !!task) ? selected.filter((task): task is SessionTaskView => !!task) : null;
}

export const SessionTaskActionsContext = createContext<SessionTaskActions | null>(null);
export const useSessionTaskActions = () => useContext(SessionTaskActionsContext);
