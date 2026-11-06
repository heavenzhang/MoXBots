import { beforeEach, expect, it, vi } from 'vitest';
import type { importSessionToStore, SessionStoreEntry } from '@anthropic-ai/claude-agent-sdk';
import { readNativeRecoveryRecords } from './native-denial-review';
const sdk = vi.hoisted(() => ({ info: vi.fn(), records: [] as SessionStoreEntry[], import: vi.fn() }));
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ getSessionInfo: sdk.info, importSessionToStore: sdk.import }));
type Collector = Parameters<typeof importSessionToStore>[1];
const key = { projectKey: 'workspace', sessionId: 'native' };
beforeEach(() => {
  vi.clearAllMocks();
  sdk.info.mockResolvedValue({ sessionId: 'native', fileSize: 120 });
  sdk.records = [{ type: 'assistant', uuid: 'use', sessionId: 'native' }];
  sdk.import.mockImplementation(async (_id: string, store: Collector) => { await store.append(key, sdk.records); });
});
it('reads SDK-resolved native evidence when the listing summary is unavailable', async () => {
  sdk.info.mockResolvedValue(undefined);
  await expect(readNativeRecoveryRecords('native', '/workspace')).resolves.toEqual(sdk.records);
  expect(sdk.import).toHaveBeenCalledWith('native', expect.any(Object), { dir: '/workspace', includeSubagents: false, batchSize: 1 });
});
it('retains validated summary size preflight when summary exists', async () => {
  await expect(readNativeRecoveryRecords('native', '/workspace')).resolves.toEqual(sdk.records);
  expect(sdk.import).toHaveBeenCalledTimes(1);
});
it.each([
  { sessionId: 'foreign', fileSize: 120 }, { sessionId: 'native', fileSize: 64 * 1024 * 1024 + 1 },
  { sessionId: 'native', fileSize: -1 }, { sessionId: 'native', fileSize: NaN }, { sessionId: 'native' }, null,
])('refuses invalid available summary before importing (%j)', async info => {
  sdk.info.mockResolvedValue(info);
  await expect(readNativeRecoveryRecords('native')).rejects.toThrow('recovery_review_native_source_unavailable');
  expect(sdk.import).not.toHaveBeenCalled();
});
it.each([{...key, sessionId: 'foreign'}, {...key, subpath: 'subagents/child'}])('refuses foreign SDK collector scope even without summary (%j)', async scope => {
  sdk.info.mockResolvedValue(undefined);
  sdk.import.mockImplementation(async (_id: string, store: Collector) => { await store.append(scope, sdk.records); });
  await expect(readNativeRecoveryRecords('native')).rejects.toThrow('recovery_review_foreign_native_source');
});
it('does not turn a missing SDK session into empty evidence', async () => {
  sdk.info.mockResolvedValue(undefined); sdk.import.mockRejectedValue(new Error('Session not found'));
  await expect(readNativeRecoveryRecords('native')).rejects.toThrow('Session not found');
});
it('refuses an empty SDK import', async () => {
  sdk.records = [];
  await expect(readNativeRecoveryRecords('native')).rejects.toThrow('recovery_review_native_source_unavailable');
});
it('keeps the record cap cumulative without a summary', async () => {
  sdk.info.mockResolvedValue(undefined);
  sdk.import.mockImplementation(async (_id: string, store: Collector) => {
    await store.append(key, Array(25_000).fill({ type: 'progress' }));
    await store.append(key, Array(25_001).fill({ type: 'progress' }));
  });
  await expect(readNativeRecoveryRecords('native')).rejects.toThrow('recovery_review_native_source_oversized');
});
it('keeps the byte cap without a summary', async () => {
  sdk.info.mockResolvedValue(undefined); sdk.records = [{ type: 'progress', payload: 'x'.repeat(64 * 1024 * 1024) }];
  await expect(readNativeRecoveryRecords('native')).rejects.toThrow('recovery_review_native_source_oversized');
});
it('never permits the collector to restore or persist a Session', async () => {
  sdk.info.mockResolvedValue(undefined);
  sdk.import.mockImplementation(async (_id: string, store: Collector) => { await store.load(key); });
  await expect(readNativeRecoveryRecords('native')).rejects.toThrow('Recovery review cannot restore a Session');
});
