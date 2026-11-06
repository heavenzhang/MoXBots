import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_DATA_DIR_NAME } from '../../shared/appProfile';
import { readBotGroupDeliveries, type BotGroupSend, type BotGroupDelivery } from '../../shared/botGroupDelivery';
import { handleInboxDrain } from '../inbox/drain-handler';
import type { PendingInboxMessage } from '../inbox/types';
import type { BotGroupConfiguration } from '../../shared/botGroup';
import { projectSpaceSnapshot } from '../__tests__/fixtures/project-space';
import { createPublishedSession } from '../__tests__/fixtures/session-store';
import type { SessionEngine } from './types';
import type { AgentConfig } from '../../shared/types/agent';

const state = vi.hoisted(() => ({ home: '', broadcast: vi.fn(), transport: vi.fn() }));
vi.mock('os', async original => ({ ...await original<typeof import('node:os')>(), homedir: () => state.home }));
vi.mock('../utils/platform', async original => ({ ...await original<typeof import('../utils/platform')>(), getHomeDir: () => state.home, getHomeDirOrNull: () => state.home }));
vi.mock('../sse', () => ({ broadcast: state.broadcast }));
vi.mock('../utils/cancellation', async original => ({ ...await original<typeof import('../utils/cancellation')>(), cancellableFetch: state.transport }));
let delivery: typeof import('./bot-group-delivery');
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
  vi.resetModules(); state.broadcast.mockClear(); state.transport.mockReset(); vi.stubEnv('MYAGENTS_MANAGEMENT_PORT', '12345');
  store = await import('../SessionStore'); owner = await import('./bot-group'); delivery = await import('./bot-group-delivery');
  const metadata = await createPublishedSession(store, rootPath, { projectSpace: projectSpaceSnapshot(rootPath) }); id = metadata.id;
  const cursor = (await store.loadSessionTranscript(id)).cursor;
  await store.appendSessionMessages(id, cursor, [{ id: 'private-before-group', role: 'user', content: 'Private earlier conversation', timestamp: at }]);
  identity = { kind: 'builtin', runtime: 'builtin', sessionId: id };
  live = { sessionState: 'idle', isBusy: false }; queue = [];
  engine = { kind: 'builtin', getRuntimeIdentity: () => identity,
    getCurrentSessionContext: () => ({ sessionId: id, workspacePath: rootPath }),
    getLiveSessionState: () => live, getQueueStatus: () => queue, sendDesktopMessage: vi.fn(),
  } as unknown as SessionEngine;
  await owner.configureSessionBotGroup(engine, input());
});
afterEach(async () => {
  expect(engine.sendDesktopMessage).not.toHaveBeenCalled();
  await store.drainSessionTranscripts();
  vi.restoreAllMocks();
  vi.unstubAllEnvs(); vi.doUnmock('../session-engine');
  rmSync(state.home, { recursive: true, force: true });
});

const command = (patch: Partial<BotGroupSend> = {}): BotGroupSend => ({ sessionId: id, requestId: randomUUID(),
  recipient: { groupId: id, botId: 'other', groupRevision: 1 }, text: 'Review the group brief', ...patch });
function nativeAck(status = 'accepted') {
  state.transport.mockImplementation(async (_url: string, options: RequestInit) => {
    const body = JSON.parse(options.body as string);
    return Response.json({ ok: true, outcome: { status, agentId: body.agentId, sessionId: body.groupDispatch.targetSessionId,
      messageId: body.groupDispatch.messageId, replyBack: true } });
  });
}
async function target(record: BotGroupDelivery, projectId = 'A') {
  const metadata = (await import('../types/session')).createSessionMetadata(record.workspacePath, {
    id: record.targetSessionId, projectSpace: projectSpaceSnapshot(record.workspacePath, projectId, record.botId),
    origin: { kind: 'session-inbox', surface: 'session_send' },
  });
  await store.saveSessionMetadata(metadata);
}
function reply(record: BotGroupDelivery, text = 'The group result'): PendingInboxMessage {
  const eventId = randomUUID();
  return { kind: 'reply', messageId: eventId, fromSessionId: record.targetSessionId, toSessionId: id, fromLabel: record.botName, replyBack: false, text,
    sessionEvent: { version: 1, type: 'send.result', eventId, requestEventId: record.messageId, sourceSessionId: record.targetSessionId,
      targetSessionId: id, payload: text, status: 'ok', terminalReason: 'completed', createdAt: at, turnId: 'real-terminal-turn', terminalStatus: 'complete' } };
}
describe('original Session ledger group dispatch and receipt ownership', () => {
  it('persists the exact claim before I/O, routes once to the selected Bot, and reloads it after restart', async () => {
    const send = command();
    state.transport.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body);
      const [claim] = readBotGroupDeliveries(store.getSessionMetadata(id)!.taskOrchestration);
      expect(claim).toMatchObject({ state: 'reserved', requestId: send.requestId, botId: 'other', targetSessionId: body.groupDispatch.targetSessionId, messageId: body.groupDispatch.messageId });
      expect(body).toMatchObject({ agentId: 'other', fromSessionId: id, inheritProject: true, replyBack: true });
      expect(JSON.stringify(body)).not.toContain('Private earlier conversation');
      return Response.json({ ok: true, outcome: { status: 'accepted', agentId: body.agentId, sessionId: claim.targetSessionId, messageId: claim.messageId } });
    });
    const response = await delivery.sendBotGroupMessage(engine, send);
    expect(response.delivery.state).toBe('accepted');
    catalog(false);
    expect(await delivery.sendBotGroupMessage(engine, send)).toEqual(response);
    expect(state.transport).toHaveBeenCalledTimes(1);
    await store.drainSessionTranscripts(); vi.resetModules(); store = await import('../SessionStore');
    expect((await store.getSessionData(id))?.taskOrchestration?.botGroupDeliveries).toEqual([response.delivery]);
  });
  it('serializes concurrent identical requests without starting a second target', async () => {
    nativeAck(); const send = command();
    const responses = await Promise.all([delivery.sendBotGroupMessage(engine, send), delivery.sendBotGroupMessage(engine, send)]);
    expect(state.transport).toHaveBeenCalledTimes(1);
    expect(new Set(responses.map(value => value.delivery.targetSessionId)).size).toBe(1);
  });
  it('retains unknown delivery and refuses a new request without replaying the old one', async () => {
    state.transport.mockRejectedValue(new Error('lost acknowledgement')); const send = command();
    expect((await delivery.sendBotGroupMessage(engine, send)).delivery.state).toBe('unconfirmed');
    await delivery.sendBotGroupMessage(engine, send);
    await expect(delivery.sendBotGroupMessage(engine, command())).rejects.toThrow('DELIVERY_UNCONFIRMED');
    await expect(delivery.sendBotGroupMessage(engine, { ...send, text: 'different body' })).rejects.toThrow('REQUEST_CONFLICT');
    expect(state.transport).toHaveBeenCalledTimes(1);
    await expect(owner.configureSessionBotGroup(engine, input({ requestId: randomUUID(), expectedRevision: 1, title: 'Changed' }))).rejects.toThrow('WORK_UNSETTLED');
  });
  it('rejects stale selection, busy source, and disabled target before recording or dispatch', async () => {
    await expect(delivery.sendBotGroupMessage(engine, command({ recipient: { groupId: id, botId: 'other', groupRevision: 2 } }))).rejects.toThrow('REVISION_CONFLICT');
    live = { sessionState: 'running', isBusy: true };
    await expect(delivery.sendBotGroupMessage(engine, command())).rejects.toThrow('WORK_UNSETTLED');
    live = { sessionState: 'idle', isBusy: false }; catalog(false);
    await expect(delivery.sendBotGroupMessage(engine, command())).rejects.toThrow();
    expect(state.transport).not.toHaveBeenCalled();
    expect(readBotGroupDeliveries(store.getSessionMetadata(id)!.taskOrchestration)).toHaveLength(0);
  });
  it('treats a mismatched native ACK as unknown, never as the requested target accepted', async () => {
    state.transport.mockResolvedValue(Response.json({ ok: true, outcome: { status: 'accepted', agentId: 'other', sessionId: 'wrong', messageId: 'wrong' } }));
    expect((await delivery.sendBotGroupMessage(engine, command())).delivery.state).toBe('unconfirmed');
  });
  it('records a fast terminal reply without overwriting it with the later admission ACK or waking the root model', async () => {
    let originalReply: PendingInboxMessage;
    state.transport.mockImplementation(async () => {
      const [claim] = readBotGroupDeliveries(store.getSessionMetadata(id)!.taskOrchestration);
      await target(claim); originalReply = reply(claim);
      const injector = vi.fn();
      expect(await handleInboxDrain([originalReply], injector, msg => delivery.receiveBotGroupReply(engine, msg))).toEqual({ accepted: true });
      expect(injector).not.toHaveBeenCalled();
      return Response.json({ ok: true, outcome: { status: 'accepted', agentId: claim.botId, sessionId: claim.targetSessionId, messageId: claim.messageId } });
    });
    const result = await delivery.sendBotGroupMessage(engine, command());
    expect(result.delivery).toMatchObject({ state: 'completed', result: { text: 'The group result', turnId: 'real-terminal-turn' } });
    const revision = store.getSessionMetadata(id)!.taskOrchestration!.revision;
    expect(await delivery.receiveBotGroupReply(engine, originalReply!)).toBe(true);
    expect(store.getSessionMetadata(id)!.taskOrchestration!.revision).toBe(revision);
  });
  it('rejects cross-request, cross-target, cross-project and changed-root results', async () => {
    nativeAck(); const { delivery: claim } = await delivery.sendBotGroupMessage(engine, command());
    const wrongRequest = reply(claim); if (wrongRequest.sessionEvent?.type === 'send.result') wrongRequest.sessionEvent.requestEventId = randomUUID();
    await expect(delivery.receiveBotGroupReply(engine, wrongRequest)).rejects.toThrow('MISMATCH');
    const wrongTarget = { ...reply(claim), toSessionId: 'elsewhere' };
    await expect(delivery.receiveBotGroupReply(engine, wrongTarget)).rejects.toThrow('WRONG_OWNER');
    await expect(delivery.receiveBotGroupReply(engine, { ...reply(claim), fromSessionId: 'unrelated-source' })).rejects.toThrow('MISMATCH');
    await target(claim, 'B');
    await expect(delivery.receiveBotGroupReply(engine, reply(claim))).rejects.toThrow('IDENTITY_CHANGED');
    identity = { ...identity, sessionId: 'changed' };
    await expect(delivery.receiveBotGroupReply(engine, reply(claim))).rejects.toThrow('WRONG_OWNER');
    expect(readBotGroupDeliveries(store.getSessionMetadata(id)!.taskOrchestration)[0].state).toBe('accepted');
  });
  it('keeps a reply without terminal turn evidence unknown and detects changes beyond a truncated excerpt', async () => {
    nativeAck(); const { delivery: claim } = await delivery.sendBotGroupMessage(engine, command()); await target(claim);
    const message = reply(claim, '你'.repeat(14000)); if (message.sessionEvent) delete message.sessionEvent.turnId;
    await delivery.receiveBotGroupReply(engine, message);
    const saved = readBotGroupDeliveries(store.getSessionMetadata(id)!.taskOrchestration)[0];
    expect(saved.state).toBe('unconfirmed'); expect(saved.result!.truncated).toBe(true);
    expect(Buffer.byteLength(saved.result!.text)).toBeLessThanOrEqual(32768);
    const changed = structuredClone(message); changed.text += 'changed'; if (changed.sessionEvent?.type === 'send.result') changed.sessionEvent.payload = changed.text;
    await expect(delivery.receiveBotGroupReply(engine, changed)).rejects.toThrow('CONFLICT');
  });
  it('requires the exact native signed user action on the actual send route', async () => {
    nativeAck(); vi.doMock('../session-engine', () => ({ getSessionEngine: () => engine }));
    const { handleSessionTaskRoute } = await import('../routes/session-task-orchestration');
    const path = '/api/session/task-orchestration/bot-group/send'; const body = JSON.stringify(command());
    const unsigned = await handleSessionTaskRoute(path, new Request(`http://local${path}`, { method: 'POST', body }));
    expect(unsigned?.status).toBe(409); expect(state.transport).not.toHaveBeenCalled();
    const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    vi.stubEnv('MYAGENTS_USER_ACTION_PUBLIC_KEY', keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'));
    const proof = Buffer.from(JSON.stringify({ version: 1, sessionId: id, path, bodySha256: createHash('sha256').update(body).digest('hex'), timestampMs: Date.now(), nonce: randomUUID() }));
    const headers = { 'x-myagents-user-action': proof.toString('base64'), 'x-myagents-user-action-signature': sign('sha256', proof, keys.privateKey).toString('base64') };
    const response = await handleSessionTaskRoute(path, new Request(`http://local${path}`, { method: 'POST', body, headers }));
    expect(response?.status).toBe(200); expect(state.transport).toHaveBeenCalledTimes(1);
  });
  it('admits a target with its own configuration and only bounded group-visible history plus the fixed project', async () => {
    nativeAck();
    const first = (await delivery.sendBotGroupMessage(engine, command({ text: 'Group-visible earlier request' }))).delivery;
    await target(first); await delivery.receiveBotGroupReply(engine, reply(first, 'Group-visible earlier answer'));
    const second = (await delivery.sendBotGroupMessage(engine, command())).delivery;
    const { handleFreshSessionStart } = await import('../inbox/start-handler');
    const metadata = store.getSessionMetadata(id)!;
    const message: PendingInboxMessage = { kind: 'request', messageId: second.messageId, fromSessionId: id, fromLabel: 'Group',
      toSessionId: second.targetSessionId, replyBack: true, text: second.text };
    const inject = vi.fn(async (text: string, options: Parameters<import('../inbox/start-handler').FreshSessionInjector>[1]) => {
      expect(text).toContain('Group-visible earlier request'); expect(text).toContain('Group-visible earlier answer');
      expect(text).toContain(metadata.projectSpace!.instructions); expect(text).not.toContain('Private earlier conversation');
      return { queued: true, dispatchAcceptance: Promise.resolve(await options.beforeDispatch()) };
    });
    const context = { sessionId: second.targetSessionId, workspacePath: second.workspacePath, runtime: 'builtin' as const,
      agent: { id: 'other', name: 'Target with own config', enabled: true, permissionMode: 'plan' } as AgentConfig,
      inheritProject: true, groupDispatch: { groupId: id, requestId: second.requestId, targetSessionId: second.targetSessionId, messageId: second.messageId } };
    expect(await handleFreshSessionStart(message, context, inject)).toEqual({ accepted: true });
    const saved = store.getSessionMetadata(second.targetSessionId)!;
    expect(saved.materializationState).not.toBe('prepared');
    expect(saved.projectSpace).toMatchObject({ projectId: 'A', projectRevision: metadata.projectSpace!.projectRevision,
      instructions: metadata.projectSpace!.instructions, botId: 'other', workspacePath: second.workspacePath });
    expect(saved.permissionMode).toBe('plan');
    expect(await handleFreshSessionStart(message, context, inject)).toMatchObject({ accepted: false });
    expect(inject).toHaveBeenCalledTimes(1);
  });
  it('revalidates a disabled target at the actual dispatch boundary and rolls back its prepared Session', async () => {
    nativeAck(); const claim = (await delivery.sendBotGroupMessage(engine, command())).delivery;
    const { handleFreshSessionStart } = await import('../inbox/start-handler');
    const message: PendingInboxMessage = { kind: 'request', messageId: claim.messageId, fromSessionId: id, fromLabel: 'Group',
      toSessionId: claim.targetSessionId, replyBack: true, text: claim.text };
    const response = await handleFreshSessionStart(message, { sessionId: claim.targetSessionId, workspacePath: claim.workspacePath, runtime: 'builtin',
      agent: { id: 'other', name: 'Target', enabled: true } as AgentConfig, inheritProject: true,
      groupDispatch: { groupId: id, requestId: claim.requestId, targetSessionId: claim.targetSessionId, messageId: claim.messageId } },
    async (_text, options) => {
      catalog(false);
      return { queued: false, dispatchAcceptance: Promise.resolve(await options.beforeDispatch()) };
    });
    expect(response).toEqual({ accepted: false, reason: 'BOT_GROUP_BOT_UNAVAILABLE' });
    expect(store.getSessionMetadata(claim.targetSessionId)).toBeNull();
  });
  it('reserves room for escaped terminal results and rejects a full history before any outbound work', async () => {
    const prior = store.getSessionMetadata(id)!.taskOrchestration!;
    await store.updateSessionMetadata(id, { taskOrchestration: { ...prior, tasks: [{ id: 'large', title: 'x'.repeat(850000), blockedBy: [] }] } });
    await expect(delivery.sendBotGroupMessage(engine, command())).rejects.toThrow('HISTORY_LIMIT');
    expect(state.transport).not.toHaveBeenCalled();
    expect(readBotGroupDeliveries(store.getSessionMetadata(id)!.taskOrchestration)).toHaveLength(0);
  });
  it('leaves ordinary Inbox traffic and unbound lazy births with their original admission path', async () => {
    const message: PendingInboxMessage = { kind: 'request', messageId: randomUUID(), fromSessionId: 'ordinary-source',
      fromLabel: 'Ordinary', toSessionId: id, text: 'Ordinary request', replyBack: true };
    const injector = vi.fn(async () => ({ queued: false }));
    expect(await handleInboxDrain([message], injector, msg => delivery.receiveBotGroupReply(engine, msg))).toEqual({ accepted: true });
    identity = { kind: 'builtin', runtime: 'builtin', sessionId: '' };
    expect(await handleInboxDrain([message], injector, msg => delivery.receiveBotGroupReply(engine, msg))).toEqual({ accepted: true });
    expect(injector).toHaveBeenCalledTimes(2);
  });
  it('rechecks source authority inside the original commit guard before any native start', async () => {
    let observations = 0;
    engine.getLiveSessionState = () => { if (++observations === 2) catalog(false); return live; };
    await expect(delivery.sendBotGroupMessage(engine, command())).rejects.toThrow('BOT_UNAVAILABLE');
    expect(state.transport).not.toHaveBeenCalled();
    expect(readBotGroupDeliveries(store.getSessionMetadata(id)!.taskOrchestration)).toHaveLength(0);
  });
});
