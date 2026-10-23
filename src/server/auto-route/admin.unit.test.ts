import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ result: {} as Record<string, unknown>, classifierMissing: false }));
vi.mock('../utils/admin-config', () => ({ loadConfig: () => ({}) }));
vi.mock('./router', () => ({
  buildAutoRouteCatalog: () => ({ settings: fixture.classifierMissing ? { classifier: { providerId: 'p', model: 'deleted' } } : {},
    table: { fast: [], balanced: [], strong: [] }, entries: new Map() }),
  resolveAutoRouteEnv: () => undefined,
  routeTurn: async () => fixture.result,
}));
import { handleRouteExplain, handleRouteTiers } from './admin';

describe('model policy diagnostics', () => {
  beforeEach(() => { fixture.classifierMissing = false; });
  it('marks an unavailable saved classifier without replacing its reference', () => {
    fixture.classifierMissing = true;
    expect(handleRouteTiers()).toMatchObject({ success: true, data: {
      classifier: { providerId: 'p', model: 'deleted', chosenBy: 'user', available: false, unavailableReason: 'unavailable' },
    } });
  });
  it.each([false, true])('explains the sole same-tier candidate plan (available=%s)', async available => {
    fixture.result = { decision: { tier: 'balanced', target: { providerId: 'p', model: 'main' }, switches: false,
      reason: 'classified', ...(available ? { backup: { providerId: 'p', model: 'next' } } : {}) }, latencyMs: 1 };
    const result = await handleRouteExplain({ prompt: 'synthetic' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.backup).toBe(available ? 'p/next' : undefined);
    expect(data.backupUnavailableReason).toBe(available ? undefined : 'no-candidate');
    expect(data).not.toHaveProperty('failoverMode');
  });
});
