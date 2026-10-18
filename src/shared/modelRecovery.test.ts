import { describe, expect, it } from 'vitest';
import { modelRecoveryDelay, validModelRecovery, type ModelRecoveryState } from './modelRecovery';

describe('persistent model recovery policy', () => {
  it('backs off finitely while honoring a longer upstream Retry-After', () => {
    expect([1, 2, 3, 4, 5, 6, 1000].map(value => modelRecoveryDelay(value)))
      .toEqual([15_000, 30_000, 60_000, 120_000, 240_000, 300_000, 300_000]);
    expect(modelRecoveryDelay(1, 900_000)).toBe(900_000);
    expect(modelRecoveryDelay(1, Number.NaN)).toBe(15_000);
  });
  it('rejects invalid identities, deadlines and unfinished future schema versions', () => {
    const state: ModelRecoveryState = { version: 1, id: 'epoch', sdkSessionId: 'native', routeIdentity: 'route',
      turnId: 'turn', status: 'waiting', attempt: 1, startedAt: 10, nextRetryAt: 20, deadlineAt: 30, lastStatus: 503 };
    expect(validModelRecovery(state)).toBe(true);
    for (const patch of [{ version: 2 }, { id: '' }, { nextRetryAt: 31 }, { deadlineAt: 10 }, { attempt: -1 }, { nextRetryAt: Number.NaN }]) {
      expect(validModelRecovery({ ...state, ...patch })).toBe(false);
    }
  });
});
