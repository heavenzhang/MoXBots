import { getSessionMetadata } from '../SessionStore';
import { ContextRecoveryController, recoveryActionHash, recoveryEvidenceDigest } from '../openai-bridge/context-recovery';
import { executionToolObservationDigest } from '../session-engine/session-execution';
import { mutateSessionTaskLedger } from '../session-engine/task-orchestration';
import { recoveryLedgerDigest, type RecoveryReviewDependencies } from './recovery-reconciliation';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const resultText = (content: unknown): string | undefined => typeof content === 'string' ? content
  : Array.isArray(content) && content.length === 1 && object(content[0]) && content[0].type === 'text'
    && typeof content[0].text === 'string' ? content[0].text : undefined;

/** Repair only the execution projection of a durable, known process failure.
 * The action journal and its exact-command replay fence remain unchanged. */
export async function reconcileKnownExecutionFailures(deps: RecoveryReviewDependencies): Promise<void> {
  if (!deps.isCurrent()) return;
  const taskLedger = getSessionMetadata(deps.owner.sessionId)?.taskOrchestration;
  const executionId = taskLedger?.execution?.id;
  const pending = taskLedger?.executionEvidence?.filter(fact => fact.pending && fact.mutating && fact.name === 'Bash');
  if (!executionId || !pending?.length) return;
  const ledger = deps.load();
  if (ledger === undefined) return;
  const ledgerDigest = recoveryLedgerDigest(ledger);
  const controller = new ContextRecoveryController({ initialLedger: ledger, recoveryOwner: deps.owner,
    scope: () => undefined, isActive: () => false, backup: async () => { throw new Error('Evidence review cannot execute'); } });
  const receipts = controller.inspectSettledBashFailures();
  if (!receipts.length) return;
  const rows = await deps.readNative();
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
    return executionToolObservationDigest(use[0].name, use[0].input, result[0].text) === fact.digest
      && receipts.filter(receipt => receipt.scope === fact.queueId && receipt.toolUseId === fact.id
        && receipt.actionHash === recoveryActionHash(use[0].name, use[0].input)
        && receipt.resultDigest === recoveryEvidenceDigest(result[0].text)).length === 1;
  });
  if (!proven.length || !current()) return;
  await mutateSessionTaskLedger(deps.owner.sessionId, next => {
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
