import { RemoteSessionError } from './receipts';

const remoteGuardCodes = new Set([
  'REMOTE_AGENT_UNAVAILABLE',
  'REMOTE_SESSION_NOT_FOUND',
  'REMOTE_SESSION_OWNER_CHANGED',
  'REMOTE_PREPARED_ADMISSION_FAILED',
]);

/** Older engine adapters expose text errors. Project only known categories:
 * never put raw adapter errors (paths, provider configuration or credentials)
 * into the encrypted response or the durable receipt. Unknown failures remain
 * refusals, not permission to retry or replace the original Session. */
export function remoteAdmissionRejectionCode(error: unknown, phase: 'enqueue' | 'dispatch'): string {
  if (typeof error === 'string') {
    if (remoteGuardCodes.has(error)) return error;
    if (error === 'Provider/model selection is incomplete. Select a provider-model pair before sending.') return 'REMOTE_PROVIDER_SELECTION_REQUIRED';
    if (error.startsWith('ProviderRoute/model mismatch:')) return 'REMOTE_PROVIDER_MODEL_MISMATCH';
    if (/^Provider ".+" is unavailable or missing an API key\./.test(error)
      || /^Subscription provider '.+' cannot execute in builtin runtime$/.test(error)) return 'REMOTE_PROVIDER_UNAVAILABLE';
    if (error.startsWith('Invalid builtin permission mode:') || error.startsWith('Invalid permissionMode ')) return 'REMOTE_RUNTIME_PERMISSION_INVALID';
    if (error.startsWith('Workspace capabilities are unavailable:')) return 'REMOTE_WORKSPACE_CAPABILITIES_UNAVAILABLE';
    if (/^Queue full \(max \d+\)$/.test(error)) return 'REMOTE_SESSION_QUEUE_FULL';
    if (/^Queue item was cancelled(?: before dispatch)?$/.test(error)
      || error === 'Session materialization was rolled back before turn admission.') return 'REMOTE_SESSION_ADMISSION_CANCELLED';
  }
  return phase === 'dispatch' ? 'REMOTE_SESSION_DISPATCH_REJECTED' : 'REMOTE_SESSION_ADMISSION_REJECTED';
}

export function rejectRemoteAdmission(
  error: unknown,
  phase: 'enqueue' | 'dispatch',
  operation: { kind: string; operationId: string; agentId: string },
  sessionId: string,
): never {
  const code = remoteAdmissionRejectionCode(error, phase);
  // Correlate target-side failures without logging the task, answers, raw
  // adapter errors, filesystem paths or provider credentials.
  console.warn('[remote-session] admission rejected', { phase, code,
    kind: operation.kind, operationId: operation.operationId, agentId: operation.agentId, sessionId });
  throw new RemoteSessionError(code);
}
