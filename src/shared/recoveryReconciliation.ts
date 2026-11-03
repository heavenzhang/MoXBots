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
