import { nativeRecoveryAncestry } from '../openai-bridge/native-recovery-ancestry';
import { getSessionMetadata } from '../SessionStore';
import { ContextRecoveryController, recoveryActionHash, recoveryEvidenceDigest } from '../openai-bridge/context-recovery';
import type { SessionTaskLedger } from '../../shared/sessionTaskOrchestration';
import { recoveryLedgerDigest, type RecoveryReviewDependencies } from './recovery-reconciliation';

interface ExecutionFailureReviewDependencies extends RecoveryReviewDependencies {
  observationDigest: (name: string, input: unknown, output?: unknown) => string;
  mutateLedger: (sessionId: string, mutation: (prior: SessionTaskLedger) => SessionTaskLedger,
    isCurrent: () => boolean) => Promise<SessionTaskLedger>;
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const resultText = (content: unknown): string | undefined => typeof content === 'string' ? content
  : Array.isArray(content) && content.length === 1 && object(content[0]) && content[0].type === 'text'
    && typeof content[0].text === 'string' ? content[0].text : undefined;

/** Repair only the execution projection of a durable, known process failure.
 * The action journal and its exact-command replay fence remain unchanged. */
export async function reconcileKnownExecutionFailures(deps: ExecutionFailureReviewDependencies): Promise<void> {
  if (!deps.isCurrent()) return;
  const taskLedger = getSessionMetadata(deps.owner.sessionId)?.taskOrchestration;
  const executionId = taskLedger?.execution?.id;
  const pending = taskLedger?.executionEvidence?.filter(fact => fact.pending && fact.mutating && fact.name === 'Bash');
  if (!executionId || !pending?.length) return;
  let verifiedRows: readonly unknown[] | undefined;
  let ledger = deps.load();
  if (ledger === undefined) return;
  if (deps.reconcileNativeFailures && deps.readNativeRecords) {
    const before = recoveryLedgerDigest(ledger);
    const [records, selected] = await Promise.all([deps.readNativeRecords(), deps.readNative()]);
    const current = () => deps.isCurrent() && recoveryLedgerDigest(deps.load()) === before
      && getSessionMetadata(deps.owner.sessionId)?.taskOrchestration?.execution?.id === executionId;
    if (!current()) return;
    await deps.reconcileNativeFailures(records, selected, current);
    verifiedRows = nativeRecoveryAncestry(records, selected, deps.owner.sdkSessionId);
    ledger = deps.load();
  }
  const ledgerDigest = recoveryLedgerDigest(ledger);
  const controller = new ContextRecoveryController({ initialLedger: ledger, recoveryOwner: deps.owner,
    scope: () => undefined, isActive: () => false, backup: async () => { throw new Error('Evidence review cannot execute'); } });
  const receipts = controller.inspectSettledBashFailures();
  if (!receipts.length) return;
  const rows = verifiedRows ?? await deps.readNative();
  const current = () => deps.isCurrent() && recoveryLedgerDigest(deps.load()) === ledgerDigest
    && getSessionMetadata(deps.owner.sessionId)?.taskOrchestration?.execution?.id === executionId;
  if (!current() || rows.length > 50_000) return;
  const uses = new Map<string, { name: string; input: unknown }[]>();
  const results = new Map<string, { failed: boolean; text: string | undefined }[]>();
  const uuids = new Set<string>();
  let blocks = 0;
  // The SDK selects the current branch. A physical history file alone never
  // authorizes this correction; duplicate/foreign rows also fail closed.
  for (const row of rows) {
    if (!object(row) || row.session_id !== deps.owner.sdkSessionId || typeof row.uuid !== 'string'
      || !row.uuid || uuids.has(row.uuid)) return;
    uuids.add(row.uuid);
    if (!object(row.message) || !Array.isArray(row.message.content)) continue;
    blocks += row.message.content.length;
    if (blocks > 200_000) return;
    for (const block of row.message.content) {
      if (!object(block)) continue;
      if (row.type === 'assistant' && block.type === 'tool_use' && typeof block.id === 'string'
        && typeof block.name === 'string' && object(block.input)) {
        const found = uses.get(block.id) ?? [];
        found.push({ name: block.name, input: block.input }); uses.set(block.id, found);
      } else if (row.type === 'user' && block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
        const found = results.get(block.tool_use_id) ?? [];
        found.push({ failed: block.is_error === true, text: resultText(block.content) }); results.set(block.tool_use_id, found);
      }
    }
  }
  const proven = pending.filter(fact => {
    const use = uses.get(fact.id); const result = results.get(fact.id);
    if (use?.length !== 1 || result?.length !== 1 || use[0].name !== 'Bash' || !result[0].failed || !result[0].text) return false;
    return deps.observationDigest(use[0].name, use[0].input, result[0].text) === fact.digest
      && receipts.filter(receipt => receipt.scope === fact.queueId && receipt.toolUseId === fact.id
        && receipt.actionHash === recoveryActionHash(use[0].name, use[0].input)
        && receipt.resultDigest === recoveryEvidenceDigest(result[0].text)).length === 1;
  });
  if (!proven.length || !current()) return;
  await deps.mutateLedger(deps.owner.sessionId, next => {
    if (!current()) return next;
    for (const fact of next.executionEvidence ?? []) {
      if (fact.pending && fact.mutating && !fact.successful && proven.some(proof => proof.id === fact.id
        && proof.queueId === fact.queueId && proof.name === fact.name && proof.digest === fact.digest)) {
        fact.pending = false;
        fact.settledFailure = 'native-bash-exit';
      }
    }
    if (next.execution?.reason === 'TOOL_OUTCOME_UNKNOWN'
      && !next.executionEvidence?.some(fact => fact.pending && fact.mutating)
      && !next.delegationClaims?.some(claim => claim.executionId === executionId && claim.state === 'unknown')) {
      next.execution.reason = 'turn_error';
    }
    return next;
  }, current);
}

/** Synchronize completion facts only from the existing durable, verified native receipt owner. */
export async function reconcileKnownExecutionCompletions(deps: ExecutionFailureReviewDependencies): Promise<void> {
  if (!deps.isCurrent()) return;
  const ledger = deps.load();
  if (!object(ledger)) return;
  const digest = recoveryLedgerDigest(ledger);
  const controller = new ContextRecoveryController({ initialLedger: ledger, recoveryOwner: deps.owner,
    scope: () => undefined, isActive: () => false, backup: async () => { throw new Error('Review cannot execute'); } });
  const receipts = controller.inspectNativeCompletionReceipts();
  if (!receipts.length) return;
  const executionId = getSessionMetadata(deps.owner.sessionId)?.taskOrchestration?.execution?.id;
  if (!executionId) return;
  const entries = object(ledger.operationAttempts) && Array.isArray(ledger.operationAttempts.entries)
    ? ledger.operationAttempts.entries as import('../openai-bridge/native-operation-journal').NativeOperationAttempt[] : [];
  const current = () => deps.isCurrent() && recoveryLedgerDigest(deps.load()) === digest
    && getSessionMetadata(deps.owner.sessionId)?.taskOrchestration?.execution?.id === executionId;
  await deps.mutateLedger(deps.owner.sessionId, next => {
    if (!current()) return next;
    for (const fact of next.executionEvidence ?? []) {
      if (!fact.pending || !fact.mutating) continue;
      const receipt = receipts.find(item => item.toolName === fact.name && item.completions.some(proof => proof.toolUseId === fact.id));
      if (!receipt) continue;
      const nativeAttempt = entries.find(item => item.toolUseId === fact.id && item.scope === fact.queueId
        && item.actionHash === receipt.actionHash && item.status === 'returned' && item.outcome === 'success');
      if (!nativeAttempt && fact.digest !== deps.observationDigest(receipt.toolName, receipt.input)) continue;
      fact.pending = false; fact.successful = true; fact.recovered = 'native-completion';
      // A recovered mutation is not a fresh verification and does not advance any watermark.
      fact.verificationEpoch = undefined;
    }
    return next;
  }, current);
}
