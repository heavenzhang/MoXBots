import { createHash, randomUUID } from 'node:crypto';

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
interface JournalEntries {
  legacyUncertain: string[];
  entries: NativeOperationAttempt[];
}
interface RetiredToolIdentities {
  sessionId: string;
  sdkSessionId: string;
  hashes: string[];
}
export type NativeOperationJournalData = JournalEntries & (
  { version: 1; retired?: never }
  | { version: 2; retired: RetiredToolIdentities }
);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 512;
const time = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v));
const LIMIT = 2048;
// Compact only settled receipts from retired Queries. Never evict an identity
// fence: at this separate bound the Session must remain fail-closed. This keeps
// ordinary repeated operations across Queries below SessionStore's 16 MiB cap.
export const MAX_RETIRED_TOOL_IDENTITIES = 65_536;
const identityHash = (toolUseId: string): string => createHash('sha256').update(toolUseId).digest('hex');

export class NativeOperationJournalCapacityError extends Error {
  readonly kind: 'query' | 'history';
  constructor(kind: 'query' | 'history') {
    super('context_recovery_required: Operation journal ' + kind + ' capacity exhausted');
    this.name = 'NativeOperationJournalCapacityError';
    this.kind = kind;
  }
}

/** Data owned/persisted by the existing ContextRecoveryController and SessionStore. No executor or recovery authority. */
export class NativeOperationJournal {
  private entries = new Map<string, NativeOperationAttempt>();
  private legacy = new Set<string>();
  private retiredOwner: { sessionId: string; sdkSessionId: string } | undefined;
  private retired = new Set<string>();

  restore(value: unknown, owner: { sessionId: string; sdkSessionId: string } | undefined, uncertain: ReadonlySet<string>, reviewed: ReadonlySet<string>): void {
    if (value === undefined) { this.legacy = new Set([...uncertain].filter(key => !reviewed.has(key))); return; }
    if (!object(value) || ![1, 2].includes(value.version as number) || !Array.isArray(value.entries) || value.entries.length > LIMIT
      || !Array.isArray(value.legacyUncertain) || value.legacyUncertain.length > LIMIT || !value.legacyUncertain.every(hash)
      || new Set(value.legacyUncertain).size !== value.legacyUncertain.length) throw new Error('context_recovery_required: Corrupt operation journal');
    let retiredOwner: typeof this.retiredOwner;
    let retired = new Set<string>();
    if (value.version === 1) {
      if (value.retired !== undefined) throw new Error('context_recovery_required: Unsupported retired operation identities');
    } else {
      const source = value.retired;
      if (!object(source) || !owner || source.sessionId !== owner.sessionId || source.sdkSessionId !== owner.sdkSessionId
        || !text(source.sessionId) || !text(source.sdkSessionId) || !Array.isArray(source.hashes)
        || source.hashes.length === 0 || source.hashes.length > MAX_RETIRED_TOOL_IDENTITIES || !source.hashes.every(hash)
        || new Set(source.hashes).size !== source.hashes.length) throw new Error('context_recovery_required: Invalid retired operation identities');
      retiredOwner = { ...owner };
      retired = new Set(source.hashes as string[]);
    }
    const entries = new Map<string, NativeOperationAttempt>(); const toolIds = new Set<string>();
    for (const item of value.entries) {
      if (!object(item) || !owner || item.sessionId !== owner.sessionId || item.sdkSessionId !== owner.sdkSessionId
        || !id(item.id) || !id(item.queryEpoch) || !Number.isSafeInteger(item.queryGeneration) || (item.queryGeneration as number) < 0
        || !text(item.scope) || !text(item.toolUseId) || !text(item.toolName) || !hash(item.actionHash) || !time(item.reservedAt)
        || entries.has(item.id) || toolIds.has(item.toolUseId) || retired.has(identityHash(item.toolUseId as string))
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
    this.entries = entries; this.legacy = legacy; this.retired = retired; this.retiredOwner = retiredOwner;
  }
  reviewLegacy(actionHash: string): void {
    if (this.hasUnresolved(actionHash)) throw new Error('context_recovery_required: Cannot review a pending native attempt');
    this.legacy.delete(actionHash);
  }
  markLegacy(actionHash: string): void { this.legacy.add(actionHash); }
  hasUnresolved(actionHash: string): boolean { return [...this.entries.values()].some(a => a.actionHash === actionHash && a.status !== 'returned'); }
  hasReturnedAction(toolUseId: string, actionHash: string): boolean {
    return [...this.entries.values()].some(a => a.toolUseId === toolUseId && a.actionHash === actionHash && a.status === 'returned');
  }
  isUncertain(actionHash: string): boolean { return this.legacy.has(actionHash) || this.hasUnresolved(actionHash); }
  hasToolId(toolUseId: string): boolean {
    return this.retired.has(identityHash(toolUseId)) || [...this.entries.values()].some(a => a.toolUseId === toolUseId);
  }
  reserve(source: Omit<NativeOperationAttempt, 'id' | 'reservedAt' | 'status'>): NativeOperationAttempt {
    if (!text(source.toolUseId) || !text(source.toolName) || !text(source.scope) || this.hasToolId(source.toolUseId)
      || this.retiredOwner && (source.sessionId !== this.retiredOwner.sessionId || source.sdkSessionId !== this.retiredOwner.sdkSessionId)) {
      throw new Error('context_recovery_required: Operation reservation identity or capacity exhausted');
    }
    if (this.entries.size >= LIMIT) {
      const settled = [...this.entries.values()].find(a => a.status === 'returned' && a.queryEpoch !== source.queryEpoch
        && a.sessionId === source.sessionId && a.sdkSessionId === source.sdkSessionId);
      if (!settled) throw new NativeOperationJournalCapacityError('query');
      if (this.retired.size >= MAX_RETIRED_TOOL_IDENTITIES) throw new NativeOperationJournalCapacityError('history');
      this.retiredOwner = { sessionId: source.sessionId, sdkSessionId: source.sdkSessionId };
      this.retired.add(identityHash(settled.toolUseId));
      this.entries.delete(settled.id);
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
    const data = { legacyUncertain: [...this.legacy], entries: structuredClone([...this.entries.values()]) };
    // A journal-aware rollback reader must reject v2 instead of silently losing
    // retired replay fences. Uncompacted v1 records keep their original format.
    return this.retiredOwner
      ? { ...data, version: 2, retired: { ...this.retiredOwner, hashes: [...this.retired].sort() } }
      : { ...data, version: 1 };
  }
  inspect() {
    return [...this.entries.values()].map(a => ({ attemptId: a.id, actionId: a.actionHash, status: a.status,
      outcome: a.outcome, reservedAt: a.reservedAt, returnedAt: a.returnedAt }));
  }
}
