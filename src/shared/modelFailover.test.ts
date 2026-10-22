import { describe, expect, it } from 'vitest';
import { configuredBackupStatus, modelFailoverMode, type ModelFailoverSettings } from './modelFailover';

describe('model policy configuration authority', () => {
  it('retains legacy behavior while an explicit mode takes precedence', () => {
    expect(modelFailoverMode(undefined)).toBe('auto');
    expect(modelFailoverMode({ enabled: false })).toBe('auto');
    expect(modelFailoverMode({ enabled: true })).toBe('specified');
    expect(modelFailoverMode({ enabled: true, mode: 'off' })).toBe('off');
    expect(modelFailoverMode({ enabled: false, mode: 'specified' })).toBe('specified');
    expect(modelFailoverMode({ enabled: true, mode: 'auto' })).toBe('auto');
  });

  it.each(['not-configured', 'provider-unavailable', 'model-unavailable', 'missing-key', 'missing-endpoint', 'ready'] as const)(
    'reports configuration readiness precisely: %s', status => {
      const settings: ModelFailoverSettings = { enabled: true, backup: { providerId: 'p', modelId: 'm' } };
      const provider = { id: 'p', name: 'Fixture', type: 'api', enabled: true,
        config: { baseUrl: 'https://example.invalid' }, models: [{ model: 'm', modelName: 'Model' }] };
      if (status === 'not-configured') delete settings.backup;
      if (status === 'provider-unavailable') provider.enabled = false;
      if (status === 'model-unavailable') provider.models = [];
      if (status === 'missing-endpoint') provider.config.baseUrl = '  ';
      expect(configuredBackupStatus(settings, [provider], { p: status === 'missing-key' ? '  ' : 'synthetic' }).status).toBe(status);
    });
});
