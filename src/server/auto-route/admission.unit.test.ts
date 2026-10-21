import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAutoTierTable, type AutoTierEntry } from '../../shared/autoRoute';
import type { MessageWire } from '../builtin-session/types';
import type { SessionMetadata } from '../types/session';
import { applyAutoRouteAdmission, autoRouteMessageText, previousTurn, type AutoRouteAdmissionDeps } from './admission';
import type { RouteTurnInput, RouteTurnResult } from './router';
import { getAutoRouteBackup, setAutoRouteSessionState } from './session-state';

const table = buildAutoTierTable([
  { providerId: 'p', model: 'claude-haiku-5-5' },
  { providerId: 'p', model: 'claude-sonnet-5-5' },
  { providerId: 'p', model: 'claude-opus-5-5' },
  { providerId: 'q', model: 'grok-4.7' },
]);
const entry = (model: string): AutoTierEntry => Object.values(table).flat().find(row => row.model === model)!;

function meta(overrides: Partial<SessionMetadata> = {}): SessionMetadata {
  return {
    id: 's1',
    agentDir: '/w',
    title: 't',
    createdAt: '2026-10-19T00:00:00.000Z',
    lastActiveAt: '2026-10-19T00:00:00.000Z',
    runtime: 'builtin',
    model: 'claude-sonnet-5-5',
    providerId: 'p',
    providerRoute: { kind: 'provider', providerId: 'p', model: 'claude-sonnet-5-5' },
    configSnapshotAt: '2026-10-19T00:00:00.000Z',
    ...overrides,
  } as SessionMetadata;
}

function result(model: string, overrides: Partial<RouteTurnResult['decision']> = {}, effort?: string): RouteTurnResult {
  const target = entry(model);
  return {
    decision: { tier: target.tier, target, reason: 'classified', switches: true, ...overrides },
    ...(effort ? { effort } : {}),
    classifier: { providerId: 'p', model: 'claude-haiku-5-5' },
    classify: { ok: true, tier: target.tier, cached: false, latencyMs: 400 },
    latencyMs: 420,
  };
}

function deps(overrides: Partial<AutoRouteAdmissionDeps> & { sessionMeta?: SessionMetadata | null } = {}) {
  let stored = overrides.sessionMeta === undefined ? meta() : overrides.sessionMeta;
  const base: AutoRouteAdmissionDeps = {
    getSessionMetadata: () => stored,
    isSessionBusy: () => false,
    getMessages: () => [],
    current: () => ({ providerId: 'p', model: 'claude-sonnet-5-5', env: { providerId: 'p', apiKey: 'k', baseUrl: 'http://p.test' } }),
    route: vi.fn(async () => result('claude-opus-5-5')),
    updateSessionMetadata: vi.fn(async (_id, updates, precondition) => {
      if (!stored || !precondition(stored)) return null;
      stored = { ...stored, ...updates } as SessionMetadata;
      return stored;
    }),
    broadcast: vi.fn(),
    trackDecision: vi.fn(),
    supportsImages: () => true,
    now: () => Date.parse('2026-10-19T08:00:00.000Z'),
  };
  return { ...base, ...overrides, stored: () => stored };
}

const input = { sessionId: 's1', text: '设计一个同步引擎', source: 'desktop' };

describe('applyAutoRouteAdmission', () => {
  beforeEach(() => setAutoRouteSessionState('s1', undefined));

  it.each(['manual', 'disabled', 'failed', 'thrown', 'conflict'])('revokes the previous automatic backup before an idle new turn: %s', async reason => {
    setAutoRouteSessionState('s1', { tier: 'strong', backup: { providerId: 'old', modelId: 'stale' } });
    const d = deps(reason === 'manual' ? { sessionMeta: meta({ modelMode: 'manual' }) }
      : reason === 'disabled' ? { route: vi.fn(async () => null) }
      : reason === 'thrown' ? { route: vi.fn(async () => { throw new Error('synthetic'); }) }
      : reason === 'failed' ? { route: vi.fn(async () => result('claude-opus-5-5', { reason: 'classifier-failed' })) }
      : { updateSessionMetadata: vi.fn(async () => null) });
    await applyAutoRouteAdmission({}, input, d);
    expect(getAutoRouteBackup('s1')).toBeUndefined();
    if (reason !== 'manual') expect(vi.mocked(d.route).mock.calls[0]?.[0].previousTier).toBe('strong');
  });

  it('keeps the admitted backup for busy messages and tool round trips', async () => {
    const backup = { providerId: 'old', modelId: 'retained' };
    setAutoRouteSessionState('s1', { tier: 'strong', backup });
    await applyAutoRouteAdmission({}, input, deps({ isSessionBusy: () => true }));
    expect(getAutoRouteBackup('s1')).toEqual(backup);
  });

  it('only lends an automatic backup to the admitted primary', () => {
    const backup = { providerId: 'q', modelId: 'candidate' };
    setAutoRouteSessionState('s1', { tier: 'balanced', primary: { providerId: 'p', model: 'admitted' }, backup });
    expect(getAutoRouteBackup('s1', { providerId: 'p', model: 'admitted' })).toEqual(backup);
    expect(getAutoRouteBackup('s1', { providerId: 'p', model: 'manual-pick' })).toBeUndefined();
    expect(getAutoRouteBackup('s1', { providerId: 'other', model: 'admitted' })).toBeUndefined();
  });

  it('does not install a same-model backup after a concurrent switch to manual', async () => {
    let manual = false;
    const d = deps({ route: vi.fn(async () => { manual = true; return result('claude-sonnet-5-5', { switches: false, backup: entry('grok-4.7') }); }) });
    const original = d.getSessionMetadata;
    d.getSessionMetadata = id => manual ? meta({ modelMode: 'manual' }) : original(id);
    expect(await applyAutoRouteAdmission({}, input, d)).toBeUndefined();
    expect(getAutoRouteBackup('s1')).toBeUndefined();
    expect(d.updateSessionMetadata).not.toHaveBeenCalled();
  });

  it('switches an idle auto Session, persists the snapshot and broadcasts', async () => {
    const d = deps({ route: vi.fn(async () => result('claude-opus-5-5', { backup: entry('grok-4.7') }, 'high')) });
    const request = { model: 'claude-sonnet-5-5', providerRoute: { kind: 'provider' as const, providerId: 'p', model: 'claude-sonnet-5-5' } };
    const record = await applyAutoRouteAdmission(request, input, d);

    expect(record).toMatchObject({ tier: 'strong', providerId: 'p', model: 'claude-opus-5-5', effort: 'high', reason: 'classified' });
    expect(JSON.stringify(record)).not.toContain('同步引擎');
    expect(request).toMatchObject({ model: 'claude-opus-5-5', providerRoute: { providerId: 'p', model: 'claude-opus-5-5' }, reasoningEffort: 'high' });
    expect(d.stored()).toMatchObject({ model: 'claude-opus-5-5', reasoningEffort: 'high', providerRoute: { model: 'claude-opus-5-5' } });
    expect(d.broadcast).toHaveBeenCalledWith('chat:session-config-changed', { sessionId: 's1' });
    expect(getAutoRouteBackup('s1')).toEqual({ providerId: 'q', modelId: 'grok-4.7' });
    const params = vi.mocked(d.trackDecision).mock.calls[0][0];
    expect(params).toMatchObject({ tier: 'strong', switches: true, source: 'desktop', classifier_ok: true });
    expect(Object.values(params).some(value => typeof value === 'string' && value.includes('同步引擎'))).toBe(false);
  });

  it('same tier keeps the live route: no snapshot write, no reload', async () => {
    const d = deps({ route: vi.fn(async () => result('claude-sonnet-5-5', { switches: false })) });
    const request: { model?: string; providerRoute?: unknown; providerEnv?: unknown } = {
      model: 'claude-sonnet-5-5', providerRoute: { kind: 'provider', providerId: 'p', model: 'claude-sonnet-5-5' },
    };
    const record = await applyAutoRouteAdmission(request as never, input, d);
    expect(record).toMatchObject({ model: 'claude-sonnet-5-5' });
    expect(request.providerRoute).toBeUndefined();
    expect(request.providerEnv).toBeUndefined();
    expect(d.updateSessionMetadata).not.toHaveBeenCalled();
    expect(d.broadcast).not.toHaveBeenCalled();
  });

  it('does not route a busy Session (queued, mid-turn, tool round trip)', async () => {
    const d = deps({ isSessionBusy: () => true });
    const request = { model: 'claude-sonnet-5-5' };
    expect(await applyAutoRouteAdmission(request, input, d)).toBeUndefined();
    expect(d.route).not.toHaveBeenCalled();
    expect(request).toEqual({ model: 'claude-sonnet-5-5' });
  });

  it('leaves manual, runtime-backed and non-builtin Sessions alone', async () => {
    for (const sessionMeta of [
      meta({ modelMode: 'manual' }),
      meta({ runtime: 'codex' as SessionMetadata['runtime'] }),
      meta({ providerExecutionIdentity: { providerId: 'codex-sub', model: 'gpt' } as SessionMetadata['providerExecutionIdentity'] }),
      null,
    ]) {
      const d = deps({ sessionMeta });
      expect(await applyAutoRouteAdmission({}, input, d)).toBeUndefined();
      expect(d.route).not.toHaveBeenCalled();
    }
  });

  it('a routing failure never blocks the turn', async () => {
    const thrown = deps({ route: vi.fn(async () => { throw new Error('boom'); }) });
    const request = { model: 'claude-sonnet-5-5' };
    expect(await applyAutoRouteAdmission(request, input, thrown)).toBeUndefined();
    expect(request).toEqual({ model: 'claude-sonnet-5-5' });
    const nothing = deps({ route: vi.fn(async () => null) });
    expect(await applyAutoRouteAdmission(request, input, nothing)).toBeUndefined();
    expect(request).toEqual({ model: 'claude-sonnet-5-5' });
  });

  it('a concurrent manual pick wins over the routed switch', async () => {
    const d = deps();
    vi.mocked(d.updateSessionMetadata).mockResolvedValueOnce(null);
    const request = { model: 'claude-sonnet-5-5' };
    expect(await applyAutoRouteAdmission(request, input, d)).toBeUndefined();
    expect(request).toEqual({ model: 'claude-sonnet-5-5' });
    expect(d.broadcast).not.toHaveBeenCalled();
  });

  it('feeds the previous turn, its tier, context use and image needs to the router', async () => {
    const messages = [
      { id: 'u1', role: 'user', content: '<system-reminder>ctx</system-reminder>\n重构登录模块', timestamp: '2026-10-19T07:58:00.000Z',
        metadata: { source: 'desktop', autoRoute: { tier: 'strong', providerId: 'p', model: 'claude-opus-5-5', reason: 'classified', latencyMs: 1, at: 'x' } } },
      { id: 'a1', role: 'assistant', content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: '已完成第一步' }], timestamp: '2026-10-19T07:59:00.000Z' },
    ] as MessageWire[];
    const route = vi.fn(async (_input: RouteTurnInput) => result('claude-opus-5-5'));
    const d = deps({
      getMessages: () => messages,
      route,
      sessionMeta: meta({ lastContextUsage: { contextTokens: 1, contextWindow: 2, usedPercent: 50 } as SessionMetadata['lastContextUsage'] }),
      supportsImages: model => model !== 'grok-4.7',
    });
    await applyAutoRouteAdmission({}, { ...input, text: '继续', hasImages: true }, d);
    const sent = route.mock.calls[0][0];
    expect(sent).toMatchObject({
      text: '继续', previousUser: '重构登录模块', previousReply: '已完成第一步', previousTier: 'strong',
      contextUsed: 0.5, freshHistory: false, lastTurnAt: Date.parse('2026-10-19T07:59:00.000Z'),
    });
    expect(sent.accept?.({ providerId: 'q', model: 'grok-4.7' })).toBe(false);
    expect(sent.accept?.({ providerId: 'p', model: 'claude-opus-5-5' })).toBe(true);
  });

  it('a failed classifier with no previous tier keeps the turn on its own model', async () => {
    const d = deps({ route: vi.fn(async () => result('claude-opus-5-5', { tier: undefined, reason: 'classifier-failed' })) });
    const request = { model: 'claude-sonnet-5-5' };
    expect(await applyAutoRouteAdmission(request, input, d)).toMatchObject({ model: 'claude-sonnet-5-5', unclassified: true, reason: 'classifier-failed' });
    expect(request).toEqual({ model: 'claude-sonnet-5-5' });
    expect(d.updateSessionMetadata).not.toHaveBeenCalled();
    expect(d.broadcast).not.toHaveBeenCalled();
  });

  it('skips reminder-only turns', async () => {
    const d = deps();
    expect(await applyAutoRouteAdmission({}, { ...input, text: '<system-reminder>goal</system-reminder>\n' }, d)).toBeUndefined();
    expect(d.route).not.toHaveBeenCalled();
  });
});

describe('message helpers', () => {
  it('reads visible text only', () => {
    expect(autoRouteMessageText('<system-reminder>a\nb</system-reminder>\nhello')).toBe('hello');
    expect(autoRouteMessageText([{ type: 'tool_use' }, { type: 'text', text: 'x' }])).toBe('x');
  });
  it('previousTurn skips diagnostics and empty users', () => {
    const turn = previousTurn([
      { id: '1', role: 'user', content: 'first', timestamp: '2026-10-19T00:00:00.000Z' },
      { id: '2', role: 'assistant', content: 'reply', timestamp: '2026-10-19T00:01:00.000Z' },
      { id: '3', role: 'assistant', content: 'note', messageKind: 'diagnostic', timestamp: '2026-10-19T00:02:00.000Z' },
    ] as MessageWire[]);
    expect(turn).toEqual({ user: 'first', reply: 'reply', tier: undefined, endedAt: Date.parse('2026-10-19T00:01:00.000Z') });
    expect(previousTurn([])).toEqual({ endedAt: undefined });
  });
});
