import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_DATA_DIR_NAME } from '../../shared/appProfile';
import { emptyTaskLedger } from '../../shared/sessionTaskOrchestration';
import type { BotGroupConfiguration } from '../../shared/botGroup';
import { projectSpaceSnapshot } from '../__tests__/fixtures/project-space';
import { createPublishedSession } from '../__tests__/fixtures/session-store';
import type { SessionEngine } from './types';

const state = vi.hoisted(() => ({ home: '', broadcast: vi.fn() }));
vi.mock('os', async original => ({ ...await original<typeof import('node:os')>(), homedir: () => state.home }));
vi.mock('../utils/platform', async original => ({ ...await original<typeof import('../utils/platform')>(), getHomeDir: () => state.home, getHomeDirOrNull: () => state.home }));
vi.mock('../sse', () => ({ broadcast: state.broadcast }));
let store: typeof import('../SessionStore');
let owner: typeof import('./bot-group');
let engine: SessionEngine;
let id: string;
let rootPath: string;
let identity: ReturnType<SessionEngine['getRuntimeIdentity']>;
let live: ReturnType<SessionEngine['getLiveSessionState']>;
let queue: ReturnType<SessionEngine['getQueueStatus']>;
const at = '2026-11-07T00:00:00Z';
const input = (patch: Partial<BotGroupConfiguration> = {}): BotGroupConfiguration => ({ sessionId: id, requestId: '11111111-1111-4111-8111-111111111111', expectedRevision: 0, projectRevision: 1, title: 'Project group', memberBotIds: ['bot', 'other'], ...patch });
const configPath = () => join(state.home, APP_DATA_DIR_NAME, 'config.json');
function catalog(otherEnabled = true) {
  writeFileSync(configPath(), JSON.stringify({ agents: [{ id: 'bot', name: 'Original', enabled: true }, { id: 'other', name: 'Independent Bot', enabled: otherEnabled }], projectSpaces: [{
    id: 'A', name: 'Project A', description: '', instructions: '', memberBotIds: ['bot', 'other'], materials: [], resources: [], revision: 1, createdAt: at, updatedAt: at,
  }] }));
}
beforeEach(async () => {
  state.home = mkdtempSync(join(tmpdir(), 'moxbots-bot-group-'));
  mkdirSync(join(state.home, APP_DATA_DIR_NAME), { recursive: true });
  rootPath = join(state.home, 'original'); catalog();
  writeFileSync(join(state.home, APP_DATA_DIR_NAME, 'projects.json'), JSON.stringify([
    { id: 'root-workspace', name: 'Original', agentId: 'bot', path: rootPath },
    { id: 'other-workspace', name: 'Independent', agentId: 'other', path: join(state.home, 'other') },
  ]));
  vi.resetModules(); state.broadcast.mockClear();
  store = await import('../SessionStore'); owner = await import('./bot-group');
  const metadata = await createPublishedSession(store, rootPath, { projectSpace: projectSpaceSnapshot(rootPath) }); id = metadata.id;
  const cursor = (await store.loadSessionTranscript(id)).cursor;
  await store.appendSessionMessages(id, cursor, [{ id: 'private-before-group', role: 'user', content: 'Private earlier conversation', timestamp: at }]);
  identity = { kind: 'builtin', runtime: 'builtin', sessionId: id };
  live = { sessionState: 'idle', isBusy: false }; queue = [];
  engine = { kind: 'builtin', getRuntimeIdentity: () => identity,
    getCurrentSessionContext: () => ({ sessionId: id, workspacePath: rootPath }),
    getLiveSessionState: () => live, getQueueStatus: () => queue, sendDesktopMessage: vi.fn(),
  } as unknown as SessionEngine;
});
afterEach(async () => {
  expect(engine.sendDesktopMessage).not.toHaveBeenCalled();
  await store.drainSessionTranscripts();
  vi.restoreAllMocks();
  vi.unstubAllEnvs(); vi.doUnmock('../session-engine');
  rmSync(state.home, { recursive: true, force: true });
});
describe('stable Bot group through original persisted Session ledger', () => {
  it('persists/reloads exact stable membership and private-history boundary without changing project or task facts', async () => {
    const originalProject = store.getSessionMetadata(id)!.projectSpace;
    const ledger = { ...emptyTaskLedger(), tasks: [{ id: 'older', title: 'Older task', blockedBy: [] }], delegationLaunches: 5 };
    await store.updateSessionMetadata(id, { taskOrchestration: ledger });
    const result = await owner.configureSessionBotGroup(engine, input());
    expect(result.group.members.map(member => member.botId)).toEqual(['bot', 'other']);
    expect(result.group.historyBoundaryMessageId).toBe('private-before-group');
    expect(store.getSessionMetadata(id)!.taskOrchestration).toMatchObject({ revision: 1, delegationLaunches: 5, tasks: ledger.tasks });
    await store.drainSessionTranscripts(); vi.resetModules();
    store = await import('../SessionStore'); owner = await import('./bot-group');
    const reloaded = await store.getSessionData(id);
    expect(reloaded?.taskOrchestration?.botGroup).toEqual(result.group);
    expect(reloaded?.projectSpace).toEqual(originalProject);
    expect(reloaded?.messages[0].content).toBe('Private earlier conversation');
  });
  it('reconciles the same request after an uncertain acknowledgement without a second write or config re-resolution', async () => {
    const result = await owner.configureSessionBotGroup(engine, input());
    const revision = store.getSessionMetadata(id)!.taskOrchestration!.revision;
    const writes = state.broadcast.mock.calls.length;
    catalog(false);
    expect(await owner.configureSessionBotGroup(engine, input())).toEqual(result);
    expect(state.broadcast).toHaveBeenCalledTimes(writes);
    expect(store.getSessionMetadata(id)!.taskOrchestration!.revision).toBe(revision);
    await expect(owner.configureSessionBotGroup(engine, input({ title: 'Changed body' }))).rejects.toThrow('REQUEST_CONFLICT');
  });
  it('serializes two stale configuration edits through the existing metadata CAS', async () => {
    const results = await Promise.allSettled([
      owner.configureSessionBotGroup(engine, input()),
      owner.configureSessionBotGroup(engine, input({ requestId: '22222222-2222-4222-8222-222222222222', title: 'Competing edit' })),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(store.getSessionMetadata(id)!.taskOrchestration!.botGroup!.receipts).toHaveLength(1);
  });
  it('rejects live work, queued input and unknown operations without clearing them', async () => {
    live = { sessionState: 'running', isBusy: true };
    await expect(owner.configureSessionBotGroup(engine, input())).rejects.toThrow('WORK_UNSETTLED');
    live = { sessionState: 'idle', isBusy: false }; queue = [{ id: 'queued', messagePreview: 'queued input' }];
    await expect(owner.configureSessionBotGroup(engine, input())).rejects.toThrow('WORK_UNSETTLED');
    queue = [];
    const ledger = { ...emptyTaskLedger(), delegationClaims: [{ toolUseId: 'unknown-tool', taskId: 'task', executionId: 'execution', state: 'unknown' as const }] };
    await store.updateSessionMetadata(id, { taskOrchestration: ledger });
    await expect(owner.configureSessionBotGroup(engine, input())).rejects.toThrow('WORK_UNSETTLED');
    expect(store.getSessionMetadata(id)!.taskOrchestration).toEqual(ledger);
  });
  it('rechecks exact Runtime identity after history awaits', async () => {
    const get = store.getSessionData;
    vi.spyOn(store, 'getSessionData').mockImplementationOnce(async sessionId => {
      const result = await get(sessionId); identity = { ...identity, boundSessionId: 'replacement' }; return result;
    });
    await expect(owner.configureSessionBotGroup(engine, input())).rejects.toThrow('SESSION_CHANGED');
    expect(store.getSessionMetadata(id)!.taskOrchestration?.botGroup).toBeUndefined();
  });
  it('rejects malformed catalogs instead of replacing history with an empty group', async () => {
    writeFileSync(configPath(), '{ malformed');
    await expect(owner.configureSessionBotGroup(engine, input())).rejects.toThrow();
    expect(store.getSessionMetadata(id)!.taskOrchestration?.botGroup).toBeUndefined();
  });
  it('revalidates the Bot catalog inside the original metadata commit guard', async () => {
    let observations = 0;
    engine.getLiveSessionState = () => {
      if (++observations === 2) catalog(false);
      return live;
    };
    await expect(owner.configureSessionBotGroup(engine, input())).rejects.toThrow('BOT_UNAVAILABLE');
    expect(store.getSessionMetadata(id)!.taskOrchestration?.botGroup).toBeUndefined();
  });
  it('does not expose a mutable alias of the persisted group in an acknowledgement', async () => {
    const response = await owner.configureSessionBotGroup(engine, input());
    response.group.members[0].name = 'Accidental local edit';
    const repeated = await owner.configureSessionBotGroup(engine, input());
    expect(repeated.group.members[0].name).toBe('Original');
    repeated.group.members[0].name = 'Second edit';
    expect(store.getSessionMetadata(id)!.taskOrchestration!.botGroup!.members[0].name).toBe('Original');
  });
  it('accepts exact native-signed configuration through the actual route and reconciles the same request', async () => {
    vi.doMock('../session-engine', () => ({ getSessionEngine: () => engine }));
    const { handleSessionTaskRoute } = await import('../routes/session-task-orchestration');
    const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    vi.stubEnv('MYAGENTS_USER_ACTION_PUBLIC_KEY', keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'));
    const path = '/api/session/task-orchestration/bot-group'; const body = JSON.stringify(input());
    const proof = Buffer.from(JSON.stringify({ version: 1, sessionId: id, path, bodySha256: createHash('sha256').update(body).digest('hex'), timestampMs: Date.now(), nonce: randomUUID() }));
    const headers = { 'x-myagents-user-action': proof.toString('base64'), 'x-myagents-user-action-signature': sign('sha256', proof, keys.privateKey).toString('base64') };
    const response = await handleSessionTaskRoute(path, new Request(`http://local${path}`, { method: 'POST', body, headers }));
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({ success: true, sessionId: id, group: { revision: 1 } });
    const revision = store.getSessionMetadata(id)!.taskOrchestration!.revision;
    const repeated = await handleSessionTaskRoute(path, new Request(`http://local${path}`, { method: 'POST', body, headers }));
    expect(repeated?.status).toBe(200);
    expect(store.getSessionMetadata(id)!.taskOrchestration!.revision).toBe(revision);
    const tampered = await handleSessionTaskRoute(path, new Request(`http://local${path}`, { method: 'POST', body: JSON.stringify(input({ title: 'Tampered' })), headers }));
    expect(await tampered?.json()).toMatchObject({ success: false, error: 'BOT_GROUP_NATIVE_USER_ACTION_REQUIRED' });
    expect(store.getSessionMetadata(id)!.taskOrchestration!.botGroup!.title).toBe('Project group');
  });
  it('rejects unsigned CLI configuration and client-supplied member snapshots without writing', async () => {
    vi.doMock('../session-engine', () => ({ getSessionEngine: () => engine }));
    const { handleSessionTaskRoute } = await import('../routes/session-task-orchestration');
    const path = '/api/session/task-orchestration/bot-group';
    for (const body of [input(), { ...input(), members: [{ botId: 'other', workspacePath: rootPath }] }]) {
      const response = await handleSessionTaskRoute(path, new Request(`http://local${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'x-myagents-internal-cli-token': 'not-user-authority' } }));
      expect(response?.status).toBe(409);
      expect((await response!.json()).success).toBe(false);
    }
    expect(store.getSessionMetadata(id)!.taskOrchestration?.botGroup).toBeUndefined();
  });
});
