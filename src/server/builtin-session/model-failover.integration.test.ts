import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderEnv } from '../provider-types';

const fixture = vi.hoisted(() => ({ config: {} as Record<string, unknown>,
  providers: {} as Record<string, unknown>, envs: {} as Record<string, unknown> }));
vi.mock('../utils/admin-config', () => ({
  loadConfig: () => fixture.config,
  findEffectiveProvider: (id: string) => fixture.providers[id],
  getAllEffectiveProviders: () => Object.values(fixture.providers),
  getProviderSelectionError: () => null,
  resolveSubscriptionAuthKind: () => undefined,
  materializeProviderRouteEnv: (route: { providerId: string }) => fixture.envs[route.providerId],
}));
vi.mock('../utils/model-capabilities', () => ({ lookupModelCapability: () => undefined, lookupProviderModelContextLength: () => undefined }));
import { createSessionModelFailover, sessionApiFailoverEligible } from './model-failover';

describe('Session API failover authority', () => {
  const primary: ProviderEnv = { providerId: 'primary', apiKey: 'fixture-main', baseUrl: 'http://primary.test' };
  beforeEach(() => {
    fixture.config = { modelFailover: { enabled: true, backup: { providerId: 'backup', modelId: 'b' } } };
    fixture.providers = {
      primary: { id: 'primary', type: 'api', models: [{ model: 'a' }] },
      backup: { id: 'backup', type: 'api', models: [{ model: 'b' }] },
    };
    fixture.envs = { backup: { providerId: 'backup', baseUrl: 'http://backup.test', apiKey: 'fixture-backup' } };
  });
  const request = () => new Request('http://127.0.0.1/bridge/test/v1/messages', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'synthetic text' }], max_tokens: 10 }) });
  it.each(['off', 'auto-disabled', 'cross-tier', 'image', 'context', 'tool-protocol'])('refuses a backup with a visible reason for %s while preserving primary retries', async reason => {
    const settings = fixture.config.modelFailover as { enabled: boolean; mode?: string; allowCrossTier?: boolean; backup?: { providerId: string; modelId: string } };
    if (reason === 'off') settings.mode = 'off';
    if (reason === 'auto-disabled') { settings.mode = 'auto'; fixture.config.autoRouting = { enabled: false }; }
    if (reason === 'cross-tier') fixture.providers.backup = { id: 'backup', type: 'api', models: [{ model: 'b', tier: 'fast' }] };
    if (reason === 'context') fixture.providers.backup = { id: 'backup', type: 'api', models: [{ model: 'b', contextLength: 100 }] };
    if (reason === 'tool-protocol') fixture.providers.backup = { id: 'backup', type: 'api', models: [{ model: 'b', supportedProtocols: ['openai:responses'] }] };
    const unavailable = vi.fn();
    const switched = vi.fn();
    const controller = createSessionModelFailover({ retryDelaysMs: [0, 0, 0], current: () => ({ env: primary, model: 'a', turnId: 'root', contextTokens: reason === 'context' ? 500 : undefined }),
      isLive: () => true, onSwitch: switched, onUnavailable: unavailable, autoBackup: () => ({ providerId: 'backup', modelId: 'b' }) });
    const req = reason === 'image' || reason === 'tool-protocol' ? new Request('http://127.0.0.1/test', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: reason === 'image' ? [{ type: 'image', source: { type: 'base64', data: 'synthetic' } }] : 'text' }], ...(reason === 'tool-protocol' ? { tools: [{ name: 'fixture_tool' }] } : {}) }) }) : request();
    const execute = vi.fn(async target => new Response('{}', { status: target.providerId === 'primary' ? 503 : 200 }));
    expect((await controller.run(req, { providerId: 'primary', model: 'a', baseUrl: primary.baseUrl! }, execute)).status).toBe(503);
    expect(execute).toHaveBeenCalledTimes(4);
    expect(switched).not.toHaveBeenCalled();
    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(unavailable.mock.calls[0][0]).toBeTruthy();
  });

  it('permits an explicitly enabled cross-tier configured backup', async () => {
    fixture.config.modelFailover = { enabled: true, mode: 'specified', allowCrossTier: true, backup: { providerId: 'backup', modelId: 'b' } };
    fixture.providers.backup = { id: 'backup', type: 'api', models: [{ model: 'b', tier: 'fast' }] };
    const switched = vi.fn();
    const controller = createSessionModelFailover({ retryDelaysMs: [0, 0, 0], current: () => ({ env: primary, model: 'a', turnId: 'root' }), isLive: () => true, onSwitch: switched });
    expect((await controller.run(request(), { providerId: 'primary', model: 'a', baseUrl: primary.baseUrl! }, async target => new Response('{}', { status: target.providerId === 'primary' ? 503 : 200 }))).status).toBe(200);
    expect(switched).toHaveBeenCalledOnce();
  });

  it.each(['chat_completions', 'responses'] as const)('checks the actual OpenAI %s output cap instead of discarded SDK max_tokens', async upstreamFormat => {
    fixture.providers.backup = { id: 'backup', type: 'api', models: [{ model: 'b', contextLength: 64000 }] };
    fixture.envs.backup = { providerId: 'backup', baseUrl: 'http://backup.test', apiKey: 'fixture-backup',
      apiProtocol: 'openai', upstreamFormat, maxOutputTokens: 8000 };
    const switched = vi.fn();
    const controller = createSessionModelFailover({ retryDelaysMs: [0, 0, 0], current: () => ({ env: primary, model: 'a', turnId: 'root', contextTokens: 4000 }),
      isLive: () => true, onSwitch: switched });
    const req = new Request('http://127.0.0.1/test', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'text' }], max_tokens: 128000 }) });
    expect((await controller.run(req, { providerId: 'primary', baseUrl: primary.baseUrl! }, async target => new Response('{}', { status: target.providerId === 'primary' ? 503 : 200 }))).status).toBe(200);
    expect(switched).toHaveBeenCalledOnce();
  });

  it('uses current backup credentials, keeps the root scope across steering, and restores primary next turn', async () => {
    let source = 'root';
    const switched = vi.fn();
    const controller = createSessionModelFailover({ retryDelaysMs: [0, 0, 0], current: () => ({ env: primary, model: 'a', turnId: source }),
      isLive: () => true, onSwitch: switched });
    const keys: string[] = [];
    const execute = vi.fn(async (target) => { keys.push(target.apiKey); return new Response('{}', { status: target.providerId === 'primary' ? 503 : 200 }); });
    const upstream = { providerId: 'primary', baseUrl: primary.baseUrl!, apiKey: primary.apiKey!, model: 'a' };
    expect((await controller.run(request(), upstream, execute)).status).toBe(200);
    expect(keys).toEqual(['fixture-main', 'fixture-main', 'fixture-main', 'fixture-main', 'fixture-backup']);
    source = 'steering-input';
    fixture.envs.backup = { ...fixture.envs.backup as object, apiKey: 'rotated-fixture' };
    await controller.run(request(), upstream, execute);
    expect(keys.at(-1)).toBe('rotated-fixture');
    expect(switched).toHaveBeenCalledTimes(1);
    controller.endTurn();
    source = 'next-root';
    await controller.run(request(), upstream, execute);
    expect(keys.slice(-5)).toEqual(['fixture-main', 'fixture-main', 'fixture-main', 'fixture-main', 'rotated-fixture']);
    expect(switched).toHaveBeenCalledTimes(2);
    expect(fixture.config).toEqual({ modelFailover: { enabled: true, backup: { providerId: 'backup', modelId: 'b' } } });
  });
  it.each(['disabled', 'subscription', 'deleted-model', 'missing-key', 'same-pair', 'history-family', 'inactive'])('does not borrow credentials or switch for %s', async reason => {
    const settings = fixture.config.modelFailover as { enabled: boolean; backup: { providerId: string; modelId: string } };
    if (reason === 'disabled') settings.enabled = false;
    if (reason === 'subscription') fixture.providers.backup = { id: 'backup', type: 'subscription' };
    if (reason === 'deleted-model') fixture.providers.backup = { id: 'backup', type: 'api', models: [] };
    if (reason === 'missing-key') fixture.envs.backup = { providerId: 'backup', baseUrl: 'http://backup.test' };
    if (reason === 'same-pair') settings.backup = { providerId: 'primary', modelId: 'a' };
    if (reason === 'history-family') fixture.envs.backup = { providerId: 'backup', baseUrl: 'https://api.anthropic.com', apiKey: 'other' };
    const switched = vi.fn();
    const controller = createSessionModelFailover({ retryDelaysMs: [0, 0, 0], current: () => ({ env: primary, model: 'a', turnId: 'root' }),
      isLive: () => reason !== 'inactive', onSwitch: switched });
    const execute = vi.fn(async () => new Response('{}', { status: 503 }));
    expect((await controller.run(request(), { providerId: 'primary', baseUrl: primary.baseUrl! }, execute)).status).toBe(reason === 'inactive' ? 499 : 503);
    expect(execute).toHaveBeenCalledTimes(reason === 'inactive' ? 0 : 4);
    expect(switched).not.toHaveBeenCalled();
  });
  it('rejects managed or scoped credentials even when a matching API catalog entry exists', () => {
    expect(sessionApiFailoverEligible({ ...primary, credentialSource: { kind: 'managed-oauth', providerId: 'xai-sub' } })).toBe(false);
    expect(sessionApiFailoverEligible({ ...primary, providerId: 'cloud-session:private' })).toBe(false);
  });
  it.each(['disable', 'delete', 'key-revoked', 'replace-backup'])('does not fall back to primary after a pinned backup loses eligibility: %s', async reason => {
    const switched = vi.fn();
    const controller = createSessionModelFailover({ retryDelaysMs: [0, 0, 0], current: () => ({ env: primary, model: 'a', turnId: 'root' }),
      isLive: () => true, onSwitch: switched });
    const execute = vi.fn(async target => new Response('{}', { status: target.providerId === 'primary' ? 503 : 200 }));
    const upstream = { providerId: 'primary', baseUrl: primary.baseUrl! };
    await controller.run(request(), upstream, execute, 'first');
    expect(execute).toHaveBeenCalledTimes(5);
    if (reason === 'disable') fixture.config.modelFailover = { enabled: false };
    if (reason === 'delete') delete fixture.providers.backup;
    if (reason === 'key-revoked') delete fixture.envs.backup;
    if (reason === 'replace-backup') fixture.config.modelFailover = { enabled: true, backup: { providerId: 'primary', modelId: 'a' } };
    expect((await controller.run(request(), upstream, execute, 'next-inference')).status).toBe(409);
    expect(execute).toHaveBeenCalledTimes(5);
    expect(switched).toHaveBeenCalledTimes(1);
  });
  it('keeps the replay guard after settings are disabled mid-root', async () => {
    const controller = createSessionModelFailover({ retryDelaysMs: [0, 0, 0], current: () => ({ env: primary, model: 'a', turnId: 'root' }),
      isLive: () => true, onSwitch: vi.fn() });
    const execute = vi.fn(async () => new Response('{}'));
    const upstream = { providerId: 'primary', baseUrl: primary.baseUrl! };
    await controller.run(request(), upstream, execute, 'already-delivered');
    fixture.config.modelFailover = { enabled: false };
    expect((await controller.run(request(), upstream, execute, 'already-delivered')).status).toBe(409);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('does not start a new failover when background ownership becomes ambiguous', async () => {
    let canSwitch = true;
    const controller = createSessionModelFailover({ retryDelaysMs: [0, 0, 0], current: () => ({ env: primary, model: 'a', turnId: 'root' }),
      isLive: () => true, canSwitch: () => canSwitch, onSwitch: vi.fn() });
    const execute = vi.fn(async () => { canSwitch = false; return new Response('{}', { status: 503 }); });
    const upstream = { providerId: 'primary', baseUrl: primary.baseUrl! };
    expect((await controller.run(request(), upstream, execute, 'first')).status).toBe(503);
    const repeated = await controller.run(request(), upstream, execute, 'first');
    expect(repeated.status).toBe(503);
    expect(await repeated.json()).toMatchObject({ error: { code: 'automatic_replay_blocked' } });
    expect(execute).toHaveBeenCalledTimes(4);
  });
  it.each([false, true])('does not deliver late backup output after root cancellation (already pinned=%s)', async pinned => {
    let alive = true;
    let cancelOnBackup = !pinned;
    const controller = createSessionModelFailover({ retryDelaysMs: [0, 0, 0], current: () => ({ env: primary, model: 'a', turnId: 'root' }),
      isLive: () => alive, onSwitch: vi.fn() });
    const execute = vi.fn(async target => {
      if (target.providerId === 'primary') return new Response('{}', { status: 503 });
      if (cancelOnBackup) alive = false;
      return new Response('late unsafe tool output');
    });
    const upstream = { providerId: 'primary', baseUrl: primary.baseUrl! };
    if (pinned) { await controller.run(request(), upstream, execute, 'first'); cancelOnBackup = true; }
    const response = await controller.run(request(), upstream, execute, 'next');
    expect(response.status).toBe(499);
    expect(await response.text()).not.toContain('unsafe tool');
    expect(execute).toHaveBeenCalledTimes(pinned ? 6 : 5);
  });
  it('uses the auto-route backup when no failover backup is configured', async () => {
    fixture.config = {};
    const switched = vi.fn();
    const controller = createSessionModelFailover({ retryDelaysMs: [0, 0, 0], current: () => ({ env: primary, model: 'a', turnId: 'root' }),
      isLive: () => true, onSwitch: switched, autoBackup: () => ({ providerId: 'backup', modelId: 'b' }) });
    const execute = vi.fn(async target => new Response('{}', { status: target.providerId === 'primary' ? 503 : 200 }));
    expect((await controller.run(request(), { providerId: 'primary', baseUrl: primary.baseUrl! }, execute)).status).toBe(200);
    expect(switched).toHaveBeenCalledTimes(1);
  });
  it('an enabled user backup wins over the auto-route backup', async () => {
    fixture.providers.other = { id: 'other', type: 'api', models: [{ model: 'c' }] };
    fixture.envs.other = { providerId: 'other', baseUrl: 'http://other.test', apiKey: 'fixture-other' };
    const controller = createSessionModelFailover({ retryDelaysMs: [0, 0, 0], current: () => ({ env: primary, model: 'a', turnId: 'root' }),
      isLive: () => true, onSwitch: vi.fn(), autoBackup: () => ({ providerId: 'other', modelId: 'c' }) });
    const used: string[] = [];
    const execute = vi.fn(async target => { used.push(target.providerId); return new Response('{}', { status: target.providerId === 'primary' ? 503 : 200 }); });
    await controller.run(request(), { providerId: 'primary', baseUrl: primary.baseUrl! }, execute);
    expect(used.at(-1)).toBe('backup');
  });
  it('the auto-route backup still has to share provider history', async () => {
    fixture.config = {};
    fixture.envs.backup = { providerId: 'backup', baseUrl: 'https://api.anthropic.com', apiKey: 'other' };
    const switched = vi.fn();
    const controller = createSessionModelFailover({ retryDelaysMs: [0, 0, 0], current: () => ({ env: primary, model: 'a', turnId: 'root' }),
      isLive: () => true, onSwitch: switched, autoBackup: () => ({ providerId: 'backup', modelId: 'b' }) });
    const execute = vi.fn(async () => new Response('{}', { status: 503 }));
    expect((await controller.run(request(), { providerId: 'primary', baseUrl: primary.baseUrl! }, execute)).status).toBe(503);
    expect(switched).not.toHaveBeenCalled();
  });
});
