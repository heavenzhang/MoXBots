import { describe, expect, it } from 'vitest';

import {
  AUTO_ROUTE_WARM_CACHE_MS,
  buildAutoRouteClassifierPrompt,
  buildAutoTierTable,
  cutMiddle,
  decideAutoRoute,
  fitEffort,
  inferAutoTier,
  modelSizeFromName,
  normalizeModelMode,
  parseAutoRouteAnswer,
  parseAutoRoutingSettings,
  pickAutoClassifier,
  type AutoTierCandidate,
} from './autoRoute';
import { OPENAI_EFFORT_LEVELS, SDK_EFFORT_LEVELS } from './reasoningEffort';

describe('parseAutoRouteAnswer', () => {
  it('takes the first integer in range', () => {
    expect(parseAutoRouteAnswer('3')).toEqual({ ok: true, tier: 'strong' });
    expect(parseAutoRouteAnswer('Kind 1.')).toEqual({ ok: true, tier: 'fast' });
    expect(parseAutoRouteAnswer('2 (maybe 3)')).toEqual({ ok: true, tier: 'balanced' });
  });
  it('separates "none" from off-format answers', () => {
    expect(parseAutoRouteAnswer('0')).toMatchObject({ ok: false, reason: 'none' });
    expect(parseAutoRouteAnswer('7')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(parseAutoRouteAnswer('hard')).toMatchObject({ ok: false, reason: 'invalid' });
  });
});

describe('buildAutoRouteClassifierPrompt', () => {
  it('lists the three levels and wraps the message', () => {
    const prompt = buildAutoRouteClassifierPrompt({ text: '你好' });
    expect(prompt).toMatch(/^Kinds:\n1\. an easy request/);
    expect(prompt).toContain('3. a hard request');
    expect(prompt).toContain('<message>\n你好\n</message>');
    expect(prompt).not.toContain('previous_user_message');
  });
  it('carries the previous turn and its tier for short follow-ups', () => {
    const prompt = buildAutoRouteClassifierPrompt({
      text: '继续',
      previousUser: '重构登录模块',
      previousReply: '已经完成第一步',
      previousTier: 'strong',
    });
    expect(prompt).toContain('<previous_user_message>\n重构登录模块\n</previous_user_message>');
    expect(prompt).toContain('<previous_assistant_reply>\n已经完成第一步\n</previous_assistant_reply>');
    expect(prompt).toContain('was of kind 3');
  });
  it('caps long messages and keeps the end of a long reply', () => {
    const prompt = buildAutoRouteClassifierPrompt({ text: 'a'.repeat(5000), previousReply: `${'x'.repeat(2000)}END` });
    expect(prompt.length).toBeLessThan(6000);
    expect(prompt).toContain("\n…\n");
    expect(prompt).toContain('END\n</previous_assistant_reply>');
  });
  it('cutMiddle counts characters, not UTF-16 units', () => {
    expect(cutMiddle('😀😀😀😀', 1, 1)).toBe('😀\n…\n😀');
    expect(cutMiddle('abc', 2, 2)).toBe('abc');
  });
});

describe('fitEffort', () => {
  it('maps tiers to low / medium / high when supported', () => {
    expect(fitEffort('fast', SDK_EFFORT_LEVELS)).toBe('low');
    expect(fitEffort('balanced', OPENAI_EFFORT_LEVELS)).toBe('medium');
    expect(fitEffort('strong', SDK_EFFORT_LEVELS)).toBe('high');
  });
  it('picks the nearest supported level and sends nothing when unknown', () => {
    expect(fitEffort('fast', ['minimal', 'high'])).toBe('minimal');
    expect(fitEffort('strong', ['low', 'xhigh'])).toBe('xhigh');
    expect(fitEffort('balanced', ['low', 'high'])).toBe('low');
    expect(fitEffort('balanced', null)).toBeUndefined();
    expect(fitEffort('strong', [])).toBeUndefined();
  });
});

describe('tiering', () => {
  it('reads size words as words, not substrings', () => {
    expect(modelSizeFromName('gemini-3-pro')).toEqual({ small: false, tiny: false });
    expect(modelSizeFromName('gpt-6-mini')).toEqual({ small: true, tiny: false });
    expect(modelSizeFromName('qwen3-8b')).toEqual({ small: true, tiny: true });
  });
  it('follows override → catalog → curated → price → name → balanced', () => {
    const base = { providerId: 'p', model: 'unknown-model' };
    expect(inferAutoTier({ ...base, catalogTier: 'strong' }, { overrides: { 'p/unknown-model': 'fast' } }))
      .toMatchObject({ tier: 'fast', source: 'override' });
    expect(inferAutoTier({ ...base, catalogTier: 'strong' })).toMatchObject({ tier: 'strong', source: 'catalog' });
    expect(inferAutoTier({ providerId: 'p', model: 'claude-opus-5-5' })).toMatchObject({ tier: 'strong', source: 'catalog' });
    expect(inferAutoTier({ ...base, outputCostPerMillion: 15 })).toMatchObject({ tier: 'strong', source: 'price' });
    expect(inferAutoTier({ ...base, outputCostPerMillion: 1 }, { strongestPrice: 20 })).toMatchObject({ tier: 'fast', source: 'price' });
    expect(inferAutoTier({ ...base, outputCostPerMillion: 4 }, { strongestPrice: 20 })).toMatchObject({ tier: 'balanced', source: 'price' });
    expect(inferAutoTier({ providerId: 'p', model: 'acme-small' })).toMatchObject({ tier: 'fast', source: 'name' });
    expect(inferAutoTier(base)).toMatchObject({ tier: 'balanced', source: 'default' });
  });
  it('tiers the models configured on the development machine as expected', () => {
    const models: AutoTierCandidate[] = [
      { providerId: 'or', model: 'deepseek/deepseek-v4.1-flash-1017' },
      { providerId: 'or', model: 'x-ai/grok-4.7' },
      { providerId: 'sf', model: 'zai-org/GLM-5.3' },
      { providerId: 'rc', model: 'claude-opus-5-5' },
      { providerId: 'rc', model: 'claude-sonnet-5-5' },
      { providerId: 'rc', model: 'claude-haiku-5-5' },
      { providerId: 'cx', model: 'gpt-6.1-sol' },
      { providerId: 'or', model: 'text-embedding-4' },
    ];
    const table = buildAutoTierTable(models);
    expect(table.fast.map(entry => entry.model)).toEqual(['deepseek/deepseek-v4.1-flash-1017', 'claude-haiku-5-5']);
    expect(table.balanced.map(entry => entry.model)).toEqual(['claude-sonnet-5-5']);
    expect(table.strong.map(entry => entry.model)).toEqual(['claude-opus-5-5', 'gpt-6.1-sol', 'x-ai/grok-4.7', 'zai-org/GLM-5.3']);
  });
  it('puts the user order first inside a tier', () => {
    const table = buildAutoTierTable(
      [{ providerId: 'a', model: 'claude-opus-5-5' }, { providerId: 'b', model: 'grok-4.7' }],
      { tierOrder: { strong: ['b/grok-4.7'] } },
    );
    expect(table.strong.map(entry => entry.providerId)).toEqual(['b', 'a']);
  });
  it('prefers a non-tiny fast model as the classifier unless the user chose one', () => {
    const table = buildAutoTierTable([
      { providerId: 'g', model: 'gemini-3.5-flash-lite' },
      { providerId: 'g', model: 'gemini-3.6-flash' },
      { providerId: 'a', model: 'claude-opus-5-5' },
    ]);
    expect(pickAutoClassifier(table, {}, undefined)).toEqual({ providerId: 'g', model: 'gemini-3.6-flash' });
    expect(pickAutoClassifier(table, { classifier: { providerId: 'x', model: 'y' } }, undefined)).toEqual({ providerId: 'x', model: 'y' });
  });
});

describe('parseAutoRoutingSettings / normalizeModelMode', () => {
  it('drops malformed parts instead of guessing', () => {
    expect(parseAutoRoutingSettings({
      enabled: false,
      classifier: { providerId: 'p', model: '' },
      tierOverrides: { 'p/m': 'strong', bad: 'fast', 'p/n': 'huge' },
      tierOrder: { fast: ['p/m', 'p/m', 3], strong: 'nope' },
    })).toEqual({ enabled: false, tierOverrides: { 'p/m': 'strong' }, tierOrder: { fast: ['p/m'] } });
    expect(parseAutoRoutingSettings(null)).toEqual({});
  });
  it('defaults the model mode to auto', () => {
    expect(normalizeModelMode(undefined)).toBe('auto');
    expect(normalizeModelMode('bogus')).toBe('auto');
    expect(normalizeModelMode('manual')).toBe('manual');
  });
});

describe('decideAutoRoute', () => {
  const table = buildAutoTierTable([
    { providerId: 'p', model: 'claude-haiku-5-5', contextLength: 200_000 },
    { providerId: 'p', model: 'claude-sonnet-5-5', contextLength: 200_000 },
    { providerId: 'p', model: 'claude-opus-5-5', contextLength: 1_000_000 },
    { providerId: 'q', model: 'grok-4.7', contextLength: 256_000 },
  ]);
  const usable = () => true;
  const now = 10_000_000;

  it('keeps failover in the actual target tier unless cross-tier backup was explicitly enabled', () => {
    const table = buildAutoTierTable([
      { providerId: 'p', model: 'only-balanced', catalogTier: 'balanced' },
      { providerId: 'p', model: 'only-fast', catalogTier: 'fast' },
    ]);
    const input = { table, tier: 'balanced' as const, verdict: 'classified' as const, now, isUsable: usable };
    expect(decideAutoRoute(input)?.backup).toBeUndefined();
    expect(decideAutoRoute({ ...input, allowCrossTierBackup: true })?.backup?.tier).toBe('fast');
  });

  it('switches to the first model of the requested tier with the next as backup', () => {
    const decision = decideAutoRoute({ table, tier: 'strong', verdict: 'classified', now, isUsable: usable });
    expect(decision).toMatchObject({ tier: 'strong', reason: 'classified', switches: true });
    expect(decision?.target.model).toBe('claude-opus-5-5');
    expect(decision?.backup?.model).toBe('grok-4.7');
  });
  it('keeps the current model when it is already in the requested tier', () => {
    const decision = decideAutoRoute({
      table, tier: 'strong', verdict: 'cached', now, isUsable: usable,
      current: { providerId: 'q', model: 'grok-4.7' },
    });
    expect(decision).toMatchObject({ switches: false, reason: 'cached' });
    expect(decision?.target.model).toBe('grok-4.7');
  });
  it('does not move down while the cache is warm, and does once it is cold', () => {
    const current = { providerId: 'p', model: 'claude-opus-5-5' };
    const warm = decideAutoRoute({ table, tier: 'fast', verdict: 'classified', current, lastTurnAt: now - 60_000, now, isUsable: usable });
    expect(warm).toMatchObject({ tier: 'strong', reason: 'held-warm-cache', switches: false });
    const cold = decideAutoRoute({
      table, tier: 'fast', verdict: 'classified', current, lastTurnAt: now - AUTO_ROUTE_WARM_CACHE_MS - 1, now, isUsable: usable,
    });
    expect(cold).toMatchObject({ tier: 'fast', reason: 'classified', switches: true });
  });
  it('always moves up, warm cache or not', () => {
    const decision = decideAutoRoute({
      table, tier: 'strong', verdict: 'classified', current: { providerId: 'p', model: 'claude-haiku-5-5' },
      lastTurnAt: now - 1000, now, isUsable: usable,
    });
    expect(decision).toMatchObject({ tier: 'strong', switches: true });
  });
  it('falls back to the nearest tier when the requested one has nothing usable', () => {
    const decision = decideAutoRoute({
      table, tier: 'fast', verdict: 'classified', now,
      isUsable: entry => entry.model !== 'claude-haiku-5-5',
    });
    expect(decision).toMatchObject({ tier: 'balanced', reason: 'unavailable-fallback' });
  });
  it('under context pressure only moves to a larger window', () => {
    const decision = decideAutoRoute({
      table, tier: 'balanced', verdict: 'classified', now, contextUsed: 0.97,
      current: { providerId: 'p', model: 'claude-haiku-5-5' },
      isUsable: usable,
    });
    expect(decision).toMatchObject({ reason: 'grown' });
    expect(decision?.target.contextLength).toBeGreaterThan(200_000);
  });
  it('keeps the current tier when the classifier failed', () => {
    const decision = decideAutoRoute({
      table, tier: undefined, verdict: 'classifier-failed', now,
      current: { providerId: 'p', model: 'claude-sonnet-5-5' }, isUsable: usable,
    });
    expect(decision).toMatchObject({ tier: 'balanced', switches: false, reason: 'classifier-failed' });
  });
  it('returns null when nothing is usable', () => {
    expect(decideAutoRoute({ table, tier: 'fast', verdict: 'classified', now, isUsable: () => false })).toBeNull();
  });
});
