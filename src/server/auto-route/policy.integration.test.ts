import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ config: {} as Record<string, unknown>, providers: [] as unknown[], unavailableProvider: '' }));
vi.mock('../utils/admin-config', () => ({
  loadConfig: () => fixture.config,
  getAllEffectiveProviders: () => fixture.providers,
  getProviderSelectionError: (provider: { id: string }) => {
    if (provider.id === fixture.unavailableProvider) throw new Error('Synthetic Host credential reference unavailable');
    return null;
  },
  resolveSubscriptionAuthKind: () => undefined,
  materializeProviderRouteEnv: (ref: { providerId: string }) => ({ providerId: ref.providerId, apiKey: 'synthetic', baseUrl: 'http://fixture.invalid' }),
}));
vi.mock('../utils/model-capabilities', () => ({ lookupModelCapability: () => undefined, lookupProviderModelContextLength: () => undefined }));
import { routeTurn, buildAutoRouteCatalog } from './router';
import { AutoRoutePoolUnavailableError } from './errors';

describe('effective model policy route plan', () => {
  beforeEach(() => {
    fixture.config = {};
    fixture.unavailableProvider = '';
    fixture.providers = [{ id: 'p', name: 'Fixture', type: 'api', config: {}, models: [
      { model: 'primary', tier: 'balanced' }, { model: 'automatic', tier: 'balanced' },
      { model: 'specified', tier: 'balanced' }, { model: 'cross', tier: 'fast' },
    ] }];
  });
  const plan = async (modelFailover?: unknown) => {
    fixture.config.modelFailover = modelFailover;
    return routeTurn({ text: 'synthetic', current: { providerId: 'p', model: 'primary' }, freshHistory: true }, {
      config: fixture.config,
      classifier: { classify: vi.fn(async () => ({ ok: true as const, tier: 'balanced' as const, latencyMs: 1, cached: false })), lastFailure: () => undefined, reset: vi.fn() },
    });
  };
  it('keeps an unavailable Host credential scoped to its provider without bypassing an explicit pool', async () => {
    fixture.providers.unshift({ id: 'unavailable', name: 'Unbound Host provider', type: 'api', config: {}, models: [{ model: 'blocked', tier: 'balanced' }] });
    fixture.unavailableProvider = 'unavailable';
    const catalog = buildAutoRouteCatalog(fixture.config);
    expect(catalog.models).toContainEqual(expect.objectContaining({ providerId: 'unavailable', model: 'blocked', available: false, unavailableReason: 'provider-unavailable' }));
    expect(catalog.entries.has('unavailable/blocked')).toBe(false);
    expect((await plan())?.decision.target.providerId).toBe('p');
    fixture.config.autoRouting = { pool: { 'unavailable/blocked': { enabled: true } } };
    await expect(plan()).rejects.toBeInstanceOf(AutoRoutePoolUnavailableError);
  });
  it.each([
    { enabled: true, mode: 'specified', backup: { providerId: 'p', modelId: 'specified' } },
    { enabled: true, mode: 'specified', backup: { providerId: 'deleted', modelId: 'missing' } },
    { enabled: true, mode: 'specified', allowCrossTier: true, backup: { providerId: 'p', modelId: 'cross' } },
    { enabled: true, mode: 'off' },
    { enabled: true, backup: { providerId: 'p', modelId: 'cross' } },
  ])('ignores retired backup configuration %j and selects the next same-tier pool member', async legacy => {
    const result = await plan(legacy);
    expect(result?.decision.target.model).toBe('primary');
    expect(result?.decision.backup).toMatchObject({ providerId: 'p', model: 'automatic', tier: 'balanced' });
    expect(result).not.toHaveProperty('failover');
    expect(fixture.config.modelFailover).toEqual(legacy);
  });
  it('skips a same-tier subscription candidate and chooses the next API candidate', async () => {
    fixture.providers.unshift({ id: 'subscription', name: 'Subscription', type: 'subscription', config: {}, models: [{ model: 'subscription-model', tier: 'balanced' }] });
    fixture.config.autoRouting = { tierOrder: { balanced: ['p/primary', 'subscription/subscription-model', 'p/automatic'] } };
    expect((await plan())?.decision.backup).toMatchObject({ providerId: 'p', model: 'automatic' });
  });
  it('does not advertise API takeover for a subscription primary', async () => {
    (fixture.providers[0] as { type: string }).type = 'subscription';
    expect((await plan())?.decision.backup).toBeUndefined();
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
  it('cannot use an out-of-pool legacy specified backup', async () => {
    fixture.config.autoRouting = { pool: { 'p/primary': { enabled: true } } };
    const result = await plan({ enabled: true, mode: 'specified', backup: { providerId: 'p', modelId: 'specified' } });
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
