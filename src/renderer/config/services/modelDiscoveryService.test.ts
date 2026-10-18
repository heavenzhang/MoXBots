import { describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { PRESET_PROVIDERS } from '../types';
import { fetchProviderModels, parseModelsResponse } from './modelDiscoveryService';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('OpenRouter account model discovery', () => {
  const provider = PRESET_PROVIDERS.find(candidate => candidate.id === 'openrouter')!;

  it('uses the authenticated account-filtered catalog instead of the global catalog', async () => {
    vi.mocked(invoke).mockResolvedValue({ data: [{ id: 'allowed/model' }] });
    const models = await fetchProviderModels(provider, 'test-account-key');
    expect(invoke).toHaveBeenLastCalledWith('cmd_fetch_provider_models', expect.objectContaining({
      url: 'https://openrouter.ai/api/v1/models/user',
      authHeaderName: 'Authorization', authHeaderValue: 'Bearer test-account-key',
    }));
    expect(models.map(model => model.id)).toEqual(['allowed/model']);
  });

  it.each(['https://openrouter.ai/api', 'https://openrouter.ai/api/v1/'])(
    'also uses the account catalog for a custom provider at %s', async baseUrl => {
      vi.mocked(invoke).mockResolvedValue({ data: [{ id: 'allowed/custom-model' }] });
      const custom = { id: 'custom-fixture', config: { baseUrl } };
      await fetchProviderModels(custom, 'custom-provider-key');
      expect(invoke).toHaveBeenLastCalledWith('cmd_fetch_provider_models', expect.objectContaining({
        providerId: custom.id, url: 'https://openrouter.ai/api/v1/models/user',
        authHeaderValue: 'Bearer custom-provider-key',
      }));
    },
  );

  it('preserves explicit catalogs and proxy hosts for custom providers', async () => {
    vi.mocked(invoke).mockResolvedValue({ data: [] });
    const custom = { id: 'custom-fixture', config: { baseUrl: 'https://openrouter.ai/api/v1' },
      modelListUrl: 'https://custom.invalid/account-models' };
    await fetchProviderModels(custom, 'custom-provider-key');
    expect(invoke).toHaveBeenLastCalledWith('cmd_fetch_provider_models', expect.objectContaining({ url: custom.modelListUrl }));
    await fetchProviderModels({ id: custom.id, config: { baseUrl: 'https://openrouter.ai.proxy.invalid/api/v1' } }, 'custom-provider-key');
    expect(invoke).toHaveBeenLastCalledWith('cmd_fetch_provider_models', expect.objectContaining({ url: 'https://openrouter.ai.proxy.invalid/api/v1/models' }));
    await fetchProviderModels({ id: custom.id, config: { baseUrl: 'https://openrouter.ai/custom/v1' } }, 'custom-provider-key');
    expect(invoke).toHaveBeenLastCalledWith('cmd_fetch_provider_models', expect.objectContaining({ url: 'https://openrouter.ai/custom/v1/models' }));
  });

  it('requires a key even though an unauthenticated catalog may return HTTP 200', async () => {
    vi.mocked(invoke).mockClear();
    await expect(fetchProviderModels(provider, undefined)).rejects.toThrow('API Key is required');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('preserves account-filtered empty responses and errors without falling back to the global catalog', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ data: [] });
    expect(await fetchProviderModels(provider, 'test-account-key')).toEqual([]);
    vi.mocked(invoke).mockRejectedValueOnce(new Error('HTTP 403'));
    await expect(fetchProviderModels(provider, 'test-account-key')).rejects.toThrow('HTTP 403');
  });
});

describe('model catalog response boundary', () => {
  it.each([
    undefined, null, 'upstream error', {}, { error: { message: 'rejected' } },
    { data: null }, { models: [{ name: 'unsupported-envelope' }] },
    { data: [{ name: 'missing-id' }] },
  ])('does not present a malformed or error response as an empty catalog: %j', body => {
    expect(() => parseModelsResponse(body)).toThrow(/model list/i);
  });

  it('accepts a genuinely empty OpenAI/Anthropic-compatible catalog', () => {
    expect(parseModelsResponse({ object: 'list', data: [] })).toEqual([]);
    expect(parseModelsResponse({ data: [], has_more: false })).toEqual([]);
  });

  it('parses each model independently instead of letting a malformed first row hide the list', () => {
    expect(parseModelsResponse({ data: [null, { name: 'invalid' }, { id: 'valid-model' }] }))
      .toEqual([expect.objectContaining({ id: 'valid-model' })]);
  });

  it.each([
    { input_modalities: {} },
    { input_modalities: 42 },
    { architecture: { input_modalities: true } },
  ])('keeps the catalog usable when a model has malformed optional capability fields: %j', metadata => {
    const models = parseModelsResponse({ data: [{ id: 'bad-metadata', ...metadata }, { id: 'valid-model' }] });
    expect(models.map(model => model.id)).toEqual(['bad-metadata', 'valid-model']);
    expect(models[0].supportsImage).toBeUndefined();
  });

  it('does not expose invalid optional display or token-limit values to the model UI/config', () => {
    const [model] = parseModelsResponse({ data: [{
      id: 'valid-model', display_name: {}, name: 'Fallback name', owned_by: [], status: {},
      token_limits: { context_window: 'not-a-number', max_output_token_length: {} },
      top_provider: { max_completion_tokens: [] },
    }] });
    expect(model).toMatchObject({ id: 'valid-model', displayName: 'Fallback name' });
    expect(model.ownedBy).toBeUndefined();
    expect(model.status).toBeUndefined();
    expect(model.contextLength).toBeUndefined();
    expect(model.maxOutputTokens).toBeUndefined();
  });

  it('preserves existing capability mapping and excludes shut-down models', () => {
    expect(parseModelsResponse({ data: [
      { id: 'retired', status: 'Shutdown' },
      { id: 'current', display_name: 'Current', max_input_tokens: 200000, max_tokens: 8192 },
    ] })).toEqual([expect.objectContaining({
      id: 'current', displayName: 'Current', contextLength: 200000, maxOutputTokens: 8192,
    })]);
    expect(parseModelsResponse({ data: [{ id: 'retired', status: 'Shutdown' }] })).toEqual([]);
  });

  it('reads OpenRouter architecture video and declared reasoning parameters', () => {
    expect(parseModelsResponse({ data: [{
      id: 'provider/visual-reasoner', architecture: { input_modalities: ['text', 'image', 'video'] },
      supported_parameters: ['tools', 'reasoning_effort'],
    }] })).toEqual([expect.objectContaining({ supportsImage: true, supportsVideo: true, supportsReasoning: true })]);
  });
});
