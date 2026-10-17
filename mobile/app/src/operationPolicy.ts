export type ReceiptState = 'prepared' | 'processing' | 'accepted' | 'rejected' | 'unconfirmed' | 'not-found' | 'unknown';

export type ViewOwner = { epoch: number; screen: 'login' | 'sessions' | 'chat'; targetId: string | null; agentId: string | null; sessionId: string | null };

/** Async view reads may commit only while their exact screen/target/session still owns the view. */
export function viewStillOwned(captured: ViewOwner, current: ViewOwner): boolean {
  return captured.epoch === current.epoch
    && captured.screen === current.screen
    && captured.targetId === current.targetId
    && captured.agentId === current.agentId
    && captured.sessionId === current.sessionId;
}

export function commitIfViewOwned<T>(captured: ViewOwner, current: ViewOwner, value: T, commit: (value: T) => void): boolean {
  if (!viewStillOwned(captured, current)) return false;
  commit(value);
  return true;
}

export type DraftStore = Record<string, string>;

/** Draft keys use returned target identity as a storage namespace, never as bridge authorization. */
export function draftKey(target: { agentId: string; deviceName: string; name: string } | null, sessionId: string | null): string | null {
  if (!target) return null;
  return JSON.stringify([target.agentId, target.deviceName, target.name, sessionId ?? 'new']);
}

export function updateDraft(store: DraftStore, key: string | null, value: string): DraftStore {
  if (!key) return store;
  return { ...store, [key]: value };
}

export function readDraft(store: DraftStore, key: string | null): string {
  return key ? store[key] ?? '' : '';
}

/** A mutation UUID may be submitted once. Later interaction is always a receipt query. */
export function mutationDisposition(status: ReceiptState): 'query-only' | 'settled' {
  return status === 'accepted' || status === 'rejected' ? 'settled' : 'query-only';
}

export function approvalStillCurrent(current: { state: string; generation: string | null; turnId: string | null; interactions: readonly { requestId: string; generation: string; turnId: string; actionable: boolean }[] }, captured: { requestId: string; generation: string; turnId: string }): boolean {
  return current.state === 'waiting_user_action'
    && current.generation === captured.generation
    && current.turnId === captured.turnId
    && current.interactions.some((item) => item.requestId === captured.requestId && item.generation === captured.generation && item.turnId === captured.turnId && item.actionable);
}
