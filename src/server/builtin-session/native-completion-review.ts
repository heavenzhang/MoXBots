import { recoveryActionHash, recoveryEvidenceDigest, type NativeCompletionResolution } from '../openai-bridge/context-recovery';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 512;

/** Require the exact raw receipt AND SDK-selected root chain, including every same-input peer. */
export function inspectNativeCompletions(records: readonly unknown[], selected: readonly unknown[], actionHash: string,
  owner: { sessionId: string; sdkSessionId: string }, ledgerBeforeDigest: string): NativeCompletionResolution | undefined {
  if (records.length > 50_000 || selected.length > 50_000) return;
  const chain = new Map<string, Record<string, unknown>>();
  for (const row of selected) {
    if (!object(row) || !id(row.uuid) || row.session_id !== owner.sdkSessionId || chain.has(row.uuid)) return;
    chain.set(row.uuid, row);
  }
  const rawIds = new Set<string>(); const toolIds = new Set<string>();
  const uses: { row: Record<string, unknown>; block: Record<string, unknown> }[] = [];
  const results = new Map<string, { row: Record<string, unknown>; block: Record<string, unknown> }[]>();
  let blocks = 0;
  for (const row of records) {
    if (!object(row)) return;
    if (id(row.uuid)) { if (rawIds.has(row.uuid)) return; rawIds.add(row.uuid); }
    if (!object(row.message) || !Array.isArray(row.message.content)) continue;
    blocks += row.message.content.length;
    if (blocks > 200_000) return;
    for (const block of row.message.content) {
      if (!object(block)) continue;
      if (block.type === 'tool_use' && id(block.id)) {
        if (toolIds.has(block.id)) return; toolIds.add(block.id);
        if (typeof block.name === 'string' && object(block.input) && recoveryActionHash(block.name, block.input) === actionHash) uses.push({row, block});
      } else if (block.type === 'tool_result' && id(block.tool_use_id)) {
        const list = results.get(block.tool_use_id) ?? []; list.push({row, block}); results.set(block.tool_use_id, list);
      }
    }
  }
  if (!uses.length || uses.length > 2048) return;
  const onChain = (row: Record<string, unknown>, type: string) => id(row.uuid) && row.type === type
    && row.sessionId === owner.sdkSessionId && row.isSidechain === false && !row.agentId && !row.teamName
    && !chain.get(row.uuid)?.parent_tool_use_id && !chain.get(row.uuid)?.parent_agent_id
    && chain.get(row.uuid)?.type === type && recoveryEvidenceDigest(chain.get(row.uuid)?.message) === recoveryEvidenceDigest(row.message);
  const completions: NativeCompletionResolution['completions'] = [];
  for (const use of uses) {
    const pair = results.get(use.block.id as string);
    if (!onChain(use.row, 'assistant') || pair?.length !== 1) return;
    const result = pair[0];
    // Only explicit successful non-background terminal results qualify. A launch
    // acknowledgment, denied/error receipt, or empty output never proves completion.
    if (!onChain(result.row, 'user') || (result.block.is_error !== undefined && result.block.is_error !== false)
      || result.row.parentUuid !== use.row.uuid || result.row.sourceToolAssistantUUID !== use.row.uuid
      || !object(result.row.message) || !Array.isArray(result.row.message.content) || result.row.message.content.length !== 1
      || typeof result.block.content !== 'string' || !result.block.content || result.block.content.length > 1_048_576
      || use.block.name === 'Bash' && (object(use.block.input) && use.block.input.run_in_background === true
        || object(result.row.toolUseResult) && !!result.row.toolUseResult.backgroundTaskId)
      || !['Write', 'Edit', 'Bash'].includes(String(use.block.name))) return;
    completions.push({ toolUseId: use.block.id as string, sourceUseUuid: use.row.uuid as string,
      sourceResultUuid: result.row.uuid as string, resultDigest: recoveryEvidenceDigest(result.block.content) });
  }
  return { version: 1, kind: 'native-completion-reviewed', ...owner, actionHash,
    toolName: uses[0].block.name as string, input: structuredClone(uses[0].block.input as Record<string, unknown>),
    completions, sourceSnapshotDigest: recoveryEvidenceDigest(records), ledgerBeforeDigest, reviewedAt: new Date().toISOString() };
}
