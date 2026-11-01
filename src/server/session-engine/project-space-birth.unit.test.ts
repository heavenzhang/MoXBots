import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ config: {} as Record<string, unknown>, projects: [] as unknown[] }));
vi.mock('../utils/admin-config', () => ({
  loadConfig: vi.fn(() => state.config), loadProjects: vi.fn(() => state.projects),
}));
import { compileProjectSpaceBirth } from './project-space-birth';
import { loadConfig, loadProjects } from '../utils/admin-config';
beforeEach(() => {
  vi.clearAllMocks();
  state.config = { agents: [{ id: 'bot', name: 'Original Bot' }], projectSpaces: [{ id: 'A', name: 'Project A',
    description: 'description', instructions: 'fixed instructions', memberBotIds: ['bot'], materials: [], resources: [],
    revision: 1, createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z' }] };
  state.projects = [{ id: 'workspace', path: '/original-cwd', agentId: 'bot' }];
});
const input = () => ({ pathname: '/api/session/birth', workspacePath: '/original-cwd',
  payload: { projectSpaceSelection: { projectId: 'A', botId: 'bot', projectRevision: 1 } } });
it('compiles ordinary builtin birth using read-only authorities, without a provider identity', () => {
  const result = compileProjectSpaceBirth(input());
  expect(result).toMatchObject({ projectId: 'A', botId: 'bot', botName: 'Original Bot', workspacePath: '/original-cwd', instructions: 'fixed instructions' });
  expect(loadConfig).toHaveBeenCalledWith({ strict: true });
  expect(loadProjects).toHaveBeenCalledWith({ strict: true });
});
it('rejects stale selection, wrong member/workspace and direct snapshot before a preparation can be entered', () => {
  expect(() => compileProjectSpaceBirth({ ...input(), payload: { projectSpaceSelection: { ...input().payload.projectSpaceSelection, projectRevision: 2 } } })).toThrow(/refresh/);
  expect(() => compileProjectSpaceBirth({ ...input(), workspacePath: '/another-cwd' })).toThrow(/workspace/);
  expect(() => compileProjectSpaceBirth({ ...input(), payload: { projectSpaceSelection: { ...input().payload.projectSpaceSelection, botId: 'other' } } })).toThrow(/member/);
  vi.clearAllMocks();
  expect(() => compileProjectSpaceBirth({ ...input(), payload: { projectSpace: { projectId: 'injected' } } })).toThrow(/server-owned/);
  expect(loadConfig).not.toHaveBeenCalled();
  expect(loadProjects).not.toHaveBeenCalled();
});
it('does not permit logical project birth through Global or channel entry points', () => {
  expect(() => compileProjectSpaceBirth({ ...input(), pathname: '/sessions' })).toThrow(/owner birth/);
  expect(() => compileProjectSpaceBirth({ ...input(), origin: { kind: 'agent-channel', surface: 'channel_message' } })).toThrow(/owner birth/);
});
