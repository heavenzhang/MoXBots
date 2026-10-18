// In-memory auto-route state per Product Session: the tier the last routed
// turn ran on and the next model in that tier for failover. Leaf module with
// no imports so agent-session can read it without an import cycle.

export interface AutoRouteBackupRef {
  providerId: string;
  modelId: string;
}

interface AutoRouteSessionState {
  tier?: 'fast' | 'balanced' | 'strong';
  backup?: AutoRouteBackupRef;
}

const states = new Map<string, AutoRouteSessionState>();
const MAX_SESSIONS = 256;

export function setAutoRouteSessionState(sessionId: string, state: AutoRouteSessionState | undefined): void {
  states.delete(sessionId);
  if (!state) return;
  states.set(sessionId, state);
  // Insertion order is recency; drop the oldest beyond the cap.
  while (states.size > MAX_SESSIONS) {
    const oldest = states.keys().next().value;
    if (oldest === undefined) break;
    states.delete(oldest);
  }
}

export function getAutoRouteSessionState(sessionId: string): AutoRouteSessionState | undefined {
  return states.get(sessionId);
}

/** Failover backup chosen by auto routing for this Session's current turn. */
export function getAutoRouteBackup(sessionId: string): AutoRouteBackupRef | undefined {
  return states.get(sessionId)?.backup;
}
