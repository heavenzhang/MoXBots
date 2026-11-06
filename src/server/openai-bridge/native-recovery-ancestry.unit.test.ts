import { expect, it } from 'vitest';
import { nativeRecoveryAncestry } from './native-recovery-ancestry';

function fixture() {
  const row = (uuid: string, parentUuid: string | null, extra = {}) => ({
    uuid, parentUuid, sessionId: 'native', isSidechain: false, type: 'user', message: { content: uuid }, ...extra,
  });
  const records: Record<string, unknown>[] = [row('start', null), row('result', 'start'),
    row('compact', null, { type: 'system', subtype: 'compact_boundary', logicalParentUuid: 'result' }),
    row('summary', 'compact'), row('preserved', 'start'), row('unrelated', null)];
  const select = (index: number) => ({ ...records[index], session_id: 'native' });
  return { records, selected: [select(3), select(4)] };
}

it('uses native compaction ancestry and preserved SDK segments, excluding unrelated physical branches', () => {
  const f = fixture();
  const found = nativeRecoveryAncestry(f.records, f.selected, 'native') as Record<string, unknown>[];
  expect(found.map(row => row.uuid).sort()).toEqual(['preserved', 'result', 'start', 'summary']);
});

it.each(['missing-parent', 'cycle', 'foreign-session', 'sidechain', 'duplicate-uuid', 'altered-selected', 'foreign-selected', 'duplicate-selected', 'agent', 'unknown-boundary'])(
  'rejects unsafe native provenance: %s', variant => {
    const f = fixture();
    if (variant === 'missing-parent') f.records[1].parentUuid = 'absent';
    if (variant === 'cycle') f.records[0].parentUuid = 'summary';
    if (variant === 'foreign-session') f.records[1].sessionId = 'foreign';
    if (variant === 'sidechain') f.records[1].isSidechain = true;
    if (variant === 'duplicate-uuid') f.records.push({ ...f.records[0] });
    if (variant === 'altered-selected') Object.assign(f.selected[0], { message: { content: 'changed' } });
    if (variant === 'foreign-selected') f.selected[0].session_id = 'foreign';
    if (variant === 'duplicate-selected') f.selected.push({ ...f.selected[0] });
    if (variant === 'agent') f.records[1].agentId = 'worker';
    if (variant === 'unknown-boundary') f.records[2].logicalParentUuid = undefined;
    expect(nativeRecoveryAncestry(f.records, f.selected, 'native')).toBeUndefined();
  });

it('requires a selected SDK anchor and bounds the input', () => {
  const f = fixture();
  expect(nativeRecoveryAncestry(f.records, [], 'native')).toBeUndefined();
  expect(nativeRecoveryAncestry(Array(50_001).fill({}), f.selected, 'native')).toBeUndefined();
});
