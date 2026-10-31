import { getSessionInfo, importSessionToStore } from '@anthropic-ai/claude-agent-sdk';
import { recoveryActionHash, recoveryEvidenceDigest, type PreToolDenialResolution } from '../openai-bridge/context-recovery';

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 512;

/** SDK owns path resolution. The destination is a bounded memory collector, never a new writer. */
export async function readNativeRecoveryRecords(sdkSessionId: string, dir?: string): Promise<readonly unknown[]> {
  const info = await getSessionInfo(sdkSessionId, { dir });
  if (!info || info.sessionId !== sdkSessionId || !Number.isSafeInteger(info.fileSize)
    || info.fileSize! < 0 || info.fileSize! > 64 * 1024 * 1024) throw new Error('recovery_review_native_source_unavailable');
  const records: unknown[] = []; let bytes = 0;
  await importSessionToStore(sdkSessionId, {
    load: async () => { throw new Error('Recovery review cannot restore a Session'); },
    append: async (key, entries) => {
      if (key.sessionId !== sdkSessionId || key.subpath !== undefined) throw new Error('recovery_review_foreign_native_source');
      bytes += Buffer.byteLength(JSON.stringify(entries));
      if (records.length + entries.length > 50_000 || bytes > 64 * 1024 * 1024) throw new Error('recovery_review_native_source_oversized');
      records.push(...entries);
    },
  }, { dir, includeSubagents: false, batchSize: 100 });
  return records;
}

/** A physical receipt qualifies only when both exact records are in the SDK-selected chain. */
export function inspectNativePreToolDenials(records: readonly unknown[], selected: readonly unknown[], actionHash: string,
  owner: { sessionId: string; sdkSessionId: string }, ledgerBeforeDigest: string): PreToolDenialResolution | undefined {
  if (records.length > 50_000 || selected.length > 50_000) throw new Error('recovery_review_native_source_oversized');
  const selectedById = new Map<string, Record<string, unknown>>();
  for (const row of selected) {
    if (!object(row) || !id(row.uuid) || row.session_id !== owner.sdkSessionId || selectedById.has(row.uuid)) return;
    selectedById.set(row.uuid, row);
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
    if (blocks > 200_000) throw new Error('recovery_review_native_source_oversized');
    for (const block of row.message.content) {
      if (!object(block)) continue;
      if (block.type === 'tool_use' && id(block.id)) {
        if (toolIds.has(block.id)) return; toolIds.add(block.id);
        if (typeof block.name === 'string' && object(block.input) && recoveryActionHash(block.name, block.input) === actionHash) uses.push({ row, block });
      } else if (block.type === 'tool_result' && id(block.tool_use_id)) {
        const list = results.get(block.tool_use_id) ?? []; list.push({ row, block }); results.set(block.tool_use_id, list);
      }
    }
  }
  if (!uses.length || uses.length > 2048) return;
  const onChain = (row: Record<string, unknown>, type: string) => row.type === type && id(row.uuid)
    && row.sessionId === owner.sdkSessionId && row.isSidechain === false && !row.agentId && !row.teamName
    && selectedById.get(row.uuid)?.type === type
    && recoveryEvidenceDigest(selectedById.get(row.uuid)?.message) === recoveryEvidenceDigest(row.message);
  const denials: PreToolDenialResolution['denials'] = [];
  for (const use of uses) {
    const paired = results.get(use.block.id as string);
    if (!onChain(use.row, 'assistant') || paired?.length !== 1) return;
    const result = paired[0]!; const decision = result.row.permissionDecision;
    if (!onChain(result.row, 'user') || result.block.is_error !== true
      || !object(result.row.message) || !Array.isArray(result.row.message.content) || result.row.message.content.length !== 1
      || result.row.toolDenialKind !== 'permission-rule' || !object(decision)
      || decision.decision !== 'reject' || decision.source !== 'hook' || decision.reasonType !== 'hook'
      || result.row.parentUuid !== use.row.uuid || result.row.sourceToolAssistantUUID !== use.row.uuid) return;
    denials.push({ sourceUseUuid: use.row.uuid as string, sourceResultUuid: result.row.uuid as string,
      toolUseId: use.block.id as string, resultDigest: recoveryEvidenceDigest(result.block) });
  }
  return { version: 1, kind: 'native-pre-tool-denied-reviewed', ...owner, actionHash,
    toolName: uses[0]!.block.name as string, input: structuredClone(uses[0]!.block.input as Record<string, unknown>),
    denials, sourceSnapshotDigest: recoveryEvidenceDigest(records), ledgerBeforeDigest, reviewedAt: new Date().toISOString() };
}
