export const RECOVERY_REVIEW_ACTIONS_PATH = '/api/session/recovery/actions';
export const RECOVERY_RECONCILE_PATH = '/api/session/recovery/reconcile';

/** Redacted review only. A review never claims that a business task succeeded. */
export type RecoveryResultCheck = {
  kind: 'native_success' | 'native_failure' | 'file_matches' | 'file_differs' | 'file_missing' | 'file_changed'
    | 'file_unavailable' | 'file_outside_workspace' | 'external_check_required';
  checkedAt?: string;
};
export interface RecoveryFollowup {
  actionHash: string;
  sdkSessionId: string;
  requestId: string;
  kind: 'note' | 'defer';
  text: string;
  createdAt: string;
}
export interface RecoveryReviewAction {
  actionHash: string;
  tool: 'TaskGet' | 'TaskList' | 'Bash' | 'Other';
  eligible: boolean;
  reason: 'builtin_task_query' | 'native_hook_denied' | 'external_receipt_required' | 'native_evidence_missing' | 'native_success';
  check?: RecoveryResultCheck;
  followups?: RecoveryFollowup[];
  association?: { taskId: string; title: string; blockedTaskIds: string[] };
  toolUseIds?: string[];
  /** Display only; never used to authorize settlement or execution. No command bodies. */
  presentation?: {
    kind: 'command' | 'read_file' | 'write_file' | 'edit_file' | 'task_query' | 'tool';
    target?: string;
  };
}
export interface RecoveryActionSnapshot {
  reviewAuthority: string;
  sessionId: string;
  sdkSessionId: string;
  epoch: number;
  ledgerDigest: string;
  actions: RecoveryReviewAction[];
  resolvedCount: number;
  /** Confirmed by actual native records; never inferred from user notes. */
  completed?: RecoveryReviewAction[];
  reviewed?: RecoveryReviewAction[];
  investigationAvailable?: boolean;
  independentTasks?: { taskId: string; title: string }[];
  checkedAt?: string;
  /** Display only: the settled current task is blocked on these exact calls.
   * Absence means historical uncertainty is handled silently. Never admission. */
  attention?: { executionId: string; actionHashes: string[] };
  /** Display only: exact unresolved calls in the latest settled product turn.
   * A user Stop is retained; this notice never grants continuation or replay. */
  unresolvedTurn?: { turnId: string; actionHashes: string[] };
}

export function recoveryAttention(snapshot: RecoveryActionSnapshot, ledger?: import('./sessionTaskOrchestration').SessionTaskLedger): RecoveryActionSnapshot['attention'] {
  const execution = ledger?.execution;
  if (!execution || !['paused', 'incomplete'].includes(execution.phase)
    || execution.reason !== 'TOOL_OUTCOME_UNKNOWN'
    || execution.lastSettledQueueId !== execution.currentQueueId
    || snapshot.investigationAvailable
    || ledger?.delegationClaims?.some(claim => claim.executionId === execution.id && claim.state !== 'settled')) return undefined;
  const pendingIds = new Set(ledger?.executionEvidence?.filter(fact => fact.pending && fact.mutating).map(fact => fact.id));
  const actionHashes = snapshot.actions.filter(action => !action.eligible && action.toolUseIds?.some(id => pendingIds.has(id)))
    .map(action => action.actionHash);
  return actionHashes.length ? { executionId: execution.id, actionHashes } : undefined;
}
export interface RecoveryActionRequest {
  reviewAuthority: string;
  sessionId: string;
  sdkSessionId: string;
  epoch: number;
  ledgerDigest: string;
  actionHash: string;
}

export interface RecoveryFollowupRequest extends RecoveryActionRequest {
  kind: 'note' | 'defer';
  text: string;
  requestId: string;
}
export type RecoveryMutationRequest = RecoveryActionRequest | RecoveryFollowupRequest | (RecoveryActionRequest & {kind: 'investigate'});
