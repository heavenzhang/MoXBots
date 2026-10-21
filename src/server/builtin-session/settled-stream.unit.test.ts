import { describe, expect, it, vi } from 'vitest';
import { SessionModelRecovery, settledStreamFailureMessage } from './model-recovery';
import { validModelRecovery, type ModelRecoveryState } from '../../shared/modelRecovery';

function fixture() {
  let state: ModelRecoveryState | undefined;
  let live = true;
  let proofLive = true;
  let now = 100_000;
  const prepare = vi.fn(async () => ({ id: 'proof-digest', interruptedAt: 90_000, archive: 'immutable-evidence', isCurrent: () => proofLive }));
  const write = vi.fn(async (next: ModelRecoveryState | undefined, expected: ModelRecoveryState | undefined, current: () => boolean) => {
    if (state !== expected || !current()) return false;
    state = next; return true;
  });
  const options = { read: () => state, write, current: () => ({ sdkSessionId: 'native', routeIdentity: 'route', turnId: 'root', goalId: 'goal' }),
    isLive: () => live, prepare: async () => {}, prepareSettledInterruption: prepare, now: () => now };
  return { create: () => new SessionModelRecovery(options), prepare, write, read: () => state,
    stop: () => { live = false; }, stale: () => { proofLive = false; }, tick: () => { now += 15_000; } };
}

describe('original owner settled-stream checkpoint', () => {
  it('durably arms without a fabricated Request and keeps earliest interruption/deadline', async () => {
    const h = fixture(); const recovery = h.create();
    expect(await recovery.armSettledInterruption()).toBe(true);
    expect(h.read()).toMatchObject({ version: 2, kind: 'stream', startedAt: 90_000, deadlineAt: 1_890_000,
      liveProof: { kind: 'settled-stream', receiptId: 'proof-digest' } });
    const first = h.read()!;
    expect(validModelRecovery(first)).toBe(true);
    expect(validModelRecovery({ ...first, version: 1 })).toBe(false);
    expect(validModelRecovery({ ...first, liveProof: undefined })).toBe(false);
    h.tick();
    expect(await recovery.armSettledInterruption()).toBe(true);
    expect(h.read()).toMatchObject({ id: first.id, startedAt: first.startedAt, deadlineAt: first.deadlineAt, attempt: 2 });
  });
  it('rejects the exact durable checkpoint in a new engine even on the same Goal/route', async () => {
    const h = fixture(); expect(await h.create().armSettledInterruption()).toBe(true);
    const restored = h.create();
    await expect(restored.admit(new Request('http://localhost/model'))).rejects.toThrow('live Query proof');
    expect(h.read()?.status).toBe('paused');
  });
  it('does not notify/arm after Stop across proof await', async () => {
    const h = fixture(); let release!: () => void;
    h.prepare.mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve; });
      return { id: 'proof-digest', interruptedAt: 90_000, archive: 'immutable-evidence', isCurrent: () => true }; });
    const recovery = h.create(); const pending = recovery.armSettledInterruption();
    await recovery.pause('user stopped'); release();
    expect(await pending).toBe(false); expect(h.read()).toBeUndefined();
  });
  it('rejects stale proof before checkpoint commit', async () => {
    const h = fixture(); h.stale(); expect(await h.create().armSettledInterruption()).toBe(false);
    expect(h.write).not.toHaveBeenCalled();
  });
  it('cannot replace a different live request or paused checkpoint', async () => {
    const h = fixture(); const recovery = h.create();
    const request = new Request('http://localhost/model');
    await recovery.wait(request, { status: 503, attempt: 1, usingBackup: false });
    expect(await recovery.armSettledInterruption()).toBe(false);
    await recovery.pause('user stopped');
    expect(await recovery.armSettledInterruption()).toBe(false);
  });
});


it('explains failure with fixed safe text and never interpolates an unknown code', () => {
  expect(settledStreamFailureMessage('history_uncertain')).toContain('历史工具结果仍不确定');
  expect(settledStreamFailureMessage('background_unsettled')).toContain('后台任务尚未获得精确终态');
  expect(settledStreamFailureMessage('storage_or_cas_failed')).toContain('未能耐久保存');
  expect(settledStreamFailureMessage('sensitive-request-body')).not.toContain('sensitive-request-body');
});
