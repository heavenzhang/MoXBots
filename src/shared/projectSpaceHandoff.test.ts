import { describe, expect, it } from 'vitest';
import { compileProjectSpaceHandoffSnapshot } from './projectSpaces';
const at = '2026-11-07T00:00:00Z';
const source = { schemaVersion: 1, projectId: 'P', projectName: 'Original project', projectRevision: 1,
  botId: 'lead', botName: 'Original lead', botIcon: 'bot:lead', workspacePath: '/lead', capturedAt: at,
  description: 'Original brief', instructions: 'Keep these requirements',
  materials: [{ id: 'm', title: 'Brief', content: 'original material' }], resources: [] };
function input() {
  return { source, sourceWorkspacePath: '/lead', targetBotId: 'worker', workspacePath: '/worker', capturedAt: at,
    projectSpaces: [{ id: 'P', name: 'Edited project', description: 'new', instructions: 'new', memberBotIds: ['lead', 'worker'],
      materials: [], resources: [], revision: 2, createdAt: at, updatedAt: at }],
    bots: [{ id: 'lead', name: 'Lead' }, { id: 'worker', name: 'Worker' }],
    workspaces: [{ id: 'a', path: '/lead', agentId: 'lead' }, { id: 'b', path: '/worker', agentId: 'worker' }] };
}
describe('fixed project Bot handoff', () => {
  it('keeps the source brief after project edits while rebinding only the recipient identity', () => {
    const result = compileProjectSpaceHandoffSnapshot(input());
    expect(result).toEqual({ ...source, botId: 'worker', botName: 'Worker', botIcon: undefined, workspacePath: '/worker' });
    expect(result).not.toHaveProperty('botIcon');
    result.materials[0].content = 'mutated';
    expect(source.materials[0].content).toBe('original material');
  });
  it.each(['lead', 'worker'])('rejects a removed %s member', bot => {
    const value = input(); value.projectSpaces[0].memberBotIds = value.projectSpaces[0].memberBotIds.filter(id => id !== bot);
    expect(() => compileProjectSpaceHandoffSnapshot(value)).toThrow(/member/);
  });
  it('rejects deletion, archive and corrupt project catalog', () => {
    expect(() => compileProjectSpaceHandoffSnapshot({ ...input(), projectSpaces: [] })).toThrow(/no longer exists/);
    expect(() => compileProjectSpaceHandoffSnapshot({ ...input(), projectSpaces: [{ ...input().projectSpaces[0], archivedAt: at }] })).toThrow(/archived/);
    expect(() => compileProjectSpaceHandoffSnapshot({ ...input(), projectSpaces: 'corrupt' })).toThrow();
  });
  it.each(['lead', 'worker'])('rejects unavailable or ambiguous %s identity', bot => {
    const value = input();
    expect(() => compileProjectSpaceHandoffSnapshot({ ...value, bots: value.bots.filter(item => item.id !== bot) })).toThrow(/unavailable/);
    expect(() => compileProjectSpaceHandoffSnapshot({ ...value, workspaces: [...value.workspaces, { id: 'duplicate', path: '/other', agentId: bot }] })).toThrow(/unavailable/);
    expect(() => compileProjectSpaceHandoffSnapshot({ ...value, workspaces: value.workspaces.map(row => row.agentId === bot ? { ...row, hidden: true } : row) })).toThrow(/unavailable/);
  });
  it('rejects mismatched source and target workspace ownership', () => {
    expect(() => compileProjectSpaceHandoffSnapshot({ ...input(), sourceWorkspacePath: '/wrong' })).toThrow(/workspace/);
    expect(() => compileProjectSpaceHandoffSnapshot({ ...input(), workspacePath: '/wrong' })).toThrow(/workspace/);
  });
});
