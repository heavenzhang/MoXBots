import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionMetadata } from '../types/session';
import type { AutoRouteCatalog, AutoRouteCatalogEntry } from './router';

const catalog = vi.hoisted(() => {
  const row = (providerId: string, model: string, modelName: string, tier: 'fast' | 'balanced' | 'strong') =>
    ({ providerId, model, modelName, tier, source: 'catalog' as const, rank: 0 });
  const fast = row('ds', 'deepseek-v4.1-flash', 'Flash', 'fast');
  const balanced = row('ds', 'deepseek-v4.1', 'DeepSeek V4.1', 'balanced');
  const strong = row('oa', 'gpt-6', 'GPT-6', 'strong');
  return {
    settings: { enabled: true, tierOverrides: {}, tierOrder: {} },
    table: { fast: [fast], balanced: [balanced], strong: [strong] },
    entries: new Map(Object.entries({
      'ds/deepseek-v4.1-flash': { ...fast, provider: { id: 'ds', name: 'DEEPSEEK', apiProtocol: 'anthropic' } },
      'ds/deepseek-v4.1': { ...balanced, provider: { id: 'ds', name: 'DEEPSEEK', apiProtocol: 'anthropic' } },
      'oa/gpt-6': { ...strong, provider: { id: 'oa', name: 'OPENAI', apiProtocol: 'openai' } },
    })) as unknown as Map<string, AutoRouteCatalogEntry>,
  };
});

vi.mock('./router', () => ({
  buildAutoRouteCatalog: () => catalog,
  resolveAutoRouteEnv: (ref: { providerId: string; model: string }) =>
    ref.providerId === 'oa' || ref.providerId === 'ds'
      ? { providerId: ref.providerId, apiKey: 'test-key', apiProtocol: ref.providerId === 'oa' ? 'openai' : 'anthropic' }
      : undefined,
}));
vi.mock('../title-generator', () => ({ generateUtilityText: vi.fn() }));

const catalogFixture = catalog as unknown as AutoRouteCatalog;
const { dispatchAssist, describeAssistCandidates, findAssistCandidate, listAssistCandidates, AutoRouteAssistError } = await import('./assist');
const { cliRequestTimeoutMs, isUnboundedCliRoute } = await import('../../cli/myagents');

function meta(extra: Partial<SessionMetadata> = {}): SessionMetadata {
  return { id: 'session-1', agentDir: '/w', title: 't', createdAt: '', lastActiveAt: '', runtime: 'builtin', providerId: 'ds', model: 'deepseek-v4.1', ...extra } as SessionMetadata;
}

let workspace: string;
beforeEach(() => { workspace = mkdtempSync(join(tmpdir(), 'route-assist-')); });
afterEach(() => { rmSync(workspace, { recursive: true, force: true }); });

describe('请外援 candidates', () => {
  it('lists the Session\'s other models, cross-tier first and never its own', () => {
    const candidates = listAssistCandidates(catalogFixture, { providerId: 'ds', model: 'deepseek-v4.1' });
    // Balanced is the current tier, so the stronger tier leads.
    expect(candidates.map(candidate => `${candidate.rank}:${candidate.providerId}/${candidate.model}:${candidate.tier}`))
      .toEqual(['1:oa/gpt-6:strong', '2:ds/deepseek-v4.1-flash:fast']);
  });

  it('resolves provider/model exactly and reports ambiguous bare model ids', () => {
    const candidates = listAssistCandidates(catalogFixture, undefined);
    expect((findAssistCandidate(candidates, 'oa/gpt-6') as { model: string }).model).toBe('gpt-6');
    const twins = [
      { ...candidates[0], providerId: 'a', model: 'same' },
      { ...candidates[0], providerId: 'b', model: 'same' },
    ];
    expect(findAssistCandidate(twins, 'same')).toBe('ambiguous');
    expect(findAssistCandidate(candidates, 'gpt-6')).toMatchObject({ providerId: 'oa' });
  });

  it('refuses external runtimes, disabled routing and empty candidate sets clearly', () => {
    expect(() => describeAssistCandidates(meta({ runtime: 'claude-code' }))).toThrow(AutoRouteAssistError);
    expect(() => describeAssistCandidates(null)).toThrow(/No current Session/);
  });
});

describe('dispatchAssist', () => {
  it('runs the chosen tier model once with the primary\'s effort and no tools', async () => {
    const runner = vi.fn().mockResolvedValue('  here is the review  ');
    const result = await dispatchAssist(
      { sessionMeta: meta(), workspacePath: workspace, target: 'oa/gpt-6', prompt: ' review this ', effort: 'high' },
      runner,
    );
    expect(result).toMatchObject({ providerId: 'oa', model: 'gpt-6', tier: 'strong', reasoningEffort: 'high', attempts: 1, text: '  here is the review  ' });
    expect(runner.mock.calls[0][0]).toMatchObject({ prompt: 'review this', effort: 'high', conversationId: 'session-1' });
  });

  it('never dispatches to the Session\'s own model', async () => {
    await expect(dispatchAssist(
      { sessionMeta: meta(), target: 'ds/deepseek-v4.1', prompt: 'x' },
      vi.fn(),
    )).rejects.toMatchObject({ status: 404 });
  });

  it('rejects an unsupported effort instead of degrading it', async () => {
    const runner = vi.fn().mockResolvedValue('ok');
    await expect(dispatchAssist(
      { sessionMeta: meta(), target: 'oa/gpt-6', prompt: 'x', effort: 'nonsense' },
      runner,
    )).rejects.toMatchObject({ status: 400 });
    expect(runner).not.toHaveBeenCalled();
  });

  it('retries a failed invocation exactly once, then reports 502', async () => {
    const runner = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('ok');
    expect((await dispatchAssist({ sessionMeta: meta(), target: 'oa/gpt-6', prompt: 'x' }, runner)).attempts).toBe(2);
    const failing = vi.fn().mockResolvedValue(null);
    await expect(dispatchAssist({ sessionMeta: meta(), target: 'oa/gpt-6', prompt: 'x' }, failing))
      .rejects.toMatchObject({ status: 502 });
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('attaches workspace files and refuses paths that escape the workspace', async () => {
    mkdirSync(join(workspace, 'src'));
    writeFileSync(join(workspace, 'src', 'a.ts'), 'export const a = 1;\n');
    const runner = vi.fn().mockResolvedValue('done');
    const result = await dispatchAssist(
      { sessionMeta: meta(), workspacePath: workspace, target: 'oa/gpt-6', prompt: 'review', files: ['src/a.ts'] },
      runner,
    );
    expect(result.files).toEqual([join('src', 'a.ts')]);
    expect(runner.mock.calls[0][0].prompt).toContain('export const a = 1;');

    const outside = mkdtempSync(join(tmpdir(), 'route-assist-outside-'));
    try {
      writeFileSync(join(outside, 'secret.txt'), 'secret');
      symlinkSync(join(outside, 'secret.txt'), join(workspace, 'link.txt'));
      for (const file of [join(outside, 'secret.txt'), '../secret.txt', 'link.txt']) {
        await expect(dispatchAssist(
          { sessionMeta: meta(), workspacePath: workspace, target: 'oa/gpt-6', prompt: 'review', files: [file] },
          runner,
        )).rejects.toMatchObject({ status: 400 });
      }
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('has no wall-clock deadline and stops only on cancel', async () => {
    expect(cliRequestTimeoutMs('route/assist')).toBe(10_000);
    expect(isUnboundedCliRoute('route/assist')).toBe(true);
    const controller = new AbortController();
    const canceled = vi.fn(async ({ signal }: { signal?: AbortSignal }) => {
      controller.abort();
      return signal?.aborted ? null : 'late';
    });
    await expect(dispatchAssist(
      { sessionMeta: meta(), target: 'oa/gpt-6', prompt: 'x', signal: controller.signal },
      canceled,
    )).rejects.toMatchObject({ status: 502 });
    expect(canceled).toHaveBeenCalledTimes(1);
  });
});
