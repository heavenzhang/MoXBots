import { NativeOperationJournal } from '../openai-bridge/native-operation-journal';
import { createHash } from 'node:crypto';
import type { RecoveryActionSnapshot, RecoveryReviewAction, RecoveryResultCheck, RecoveryMutationRequest } from '../../shared/recoveryReconciliation';
import { recoveryAttention } from '../../shared/recoveryReconciliation';
import { ContextRecoveryController, isBuiltinTaskQuery, recoveryActionHash, type RecoveryActionResolution } from '../openai-bridge/context-recovery';
import { inspectNativeCompletions } from './native-completion-review';
import { inspectNativePreToolDenials } from './native-denial-review';
import type { SessionTaskLedger } from '../../shared/sessionTaskOrchestration';
import type { ReviewedToolError } from './recovery-tool-errors';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const recoveryLedgerDigest = (ledger: unknown) => createHash('sha256').update(JSON.stringify(ledger)).digest('hex');
export interface RecoveryReviewOwner { sessionId: string; sdkSessionId: string; epoch: number; reviewAuthority: string }
export interface RecoveryReviewDependencies {
  owner: RecoveryReviewOwner;
  canInvestigate?: () => boolean;
  startInvestigation?: () => Promise<void>;
  checkFile?: (name: string, input: Record<string, unknown>) => Promise<RecoveryResultCheck>;
  taskLedger?: () => SessionTaskLedger | undefined;
  mutateTaskLedger?: (mutation: (prior: SessionTaskLedger) => SessionTaskLedger, current: () => boolean) => Promise<void>;
  isCurrent: () => boolean;
  load: () => unknown;
  readNative: () => Promise<readonly unknown[]>;
  readNativeRecords?: () => Promise<readonly unknown[]>;
  save: (ledger: unknown, expectedDigest: string, current: () => boolean) => Promise<void>;
  adopt: (receipt: RecoveryActionResolution) => void;
  reconcileNativeFailures?: (records: readonly unknown[], selected: readonly unknown[], current: () => boolean) => Promise<void>;
  repairToolErrors?: (evidence: readonly ReviewedToolError[]) => Promise<void>;
}

/** Conservative description from the selected native chain, independent of eligibility. */
function describeAction(name: string, input: Record<string, unknown>): RecoveryReviewAction['presentation'] {
  const kinds = { Bash: 'command', Read: 'read_file', Write: 'write_file', Edit: 'edit_file',
    TaskGet: 'task_query', TaskList: 'task_query' } as const;
  const kind = Object.hasOwn(kinds, name) ? kinds[name as keyof typeof kinds] : 'tool';
  // Only a basename is projected; never publish shell bodies, arbitrary descriptions,
  // message content, URLs, environment variables or full user paths in this API.
  const basename = ['read_file', 'write_file', 'edit_file'].includes(kind) && typeof input.file_path === 'string'
    ? [...(input.file_path.split(/[\\/]/).pop() ?? '')].filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
      .join('').replace(/[\u202a-\u202e\u2066-\u2069]/g, '').slice(0, 160) : undefined;
  return { kind, ...(basename ? { target: basename } : {}) };
}

/** The SDK source supplies identity, never model text or a client-provided input. */
async function inspect(deps: RecoveryReviewDependencies) {
  if (!deps.isCurrent()) throw new Error('recovery_review_owner_changed');
  const ledger = deps.load();
  const empty: RecoveryActionSnapshot = { ...deps.owner, ledgerDigest: '', actions: [], resolvedCount: 0 };
  if (ledger === undefined) return { snapshot: empty, ledger, candidates: new Map<string, RecoveryActionResolution>(), verifiedDeniedTools: [] as ReviewedToolError[] };
  const controller = new ContextRecoveryController({ initialLedger: ledger, recoveryOwner: deps.owner,
    scope: () => undefined, isActive: () => false, backup: async () => { throw new Error('Review cannot execute'); } });
  const state = controller.inspectActionLedger();
  if (state.blocked) throw new Error('recovery_review_ledger_blocked');
  const ledgerDigest = recoveryLedgerDigest(ledger);
  // SDK has a result limit; the engine also caps time. Never interpret truncation as absence of side effects.
  const rows = state.uncertainCount ? await deps.readNative() : [];
  const records = state.uncertainCount && deps.readNativeRecords ? await deps.readNativeRecords() : [];
  if (!deps.isCurrent() || recoveryLedgerDigest(deps.load()) !== ledgerDigest || rows.length > 50_000) {
    throw new Error('recovery_review_changed_or_oversized');
  }
  const taskLedger = deps.taskLedger?.();
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
  const candidates = new Map<string, RecoveryActionResolution>();
  for (const use of uses) {
    if (duplicates.has(use.id) || !isBuiltinTaskQuery(use.name, use.input)) continue;
    candidates.set(use.hash, { version: 1, kind: 'builtin-task-query-reviewed', ...deps.owner,
      actionHash: use.hash, toolName: use.name as 'TaskGet' | 'TaskList', input: structuredClone(use.input),
      sourceUseUuid: use.uuid, toolUseId: use.id, ledgerBeforeDigest: ledgerDigest, reviewedAt: new Date().toISOString() });
  }
  for (const hash of unknown) {
    if (candidates.has(hash) || state.operationAttempts.some(attempt => attempt.actionId === hash && attempt.status !== 'returned')) continue;
    const receipt = inspectNativePreToolDenials(records, rows, hash, deps.owner, ledgerDigest);
    if (receipt) candidates.set(hash, receipt);
  }
  const completions = new Map<string, import('../openai-bridge/context-recovery').NativeCompletionResolution>();
  for (const hash of unknown) {
    if (candidates.has(hash)) continue;
    const receipt = inspectNativeCompletions(records, rows, hash, deps.owner, ledgerDigest);
    if (receipt && controller.canAdoptNativeCompletion(receipt)) { candidates.set(hash, receipt); completions.set(hash, receipt); }
  }
  const knownDenials = Array.isArray((ledger as Record<string, unknown>).nativeErrors)
    ? ((ledger as { nativeErrors: [unknown, { reason?: string; actionHash: string }][] }).nativeErrors)
      .filter(([, proof]) => proof.reason === 'pre-tool-denied').map(([, proof]) => proof.actionHash) : [];
  const denialHashes = new Set([...unknown, ...knownDenials]);
  const verifiedDeniedTools = [...denialHashes].flatMap(hash => {
    const receipt = inspectNativePreToolDenials(records, rows, hash, deps.owner, ledgerDigest);
    return receipt?.denials.map(item => ({ toolUseId: item.toolUseId, toolName: receipt.toolName, actionHash: receipt.actionHash })) ?? [];
  });
  const descriptions = new Map(uses.filter(use => !duplicates.has(use.id)).map(use => [use.hash, use]));
  const checks = new Map<string, RecoveryResultCheck>();
  let fileChecks = 0;
  for (const [hash, use] of descriptions) {
    if (deps.checkFile && use.name === 'Write' && !candidates.has(hash) && fileChecks++ < 20) {
      checks.set(hash, await deps.checkFile(use.name, use.input));
    }
  }
  if (!deps.isCurrent() || recoveryLedgerDigest(deps.load()) !== ledgerDigest) throw new Error('recovery_review_changed');
  const snapshot: RecoveryActionSnapshot = { ...empty, ledgerDigest, resolvedCount: state.readonlyTaskReceiptCount + state.preToolDenialReceiptCount + state.nativeCompletionReceiptCount,
    checkedAt: new Date().toISOString(), investigationAvailable: deps.canInvestigate?.() ?? false,
    actions: state.uncertainActions.map(action => {
      const use = descriptions.get(action.actionId);
      const name = use?.name ?? candidates.get(action.actionId)?.toolName;
      const toolUseIds = uses.filter(item => item.hash === action.actionId && !duplicates.has(item.id)).map(item => item.id);
      const bindings = [...new Set(toolUseIds.map(id => taskLedger?.bindings[id]).filter((id): id is string => !!id))];
      const task = bindings.length === 1 && toolUseIds.every(id => taskLedger?.bindings[id] === bindings[0]) ? taskLedger?.tasks.find(task => task.id === bindings[0] && !task.retired) : undefined;
      const blocked = new Set(task ? [task.id] : []);
      if (task) for (let i = 0; i < (taskLedger?.tasks.length ?? 0); i++) for (const item of taskLedger!.tasks) {
        if (item.blockedBy.some(id => blocked.has(id))) blocked.add(item.id);
      }
      return { actionHash: action.actionId, toolUseIds,
      ...(checks.has(action.actionId) ? { check: checks.get(action.actionId) } : {}),
      ...(completions.has(action.actionId) ? { check: { kind: 'native_success' as const } } : {}),
      followups: taskLedger?.recoveryFollowups?.filter(note => note.actionHash === action.actionId && note.sdkSessionId === deps.owner.sdkSessionId) ?? [],
      ...(task ? { association: { taskId: task.id, title: task.title, blockedTaskIds: [...blocked].filter(id => id !== task.id),
        blockedTasks: taskLedger!.tasks.filter(item => !item.retired && item.id !== task.id && blocked.has(item.id))
          .map(item => ({ taskId: item.id, title: item.title })) } } : {}),
      tool: (name && ['TaskGet', 'TaskList', 'Bash'].includes(name) ? name : 'Other') as RecoveryReviewAction['tool'],
      ...(use ? { presentation: describeAction(use.name, use.input) } : {}), eligible: candidates.has(action.actionId),
      reason: completions.has(action.actionId) ? 'native_success' : candidates.has(action.actionId) ? candidates.get(action.actionId)!.kind === 'native-pre-tool-denied-reviewed'
        ? 'native_hook_denied' : 'builtin_task_query' : seen.has(action.actionId) ? 'external_receipt_required' : 'native_evidence_missing' };
    }) };
  const affected = new Set(snapshot.actions.flatMap(action => action.association ? [action.association.taskId, ...action.association.blockedTaskIds] : []));
  snapshot.independentTasks = snapshot.actions.every(action => !!action.association)
    ? taskLedger?.tasks.filter(task => !task.retired && !affected.has(task.id)).map(task => ({taskId: task.id, title: task.title})) ?? [] : [];
  snapshot.reviewed = ['readonlyTasks', 'preToolDenials'].flatMap(field => Array.isArray((ledger as Record<string, unknown>)[field])
    ? ((ledger as Record<string, unknown>)[field] as RecoveryActionResolution[]).map(receipt => ({ actionHash: receipt.actionHash,
      tool: (['Bash','TaskGet','TaskList'].includes(receipt.toolName) ? receipt.toolName : 'Other') as RecoveryReviewAction['tool'],
      eligible: false, reason: (receipt.kind === 'native-pre-tool-denied-reviewed' ? 'native_hook_denied' : 'builtin_task_query') as RecoveryReviewAction['reason'],
      presentation: describeAction(receipt.toolName, receipt.input),
    })) : []);
  snapshot.completed = Array.isArray((ledger as Record<string, unknown>).nativeCompletions)
    ? ((ledger as { nativeCompletions: import('../openai-bridge/context-recovery').NativeCompletionResolution[] }).nativeCompletions).map(receipt => ({
      actionHash: receipt.actionHash, tool: ['Bash'].includes(receipt.toolName) ? 'Bash' : 'Other', eligible: false,
      reason: 'native_success', check: {kind: 'native_success'}, presentation: describeAction(receipt.toolName, receipt.input),
    })) : [];
  snapshot.attention = recoveryAttention(snapshot, taskLedger);
  return { snapshot, ledger, candidates, verifiedDeniedTools };
}

export async function inspectRecoveryActions(deps: RecoveryReviewDependencies): Promise<RecoveryActionSnapshot> {
  return (await inspect(deps)).snapshot;
}

/** Event-driven background proof collection under the existing Session lock.
 * Never dispatches a tool or starts an investigation during human admission. */
export async function reconcileAvailableRecoveryProof(deps: RecoveryReviewDependencies): Promise<void> {
  // One immutable native observation per Session-locked collection. Each
  // adoption still reloads the current ledger and checks owner/CAS. Re-reading
  // the complete history for every proven call would multiply the input gate's
  // bounded SDK IO by the number of receipts. This cache never crosses calls;
  // file checks and ledger reads deliberately remain fresh.
  let observed: Promise<[readonly unknown[], readonly unknown[]]> | undefined;
  const observe = () => observed ??= Promise.all([
    deps.readNative(), deps.readNativeRecords?.() ?? Promise.resolve([]),
  ]);
  const collection: RecoveryReviewDependencies = { ...deps,
    readNative: async () => (await observe())[0],
    ...(deps.readNativeRecords ? { readNativeRecords: async () => (await observe())[1] } : {}),
  };
  let snapshot = await inspectRecoveryActions(collection);
  const attempted = new Set<string>();
  while (snapshot.actions.some(action => action.eligible)) {
    const action = snapshot.actions.find(item => item.eligible)!;
    if (attempted.has(action.actionHash) || attempted.size >= 100) throw new Error('recovery_review_no_progress');
    attempted.add(action.actionHash);
    snapshot = await reconcileRecoveryAction({ sessionId: snapshot.sessionId, sdkSessionId: snapshot.sdkSessionId,
      epoch: snapshot.epoch, reviewAuthority: snapshot.reviewAuthority, ledgerDigest: snapshot.ledgerDigest,
      actionHash: action.actionHash }, collection);
  }
}

/** Caller holds the existing Session mutation lock and native signed-request admission. */
export async function reconcileRecoveryAction(request: RecoveryMutationRequest, deps: RecoveryReviewDependencies): Promise<RecoveryActionSnapshot> {
  const { snapshot, ledger, candidates, verifiedDeniedTools } = await inspect(deps);
  const control = 'kind' in request && request.kind === 'investigate';
  const followup = 'kind' in request && !control;
  if (!request || Object.keys(request).sort().join(',') !== (control ? 'actionHash,epoch,kind,ledgerDigest,reviewAuthority,sdkSessionId,sessionId' : followup ? 'actionHash,epoch,kind,ledgerDigest,requestId,reviewAuthority,sdkSessionId,sessionId,text' : 'actionHash,epoch,ledgerDigest,reviewAuthority,sdkSessionId,sessionId')
    || request.sessionId !== snapshot.sessionId || request.sdkSessionId !== snapshot.sdkSessionId
    || request.epoch !== snapshot.epoch || request.reviewAuthority !== snapshot.reviewAuthority
    || request.ledgerDigest !== snapshot.ledgerDigest || !deps.isCurrent()) throw new Error('recovery_review_stale_request');
  if (control) {
    if (!deps.startInvestigation || !deps.canInvestigate?.() || !snapshot.actions.some(action => action.actionHash === request.actionHash)) throw new Error('recovery_investigation_unavailable');
    await deps.startInvestigation();
    // The original execution owner is now running the investigation. Do not
    // present a stale user decision while its next turn is being scheduled.
    return { ...snapshot, investigationAvailable: false, attention: undefined };
  }
  if (followup && 'text' in request) {
    if (!['note', 'defer'].includes(request.kind) || typeof request.text !== 'string' || request.text.length > 4000
      || request.kind === 'note' && !request.text.trim() || !/^[a-f0-9-]{36}$/i.test(request.requestId)
      || !deps.mutateTaskLedger || !snapshot.actions.some(action => action.actionHash === request.actionHash)) throw new Error('recovery_followup_invalid');
    await deps.mutateTaskLedger(next => {
      const notes = next.recoveryFollowups ?? [];
      const existing = notes.find(note => note.requestId === request.requestId);
      if (existing) {
        if (existing.actionHash !== request.actionHash || existing.sdkSessionId !== request.sdkSessionId
          || existing.kind !== request.kind || existing.text !== request.text.trim()) throw new Error('recovery_followup_conflict');
        return next;
      }
      if (notes.length >= 256) throw new Error('recovery_followup_capacity');
      next.recoveryFollowups = [...notes, { actionHash: request.actionHash, sdkSessionId: request.sdkSessionId,
        requestId: request.requestId, kind: request.kind, text: request.text.trim(), createdAt: new Date().toISOString() }];
      return next;
    }, () => deps.isCurrent() && recoveryLedgerDigest(deps.load()) === snapshot.ledgerDigest);
    return inspectRecoveryActions(deps);
  }
  const receipt = candidates.get(request.actionHash);
  if (!receipt || !object(ledger)) throw new Error('recovery_review_unproven_action');
  const field = receipt.kind === 'native-completion-reviewed' ? 'nativeCompletions' : receipt.kind === 'native-pre-tool-denied-reviewed' ? 'preToolDenials' : 'readonlyTasks';
  const previous = (ledger[field] ?? []) as RecoveryActionResolution[];
  if (previous.length >= 2048) throw new Error('recovery_review_capacity');
  // Preserve raw uncertain hashes. Older binaries ignore receipts and fail closed.
  const next = { ...ledger, [field]: [...previous, receipt] };
  // The journal owns uncertainty per admission. Discharge only this legacy lead;
  // a later same-input reservation/error must become uncertain independently.
  if (receipt.kind === 'native-pre-tool-denied-reviewed' && object(next.operationAttempts)) {
    next.operationAttempts = { ...next.operationAttempts,
      legacyUncertain: (next.operationAttempts.legacyUncertain as string[]).filter(hash => hash !== receipt.actionHash) };
  }
  if (receipt.kind === 'native-completion-reviewed') {
    const journal = new NativeOperationJournal();
    journal.restore(ledger.operationAttempts, deps.owner, new Set(ledger.uncertain as string[]), new Set(['readonlyTasks', 'preToolDenials', 'nativeCompletions'].flatMap(field =>
      Array.isArray(ledger[field]) ? (ledger[field] as RecoveryActionResolution[]).map(item => item.actionHash) : [])));
    journal.reviewCompletion(receipt.actionHash, receipt.completions, receipt.reviewedAt);
    next.operationAttempts = journal.serialize();
    next.completed = [...(ledger.completed as [string, unknown][]).filter(([hash]) => hash !== receipt.actionHash),
      [receipt.actionHash, { result: { nativeCompletionConfirmed: true }, digest: receipt.sourceSnapshotDigest }]];
  }
  await deps.repairToolErrors?.(verifiedDeniedTools);
  if (!deps.isCurrent()) throw new Error('recovery_review_owner_changed');
  await deps.save(next, snapshot.ledgerDigest, deps.isCurrent);
  if (!deps.isCurrent()) throw new Error('recovery_review_owner_changed');
  deps.adopt(receipt);
  const result: RecoveryActionSnapshot = { ...snapshot, ledgerDigest: recoveryLedgerDigest(next), resolvedCount: snapshot.resolvedCount + 1,
    ...(receipt.kind !== 'native-completion-reviewed' ? { reviewed: [...(snapshot.reviewed ?? []), { ...snapshot.actions.find(action => action.actionHash === receipt.actionHash)!, eligible: false }] } : {}),
    ...(receipt.kind === 'native-completion-reviewed' ? { completed: [...(snapshot.completed ?? []), { ...snapshot.actions.find(action => action.actionHash === receipt.actionHash)!, eligible: false }] } : {}),
    actions: snapshot.actions.filter(action => action.actionHash !== receipt.actionHash) };
  result.attention = recoveryAttention(result, deps.taskLedger?.());
  return result;
}
