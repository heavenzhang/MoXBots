/** Non-secret SessionStore intent; native history and the action ledger remain authoritative. */
export interface ModelRecoveryState {
  version: 1 | 2;
  /** A partial stream resumes through the original turn owner, never HTTP replay. */
  kind?: 'stream';
  /** This receipt requires the original live Query; a restart must pause, never downgrade it. */
  liveProof?: { kind: 'settled-stream'; authority: string; receiptId: string };
  id: string;
  status: 'waiting' | 'paused';
  sdkSessionId: string;
  routeIdentity: string;
  turnId: string;
  goalId?: string;
  attempt: number;
  startedAt: number;
  nextRetryAt: number;
  deadlineAt: number;
  lastStatus: number;
  reason?: string;
}

export const MODEL_RECOVERY_WINDOW_MS = 30 * 60_000;

export function validModelRecovery(value: unknown): value is ModelRecoveryState {
  if (!value || typeof value !== 'object') return false;
  const row = value as ModelRecoveryState;
  return (row.version === 1 || row.version === 2)
    && (row.version === 1 ? row.liveProof === undefined : row.liveProof !== undefined) && (row.kind === undefined || row.kind === 'stream') && typeof row.id === 'string' && row.id.length > 0
    && (row.liveProof === undefined || (row.kind === 'stream' && row.liveProof?.kind === 'settled-stream'
      && typeof row.liveProof.authority === 'string' && row.liveProof.authority.length > 0
      && typeof row.liveProof.receiptId === 'string' && row.liveProof.receiptId.length > 0))
    && (row.status === 'waiting' || row.status === 'paused')
    && typeof row.sdkSessionId === 'string' && row.sdkSessionId.length > 0
    && typeof row.routeIdentity === 'string' && row.routeIdentity.length > 0
    && typeof row.turnId === 'string' && row.turnId.length > 0
    && (row.goalId === undefined || typeof row.goalId === 'string')
    && Number.isSafeInteger(row.attempt) && row.attempt > 0
    && [row.startedAt, row.nextRetryAt, row.deadlineAt].every(Number.isSafeInteger)
    && row.deadlineAt > row.startedAt && row.deadlineAt - row.startedAt <= MODEL_RECOVERY_WINDOW_MS
    && row.nextRetryAt >= row.startedAt
    && row.nextRetryAt <= row.deadlineAt && Number.isInteger(row.lastStatus);
}

export function modelRecoveryDelay(attempt: number, retryAfterMs = 0): number {
  return Math.max(Math.min(300_000, 15_000 * 2 ** Math.min(5, Math.max(0, attempt - 1))),
    Number.isFinite(retryAfterMs) ? Math.max(0, retryAfterMs) : 0);
}
