import { createContext, useContext } from 'react';

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

export const SessionTaskActionsContext = createContext<SessionTaskActions | null>(null);
export const useSessionTaskActions = () => useContext(SessionTaskActionsContext);
