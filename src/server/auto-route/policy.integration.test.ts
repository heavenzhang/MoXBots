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
import { routeTurn } from './router';

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
});
