export type ReceiptState = 'prepared' | 'processing' | 'accepted' | 'rejected' | 'unconfirmed' | 'not-found' | 'unknown';

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
