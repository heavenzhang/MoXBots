import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../shared/config-types';

const fixture = vi.hoisted(() => ({ config: {} as Record<string, unknown>, providers: [] as unknown[] }));
vi.mock('../utils/admin-config', () => ({
  loadConfig: () => fixture.config,
  getAllEffectiveProviders: () => fixture.providers,
  getProviderSelectionError: () => null,
  resolveSubscriptionAuthKind: () => undefined,
  materializeProviderRouteEnv: (ref: { providerId: string }) => ({ providerId: ref.providerId, apiKey: 'synthetic', baseUrl: 'http://fixture.invalid' }),
}));
vi.mock('../utils/model-capabilities', () => ({ lookupModelCapability: () => undefined, lookupProviderModelContextLength: () => undefined }));
import { routeTurn, buildAutoRouteCatalog } from './router';
import { AutoRoutePoolUnavailableError } from './errors';

describe('effective model policy route plan', () => {
  beforeEach(() => {
    fixture.config = {};
    fixture.providers = [{ id: 'p', name: 'Fixture', type: 'api', config: {}, models: [
      { model: 'primary', tier: 'balanced' }, { model: 'automatic', tier: 'balanced' },
      { model: 'specified', tier: 'balanced' }, { model: 'cross', tier: 'fast' },
    ] }];
  });
  const plan = async (modelFailover?: AppConfig['modelFailover']) => {
    fixture.config.modelFailover = modelFailover;
    return routeTurn({ text: 'synthetic', current: { providerId: 'p', model: 'primary' }, freshHistory: true }, {
      config: fixture.config,
      classifier: { classify: vi.fn(async () => ({ ok: true as const, tier: 'balanced' as const, latencyMs: 1, cached: false })), lastFailure: () => undefined, reset: vi.fn() },
    });
  };
  it('reports the specified candidate instead of the unused automatic candidate', async () => {
    const result = await plan({ enabled: true, mode: 'specified', backup: { providerId: 'p', modelId: 'specified' } });
    expect(result?.decision.backup?.model).toBe('automatic');
    expect(result?.failover).toEqual({ mode: 'specified', backup: { providerId: 'p', model: 'specified' } });
  });
  it('does not replace an invalid specified candidate with an automatic one', async () => {
    expect((await plan({ enabled: true, mode: 'specified', backup: { providerId: 'deleted', modelId: 'missing' } }))?.failover)
      .toEqual({ mode: 'specified', unavailableReason: 'unavailable' });
  });
  it('permits the specified cross-tier candidate only after explicit opt-in', async () => {
    const settings = { enabled: true, mode: 'specified' as const, backup: { providerId: 'p', modelId: 'cross' } };
    expect((await plan(settings))?.failover).toEqual({ mode: 'specified', unavailableReason: 'cross-tier' });
    expect((await plan({ ...settings, allowCrossTier: true }))?.failover?.backup).toEqual({ providerId: 'p', model: 'cross' });
  });
  it('off revokes only the backup plan and retains automatic primary selection', async () => {
    const result = await plan({ enabled: true, mode: 'off' });
    expect(result?.decision.target.model).toBe('primary');
    expect(result?.decision.backup).toBeUndefined();
    expect(result?.failover).toEqual({ mode: 'off', unavailableReason: 'off' });
  });
  it('uses only active explicit members for primary and automatic backup', async () => {
    fixture.config.autoRouting = { pool: { 'p/primary': { enabled: false }, 'p/automatic': { enabled: true }, 'p/specified': { enabled: true } } };
    const result = await plan();
    expect(result?.decision.target.model).toBe('automatic');
    expect(result?.decision.backup?.model).toBe('specified');
    expect(result?.decision.target.model).not.toBe('primary');
  });
  it('rejects an explicit empty or all-paused pool before contacting a classifier', async () => {
    for (const pool of [{}, { 'p/primary': { enabled: false } }]) {
      fixture.config.autoRouting = { pool };
      const classify = vi.fn();
      await expect(routeTurn({ text: 'synthetic', freshHistory: true }, { config: fixture.config,
        classifier: { classify, lastFailure: () => undefined, reset: vi.fn() } })).rejects.toBeInstanceOf(AutoRoutePoolUnavailableError);
      expect(classify).not.toHaveBeenCalled();
    }
  });
  it('does not call an excluded saved classifier or retain an excluded current model', async () => {
    fixture.config.autoRouting = { classifier: { providerId: 'p', model: 'cross' }, pool: { 'p/automatic': { enabled: true } } };
    const classify = vi.fn();
    const result = await routeTurn({ text: 'synthetic', current: { providerId: 'p', model: 'primary' }, freshHistory: true }, {
      config: fixture.config, classifier: { classify, lastFailure: () => undefined, reset: vi.fn() },
    });
    expect(classify).not.toHaveBeenCalled();
    expect(result?.classifier).toBeUndefined();
    expect(result?.decision).toMatchObject({ target: { model: 'automatic' }, reason: 'unavailable-fallback' });
  });
  it('keeps explicitly specified backup independent of automatic pool membership', async () => {
    fixture.config.autoRouting = { pool: { 'p/primary': { enabled: true } } };
    const result = await plan({ enabled: true, mode: 'specified', backup: { providerId: 'p', modelId: 'specified' } });
    expect(result?.failover?.backup?.model).toBe('specified');
    expect(result?.decision.backup).toBeUndefined();
  });
  it('retains unavailable saved membership and diagnoses excluded/new directory models', () => {
    fixture.config.autoRouting = { pool: { 'p/primary': { enabled: false }, 'deleted/old-model': { enabled: true } } };
    const catalog = buildAutoRouteCatalog(fixture.config);
    expect(catalog.models).toEqual(expect.arrayContaining([
      expect.objectContaining({ model: 'primary', inPool: true, enabled: false, available: true }),
      expect.objectContaining({ model: 'automatic', inPool: false, enabled: false, available: true }),
      expect.objectContaining({ model: 'old-model', inPool: true, available: false, unavailableReason: 'model-unavailable' }),
    ]));
    expect(Object.values(catalog.table).flat()).toHaveLength(0);
  });
  it('does not silently lose disabled-provider pool entries or route to them', () => {
    (fixture.providers[0] as { enabled: boolean }).enabled = false;
    fixture.config.autoRouting = { pool: { 'p/primary': { enabled: true } } };
    const catalog = buildAutoRouteCatalog(fixture.config);
    expect(catalog.models).toContainEqual(expect.objectContaining({ model: 'primary', inPool: true, available: false, unavailableReason: 'provider-disabled' }));
    expect(catalog.entries.size).toBe(0);
  });

});
