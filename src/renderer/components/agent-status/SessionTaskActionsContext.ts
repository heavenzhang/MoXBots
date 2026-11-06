import { createContext, useContext } from 'react';

export interface SessionTaskActions {
  onInspect: (toolUseId: string) => void;
}

export const SessionTaskActionsContext = createContext<SessionTaskActions | null>(null);
export const useSessionTaskActions = () => useContext(SessionTaskActionsContext);
