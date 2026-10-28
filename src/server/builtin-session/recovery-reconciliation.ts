import { createHash } from 'node:crypto';
import type { RecoveryActionRequest, RecoveryActionSnapshot } from '../../shared/recoveryReconciliation';
import { ContextRecoveryController, isBuiltinTaskQuery, recoveryActionHash, type ReadonlyTaskResolution } from '../openai-bridge/context-recovery';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const recoveryLedgerDigest = (ledger: unknown) => createHash('sha256').update(JSON.stringify(ledger)).digest('hex');
export interface RecoveryReviewOwner { sessionId: string; sdkSessionId: string; epoch: number; reviewAuthority: string }
export interface RecoveryReviewDependencies {
  owner: RecoveryReviewOwner;
  isCurrent: () => boolean;
  load: () => unknown;
  readNative: () => Promise<readonly unknown[]>;
  save: (ledger: unknown, expectedDigest: string, current: () => boolean) => Promise<void>;
  adopt: (receipt: ReadonlyTaskResolution) => void;
}

/** The SDK source supplies identity, never model text or a client-provided input. */
async function inspect(deps: RecoveryReviewDependencies) {
  if (!deps.isCurrent()) throw new Error('recovery_review_owner_changed');
  const ledger = deps.load();
  const empty: RecoveryActionSnapshot = { ...deps.owner, ledgerDigest: '', actions: [], resolvedCount: 0 };
  if (ledger === undefined) return { snapshot: empty, ledger, candidates: new Map<string, ReadonlyTaskResolution>() };
  const controller = new ContextRecoveryController({ initialLedger: ledger, recoveryOwner: deps.owner,
    scope: () => undefined, isActive: () => false, backup: async () => { throw new Error('Review cannot execute'); } });
  const state = controller.inspectActionLedger();
  if (state.blocked) throw new Error('recovery_review_ledger_blocked');
  const ledgerDigest = recoveryLedgerDigest(ledger);
  // SDK has a result limit; the engine also caps time. Never interpret truncation as absence of side effects.
  const rows = state.uncertainCount ? await deps.readNative() : [];
  if (!deps.isCurrent() || recoveryLedgerDigest(deps.load()) !== ledgerDigest || rows.length > 50_000) {
    throw new Error('recovery_review_changed_or_oversized');
  }
  const unknown = new Set(state.uncertainActions.map(action => action.actionId));
  const uses: { hash: string; name: string; input: Record<string, unknown>; uuid: string; id: string }[] = [];
  const toolIds = new Set<string>(); const duplicates = new Set<string>(); const seen = new Set<string>();
  let blocks = 0;
  for (const row of rows) {
    if (!object(row) || row.session_id !== deps.owner.sdkSessionId || typeof row.uuid !== 'string'
      || row.uuid.length === 0 || row.uuid.length > 512 || row.type !== 'assistant' || !object(row.message)
      || !Array.isArray(row.message.content)) continue;
    blocks += row.message.content.length;
    if (blocks > 200_000) throw new Error('recovery_review_oversized');
    for (const block of row.message.content) {
      if (!object(block) || block.type !== 'tool_use' || typeof block.name !== 'string'
        || typeof block.id !== 'string' || !block.id || block.id.length > 512 || !object(block.input)) continue;
      if (toolIds.has(block.id)) duplicates.add(block.id);
      toolIds.add(block.id);
      const hash = recoveryActionHash(block.name, block.input);
      if (!unknown.has(hash)) continue;
      seen.add(hash);
      uses.push({ hash, name: block.name, input: block.input, uuid: row.uuid, id: block.id });
    }
  }
  const candidates = new Map<string, ReadonlyTaskResolution>();
  for (const use of uses) {
    if (duplicates.has(use.id) || !isBuiltinTaskQuery(use.name, use.input)) continue;
    candidates.set(use.hash, { version: 1, kind: 'builtin-task-query-reviewed', ...deps.owner,
      actionHash: use.hash, toolName: use.name as 'TaskGet' | 'TaskList', input: structuredClone(use.input),
      sourceUseUuid: use.uuid, toolUseId: use.id, ledgerBeforeDigest: ledgerDigest, reviewedAt: new Date().toISOString() });
  }
  const snapshot: RecoveryActionSnapshot = { ...empty, ledgerDigest, resolvedCount: state.readonlyTaskReceiptCount,
    actions: state.uncertainActions.map(action => ({ actionHash: action.actionId,
      tool: candidates.get(action.actionId)?.toolName ?? 'Other', eligible: candidates.has(action.actionId),
      reason: candidates.has(action.actionId) ? 'builtin_task_query' : seen.has(action.actionId) ? 'external_receipt_required' : 'native_evidence_missing' })) };
  return { snapshot, ledger, candidates };
}

export async function inspectRecoveryActions(deps: RecoveryReviewDependencies): Promise<RecoveryActionSnapshot> {
  return (await inspect(deps)).snapshot;
}

/** Caller holds the existing Session mutation lock and native signed-request admission. */
export async function reconcileRecoveryAction(request: RecoveryActionRequest, deps: RecoveryReviewDependencies): Promise<RecoveryActionSnapshot> {
  const { snapshot, ledger, candidates } = await inspect(deps);
  if (!request || Object.keys(request).sort().join(',') !== 'actionHash,epoch,ledgerDigest,reviewAuthority,sdkSessionId,sessionId'
    || request.sessionId !== snapshot.sessionId || request.sdkSessionId !== snapshot.sdkSessionId
    || request.epoch !== snapshot.epoch || request.reviewAuthority !== snapshot.reviewAuthority
    || request.ledgerDigest !== snapshot.ledgerDigest || !deps.isCurrent()) throw new Error('recovery_review_stale_request');
  const receipt = candidates.get(request.actionHash);
  if (!receipt || !object(ledger)) throw new Error('recovery_review_unproven_action');
  const previous = (ledger.readonlyTasks ?? []) as ReadonlyTaskResolution[];
  if (previous.length >= 2048) throw new Error('recovery_review_capacity');
  // Preserve raw uncertain hashes. Older binaries ignore receipts and fail closed.
  const next = { ...ledger, readonlyTasks: [...previous, receipt] };
  await deps.save(next, snapshot.ledgerDigest, deps.isCurrent);
  if (!deps.isCurrent()) throw new Error('recovery_review_owner_changed');
  deps.adopt(receipt);
  return { ...snapshot, ledgerDigest: recoveryLedgerDigest(next), resolvedCount: previous.length + 1,
    actions: snapshot.actions.filter(action => action.actionHash !== receipt.actionHash) };
}
