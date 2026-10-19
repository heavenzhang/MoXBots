/** Server-owned observations for one turn. This is not a business action ledger. */
export interface StreamRecoveryEvidence {
  version: 1;
  interruptions: number;
  continuations: number;
  protectedActions: number;
  status: 'waiting' | 'resuming' | 'completed' | 'stopped' | 'blocked';
  startedAt: number;
  updatedAt: number;
  reason?: 'stream_interrupted' | 'uncertain_action' | 'stopped' | 'budget_exhausted' | 'storage_failed';
}

/** History and live payloads cross a runtime boundary; never render malformed
 * metadata as a zero count or a successful recovery. Unknown versions stay absent. */
export function readStreamRecoveryEvidence(value: unknown): StreamRecoveryEvidence | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  if (data.version !== 1
    || typeof data.status !== 'string'
    || !['waiting', 'resuming', 'completed', 'stopped', 'blocked'].includes(data.status)
    || !['interruptions', 'continuations', 'protectedActions'].every(key =>
      Number.isSafeInteger(data[key]) && (data[key] as number) >= 0)
    || !['startedAt', 'updatedAt'].every(key =>
      Number.isSafeInteger(data[key]) && (data[key] as number) > 0 && (data[key] as number) <= 8_640_000_000_000_000)
    || (data.updatedAt as number) < (data.startedAt as number)
    || (data.reason !== undefined && (typeof data.reason !== 'string' || !['stream_interrupted', 'uncertain_action', 'stopped', 'budget_exhausted', 'storage_failed'].includes(data.reason)))) {
    return undefined;
  }
  return data as unknown as StreamRecoveryEvidence;
}
