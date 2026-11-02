import { describe, expect, it } from 'vitest';
import { applyProjectSpaceMutation, compileProjectSpaceSessionSnapshot, normalizeProjectSpace, preserveProjectSpaceSessionSnapshot, readProjectSpaces, type ProjectSpace } from './projectSpaces';
const at = '2026-11-02T00:00:00.000Z';
const project: ProjectSpace = { id: 'a', name: '产品项目', description: 'A only', instructions: 'Use A context', memberBotIds: ['bot'], materials: [{ id: 'm', title: 'A reference', content: 'A private reference' }], resources: [{ id: 'r', label: '文件资料', path: '/projects/a' }], revision: 1, createdAt: at, updatedAt: at };
const bots = [{ id: 'bot', name: '分析助手', icon: 'bot:spark' }];
const workspaces = [{ id: 'w', path: '/bot-home', agentId: 'bot' }];
function capture(spaces = [project], selection = { projectId: 'a', botId: 'bot', projectRevision: 1 }) {
  return compileProjectSpaceSessionSnapshot({ selection, projectSpaces: spaces, bots, workspaces, workspacePath: '/bot-home/', capturedAt: at });
}
describe('project organization and immutable conversation birth', () => {
  it('reuses one Bot in two logical projects without changing its one workspace', () => {
    const b = { ...project, id: 'b', name: '经营项目', description: 'B only' };
    const a = capture([project, b]); const next = capture([project, b], { projectId: 'b', botId: 'bot', projectRevision: 1 });
    expect(a.projectId).toBe('a'); expect(next.projectId).toBe('b');
    expect(a.botId).toBe(next.botId); expect(a.workspacePath).toBe(next.workspacePath);
    expect(workspaces).toEqual([{ id: 'w', path: '/bot-home', agentId: 'bot' }]);
  });
  it('captures detached configuration; later project edits cannot change an old birth', () => {
    const source = structuredClone(project); const snapshot = capture([source]);
    source.materials[0].content = 'changed'; source.memberBotIds.length = 0;
    expect(snapshot.materials[0].content).toBe('A private reference');
    const retained = preserveProjectSpaceSessionSnapshot(snapshot, undefined)!;
    retained.materials[0].content = 'another clone';
    expect(snapshot.materials[0].content).toBe('A private reference');
  });
  it('rejects stale revision, removed membership, archived projects and duplicate workspace claims', () => {
    expect(() => capture([{ ...project, revision: 2 }])).toThrow('refresh');
    expect(() => capture([{ ...project, memberBotIds: [] }])).toThrow('member');
    expect(() => capture([{ ...project, archivedAt: at }])).toThrow('archived');
    expect(() => compileProjectSpaceSessionSnapshot({ selection: { projectId: 'a', botId: 'bot', projectRevision: 1 }, projectSpaces: [project], bots, workspaces: [...workspaces, { id: 'w2', path: '/other', agentId: 'bot', hidden: true }], workspacePath: '/bot-home', capturedAt: at })).toThrow('unavailable');
  });
  it('rejects a mismatched execution directory instead of rebinding the Bot', () => {
    expect(() => compileProjectSpaceSessionSnapshot({ selection: { projectId: 'a', botId: 'bot', projectRevision: 1 }, projectSpaces: [project], bots, workspaces, workspacePath: '/projects/a', capturedAt: at })).toThrow('own this workspace');
  });
  it('preserves omitted fields and rejects reassignment or attaching scope to legacy history', () => {
    const snapshot = capture();
    expect(preserveProjectSpaceSessionSnapshot(snapshot, undefined)).toEqual(snapshot);
    expect(() => preserveProjectSpaceSessionSnapshot(snapshot, { ...snapshot, projectId: 'b' })).toThrow('immutable');
    expect(() => preserveProjectSpaceSessionSnapshot(undefined, snapshot)).toThrow('existing conversation');
  });
  it('does not overwrite a newer edit and preserves unrelated projects', () => {
    const b = { ...project, id: 'b', name: 'B' };
    expect(() => applyProjectSpaceMutation([project, b], { kind: 'update', id: 'a', expectedRevision: 2, draft: project, at }, bots)).toThrow('another window');
    const changed = applyProjectSpaceMutation([project, b], { kind: 'update', id: 'a', expectedRevision: 1, draft: { ...project, name: 'Updated' }, at }, bots);
    expect(changed[0].revision).toBe(2); expect(changed[1]).toEqual(b); expect(project.name).toBe('产品项目');
  });
  it('supports reversible archive without modifying existing conversation snapshots', () => {
    const snapshot = capture(); const archived = applyProjectSpaceMutation([project], { kind: 'archive', id: 'a', expectedRevision: 1, archived: true, at }, bots);
    expect(archived[0].archivedAt).toBe(at);
    const restored = applyProjectSpaceMutation(archived, { kind: 'archive', id: 'a', expectedRevision: 2, archived: false, at }, bots);
    expect(restored[0].archivedAt).toBeUndefined(); expect(restored[0].revision).toBe(3); expect(snapshot.projectRevision).toBe(1);
  });
  it('treats corrupt config as failure, validates bounds, and does not grant relative resource paths', () => {
    expect(readProjectSpaces(undefined)).toEqual([]);
    expect(() => readProjectSpaces({ invalid: true })).toThrow();
    expect(() => normalizeProjectSpace({ ...project, resources: [{ id: 'r', label: 'bad', path: '../other' }] })).toThrow('absolute');
    expect(() => normalizeProjectSpace({ ...project, materials: [{ id: 'm', title: 'large', content: 'x'.repeat(4_001) }] })).toThrow('content');
    expect(() => normalizeProjectSpace({ ...project, memberBotIds: ['bot', 'bot'] })).toThrow('Duplicate');
  });
  it('omits a large custom Bot avatar without blocking project conversation birth', () => {
    const customIcon = `data:image/png;base64,${'A'.repeat(20_000)}`;
    const customBot = { ...bots[0], icon: customIcon };
    const snapshot = compileProjectSpaceSessionSnapshot({ selection: { projectId: 'a', botId: 'bot', projectRevision: 1 }, projectSpaces: [project], bots: [customBot], workspaces, workspacePath: '/bot-home', capturedAt: at });
    expect(snapshot).toMatchObject({ projectId: 'a', botId: 'bot', botName: '分析助手', workspacePath: '/bot-home' });
    expect(snapshot).not.toHaveProperty('botIcon');
    expect(snapshot.materials).toEqual(project.materials);
    expect(customBot.icon).toBe(customIcon);
    expect(capture().botIcon).toBe('bot:spark');
  });

});
