export const RECOVERY_REVIEW_ACTIONS_PATH = '/api/session/recovery/actions';
export const RECOVERY_RECONCILE_PATH = '/api/session/recovery/reconcile';

/** Redacted review only. A review never claims that a business task succeeded. */
export interface RecoveryReviewAction {
  actionHash: string;
  tool: 'TaskGet' | 'TaskList' | 'Bash' | 'Other';
  eligible: boolean;
  reason: 'builtin_task_query' | 'native_hook_denied' | 'external_receipt_required' | 'native_evidence_missing';
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
}
export interface RecoveryActionRequest {
  reviewAuthority: string;
  sessionId: string;
  sdkSessionId: string;
  epoch: number;
  ledgerDigest: string;
  actionHash: string;
}
