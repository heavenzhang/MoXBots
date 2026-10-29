import { createHash } from 'node:crypto';

export type AdmissionRejectionReason = 'registry_exhausted' | 'blocked_exact_scope' | 'blocked_ambiguous_scope'
  | 'duplicate_exact_key' | 'duplicate_ambiguous_fingerprint' | 'registry_capacity';
export type NativeActionPhase = 'reserve_enter' | 'reserve_complete' | 'reserve_not_required' | 'reserve_denied'
  | 'reserve_failed' | 'commit_enter' | 'commit_complete' | 'commit_failed' | 'commit_unmatched';
export type RecoveryCausalDiagnostic =
  | { event: 'inference_retry_deferred'; reason: 'provider_cooldown'; status: number; attempt: number;
      retryAfterMs: number; usingBackup: boolean; durableOwnerAvailable: boolean }
  | { event: 'inference_admission_rejected'; owner: 'context' | 'model_failover'; reason: AdmissionRejectionReason }
  | { event: 'native_action_gate_rejected'; reason: 'state_blocked' | 'ledger_blocked' | 'request_guard_blocked' }
  | { event: 'native_action'; phase: NativeActionPhase; toolIdDigest: string; actionDigest: string;
      persistence: 'active' | 'inactive'; hook: 'pre_tool_use' | 'post_tool_use' | 'post_tool_use_failure' };
export type RecoveryDiagnosticObserver = false | ((event: Readonly<RecoveryCausalDiagnostic>) => void);

/** No caller data, scope, request fingerprint, raw native IDs or error text belongs here. */
export function observeRecoveryDiagnostic(event: RecoveryCausalDiagnostic, observer?: RecoveryDiagnosticObserver): void {
  if (observer === false) return;
  try {
    const observed: unknown = observer ? observer(event) : console.log(`[recovery-causal] ${JSON.stringify(event)}`);
    if (observed instanceof Promise) void observed.catch(() => {});
  } catch { /* Observability cannot change admission, persistence or dispatch. */ }
}

/** Summaries correlate logs only; they are never evidence or recovery authority. */
export function nativeActionDiagnostic(phase: NativeActionPhase, toolUseId: string | undefined,
  actionHash: string | undefined, active: boolean, failed?: boolean): RecoveryCausalDiagnostic {
  return { event: 'native_action', phase,
    toolIdDigest: toolUseId ? createHash('sha256').update(toolUseId).digest('hex').slice(0, 24) : 'unavailable',
    actionDigest: actionHash && /^[a-f0-9]{64}$/.test(actionHash) ? actionHash.slice(0, 24) : 'unavailable',
    persistence: active ? 'active' : 'inactive', hook: failed === undefined ? 'pre_tool_use' : failed ? 'post_tool_use_failure' : 'post_tool_use' };
}
