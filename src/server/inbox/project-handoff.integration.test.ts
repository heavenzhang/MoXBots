import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_DATA_DIR_NAME } from '../../shared/appProfile';
import { parseLeadingSystemReminder, parseSessionSendRequestDisplay } from '../../shared/systemReminder';
import { projectSpaceSnapshot } from '../__tests__/fixtures/project-space';
import { createPublishedSession } from '../__tests__/fixtures/session-store';
import type { AgentConfig } from '../../shared/types/agent';
import type { PendingInboxMessage } from './types';
import type { FreshSessionInjector } from './start-handler';
const state = vi.hoisted(() => ({ home: '/__bot-handoff-fixture-only__' }));
vi.mock('os', async original => ({ ...await original<typeof import('node:os')>(), homedir: () => state.home }));
vi.mock('../utils/platform', async original => ({ ...await original<typeof import('../utils/platform')>(),
  getHomeDir: () => state.home, getHomeDirOrNull: () => state.home }));
let store: typeof import('../SessionStore');
let start: typeof import('./start-handler');
let message: PendingInboxMessage;
let context: Parameters<typeof start.handleFreshSessionStart>[1];
let configuration: Record<string, unknown>;
function writeConfiguration() { writeFileSync(join(state.home, APP_DATA_DIR_NAME, 'config.json'), JSON.stringify(configuration)); }
beforeEach(async () => {
  state.home = mkdtempSync(join(tmpdir(), 'mox-bot-handoff-'));
  mkdirSync(join(state.home, APP_DATA_DIR_NAME), { recursive: true });
  const leadPath = join(state.home, 'lead'), workerPath = join(state.home, 'worker');
  const agent = { id: 'worker', name: 'Worker', enabled: true, permissionMode: 'plan', model: 'recipient-model' } as AgentConfig;
  configuration = { agents: [{ id: 'lead', name: 'Lead', enabled: true }, agent], projectSpaces: [{ id: 'A', name: 'Edited', description: 'edited description', instructions: 'edited instructions',
    memberBotIds: ['lead', 'worker'], materials: [], resources: [], revision: 2, createdAt: '2026-11-07T00:00:00Z', updatedAt: '2026-11-07T00:00:00Z' }] };
  writeConfiguration();
  writeFileSync(join(state.home, APP_DATA_DIR_NAME, 'projects.json'), JSON.stringify([
    { id: 'lead-workspace', name: 'Lead', path: leadPath, agentId: 'lead' },
    { id: 'worker-workspace', name: 'Worker', path: workerPath, agentId: 'worker' },
  ]));
  vi.resetModules();
  store = await import('../SessionStore');
  start = await import('./start-handler');
  const source = await createPublishedSession(store, leadPath, { projectSpace: projectSpaceSnapshot(leadPath, 'A', 'lead') });
  message = { messageId: 'handoff-1', fromSessionId: source.id, sourceKind: 'internal-session', fromLabel: 'Lead', toSessionId: 'target-session',
    text: 'Review the specification', kind: 'request', replyBack: true };
  context = { sessionId: message.toSessionId, workspacePath: workerPath, agent, runtime: 'builtin', inheritProject: true };
});
afterEach(async () => {
  await store.drainSessionTranscripts();
  rmSync(state.home, { recursive: true, force: true });
});
const accept: FreshSessionInjector = async (_text, options) => ({ queued: true, dispatchAcceptance: Promise.resolve(await options.beforeDispatch()) });
describe('local Bot project handoff using real isolated SessionStore', () => {
  it('injects the fixed brief, retains recipient authority and survives a cold read', async () => {
    let prompt = '';
    const inject: FreshSessionInjector = async (text, options) => {
      prompt = text;
      const metadata = store.getSessionMetadata(context.sessionId)!;
      expect(metadata.projectSpace).toMatchObject({ projectId: 'A', projectRevision: 1, botId: 'worker', workspacePath: context.workspacePath });
      expect(metadata.permissionMode).toBe('plan');
      expect(metadata.model).toBe('recipient-model');
      expect(options.inboxMeta).toMatchObject({ fromSessionId: message.fromSessionId, originalMessageId: 'handoff-1', replyBack: true });
      const result = await accept(text, options);
      const transcript = await store.loadSessionTranscript(context.sessionId);
      expect((await store.appendSessionMessages(context.sessionId, transcript.cursor, [{ id: 'input-1', role: 'user', content: text, timestamp: new Date().toISOString() }])).ok).toBe(true);
      return result;
    };
    expect(await start.handleFreshSessionStart(message, context, inject)).toEqual({ accepted: true });
    expect(prompt).toContain('A-fixed-instructions');
    expect(prompt).toContain('A-material-secret');
    expect(prompt).not.toContain('edited instructions');
    expect(prompt.match(/<system-reminder>/g)).toHaveLength(1);
    expect(parseSessionSendRequestDisplay(parseLeadingSystemReminder(prompt))).toEqual({ payload: message.text, sourceLabel: 'Lead' });
    await store.drainSessionTranscripts();
    vi.resetModules(); store = await import('../SessionStore');
    const reopened = await store.getSessionData(context.sessionId);
    expect(reopened?.projectSpace).toMatchObject({ projectRevision: 1, botId: 'worker', instructions: 'A-fixed-instructions' });
    expect(reopened?.messages[0].content).toBe(prompt);
    expect(reopened?.origin).toEqual({ kind: 'session-inbox', surface: 'session_send' });
  });
  it('persists the same collaboration through real local handoff and injects its roster once', async () => {
    const leadPath = store.getSessionMetadata(message.fromSessionId!)!.agentDir;
    const fixed = { ...projectSpaceSnapshot(leadPath, 'A', 'lead'), collaboration: { leadSessionId: 'frozen-root', leadBotId: 'lead', members: [{ id: 'lead', name: 'Lead' }, { id: 'worker', name: 'Worker' }] } };
    const root = await createPublishedSession(store, leadPath, { projectSpace: fixed });
    message.fromSessionId = root.id;
    let prompt = '';
    const inject: FreshSessionInjector = async (text, options) => { prompt = text; return accept(text, options); };
    expect(await start.handleFreshSessionStart(message, context, inject)).toEqual({ accepted: true });
    expect(store.getSessionMetadata(context.sessionId)?.projectSpace?.collaboration).toEqual(fixed.collaboration);
    expect(prompt).toContain('frozen-root'); expect(prompt).toContain('leadBotId'); expect(prompt).toContain('Worker');
    expect(prompt.match(/<system-reminder>/g)).toHaveLength(1);
    expect(parseSessionSendRequestDisplay(parseLeadingSystemReminder(prompt))).toEqual({ payload: message.text, sourceLabel: 'Lead' });
    await store.drainSessionTranscripts(); vi.resetModules(); store = await import('../SessionStore');
    expect((await store.getSessionData(context.sessionId))?.projectSpace?.collaboration).toEqual(fixed.collaboration);
  });
  it.each(['deleted', 'archived', 'removed', 'missing-source', 'external', 'corrupt'])('rejects %s before model admission or target metadata', async reason => {
    const project = (configuration.projectSpaces as Array<Record<string, unknown>>)[0];
    if (reason === 'deleted') configuration.projectSpaces = [];
    if (reason === 'archived') project.archivedAt = '2026-11-07T01:00:00Z';
    if (reason === 'removed') project.memberBotIds = ['lead'];
    if (reason === 'missing-source') message.fromSessionId = 'missing';
    if (reason === 'external') message.sourceKind = 'external-cli';
    writeConfiguration();
    if (reason === 'corrupt') writeFileSync(join(state.home, APP_DATA_DIR_NAME, 'config.json'), '{invalid');
    const inject = vi.fn(accept);
    const result = await start.handleFreshSessionStart(message, context, inject);
    expect(result.accepted).toBe(false);
    expect(result.reason).toMatch(({ deleted: /no longer exists/, archived: /archived/, removed: /member/, 'missing-source': /unavailable/, external: /local source/, corrupt: /REGISTRY_CORRUPT/ })[reason]!);
    expect(inject).not.toHaveBeenCalled();
    expect(store.getSessionMetadata(context.sessionId)).toBeNull();
  });
  it.each([false, true])('preserves admission uncertainty=%s without replay', async unconfirmed => {
    const result = await start.handleFreshSessionStart(message, context, async () => ({ queued: false,
      terminationUnconfirmed: unconfirmed, dispatchAcceptance: Promise.resolve({ accepted: false, error: 'not accepted' }) }));
    if (unconfirmed) {
      expect(result).toMatchObject({ accepted: null, unconfirmed: true });
      expect(store.getSessionMetadata(context.sessionId)?.projectSpace?.botId).toBe('worker');
    } else {
      expect(result.accepted).toBe(false);
      expect(store.getSessionMetadata(context.sessionId)).toBeNull();
    }
  });
  it('keeps legacy non-project starts unchanged and does not read source scope for remote starts', async () => {
    message.fromSessionId = 'remote-source-not-local';
    expect(await start.handleFreshSessionStart(message, { ...context, inheritProject: false }, accept)).toEqual({ accepted: true });
    expect(store.getSessionMetadata(context.sessionId)?.projectSpace).toBeUndefined();
  });
});
