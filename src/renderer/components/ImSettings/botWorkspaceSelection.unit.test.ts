import { describe, expect, it } from 'vitest';
import type { Project } from '@/config/types';
import type { AgentConfig } from '../../../shared/types/agent';
import { getBotWorkspaceCandidates, getBotBindingCandidates, resolveCurrentBotBindingTarget } from './botWorkspaceSelection';

const project = (id: string, overrides: Partial<Project> = {}): Project => ({
  id,
  name: id,
  path: `/workspace/${id}`,
  providerId: null,
  permissionMode: null,
  ...overrides,
});

describe('getBotWorkspaceCandidates', () => {
  it('keeps only visible active workspaces and puts the default first', () => {
    const result = getBotWorkspaceCandidates([
      project('recent', { lastOpened: '2026-08-15T12:00:00Z' }),
      project('default', { lastOpened: '2026-08-14T12:00:00Z' }),
      project('hidden', { hidden: true }),
      project('internal', { internal: true }),
      project('archived', { archivedAt: '2026-08-15T00:00:00Z' }),
    ], '/workspace/default');

    expect(result.map(item => item.id)).toEqual(['default', 'recent']);
  });
});

const bot = (id: string): AgentConfig => ({ id, name: id, enabled: false, permissionMode: 'auto', channels: [] });

describe('Bot binding identity', () => {
  it('requires an existing unambiguous Bot and counts hidden/archive claims as conflicts', () => {
    const targets = getBotBindingCandidates([
      project('ok', { agentId: 'ok' }),
      project('conflict', { agentId: 'shared' }),
      project('hidden-claim', { agentId: 'shared', hidden: true, archivedAt: '2026-11-01' }),
      project('missing', { agentId: 'missing' }),
      project('unassigned'),
      project('archive', { agentId: 'archive', archivedAt: '2026-11-01' }),
    ], [bot('ok'), bot('shared'), bot('archive')]);
    // Proactive toggle is unrelated to channel eligibility.
    expect(targets.map(item => item.agent.id)).toEqual(['ok']);
  });

  it('rejects stale Bot replacement and moved workspace instead of binding a new identity', () => {
    const selected = project('p', { agentId: 'original' });
    expect(resolveCurrentBotBindingTarget(getBotBindingCandidates([
      { ...selected, agentId: 'replacement' },
    ], [bot('replacement')]), selected)).toBeUndefined();
    expect(resolveCurrentBotBindingTarget(getBotBindingCandidates([
      { ...selected, path: '/workspace/moved' },
    ], [bot('original')]), selected)).toBeUndefined();
    const targets = getBotBindingCandidates([selected], [bot('original')]);
    expect(resolveCurrentBotBindingTarget(targets, selected)?.agent.id).toBe('original');
  });
});
