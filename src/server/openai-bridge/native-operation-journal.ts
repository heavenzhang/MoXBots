import { randomUUID } from 'node:crypto';

export interface NativeOperationAttempt {
  id: string;
  sessionId: string;
  sdkSessionId: string;
  queryEpoch: string;
  queryGeneration: number;
  scope: string;
  toolUseId: string;
  toolName: string;
  actionHash: string;
  reservedAt: string;
  status: 'reserved' | 'returned' | 'unresolved';
  outcome?: 'success' | 'bash-exit' | 'error';
  resultDigest?: string;
  returnedAt?: string;
}
export interface NativeOperationJournalData {
  version: 1;
  legacyUncertain: string[];
  entries: NativeOperationAttempt[];
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 512;
const time = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v));
const LIMIT = 2048;

/** Data owned/persisted by the existing ContextRecoveryController and SessionStore. No executor or recovery authority. */
export class NativeOperationJournal {
  private entries = new Map<string, NativeOperationAttempt>();
  private legacy = new Set<string>();

  restore(value: unknown, owner: { sessionId: string; sdkSessionId: string } | undefined, uncertain: ReadonlySet<string>, reviewed: ReadonlySet<string>): void {
    if (value === undefined) { this.legacy = new Set([...uncertain].filter(key => !reviewed.has(key))); return; }
    if (!object(value) || value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > LIMIT
      || !Array.isArray(value.legacyUncertain) || value.legacyUncertain.length > LIMIT || !value.legacyUncertain.every(hash)
      || new Set(value.legacyUncertain).size !== value.legacyUncertain.length) throw new Error('context_recovery_required: Corrupt operation journal');
    const entries = new Map<string, NativeOperationAttempt>(); const toolIds = new Set<string>();
    for (const item of value.entries) {
      if (!object(item) || !owner || item.sessionId !== owner.sessionId || item.sdkSessionId !== owner.sdkSessionId
        || !id(item.id) || !id(item.queryEpoch) || !Number.isSafeInteger(item.queryGeneration) || (item.queryGeneration as number) < 0
        || !text(item.scope) || !text(item.toolUseId) || !text(item.toolName) || !hash(item.actionHash) || !time(item.reservedAt)
        || entries.has(item.id) || toolIds.has(item.toolUseId)
        || !['reserved', 'returned', 'unresolved'].includes(item.status as string)
        || (item.status === 'reserved' ? item.outcome !== undefined || item.resultDigest !== undefined || item.returnedAt !== undefined
          : !hash(item.resultDigest) || !time(item.returnedAt) || (item.status === 'returned'
            ? !['success', 'bash-exit'].includes(item.outcome as string) || item.outcome === 'bash-exit' && item.toolName !== 'Bash'
            : item.outcome !== 'error'))) throw new Error('context_recovery_required: Invalid operation attempt');
      entries.set(item.id, structuredClone(item) as unknown as NativeOperationAttempt); toolIds.add(item.toolUseId);
    }
    const unresolved = new Set([...entries.values()].filter(item => item.status !== 'returned').map(item => item.actionHash));
    const legacy = new Set(value.legacyUncertain as string[]);
    if ([...unresolved, ...legacy].some(key => !uncertain.has(key))
      || [...uncertain].some(key => !reviewed.has(key) && !legacy.has(key) && !unresolved.has(key))) {
      throw new Error('context_recovery_required: Operation journal uncertainty mismatch');
    }
    this.entries = entries; this.legacy = legacy;
  }
  markLegacy(actionHash: string): void { this.legacy.add(actionHash); }
  hasUnresolved(actionHash: string): boolean { return [...this.entries.values()].some(a => a.actionHash === actionHash && a.status !== 'returned'); }
  isUncertain(actionHash: string): boolean { return this.legacy.has(actionHash) || this.hasUnresolved(actionHash); }
  hasToolId(toolUseId: string): boolean { return [...this.entries.values()].some(a => a.toolUseId === toolUseId); }
  reserve(source: Omit<NativeOperationAttempt, 'id' | 'reservedAt' | 'status'>): NativeOperationAttempt {
    if (this.entries.size >= LIMIT || this.hasToolId(source.toolUseId) || !text(source.toolUseId) || !text(source.toolName) || !text(source.scope)) {
      throw new Error('context_recovery_required: Operation reservation identity or capacity exhausted');
    }
    const attempt: NativeOperationAttempt = { ...source, id: randomUUID(), reservedAt: new Date().toISOString(), status: 'reserved' };
    this.entries.set(attempt.id, attempt); return attempt;
  }
  complete(attempt: NativeOperationAttempt, outcome: 'success' | 'bash-exit' | 'error', resultDigest: string): void {
    if (this.entries.get(attempt.id) !== attempt || attempt.status !== 'reserved') throw new Error('Operation attempt is not pending');
    attempt.status = outcome === 'error' ? 'unresolved' : 'returned';
    attempt.outcome = outcome; attempt.resultDigest = resultDigest; attempt.returnedAt = new Date().toISOString();
  }
  serialize(): NativeOperationJournalData {
    return { version: 1, legacyUncertain: [...this.legacy], entries: structuredClone([...this.entries.values()]) };
  }
  inspect() {
    return [...this.entries.values()].map(a => ({ attemptId: a.id, actionId: a.actionHash, status: a.status,
      outcome: a.outcome, reservedAt: a.reservedAt, returnedAt: a.returnedAt }));
  }
}
