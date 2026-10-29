import { createHash, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { MAX_RETIRED_TOOL_IDENTITIES, NativeOperationJournal, NativeOperationJournalCapacityError } from './native-operation-journal';

const owner = { sessionId: 'product-session', sdkSessionId: 'sdk-session' };
const action = 'a'.repeat(64);
const result = 'b'.repeat(64);
const retiredEpoch = randomUUID();
const nextEpoch = randomUUID();
const identityHash = (value: string) => createHash('sha256').update(value).digest('hex');
function source(toolUseId: string, queryEpoch = retiredEpoch) {
  return { ...owner, queryEpoch, queryGeneration: 1, scope: 'owned-turn', toolUseId, toolName: 'Write', actionHash: action };
}
function fullJournal(pending = false) {
  const journal = new NativeOperationJournal();
  for (let i = 0; i < 2048; i++) {
    const attempt = journal.reserve(source('old-' + i));
    if (!pending) journal.complete(attempt, 'success', result);
  }
  return journal;
}

it('admits later Query work after successful lifetime saturation and retains old identities through cold restore', () => {
  const journal = fullJournal();
  const old = journal.serialize();
  expect(old.version).toBe(1);
  const restored = new NativeOperationJournal();
  restored.restore(old, owner, new Set(), new Set());
  const next = restored.reserve(source('new-work', nextEpoch));
  expect(restored.hasToolId('old-0')).toBe(true);
  expect(restored.hasToolId('new-work')).toBe(true);
  restored.complete(next, 'success', result);
  const saved = restored.serialize();
  expect(saved.version).toBe(2);
  expect(saved.entries).toHaveLength(2048);
  expect(saved.entries.every(a => a.status === 'returned')).toBe(true);
  expect(saved.retired).toEqual({ ...owner, hashes: [identityHash('old-0')] });
  const cold = new NativeOperationJournal();
  cold.restore(saved, owner, new Set(), new Set());
  expect(() => cold.reserve(source('old-0', randomUUID()))).toThrow('reservation identity');
  expect(cold.serialize()).toEqual(saved);
});

it('never compacts a reserved or unresolved operation, including an identical peer', () => {
  const journal = fullJournal();
  const saved = journal.serialize();
  saved.entries[0]!.status = 'reserved';
  delete saved.entries[0]!.outcome; delete saved.entries[0]!.resultDigest; delete saved.entries[0]!.returnedAt;
  saved.entries[1]!.status = 'unresolved'; saved.entries[1]!.outcome = 'error';
  const cold = new NativeOperationJournal();
  cold.restore(saved, owner, new Set([action]), new Set());
  const next = cold.reserve(source('known-later', nextEpoch));
  cold.complete(next, 'success', result);
  const after = cold.serialize();
  expect(after.entries.slice(0, 2)).toEqual(saved.entries.slice(0, 2));
  expect(cold.isUncertain(action)).toBe(true);
  expect(after.retired?.hashes).toEqual([identityHash('old-2')]);
});

it.each(['same-query', 'all-pending'] as const)('keeps the detailed cap fail-closed for %s', kind => {
  const journal = fullJournal(kind === 'all-pending');
  const before = journal.serialize();
  expect(() => journal.reserve(source('refused', kind === 'same-query' ? retiredEpoch : nextEpoch)))
    .toThrow(NativeOperationJournalCapacityError);
  expect(journal.serialize()).toEqual(before);
});

it('does not evict an old identity when the separate bounded tombstone history fills', () => {
  const data = fullJournal().serialize();
  const retired = { ...owner, hashes: Array.from({ length: MAX_RETIRED_TOOL_IDENTITIES }, (_, i) => i.toString(16).padStart(64, '0')) };
  const journal = new NativeOperationJournal();
  journal.restore({ ...data, version: 2, retired }, owner, new Set(), new Set());
  const before = journal.serialize();
  expect(() => journal.reserve(source('history-full', nextEpoch))).toThrow('history capacity exhausted');
  expect(journal.serialize()).toEqual(before);
});

it.each(['owner', 'duplicate', 'invalid', 'overlap', 'version', 'oversize'] as const)('rejects corrupt retired identities: %s', change => {
  const journal = fullJournal(); journal.reserve(source('new', nextEpoch));
  const data = journal.serialize();
  expect(data.version).toBe(2);
  if (data.version !== 2) throw new Error('Expected compacted fixture');
  if (change === 'owner') data.retired.sessionId = 'other-session';
  if (change === 'duplicate') data.retired.hashes.push(data.retired.hashes[0]!);
  if (change === 'invalid') data.retired.hashes[0] = 'not-a-digest';
  if (change === 'overlap') data.retired.hashes[0] = identityHash(data.entries[0]!.toolUseId);
  if (change === 'oversize') data.retired.hashes = Array.from({ length: MAX_RETIRED_TOOL_IDENTITIES + 1 }, (_, i) => i.toString(16).padStart(64, '0'));
  const value = change === 'version' ? { ...data, version: 1 } : data;
  expect(() => new NativeOperationJournal().restore(value, owner, new Set([action]), new Set()))
    .toThrow('context_recovery_required');
});

it('retains original schema1 and all legacy uncertainty when no receipt needs retirement', () => {
  const journal = new NativeOperationJournal();
  journal.restore(undefined, owner, new Set([action]), new Set());
  const a = journal.reserve(source('fresh'));
  journal.complete(a, 'success', result);
  expect(journal.isUncertain(action)).toBe(true);
  const data = journal.serialize();
  expect(data.version).toBe(1); expect(data).not.toHaveProperty('retired');
  const cold = new NativeOperationJournal();
  cold.restore(data, owner, new Set([action]), new Set());
  expect(cold.isUncertain(action)).toBe(true);
});
