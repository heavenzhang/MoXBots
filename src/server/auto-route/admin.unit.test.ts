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
  it.each(['specified', 'off'])('explains actual %s policy rather than the automatic backup candidate', async mode => {
    fixture.result = { decision: { tier: 'balanced', target: { providerId: 'p', model: 'main' }, switches: false,
      reason: 'classified', backup: { providerId: 'p', model: 'unused-auto' } }, latencyMs: 1,
    failover: mode === 'specified' ? { mode, backup: { providerId: 'p', model: 'user-backup' } } : { mode, unavailableReason: 'off' } };
    const result = await handleRouteExplain({ prompt: 'synthetic' });
    expect(result).toMatchObject({ success: true, data: { failoverMode: mode } });
    const data = result.data as Record<string, unknown>;
    expect(data.backup).toBe(mode === 'specified' ? 'p/user-backup' : undefined);
    if (mode === 'off') expect(data.backupUnavailableReason).toBe('off');
  });
});
