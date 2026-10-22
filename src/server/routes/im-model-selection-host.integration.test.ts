/** Real config/menu resolution in a Host supervisor, without any worker secret. */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SessionMetadata } from '../types/session';
const state = vi.hoisted(() => ({ directory: '', metadata: null as SessionMetadata | null,
  update: vi.fn(), apply: vi.fn(), commit: vi.fn(), credential: vi.fn() }));
vi.mock('../utils/platform', async original => ({
  ...await original<typeof import('../utils/platform')>(), getHomeDirOrNull: () => state.directory,
}));
vi.mock('../utils/host-credentials', async original => {
  const actual = await original<typeof import('../utils/host-credentials')>();
  state.credential.mockImplementation(actual.resolveHostProviderCredential);
  return { ...actual, resolveHostProviderCredential: state.credential };
});
vi.mock('../SessionStore', () => ({ getSessionMetadata: () => state.metadata, updateSessionMetadata: state.update }));
vi.mock('../session-engine', () => ({ queryRuntimeModels: vi.fn(), getSessionEngine: () => ({
  getCurrentSessionContext: () => ({ sessionId: 'session' }), applyModelSelection: state.apply,
}) }));
vi.mock('../admin-api', () => ({ commitAgentModelSelection: state.commit }));
vi.mock('../sse', () => ({ broadcast: vi.fn() }));
import { findEffectiveProvider, getProviderHistorySelectionError, getProviderSelectionError, loadConfig, resolveProviderEnv, resolveProviderHistoryEnv, resolveWorkspaceConfig, resolveWorkspaceProviderHistoryEnv } from '../utils/admin-config';
import { handleImModelRoute, imSnapshotObservation } from './im-model-selection';
let model: string;
beforeEach(() => {
  state.directory = mkdtempSync(join(tmpdir(), 'host-model-menu-'));
  mkdirSync(join(state.directory, '.myagents'));
  vi.stubEnv('MYAGENTS_HOST_MODE', '1');
  model = String(findEffectiveProvider('moonshot-coding', {})!.primaryModel);
  const config = { providerApiKeys: { 'moonshot-coding': 'host-provider-credential:moonshot-coding' },
    agents: [{ id: 'agent', name: 'Fixture', enabled: true, runtime: 'builtin', providerId: 'moonshot-coding', model }] };
  writeFileSync(join(state.directory, '.myagents/config.json'), JSON.stringify(config));
  writeFileSync(join(state.directory, '.myagents/projects.json'), JSON.stringify([{ id: 'project', path: '/workspace', agentId: 'agent' }]));
  state.metadata = null;
  state.credential.mockClear(); state.update.mockClear(); state.apply.mockClear(); state.commit.mockClear();
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(state.directory, { recursive: true, force: true }); });
for (const frozen of [false, true]) it(`lists real models without worker credentials (${frozen ? 'frozen Session' : 'new Session'})`, async () => {
  if (frozen) state.metadata = { id: 'session', agentDir: '/workspace', configSnapshotAt: '2026-10-23T00:00:00Z',
    runtime: 'builtin', providerId: 'moonshot-coding', model,
    providerRoute: { kind: 'provider', providerId: 'moonshot-coding', model } } as SessionMetadata;
  const response = await handleImModelRoute('/api/im/model-options', new Request(
    `http://localhost/api/im/model-options?agentId=agent${frozen ? '&sessionId=session' : ''}`));
  expect(response!.status).toBe(200);
  const body = await response!.json();
  expect(body.options).toContainEqual(expect.objectContaining({ selection: { kind: 'product-provider', providerId: 'moonshot-coding', model }, requiresNewSession: false }));
  expect(JSON.stringify(body)).not.toMatch(/host-provider-credential|apiKey|credentialSource/);
  expect(state.credential).not.toHaveBeenCalled();
  expect(state.update).not.toHaveBeenCalled(); expect(state.apply).not.toHaveBeenCalled(); expect(state.commit).not.toHaveBeenCalled();
  // Real execution is still forbidden without the original worker snapshot.
  expect(() => resolveWorkspaceConfig('/workspace', state.metadata, { includeMcp: false })).toThrow('Host credential reference is unavailable');
});

it('plans a new Session without materializing credentials, but rejects actual apply before any write', async () => {
  const selection = { kind: 'product-provider', providerId: 'moonshot-coding', model };
  const planned = await handleImModelRoute('/api/im/model-options', new Request('http://localhost/api/im/model-options',
    { method: 'POST', body: JSON.stringify({ agentId: 'agent', selection }) }));
  expect(planned!.status).toBe(200); expect(state.credential).not.toHaveBeenCalled();
  state.metadata = { id: 'session', agentDir: '/workspace', configSnapshotAt: '2026-10-23T00:00:00Z',
    runtime: 'builtin', providerId: 'moonshot-coding', model,
    providerRoute: { kind: 'provider', providerId: 'moonshot-coding', model } } as SessionMetadata;
  const response = await handleImModelRoute('/api/im/model-selection', new Request('http://localhost/api/im/model-selection',
    { method: 'POST', body: JSON.stringify({ agentId: 'agent', sessionId: 'session',
      snapshotObservation: imSnapshotObservation(state.metadata), selection }) }));
  expect(response!.status).toBe(409); expect(state.credential).toHaveBeenCalled();
  expect(state.update).not.toHaveBeenCalled(); expect(state.apply).not.toHaveBeenCalled(); expect(state.commit).not.toHaveBeenCalled();
});
it('preserves canonical route precedence and strips legacy credential fields from history', () => {
  const config = loadConfig();
  const snapshot = { id: 'session', configSnapshotAt: 'frozen', providerId: 'moonshot-coding', model,
    providerRoute: { kind: 'provider', providerId: 'moonshot-coding', model },
    providerEnvJson: JSON.stringify({ baseUrl: 'https://legacy.example', apiKey: 'legacy-fixture-secret', authType: 'both', credentialSource: { token: 'legacy-token' } }) } as SessionMetadata;
  expect(resolveWorkspaceProviderHistoryEnv('/workspace', snapshot)).toEqual(resolveProviderHistoryEnv('moonshot-coding', config, model));
  const legacy = { ...snapshot, providerId: undefined, model: undefined, providerRoute: undefined };
  expect(resolveWorkspaceProviderHistoryEnv('/workspace', legacy)).toEqual({ providerId: undefined, baseUrl: 'https://legacy.example', apiProtocol: undefined });
  expect(state.credential).not.toHaveBeenCalled();
  config.disabledProviderIds = ['moonshot-coding'];
  writeFileSync(join(state.directory, '.myagents/config.json'), JSON.stringify(config));
  expect(resolveWorkspaceProviderHistoryEnv('/workspace', snapshot)).toBeUndefined();
  expect(resolveWorkspaceProviderHistoryEnv('/workspace', { ...snapshot, providerRoute: undefined })).toBeUndefined();
  // SDK-native subscription routes do not materialize an API transport.
  config.disabledProviderIds = [];
  writeFileSync(join(state.directory, '.myagents/config.json'), JSON.stringify(config));
  expect(resolveWorkspaceProviderHistoryEnv('/workspace', { ...snapshot, providerId: 'anthropic-sub', providerRoute: { kind: 'subscription', providerId: 'anthropic-sub', model } })).toBeUndefined();
});
it('checks configured references without weakening the original execution readiness', () => {
  const provider = findEffectiveProvider('moonshot-coding', {})!;
  const config = loadConfig();
  expect(getProviderHistorySelectionError(provider, config)).toBeNull();
  expect(() => getProviderSelectionError(provider, config)).toThrow('Host credential reference is unavailable');
  state.credential.mockClear();
  for (const value of ['', '  ', 'host-provider-credential:other', 'systemd-credential:../key']) {
    expect(getProviderHistorySelectionError(provider, { providerApiKeys: { 'moonshot-coding': value } })).not.toBeNull();
  }
  vi.stubEnv('MYAGENTS_HOST_MODE', '0');
  expect(getProviderHistorySelectionError(provider, config)).not.toBeNull();
  expect(state.credential).not.toHaveBeenCalled();
});
it('uses concrete per-model endpoints and keeps reserved cloud credentials private', () => {
  const config = { providerApiKeys: { 'opencode-go': 'controlled-fixture-key' } };
  const provider = findEffectiveProvider('opencode-go', config)!;
  const models = provider.models as { model: string }[];
  expect(models.length).toBeGreaterThan(1);
  for (const { model: concrete } of models) {
    const projected = resolveProviderHistoryEnv(provider.id, config, concrete);
    expect(state.credential).not.toHaveBeenCalled();
    const execution = resolveProviderEnv(provider.id, config, concrete)!;
    expect(projected).toEqual({ providerId: provider.id, baseUrl: execution.baseUrl, apiProtocol: execution.apiProtocol });
    state.credential.mockClear();
  }
  expect(resolveProviderHistoryEnv('cloud-session:fixture', config)).toBeUndefined();
  expect(() => resolveProviderEnv('cloud-session:fixture', config)).toThrow('BOT_MODEL_NOT_AUTHORIZED');
  expect(state.credential).not.toHaveBeenCalled();
});
