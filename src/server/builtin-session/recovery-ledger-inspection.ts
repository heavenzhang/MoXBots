import { createHash } from 'node:crypto';
import { ContextRecoveryController, recoveryActionHash } from '../openai-bridge/context-recovery';

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const builtins = new Set(['Bash', 'Read', 'Grep', 'Glob', 'Edit', 'Write', 'TaskGet', 'TaskList', 'TaskUpdate', 'TaskCreate', 'Agent', 'SendMessage']);
const category = (name: string) => builtins.has(name) ? name : name.startsWith('mcp__') ? 'MCP' : 'Other';
type ResultKind = 'success_recorded' | 'error_recorded' | 'missing_result' | 'ambiguous_records';

/** Physical native records are leads, not selected-chain or execution proof. Never writes a ledger. */
export function inspectRecoveryLedger(envelope: unknown, records: readonly unknown[]) {
  if (!object(envelope) || envelope.version !== 1 || typeof envelope.sessionId !== 'string'
    || typeof envelope.sdkSessionId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(envelope.sessionId)
    || !/^[a-zA-Z0-9-]{1,100}$/.test(envelope.sdkSessionId) || !object(envelope.ledger)
    || createHash('sha256').update(JSON.stringify(envelope.ledger)).digest('hex') !== envelope.digest) {
    throw new Error('Invalid ledger identity or integrity');
  }
  if (records.length > 100_000) throw new Error('Native record inspection limit exceeded');
  // Reuse the production schema/owner validation with an inert, non-writing controller.
  const controller = new ContextRecoveryController({ initialLedger: envelope.ledger,
    recoveryOwner: { sessionId: envelope.sessionId, sdkSessionId: envelope.sdkSessionId },
    scope: () => undefined, isActive: () => false,
    backup: async () => { throw new Error('Inspection cannot archive or execute'); },
  });
  const ledger = controller.inspectActionLedger();
  const unknown = new Set(ledger.uncertainActions.map(a => a.actionId));
  const uses = new Map<string, { actionId: string; tool: string }[]>();
  const results = new Map<string, ResultKind[]>();
  let foreignRecords = 0;
  let inspectedBlocks = 0;
  for (const row of records) {
    if (!object(row) || !object(row.message) || !Array.isArray(row.message.content)) continue;
    if ((row.sessionId ?? row.session_id) !== envelope.sdkSessionId
      || row.sessionId !== undefined && row.session_id !== undefined && row.sessionId !== row.session_id) {
      foreignRecords++; continue;
    }
    for (const block of row.message.content) {
      if (++inspectedBlocks > 200_000) throw new Error('Native block inspection limit exceeded');
      if (!object(block)) continue;
      if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string' && object(block.input)) {
        // Keep all IDs, including nonmatching uses: ID reuse must remain ambiguous.
        const actionId = recoveryActionHash(block.name, block.input);
        uses.set(block.id, [...(uses.get(block.id) ?? []), { actionId, tool: category(block.name) }]);
      } else if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
        const kind = block.is_error === true ? 'error_recorded'
          : block.is_error === undefined || block.is_error === false ? 'success_recorded' : 'ambiguous_records';
        results.set(block.tool_use_id, [...(results.get(block.tool_use_id) ?? []), kind]);
      }
    }
  }
  const matches = new Map<string, { tools: Set<string>; occurrences: number; results: Set<ResultKind> }>();
  for (const [id, calls] of uses) for (const call of calls) {
    if (!unknown.has(call.actionId)) continue;
    const row = matches.get(call.actionId) ?? { tools: new Set<string>(), occurrences: 0, results: new Set<ResultKind>() };
    row.tools.add(call.tool); row.occurrences++;
    const outcomes = results.get(id) ?? [];
    row.results.add(calls.length !== 1 || outcomes.length > 1 ? 'ambiguous_records' : outcomes[0] ?? 'missing_result');
    matches.set(call.actionId, row);
  }
  return {
    version: 1, kind: 'readonly_recovery_inspection', authorizesExecution: false,
    evidenceScope: 'physical_native_records_not_verified_selected_chain',
    sessionId: envelope.sessionId, sdkSessionId: envelope.sdkSessionId,
    ...ledger, inspectedRecords: records.length, foreignRecords,
    uncertainActions: ledger.uncertainActions.map(action => {
      const match = matches.get(action.actionId);
      return { ...action, tools: [...(match?.tools ?? [])].sort(), occurrences: match?.occurrences ?? 0,
        resultKinds: [...(match?.results ?? [])].sort(), nextStep: match ? 'verify_original_execution_and_business_receipt' : 'locate_original_evidence' };
    }),
  };
}
