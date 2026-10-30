import { expect, it } from 'vitest';
import { inspectNativePreToolDenials } from './native-denial-review';
import { ContextRecoveryController, recoveryActionHash, type RecoveryActionResolution } from '../openai-bridge/context-recovery';
import { inspectRecoveryActions, reconcileRecoveryAction, recoveryLedgerDigest, type RecoveryReviewDependencies } from './recovery-reconciliation';
import type { AnthropicRequest } from '../openai-bridge/types/anthropic';

const owner = { sessionId: 'product', sdkSessionId: 'native', epoch: 2, reviewAuthority: 'process' };
const input = { command: 'synthetic operation' }; const hash = recoveryActionHash('Bash', input);
function fixture() {
  const records: Record<string, unknown>[] = [
    { type: 'assistant', uuid: 'assistant-1', sessionId: 'native', isSidechain: false,
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 'old-tool', name: 'Bash', input }] } },
    { type: 'user', uuid: 'result-1', sessionId: 'native', isSidechain: false,
      parentUuid: 'assistant-1', sourceToolAssistantUUID: 'assistant-1', toolDenialKind: 'permission-rule',
      permissionDecision: { decision: 'reject', source: 'hook', reasonType: 'hook' },
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'old-tool', is_error: true, content: 'Synthetic denial' }] } },
  ];
  const selected = records.map(row => ({ type: row.type, uuid: row.uuid, session_id: 'native', message: row.message }));
  let ledger: Record<string, unknown> = { version: 1, completed: [], uncertain: [hash], denied: [], blocked: false,
    projectionActive: false, streamArmedOnly: true, operationAttempts: { version: 1, legacyUncertain: [hash], entries: [] } };
  const deps: RecoveryReviewDependencies = { owner, isCurrent: () => true, load: () => ledger,
    readNative: async () => selected, readNativeRecords: async () => records,
    save: async (value, expected, current) => {
      if (!current() || expected !== recoveryLedgerDigest(ledger)) throw new Error('CAS refused');
      ledger = value as typeof ledger;
    }, adopt: () => {} };
  return { records, selected, deps, ledger: () => ledger };
}

it('reviews the exact selected structured hook denial without inferring command semantics or success', async () => {
  const f = fixture(); let adopted: RecoveryActionResolution | undefined;
  f.deps.adopt = receipt => { adopted = receipt; };
  const first = await inspectRecoveryActions(f.deps);
  expect(first.actions).toEqual([{ actionHash: hash, tool: 'Bash', eligible: true, reason: 'native_hook_denied' }]);
  expect(JSON.stringify(first)).not.toContain(input.command);
  const repaired: string[] = []; f.deps.repairToolErrors = async ids => { repaired.push(...ids.map(item => item.toolUseId)); };
  const next = await reconcileRecoveryAction({ ...owner, ledgerDigest: first.ledgerDigest, actionHash: hash }, f.deps);
  expect(next.actions).toEqual([]); expect(next.resolvedCount).toBe(1);
  expect(repaired).toEqual(['old-tool']); expect(adopted?.kind).toBe('native-pre-tool-denied-reviewed');
  expect(f.ledger().uncertain).toEqual([hash]);
  expect(f.ledger().operationAttempts).toMatchObject({ legacyUncertain: [] });
  expect((await inspectRecoveryActions(f.deps)).actions).toEqual([]);
});

it.each(['text-only', 'source', 'decision', 'denial-kind', 'parent', 'source-assistant', 'sidechain', 'foreign', 'selected-missing',
  'selected-message', 'multiple-result-blocks', 'duplicate-uuid', 'duplicate-tool', 'duplicate-result', 'same-hash-unproved-peer'])('rejects incomplete or forged denial provenance: %s', mode => {
  const f = fixture(); const result = f.records[1]!;
  if (mode === 'text-only') delete result.permissionDecision;
  if (mode === 'source') (result.permissionDecision as Record<string, unknown>).source = 'model';
  if (mode === 'decision') (result.permissionDecision as Record<string, unknown>).decision = 'allow';
  if (mode === 'denial-kind') result.toolDenialKind = 'execution-error';
  if (mode === 'parent') result.parentUuid = 'other';
  if (mode === 'source-assistant') result.sourceToolAssistantUUID = 'other';
  if (mode === 'sidechain') result.isSidechain = true;
  if (mode === 'foreign') result.sessionId = 'foreign';
  if (mode === 'selected-missing') f.selected.pop();
  if (mode === 'selected-message') f.selected[1]!.message = { content: [] };
  if (mode === 'multiple-result-blocks') (result.message as { content: unknown[] }).content.push({ type: 'tool_result', tool_use_id: 'another', is_error: true, content: 'denial' });
  if (mode === 'duplicate-uuid') f.records.push(structuredClone(result));
  if (mode === 'duplicate-tool') f.records.push({ ...structuredClone(f.records[0]), uuid: 'duplicate' });
  if (mode === 'duplicate-result') f.records.push({ ...structuredClone(result), uuid: 'duplicate' });
  if (mode === 'same-hash-unproved-peer') {
    f.records.push({ ...structuredClone(f.records[0]), uuid: 'peer', message: { content: [{ type: 'tool_use', id: 'peer-tool', name: 'Bash', input }] } });
  }
  expect(inspectNativePreToolDenials(f.records, f.selected, hash, owner, 'a'.repeat(64))).toBeUndefined();
});

it.each(['success', 'error'])('admits a new exact-input tool ID after review and preserves a later %s independently across restart', async outcome => {
  const f = fixture(); const first = await inspectRecoveryActions(f.deps);
  await reconcileRecoveryAction({ ...owner, ledgerDigest: first.ledgerDigest, actionHash: hash }, f.deps);
  let saved = f.ledger();
  const make = () => {
    const context = new ContextRecoveryController({ initialLedger: saved, recoveryOwner: owner,
      scope: () => 'new-turn', isActive: () => true, protectStreaming: true,
      backup: async () => '/fixture/archive', persistLedger: async value => { saved = structuredClone(value) as typeof saved; } });
    context.bindNoDispatchOwner({ ...owner, queryGeneration: 3, isCurrent: () => true });
    return context;
  };
  const context = make();
  const body: AnthropicRequest = { model: 'fixture', max_tokens: 64, messages: [{ role: 'user', content: 'Explicitly continue' }] };
  await context.protectInference(body, true);
  expect(await context.authorizeTool('Bash', input, 'old-tool')).toContain('cannot be reused');
  expect(await context.authorizeTool('Bash', input, 'new-tool')).toBeUndefined();
  await context.commitToolResult('Bash', input, 'new result', outcome === 'error', 'new-tool', { interrupted: true });
  expect(context.inspectActionLedger().uncertainCount).toBe(outcome === 'error' ? 1 : 0);
  expect(make().inspectActionLedger().uncertainCount).toBe(outcome === 'error' ? 1 : 0);
});

it('uses exact old tool-result evidence during context analysis, preserving new tool errors with the same input', async () => {
  const f = fixture(); const first = await inspectRecoveryActions(f.deps);
  await reconcileRecoveryAction({ ...owner, ledgerDigest: first.ledgerDigest, actionHash: hash }, f.deps);
  const body = { model: 'fixture', max_tokens: 64, messages: f.records.map(row => row.message) } as AnthropicRequest;
  const make = () => new ContextRecoveryController({ initialLedger: f.ledger(), recoveryOwner: owner,
    scope: () => 'turn', isActive: () => true, backup: async () => '/fixture/archive', persistLedger: async () => {} });
  await expect(make().protectInference(body)).resolves.toBeUndefined();
  const changed = structuredClone(body);
  (changed.messages[0]!.content as { id: string }[])[0]!.id = 'new-tool';
  (changed.messages[1]!.content as { tool_use_id: string }[])[0]!.tool_use_id = 'new-tool';
  await expect(make().protectInference(changed)).rejects.toThrow('read-only reconciliation');
  const alteredResult = structuredClone(body);
  (alteredResult.messages[1]!.content as { content: string }[])[0]!.content = 'Different evidence';
  await expect(make().protectInference(alteredResult)).rejects.toThrow('read-only reconciliation');
});
