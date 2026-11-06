const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Follow only ancestors of exact SDK-selected records. Compaction's native logical
 * parent preserves provenance; unrelated physical branches are never selected. */
export function nativeRecoveryAncestry(records: readonly unknown[], selected: readonly unknown[], sdkSessionId: string): readonly unknown[] | undefined {
  if (!selected.length || selected.length > 50_000 || records.length > 50_000) return;
  const raw = new Map<string, Record<string, unknown>>();
  for (const row of records) {
    if (!object(row)) return;
    if (typeof row.uuid !== 'string') continue;
    if (!row.uuid || raw.has(row.uuid)) return;
    raw.set(row.uuid, row);
  }
  const selectedIds = new Set<string>();
  for (const row of selected) {
    if (!object(row) || typeof row.uuid !== 'string' || selectedIds.has(row.uuid)
      || row.session_id !== sdkSessionId || row.parent_tool_use_id || row.parent_agent_id) return;
    const original = raw.get(row.uuid);
    if (!original || original.type !== row.type || JSON.stringify(original.message) !== JSON.stringify(row.message)) return;
    selectedIds.add(row.uuid);
  }
  const seen = new Set<string>(); const ancestry: unknown[] = [];
  // Preserved compaction segments can have multiple selected anchors. Follow
  // each exact SDK-selected record, never an arbitrary record in the file.
  for (const anchor of selectedIds) {
    let leaf: string = anchor; const walking = new Set<string>();
    while (leaf && !seen.has(leaf)) {
      if (walking.has(leaf)) return;
      walking.add(leaf);
      const row = raw.get(leaf);
      if (!row || row.sessionId !== sdkSessionId || row.isSidechain !== false || row.agentId || row.teamName) return;
      if (['user', 'assistant'].includes(String(row.type))) ancestry.push({ ...row, session_id: sdkSessionId });
      const parent = row.type === 'system' && row.subtype === 'compact_boundary' && row.parentUuid === null
        ? row.logicalParentUuid : row.parentUuid;
      if (parent === null) break;
      if (typeof parent !== 'string' || !parent) return;
      leaf = parent;
    }
    for (const id of walking) seen.add(id);
  }
  return ancestry;
}
