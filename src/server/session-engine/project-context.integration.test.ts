import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectSpaceSnapshot } from '../__tests__/fixtures/project-space';
import type { SessionMessage } from '../../shared/types/session-message';
import { APP_DATA_DIR_NAME } from '../../shared/appProfile';
import { createLegacySession, createPublishedSession } from '../__tests__/fixtures/session-store';

const state = vi.hoisted(() => ({ home: '/__project-context-fixture-only__' }));
vi.mock('os', async (original) => ({ ...await original<typeof import('node:os')>(), homedir: () => state.home }));
vi.mock('../utils/platform', async (original) => ({ ...await original<typeof import('../utils/platform')>(),
  getHomeDir: () => state.home, getHomeDirOrNull: () => state.home }));
type Store = typeof import('../SessionStore');
let store: Store;
let context: typeof import('./project-context');
let prepare: typeof import('./query-reminder');
let projectPath: string;
let registry: string;
const request = () => ({ sessionId: 'new-chat', workspacePath: projectPath, text: '继续项目', scenario: { type: 'desktop' as const } });
function projects(value: unknown) { writeFileSync(registry, JSON.stringify(Array.isArray(value)
  ? value.map(row => ({ name: 'Fixture Project', ...row })) : value)); }
const msg = (id: string, role: 'user' | 'assistant', content: string): SessionMessage =>
  ({ id, role, content, timestamp: '2026-10-16T01:00:00Z' });
async function source(messages: SessionMessage[], v2 = true, path = projectPath, extra = {}) {
  const metadata = v2 ? await createPublishedSession(store, path, extra) : await createLegacySession(store, path, extra);
  const cursor = (await store.loadSessionTranscript(metadata.id)).cursor;
  expect((await store.appendSessionMessages(metadata.id, cursor, messages)).ok).toBe(true);
  return metadata;
}
beforeEach(async () => {
  state.home = mkdtempSync(join(tmpdir(), 'moxbots-project-context-'));
  mkdirSync(join(state.home, APP_DATA_DIR_NAME), { recursive: true });
  projectPath = join(state.home, 'workspace');
  registry = join(state.home, APP_DATA_DIR_NAME, 'projects.json');
  projects([{ id: 'project', name: 'Project', path: projectPath }]);
  vi.resetModules();
  store = await import('../SessionStore');
  context = await import('./project-context');
  prepare = await import('./query-reminder');
});
afterEach(async () => {
  await store.drainSessionTranscripts();
  rmSync(state.home, { recursive: true, force: true });
});

describe('project context through real persisted history and desktop query preparation', () => {
  it.each([false, true])('carries a one-turn decision and progress from V2=%s without a model call', async (v2) => {
    const a = await source([msg('decision', 'user', '确定采用方案B，发布交给统一发布会话'),
      msg('progress', 'assistant', '实现完成，测试通过，尚未发布。')], v2);
    const result = await prepare.prepareDesktopQuery(request());
    expect(result.request.text).toContain('确定采用方案B');
    expect(result.request.text).toContain('尚未发布');
    expect(result.request.desktopQuery?.projectContext?.sources[0].sessionId).toBe(a.id);
    expect(result.request.desktopQuery?.visibleText).toBe('继续项目');
  });
  it('reads updates made after new-chat preparation/prewarm, not a persistent prompt cache', async () => {
    const a = await source([msg('old', 'user', '采用方案A')]);
    expect((await prepare.prepareDesktopQuery(request())).request.text).toContain('采用方案A');
    const cursor = (await store.loadSessionTranscript(a.id)).cursor;
    await store.appendSessionMessages(a.id, cursor, [msg('new', 'user', '取消方案A，改为方案B')]);
    const latest = await prepare.prepareDesktopQuery(request());
    expect(latest.request.desktopQuery?.projectContext?.sources[0].messageId).toBe('new');
    expect(latest.request.text).toContain('取消方案A，改为方案B');
  });
  it('includes background in an empty prepared target, before its first message is materialized', async () => {
    await source([msg('decision', 'user', '确定采用方案B')]);
    const target = await store.createSession(projectPath);
    const result = await prepare.prepareDesktopQuery({ ...request(), sessionId: target.id });
    expect(result.request.text).toContain('确定采用方案B');
  });
  it('does not repeat background on later turns and retains exact stored visible text', async () => {
    await source([msg('other-user', 'user', '采用B')]);
    const first = await prepare.prepareDesktopQuery(request());
    const target = await source([{ ...msg('target-user', 'user', first.request.text), desktopQuery: first.request.desktopQuery }]);
    const next = await prepare.prepareDesktopQuery({ ...request(), sessionId: target.id, text: '下一步' });
    expect(next.request.text).toBe('下一步');
    expect(next.request.desktopQuery).toBeUndefined();
  });
  it('uses only the same project and excludes archived, channel and delegated histories', async () => {
    await source([msg('keep', 'user', '确定共享方案B')]);
    await source([msg('other', 'user', 'other-project-secret')], true, join(state.home, 'other'));
    const archived = await source([msg('archived', 'user', 'archived-secret')]);
    await store.updateSessionMetadata(archived.id, { archived: true });
    const channel = await source([msg('channel', 'user', 'channel-secret')]);
    await store.updateSessionMetadata(channel.id, { source: 'feishu_group', origin: { kind: 'agent-channel', surface: 'channel_message' } });
    await source([msg('bot', 'user', 'bot-secret')], true, projectPath,
      { hostBotBinding: { botId: 'bot', runGeneration: 'generation' } });
    const text = (await prepare.prepareDesktopQuery(request())).request.text;
    expect(text).toContain('确定共享方案B');
    expect(text).not.toMatch(/other-project-secret|archived-secret|channel-secret|bot-secret/);
  });
  it('honors opt-out and ambiguous/deleted project identities without blocking the query', async () => {
    await source([msg('keep', 'user', '采用B')]);
    for (const rows of [[{ id: 'p', path: projectPath, projectContextEnabled: false }], [],
      [{ id: 'p1', path: projectPath }, { id: 'p2', path: projectPath }]]) {
      projects(rows);
      expect((await prepare.prepareDesktopQuery(request())).request.text).toBe('继续项目');
    }
    writeFileSync(registry, '{broken');
    expect((await prepare.prepareDesktopQuery(request())).request.text).toBe('继续项目');
  });
  it('skips corrupt and deleted source history instead of injecting a stale cached decision', async () => {
    const a = await source([msg('a', 'user', '确定方案A')], false);
    expect((await context.readProjectContext(request()))?.sources).toHaveLength(1);
    // External deletion of the history/index is observed on the next read.
    const indexPath = join(state.home, APP_DATA_DIR_NAME, 'sessions.json');
    const index = JSON.parse(readFileSync(indexPath, 'utf8')) as { id: string }[];
    writeFileSync(indexPath, JSON.stringify(index.filter(row => row.id !== a.id)));
    expect(await context.readProjectContext(request())).toBeUndefined();
    projects([{ id: 'project', path: projectPath, archivedAt: '2026-10-16T02:00:00Z' }]);
    expect(await context.readProjectContext(request())).toBeUndefined();
  });
  it('excludes damaged V2 history and reports incomplete coverage', async () => {
    await source([msg('healthy', 'user', '确定采用方案B')]);
    const damaged = await source([msg('damaged', 'user', 'damaged-source-secret')]);
    await store.releaseSessionTranscriptForBinding(damaged.id);
    appendFileSync(join(state.home, APP_DATA_DIR_NAME, 'sessions-v2', `${damaged.id}.jsonl`), '{broken\n');
    const result = await context.readProjectContext(request());
    expect(result?.unavailableSessions).toBe(1);
    expect(result?.sources.some(s => s.text.includes('damaged-source-secret'))).toBe(false);
  });
  it('allows parallel fresh chats to read the same committed state without writing any source', async () => {
    await source([msg('one', 'user', '决定采用方案B'), msg('two', 'assistant', '测试通过，未发布')]);
    const indexPath = join(state.home, APP_DATA_DIR_NAME, 'sessions.json');
    const before = readFileSync(indexPath, 'utf8');
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => prepare.prepareDesktopQuery({ ...request(), sessionId: `new-${i}` })));
    expect(results.every(r => r.request.text.includes('决定采用方案B'))).toBe(true);
    expect(readFileSync(indexPath, 'utf8')).toBe(before);
    vi.resetModules();
    const reloaded = await import('./project-context');
    expect((await reloaded.readProjectContext(request()))?.sources[0].messageId).toBe('one');
  });
});


describe('logical project scope through real SessionStore persistence', () => {
  function catalog(archived = false) {
    writeFileSync(join(state.home, APP_DATA_DIR_NAME, 'config.json'), JSON.stringify({ projectSpaces: ['A', 'B'].map(id => ({
      id, name: id, description: 'changed-current-description', instructions: 'changed-current-instructions',
      memberBotIds: ['bot', 'other-bot'], materials: [], resources: [], revision: 2,
      createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z',
      ...(archived ? { archivedAt: '2026-11-02T01:00:00Z' } : {}),
    })) }));
  }
  it('isolates A/B and legacy in both directions while sharing across same-project Bots', async () => {
    catalog();
    await source([msg('a', 'user', 'A-history-secret')], true, projectPath, { projectSpace: projectSpaceSnapshot(projectPath) });
    await source([msg('b', 'user', 'B-history-secret')], true, projectPath, { projectSpace: projectSpaceSnapshot(projectPath, 'B') });
    const otherPath = join(state.home, 'other-bot-workspace');
    await source([msg('cross', 'user', 'A-other-bot-history')], true, otherPath, { projectSpace: projectSpaceSnapshot(otherPath, 'A', 'other-bot') });
    await source([msg('legacy', 'user', 'legacy-history-secret')]);
    for (const id of ['A', 'B']) {
      const target = await createPublishedSession(store, projectPath, { projectSpace: projectSpaceSnapshot(projectPath, id) });
      const result = await prepare.prepareDesktopQuery({ ...request(), sessionId: target.id });
      expect(result.request.text).toContain(`${id}-fixed-description`);
      expect(result.request.text).toContain(`${id}-material-secret`);
      expect(result.request.text).toContain(`${id}-history-secret`);
      expect(result.request.text).not.toContain(`${id === 'A' ? 'B' : 'A'}-history-secret`);
      expect(result.request.text).not.toContain('legacy-history-secret');
      expect(result.request.text.includes('A-other-bot-history')).toBe(id === 'A');
      expect(result.request.text).not.toContain('changed-current-description');
      expect(result.request.desktopQuery?.visibleText).toBe('继续项目');
    }
    const legacy = (await prepare.prepareDesktopQuery(request())).request.text;
    expect(legacy).toContain('legacy-history-secret');
    expect(legacy).not.toMatch(/A-history-secret|B-history-secret|A-other-bot-history|fixed-description/);
  });
  it('retains fixed configuration without sources and stops dynamic aggregation after archive/deletion', async () => {
    catalog();
    await source([msg('a', 'user', 'A-history-secret')], true, projectPath, { projectSpace: projectSpaceSnapshot(projectPath) });
    const target = await createPublishedSession(store, projectPath, { projectSpace: projectSpaceSnapshot(projectPath) });
    for (const deleted of [false, true]) {
      catalog(true);
      if (deleted) writeFileSync(join(state.home, APP_DATA_DIR_NAME, 'config.json'), '{}');
      const result = await prepare.prepareDesktopQuery({ ...request(), sessionId: target.id });
      expect(result.request.text).toContain('A-fixed-instructions');
      expect(result.request.text).not.toContain('A-history-secret');
    }
  });
  it('flushes and cold-reloads the immutable snapshot; omission preserves it and reassignment fails', async () => {
    catalog();
    const fixed = projectSpaceSnapshot(projectPath);
    const target = await createPublishedSession(store, projectPath, { projectSpace: fixed });
    const { projectSpace: _scope, ...stale } = target;
    await store.saveSessionMetadata({ ...stale, title: 'renamed' });
    expect(store.getSessionMetadata(target.id)?.projectSpace).toEqual(fixed);
    await expect(store.saveSessionMetadata({ ...target, projectSpace: projectSpaceSnapshot(projectPath, 'B') })).rejects.toThrow(/immutable/);
    const legacy = await createPublishedSession(store, projectPath);
    await expect(store.saveSessionMetadata({ ...legacy, projectSpace: fixed })).rejects.toThrow(/assigned/);
    await expect(store.updateSessionMetadata(target.id, { projectSpace: projectSpaceSnapshot(projectPath, 'B') } as never)).rejects.toThrow(/immutable/);
    await store.drainSessionTranscripts();
    expect(JSON.parse(readFileSync(join(state.home, APP_DATA_DIR_NAME, 'sessions.json'), 'utf8')).find((row: { id: string }) => row.id === target.id).projectSpace).toEqual(fixed);
    vi.resetModules();
    store = await import('../SessionStore');
    prepare = await import('./query-reminder');
    expect((await store.getSessionData(target.id))?.projectSpace).toEqual(fixed);
    const result = await prepare.prepareDesktopQuery({ ...request(), sessionId: target.id });
    expect(result.request.text).toContain('A-fixed-description');
    expect(result.request.text).not.toContain('changed-current-description');
  });
  it('persists forked project context independently while preserving the source snapshot', async () => {
    catalog();
    const fixed = projectSpaceSnapshot(projectPath);
    const original = await source([msg('original', 'user', 'A-original-history')], true, projectPath, { projectSpace: fixed });
    const { snapshotForForkedSession } = await import('../utils/session-snapshot');
    const { createSessionMetadata } = await import('../types/session');
    const fork = createSessionMetadata(projectPath, snapshotForForkedSession(original));
    await store.publishForkSession(fork, (await store.getSessionData(original.id))!.messages, original.id);
    expect((await store.getSessionData(fork.id))?.projectSpace).toEqual(fixed);
    expect((await store.getSessionData(fork.id))?.messages[0].content).toBe('A-original-history');
    expect((await store.getSessionData(original.id))?.projectSpace).toEqual(fixed);
  });
  it.each([false, true])('prevents assigning existing legacy sessions to projects (V2=%s)', async (v2) => {
    const original = await source([], v2);
    await expect(store.saveSessionMetadata({ ...original, projectSpace: projectSpaceSnapshot(projectPath) })).rejects.toThrow(/assigned/);
    expect(store.getSessionMetadata(original.id)?.projectSpace).toBeUndefined();
  });
  it('never falls back from invalid persisted project scope to legacy workspace', async () => {
    await source([msg('legacy', 'user', 'legacy-history-secret')]);
    const target = await createPublishedSession(store, projectPath);
    await store.drainSessionTranscripts();
    const indexPath = join(state.home, APP_DATA_DIR_NAME, 'sessions.json');
    const rows = JSON.parse(readFileSync(indexPath, 'utf8'));
    rows.find((row: { id: string }) => row.id === target.id).projectSpace = { projectId: 'A' };
    writeFileSync(indexPath, JSON.stringify(rows));
    vi.resetModules();
    store = await import('../SessionStore');
    prepare = await import('./query-reminder');
    expect((await prepare.prepareDesktopQuery({ ...request(), sessionId: target.id })).request.text).toBe('继续项目');
  });
});


describe('project owner birth transactions', () => {
  it('prepares and commits ordinary builtin project birth without providerExecutionIdentity and rejects a different repeated scope', async () => {
    const binding = await import('./product-session-binding');
    const { createSessionMetadata } = await import('../types/session');
    await binding.resetProductSessionBinding({ sessionId: 'pending-project-test', workspacePath: projectPath, allowLazySessionMaterialization: true });
    const fixed = projectSpaceSnapshot(projectPath);
    let creations = 0;
    const options = { hasActiveWork: false, createPreparedMetadata: () => {
      creations += 1;
      const metadata = createSessionMetadata(projectPath, { projectSpace: fixed, origin: { kind: 'desktop', surface: 'agent_card' } });
      return { targetSessionId: metadata.id, metadata, reusingNativeSession: false, snapshotKind: 'owned' };
    } };
    const prepared = await binding.preparePendingProductSession({ birthSnapshot: { projectSpace: fixed } }, options);
    expect(prepared.success).toBe(true);
    if (!prepared.success) throw new Error(prepared.error);
    expect(prepared.metadata?.providerExecutionIdentity).toBeUndefined();
    expect(prepared.metadata?.materializationState).toBe('prepared');
    const repeated = await binding.preparePendingProductSession({ birthSnapshot: { projectSpace: { ...fixed, capturedAt: '2026-11-02T01:00:00Z' } } }, options);
    expect(repeated.success).toBe(true);
    const conflict = await binding.preparePendingProductSession({ birthSnapshot: { projectSpace: projectSpaceSnapshot(projectPath, 'B') } }, options);
    expect(conflict).toMatchObject({ success: false, status: 409 });
    expect(creations).toBe(1);
    expect(store.getSessionMetadata(prepared.sessionId!)?.projectSpace).toEqual(fixed);
    const committed = await binding.commitPendingProductSession({ preparedSessionId: prepared.sessionId });
    expect(committed.success).toBe(true);
    expect(store.getSessionMetadata(prepared.sessionId!)?.materializationState).toBeUndefined();
    expect(store.getSessionMetadata(prepared.sessionId!)?.projectSpace).toEqual(fixed);
  });
  it('rejects attaching scope to an already-materialized prewarm session without changing its binding or metadata', async () => {
    const binding = await import('./product-session-binding');
    const source = await createPublishedSession(store, projectPath);
    await binding.resetProductSessionBinding({ sessionId: source.id, workspacePath: projectPath, allowLazySessionMaterialization: false });
    const before = JSON.stringify(store.getSessionMetadata(source.id));
    const create = vi.fn(() => { throw new Error('must not create'); });
    const result = await binding.preparePendingProductSession({ birthSnapshot: { projectSpace: projectSpaceSnapshot(projectPath) } },
      { hasActiveWork: false, createPreparedMetadata: create });
    expect(result).toMatchObject({ success: false, status: 409 });
    expect(create).not.toHaveBeenCalled();
    expect(binding.currentProductSessionId).toBe(source.id);
    expect(JSON.stringify(store.getSessionMetadata(source.id))).toBe(before);
    expect(binding.getPendingProductSessionMaterialization()).toBeNull();
  });
});
