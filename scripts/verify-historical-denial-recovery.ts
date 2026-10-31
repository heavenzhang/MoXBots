/** Read-only original-history probe. All reconciliation is confined to memory. */
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getSessionMessages } from '@anthropic-ai/claude-agent-sdk';
import { readNativeRecoveryRecords } from '../src/server/builtin-session/native-denial-review';
import { inspectRecoveryActions, reconcileRecoveryAction, recoveryLedgerDigest, type RecoveryReviewDependencies } from '../src/server/builtin-session/recovery-reconciliation';
import { ContextRecoveryController } from '../src/server/openai-bridge/context-recovery';
import { decodeTranscript } from '../src/server/session-transcript/codec';
import { ProductTranscriptContent } from '../src/server/session-transcript/content';
import { TranscriptWriter } from '../src/server/session-transcript/writer';
import { repairReviewedToolErrors } from '../src/server/builtin-session/recovery-tool-errors';

const args = process.argv.slice(2);
const arg = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const ledgerPath = arg('--ledger'); const dir = arg('--dir'); const checkpointPath = arg('--checkpoint');
const productPath = arg('--product');
if (!ledgerPath || !dir) throw new Error('Usage: --ledger FILE --dir WORKSPACE [--checkpoint FILE] [--product V2_FILE]');
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const before = await readFile(ledgerPath, 'utf8'); const beforeStat = await stat(ledgerPath);
const envelope = JSON.parse(before);
if (envelope.version !== 1 || envelope.digest !== recoveryLedgerDigest(envelope.ledger)) throw new Error('Invalid ledger envelope');
const owner = { sessionId: envelope.sessionId as string, sdkSessionId: envelope.sdkSessionId as string, epoch: 0, reviewAuthority: 'readonly-memory-probe' };
if (![owner.sessionId, owner.sdkSessionId].every(id => /^[a-zA-Z0-9-]{1,100}$/.test(id))) throw new Error('Invalid Session identity');
const rows = await getSessionMessages(owner.sdkSessionId, { dir, limit: 50_001 });
const records = await readNativeRecoveryRecords(owner.sdkSessionId, dir);
let ledger = structuredClone(envelope.ledger);
const productBefore = productPath ? await readFile(productPath, 'utf8') : undefined;
const productStat = productPath ? await stat(productPath) : undefined;
const decoded = productBefore ? decodeTranscript(productBefore, owner.sessionId) : undefined;
if (decoded && decoded.tail !== 'clean') throw new Error('Incomplete product history');
const productWriter = decoded ? new TranscriptWriter({ sessionId: owner.sessionId, generation: decoded.header.generation,
  revision: decoded.revision, projection: structuredClone(decoded.projection),
  storage: { append: async () => {}, replace: async () => { throw new Error('Probe cannot replace history'); } } }) : undefined;
const productContent = productWriter ? new ProductTranscriptContent(productWriter) : undefined;
const repairs = new Set<string>();
productWriter?.subscribeOperations(operation => {
  if (operation.kind !== 'block-update' || operation.target !== 'tool'
    || JSON.stringify(operation.details) !== '{"isError":true}') throw new Error('Unexpected product mutation');
  repairs.add(operation.messageId + ':' + operation.blockId);
});
let controller = new ContextRecoveryController({ initialLedger: ledger, recoveryOwner: owner,
  scope: () => 'probe-explicit-turn', isActive: () => true, backup: async () => { throw new Error('Probe cannot archive'); } });
const deps: RecoveryReviewDependencies = { owner, isCurrent: () => true, load: () => ledger,
  readNative: async () => rows, readNativeRecords: async () => records,
  save: async (value, expected, current) => {
    if (!current() || expected !== recoveryLedgerDigest(ledger)) throw new Error('Memory CAS refused');
    ledger = structuredClone(value);
  },
  adopt: receipt => receipt.kind === 'native-pre-tool-denied-reviewed'
    ? controller.adoptPreToolDenialResolution(receipt) : controller.adoptReadonlyTaskResolution(receipt),
  repairToolErrors: productContent ? evidence => repairReviewedToolErrors(productContent, evidence, () => true) : undefined,
};
const initial = await inspectRecoveryActions(deps);
let snapshot = initial;
while (snapshot.actions.some(action => action.eligible)) {
  const action = snapshot.actions.find(action => action.eligible)!;
  snapshot = await reconcileRecoveryAction({ ...owner, ledgerDigest: snapshot.ledgerDigest, actionHash: action.actionHash }, deps);
}
controller = new ContextRecoveryController({ initialLedger: ledger, recoveryOwner: owner,
  scope: () => 'probe-explicit-turn', isActive: () => true, backup: async () => { throw new Error('Probe cannot archive'); } });
let checkpoint: { restored: boolean; retryAllowed: boolean } | undefined;
if (checkpointPath) {
  const source = JSON.parse(await readFile(checkpointPath, 'utf8'));
  if (source.sessionId !== owner.sessionId || source.digest !== sha(JSON.stringify(source.request))) throw new Error('Invalid checkpoint');
  controller.restoreCheckpoint(source.request, checkpointPath, source.digest);
  checkpoint = { restored: true, retryAllowed: controller.canRetryInference() };
}
const afterStat = await stat(ledgerPath);
if (sha(await readFile(ledgerPath, 'utf8')) !== sha(before) || beforeStat.mtimeMs !== afterStat.mtimeMs) throw new Error('Original ledger changed during probe');
if (productPath && productBefore && (sha(await readFile(productPath, 'utf8')) !== sha(productBefore)
  || productStat!.mtimeMs !== (await stat(productPath)).mtimeMs)) throw new Error('Original product history changed during probe');
await productWriter?.close();
process.stdout.write(JSON.stringify({ mode: 'readonly_memory_reconciliation', liveMutation: false, executedTools: 0,
  selectedRecords: rows.length, rawRecords: records.length, initial: initial.actions,
  resolvedCount: snapshot.resolvedCount, remaining: snapshot.actions, restoredUncertain: controller.inspectActionLedger().uncertainCount,
  originalLedgerUnchanged: true, checkpoint,
  ...(productPath ? { product: { metadataRepairsInMemory: repairs.size, originalUnchanged: true } } : {}) }, null, 2) + '\n');
