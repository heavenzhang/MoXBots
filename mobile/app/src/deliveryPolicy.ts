import type { PendingOperation } from './native';
import type { SubmittedDraft } from './draftPersistence';
import type { ViewOwner } from './operationPolicy';

/** Retain the native draft until final acceptance, but never present a submitted edit as editable. */
export function submittedDraftHidden(draft: { key: string; text: string; editRevision: number; revision?: number; lastWriteId?: string | null; status?: string } | null,
  submitted: readonly SubmittedDraft[], pending: readonly PendingOperation[], owner: ViewOwner): boolean {
  if (!draft) return false;
  return submitted.some((item) => item.key === draft.key && item.text === draft.text && item.editRevision === draft.editRevision)
    || pending.some((item) => item.targetId === owner.targetId && item.agentId === owner.agentId
      && item.sessionId === owner.sessionId && item.submittedText !== undefined && item.submittedText === draft.text.trim()
      && item.submittedDraft !== undefined && draft.status === 'saved'
      && draft.revision === item.submittedDraft.revision && draft.lastWriteId === item.submittedDraft.lastWriteId);
}

/** Bound unattended receipt reads; manual checks and a new foreground visit reset this schedule. */
export function receiptCheckDelay(attempt: number): number | null {
  return attempt >= 8 ? null : Math.min(1500 * 2 ** attempt, 15000);
}

/** Initial read failures must remain eligible even when there is no snapshot to poll yet. */
export function snapshotSessionToRead(owner: ViewOwner, snapshot: { sessionId: string; agentId: string } | null): string | null {
  if (owner.screen !== 'chat' || !owner.sessionId || !owner.agentId) return null;
  if (snapshot && (snapshot.sessionId !== owner.sessionId || snapshot.agentId !== owner.agentId)) return null;
  return owner.sessionId;
}

/** A definitive rejection may restore text only into its original/materialized conversation. */
export function rejectedDraftForOwner(owner: ViewOwner, operation: Pick<PendingOperation,'targetId'|'agentId'|'sessionId'|'submittedText'>,
  resultSessionId: string | null, existing: string, limit = 16000): { kind: 'skip' | 'overflow' } | { kind: 'restore'; text: string } {
  if (owner.screen !== 'chat' || owner.targetId !== operation.targetId || owner.agentId !== operation.agentId
    || owner.sessionId !== (resultSessionId ?? operation.sessionId) || !operation.submittedText) return {kind:'skip'};
  if (existing.trim() === operation.submittedText.trim()) return {kind:'restore',text:existing};
  const text = existing ? `${existing}\n\n${operation.submittedText}` : operation.submittedText;
  return text.length > limit ? {kind:'overflow'} : {kind:'restore',text};
}
