import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionEngineLiveState } from '../session-engine/types';

const mocks = vi.hoisted(() => ({
  engine: {
    getBackgroundTaskDetail: vi.fn(),
    acknowledgeBackgroundWork: vi.fn(),
    getExecutionTurnId: vi.fn(() => 'turn-1'),
    getRuntimeIdentity: vi.fn(() => ({ kind: 'builtin', runtime: 'builtin', sessionId: 'sid' })),
    getLiveSessionState: vi.fn<() => Partial<SessionEngineLiveState>>(() => ({ sessionState: 'idle', isBusy: false, hasBackgroundWork: false })),
    getSessionCompletionTerminal: vi.fn<() => Record<string, unknown> | null>(() => null),
    getLatestAssistantResult: vi.fn(() => ({ sessionId: 'sid', latestResult: 'latest answer' })),
    getLiveSessionOverlay: vi.fn<() => Record<string, unknown>>(() => ({ isActive: false })),
  },
  getSessionData: vi.fn(),
  isHistoryVisibleSession: vi.fn(() => true),
  pendingSessionWatchCount: vi.fn(() => 1),
  registerPendingSessionWatch: vi.fn(watch => watch),
}));

vi.mock('../session-engine', () => ({
  getSessionEngine: () => mocks.engine,
}));

vi.mock('../SessionStore', () => ({
  getSessionData: mocks.getSessionData,
  getSessionMetadata: vi.fn(() => ({ id: 'sid', title: 'Target' })),
  isHistoryVisibleSession: mocks.isHistoryVisibleSession,
}));

vi.mock('../inbox/watch-registry', () => ({
  pendingSessionWatchCount: mocks.pendingSessionWatchCount,
  registerPendingSessionWatch: mocks.registerPendingSessionWatch,
}));

vi.mock('../utils/session-message-preview', () => ({
  shrinkSessionMessageForClient: (message: unknown) => message,
  shrinkSessionMessagesForClient: (messages: unknown) => messages,
}));

import { handleSessionReadRoute } from './session-read';

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

describe('handleSessionReadRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.engine.getRuntimeIdentity.mockReturnValue({ kind: 'builtin', runtime: 'builtin', sessionId: 'sid' });
    mocks.engine.getLiveSessionState.mockReturnValue({ sessionState: 'idle', isBusy: false, hasBackgroundWork: false });
    mocks.engine.getSessionCompletionTerminal.mockReturnValue(null);
    mocks.engine.getLatestAssistantResult.mockReturnValue({ sessionId: 'sid', latestResult: 'latest answer' });
    mocks.engine.getLiveSessionOverlay.mockReturnValue({ isActive: false });
    mocks.getSessionData.mockReturnValue(null);
    mocks.isHistoryVisibleSession.mockReturnValue(true);
    mocks.pendingSessionWatchCount.mockReturnValue(1);
  });

  it('validates background task requests before asking the current engine', async () => {
    for (const query of ['', '?toolUseId=../secret', '?toolUseId=ok&toolUseId=other', '?toolUseId=' + 'x'.repeat(257)]) {
      const url = new URL('http://local/api/session/background-task' + query);
      const response = await handleSessionReadRoute(url.pathname, new Request(url), url);
      expect(response?.status).toBe(400);
      expect(response?.headers.get('Cache-Control')).toBe('no-store');
      expect(await response?.json()).toEqual({ success: false, errorCode: 'INVALID_TOOL_USE_ID' });
    }
    const url = new URL('http://local/api/session/background-task?toolUseId=tool');
    const methodResponse = await handleSessionReadRoute(url.pathname, new Request(url, { method: 'POST' }), url);
    expect(methodResponse?.status).toBe(405);
    expect(methodResponse?.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.engine.getBackgroundTaskDetail).not.toHaveBeenCalled();
  });

  it('delegates background details and maps unavailable/unknown runtime results', async () => {
    const url = new URL('http://local/api/session/background-task?toolUseId=call_123');
    mocks.engine.getBackgroundTaskDetail.mockResolvedValue({ success: true, task: { output: 'real output', status: 'running' } });
    const response = await handleSessionReadRoute(url.pathname, new Request(url), url);
    expect(await response?.json()).toEqual({ success: true, task: { output: 'real output', status: 'running' } });
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.engine.getBackgroundTaskDetail).toHaveBeenCalledWith('call_123');
    mocks.engine.getBackgroundTaskDetail.mockResolvedValue({ success: false, errorCode: 'BACKGROUND_TASK_NOT_FOUND' });
    const missing = await handleSessionReadRoute(url.pathname, new Request(url), url);
    expect(missing?.status).toBe(200);
    expect(missing?.headers.get('Cache-Control')).toBe('no-store');
    mocks.engine.getBackgroundTaskDetail.mockRejectedValue(new Error('private path must not escape'));
    const unavailable = await handleSessionReadRoute(url.pathname, new Request(url), url);
    expect(unavailable?.status).toBe(503);
    expect(unavailable?.headers.get('Cache-Control')).toBe('no-store');
    expect(await unavailable?.json()).toEqual({ success: false, errorCode: 'BACKGROUND_TASK_UNAVAILABLE' });
  });

  it('returns an explicit unsupported result for runtimes without task output', async () => {
    const original = mocks.engine.getBackgroundTaskDetail;
    mocks.engine.getBackgroundTaskDetail = undefined as never;
    try {
      const url = new URL('http://local/api/session/background-task?toolUseId=tool');
      const response = await handleSessionReadRoute(url.pathname, new Request(url), url);
      expect(response?.status).toBe(200);
      expect(await response?.json()).toEqual({ success: false, errorCode: 'BACKGROUND_TASK_UNSUPPORTED' });
      expect(response?.headers.get('Cache-Control')).toBe('no-store');
    } finally { mocks.engine.getBackgroundTaskDetail = original; }
  });

  it('reads live session state and latest result from the active engine', async () => {
    mocks.engine.getLiveSessionState.mockReturnValue({ sessionState: 'idle', isBusy: true, hasBackgroundWork: true });
    mocks.engine.getSessionCompletionTerminal.mockReturnValue({
      sessionId: 'sid',
      workspacePath: '/tmp/workspace',
      turnId: 'turn-1',
      origin: { kind: 'desktop', surface: 'launcher_input' },
      status: 'complete',
    });
    const stateResponse = await handleSessionReadRoute(
      '/api/session-state',
      new Request('http://local/api/session-state'),
      new URL('http://local/api/session-state'),
    );
    const latestResponse = await handleSessionReadRoute(
      '/api/session-latest-result',
      new Request('http://local/api/session-latest-result'),
      new URL('http://local/api/session-latest-result'),
    );

    expect(await readJson(stateResponse as Response)).toEqual({
      sessionId: 'sid',
      sessionState: 'idle',
      isBusy: true,
      waitingForUser: false,
      hasBackgroundWork: true,
      completionTerminal: {
        sessionId: 'sid',
        workspacePath: '/tmp/workspace',
        turnId: 'turn-1',
        origin: { kind: 'desktop', surface: 'launcher_input' },
        status: 'complete',
      },
    });
    expect(await readJson(latestResponse as Response)).toEqual({
      sessionId: 'sid',
      latestResult: 'latest answer',
    });
  });

  it('reports classified background work so the scheduler can resume past an acknowledged shell', async () => {
    const shell = { taskId: 'shell', runId: 'run-1', taskType: 'local_bash', description: 'serve on 8093' };
    mocks.engine.getLiveSessionState.mockReturnValue({
      sessionState: 'idle',
      isBusy: false,
      hasBackgroundWork: true,
      backgroundWorkBlocksContinuation: false,
      backgroundWork: {
        active: [shell],
        blocking: [],
        acknowledgeableShells: [shell],
        acknowledged: [shell],
        blocksContinuation: false,
      },
    });

    const response = await handleSessionReadRoute(
      '/api/session-state',
      new Request('http://local/api/session-state'),
      new URL('http://local/api/session-state'),
    );

    expect(await readJson(response as Response)).toMatchObject({
      sessionState: 'idle',
      isBusy: false,
      waitingForUser: false,
      hasBackgroundWork: true,
      backgroundWorkBlocksContinuation: false,
      backgroundWork: {
        active: 1,
        blocking: 0,
        acknowledgeableShells: [{ taskId: 'shell', runId: 'run-1', description: 'serve on 8093' }],
        acknowledged: ['shell'],
      },
    });
  });

  it('passes exact observed identities and revoke decisions to the owner', async () => {
    const identity = { taskId: 'shell', runId: 'run-1', queryId: 'query-incarnation' };
    const url = new URL('http://local/api/session/background-work/acknowledge');
    mocks.engine.acknowledgeBackgroundWork.mockReturnValue({ acknowledged: [identity], rejected: [] });
    for (const allow of [true, false]) {
      const response = await handleSessionReadRoute(url.pathname, new Request(url, {
        method: 'POST', body: JSON.stringify({ tasks: [identity], allow }),
      }), url);
      expect(await response?.json()).toMatchObject({ success: true, allow, acknowledged: [identity], rejected: [] });
      expect(response?.headers.get('Cache-Control')).toBe('no-store');
      expect(mocks.engine.acknowledgeBackgroundWork).toHaveBeenLastCalledWith([identity], allow);
    }
  });

  it.each([
    { taskIds: ['shell'] },
    { tasks: [] , allow: true },
    { tasks: [{ taskId: 'shell', runId: 'r' }], allow: true },
    { tasks: [{ taskId: 'shell', runId: '', queryId: 'q' }], allow: true },
    { tasks: [{ taskId: '../secret', runId: 'r', queryId: 'q' }], allow: true },
    { tasks: [{ taskId: 'shell', runId: 'r', queryId: 'q' }] },
  ])('rejects missing or malformed observed identities without acknowledging current work (%j)', async body => {
    const url = new URL('http://local/api/session/background-work/acknowledge');
    const response = await handleSessionReadRoute(url.pathname, new Request(url, {
      method: 'POST', body: JSON.stringify(body),
    }), url);
    expect(response?.status).toBe(400);
    expect(await response?.json()).toEqual({ success: false, errorCode: 'INVALID_TASK_IDENTITIES' });
    expect(mocks.engine.acknowledgeBackgroundWork).not.toHaveBeenCalled();
  });

  it('registers a pending watch only when the target matches active engine identity', async () => {
    mocks.engine.getLiveSessionState.mockReturnValue({ sessionState: 'running', isBusy: true, hasBackgroundWork: false });

    const response = await handleSessionReadRoute(
      '/api/session-watch/register',
      new Request('http://local/api/session-watch/register', {
        method: 'POST',
        body: JSON.stringify({
          watchId: 'watch-1',
          watcherSessionId: 'watcher',
          targetSessionId: 'sid',
        }),
      }),
      new URL('http://local/api/session-watch/register'),
    );

    expect(response?.status).toBe(200);
    expect(await readJson(response as Response)).toMatchObject({
      accepted: true,
      delivery: 'registered',
      pending: 1,
    });
    expect(mocks.registerPendingSessionWatch).toHaveBeenCalledWith(
      expect.objectContaining({
        watchId: 'watch-1',
        watcherSessionId: 'watcher',
        targetSessionId: 'sid',
        targetStateAtRegistration: 'running',
      }),
    );
  });

  it('rejects watch registration when target does not match the active engine session', async () => {
    const response = await handleSessionReadRoute(
      '/api/session-watch/register',
      new Request('http://local/api/session-watch/register', {
        method: 'POST',
        body: JSON.stringify({
          watchId: 'watch-1',
          watcherSessionId: 'watcher',
          targetSessionId: 'other',
        }),
      }),
      new URL('http://local/api/session-watch/register'),
    );

    expect(response?.status).toBe(409);
    expect(await readJson(response as Response)).toEqual({
      accepted: false,
      reason: 'target session mismatch',
    });
    expect(mocks.registerPendingSessionWatch).not.toHaveBeenCalled();
  });

  it('merges persisted session data with active live overlay without exposing provider env JSON', async () => {
    mocks.getSessionData.mockReturnValue({
      id: 'sid',
      runtime: 'builtin',
      providerEnvJson: '{"secret":"value"}',
      messages: [
        { id: 'm1', role: 'user', content: 'hello', timestamp: '2026-01-01T00:00:00.000Z' },
      ],
    });
    mocks.engine.getLiveSessionOverlay.mockReturnValue({
      isActive: true,
      runtime: 'builtin',
      snapshotRevision: 12,
      liveSessionState: 'running',
      pendingInteractiveRequests: [{ type: 'permission:request', data: { requestId: 'p1' } }],
      liveStreamingMessage: { id: 'live', role: 'assistant', content: 'typing', timestamp: '2026-01-01T00:00:01.000Z' },
      inMemoryMessages: [
        { id: 'm1', role: 'user', content: 'hello from newer memory', timestamp: '2026-01-01T00:00:00.000Z' },
        { id: 'm2', role: 'assistant', content: 'in memory', timestamp: '2026-01-01T00:00:02.000Z' },
      ],
    });

    const response = await handleSessionReadRoute(
      '/sessions/sid',
      new Request('http://local/sessions/sid?limit=10'),
      new URL('http://local/sessions/sid?limit=10'),
    );

    const body = await readJson(response as Response);
    expect(response?.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.session).toMatchObject({
      providerEnvJson: '[redacted]',
      snapshotRevision: 12,
      liveSessionState: 'running',
      pendingInteractiveRequests: [{ type: 'permission:request', data: { requestId: 'p1' } }],
      totalCount: 2,
      hasMoreBefore: false,
    });
    expect((body.session as { messages: Array<{ id: string }> }).messages.map(message => message.id)).toEqual(['m1', 'm2']);
    expect((body.session as { messages: Array<{ id: string; content: string }> }).messages[0]?.content)
      .toBe('hello from newer memory');
    expect(body.session).toMatchObject({
      liveStreamingMessage: { id: 'live', content: 'typing' },
    });
  });

  it('reads the V2 retained range at the same revision as the live overlay without stale pre-await rows', async () => {
    mocks.getSessionData.mockResolvedValue({ id: 'sid', transcriptFormat: 2, messages: [{ id: 'old', content: 'stale before await' }] });
    mocks.engine.getLiveSessionOverlay.mockReturnValue({
      isActive: true, snapshotRevision: 9, liveSessionState: 'running',
      inMemoryMessages: [{ id: 'u1', content: 'first' }, { id: 'a1', content: 'corrected' }, { id: 'u2', content: 'steer' }],
      liveStreamingMessage: { id: 'a2', content: 'live' },
    });
    const url = new URL('http://local/sessions/sid?limit=1&from=a1');
    const response = await handleSessionReadRoute('/sessions/sid', new Request(url), url);
    expect((await readJson(response!)).session).toMatchObject({
      transcriptFormat: 2, snapshotRevision: 9, totalCount: 3, hasMoreBefore: true,
      messages: [{ id: 'a1', content: 'corrected' }, { id: 'u2', content: 'steer' }],
      liveStreamingMessage: { id: 'a2', content: 'live' },
    });
  });

  it('returns not found for hidden system maintenance sessions', async () => {
    mocks.getSessionData.mockReturnValue({
      id: 'sid',
      providerEnvJson: undefined,
      messages: [],
    });
    mocks.isHistoryVisibleSession.mockReturnValue(false);

    const response = await handleSessionReadRoute(
      '/sessions/sid',
      new Request('http://local/sessions/sid'),
      new URL('http://local/sessions/sid'),
    );

    expect(response?.status).toBe(404);
    expect(await readJson(response as Response)).toEqual({
      success: false,
      error: 'Session not found.',
    });
  });

  it('returns an active memory-only session without dropping its finalized tail', async () => {
    mocks.engine.getLiveSessionOverlay.mockReturnValue({
      isActive: true,
      runtime: 'builtin',
      snapshotRevision: 4,
      liveSessionState: 'starting',
      inMemoryMessages: [
        { id: 'u1', role: 'user', content: 'accepted', timestamp: '2026-01-01T00:00:00.000Z' },
      ],
      liveStreamingMessage: null,
      pendingInteractiveRequests: [],
    });

    const response = await handleSessionReadRoute(
      '/sessions/sid',
      new Request('http://local/sessions/sid?limit=80'),
      new URL('http://local/sessions/sid?limit=80'),
    );

    expect(response?.status).toBe(200);
    expect(await readJson(response as Response)).toMatchObject({
      success: true,
      session: {
        id: 'sid',
        snapshotRevision: 4,
        liveSessionState: 'starting',
        totalCount: 1,
        messages: [{ id: 'u1', content: 'accepted' }],
      },
    });
  });

  it('allows the active prepared session to load while it stays hidden from history', async () => {
    mocks.getSessionData.mockReturnValue({
      id: 'sid',
      runtime: 'codex',
      runtimeSource: 'managed-provider',
      materializationState: 'prepared',
      providerEnvJson: undefined,
      messages: [],
    });
    mocks.isHistoryVisibleSession.mockReturnValue(false);
    mocks.engine.getLiveSessionOverlay.mockReturnValue({
      isActive: true,
      runtime: 'codex',
      liveSessionState: 'idle',
    });

    const response = await handleSessionReadRoute(
      '/sessions/sid',
      new Request('http://local/sessions/sid?limit=80'),
      new URL('http://local/sessions/sid?limit=80'),
    );

    const body = await readJson(response as Response);
    expect(response?.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.session).toMatchObject({
      id: 'sid',
      runtime: 'codex',
      runtimeSource: 'managed-provider',
      materializationState: 'prepared',
      liveSessionState: 'idle',
      totalCount: 0,
      hasMoreBefore: false,
      messages: [],
    });
  });

  it('does not catch more specific /sessions subroutes owned by index.ts', async () => {
    await expect(handleSessionReadRoute(
      '/sessions/sid/stats',
      new Request('http://local/sessions/sid/stats'),
      new URL('http://local/sessions/sid/stats'),
    )).resolves.toBeNull();

    await expect(handleSessionReadRoute(
      '/sessions/sid/since/m1',
      new Request('http://local/sessions/sid/since/m1'),
      new URL('http://local/sessions/sid/since/m1'),
    )).resolves.toBeNull();
  });
});
