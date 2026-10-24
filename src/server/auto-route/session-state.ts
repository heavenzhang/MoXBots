// In-memory auto-route state per Product Session: the tier the last routed
// turn ran on and the next model in that tier for failover. Leaf module with
// no imports so agent-session can read it without an import cycle.

export interface AutoRouteBackupRef {
  providerId: string;
  modelId: string;
}

interface AutoRouteSessionState {
  tier?: 'fast' | 'balanced' | 'strong';
  /** The candidate is valid only for the primary chosen by this admission. */
  primary?: { providerId: string; model: string };
  backup?: AutoRouteBackupRef;
  candidates?: AutoRouteBackupRef[];
}

const states = new Map<string, AutoRouteSessionState>();
const MAX_SESSIONS = 256;

export function setAutoRouteSessionState(sessionId: string, state: AutoRouteSessionState | undefined,
): void {
  states.delete(sessionId);
  if (!state) return;
  states.set(sessionId, {
    ...state,
    ...(state.primary ? { primary: { ...state.primary } } : {}),
    ...(state.backup ? { backup: { ...state.backup } } : {}),
    ...(state.candidates
      ? { candidates: state.candidates.slice(0, 3).map((ref) => ({ ...ref })) }
      : {}),
  });
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
export function getAutoRouteBackup(sessionId: string, primary?: { providerId: string; model: string }): AutoRouteBackupRef | undefined {
  const state = states.get(sessionId);
  if (primary && (state?.primary?.providerId !== primary.providerId || state.primary.model !== primary.model)) return undefined;
  return state?.backup;
}

/** Immutable admission plan, capped independently of later catalog expansion. */
export function getAutoRouteCandidates(
  sessionId: string,
  primary?: { providerId: string; model: string },
): AutoRouteBackupRef[] {
  const state = states.get(sessionId);
  if (
    primary && (state?.primary?.providerId !== primary.providerId || state.primary.model !== primary.model)
  )
    return [];
  return (state?.candidates ?? (state?.backup ? [state.backup] : []))
    .slice(0, 3)
    .map((ref) => ({ ...ref }));
}
