import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cancellableFetch: vi.fn(),
  resolvePersistedAgentWorkspaceRegistry: vi.fn(),
  agentWorkspaceIdentityFailure: vi.fn((error: unknown) => ({
    error: error instanceof Error ? error.message : String(error),
  })),
  getSessionMetadata: vi.fn(),
}));

vi.mock('../utils/cancellation', () => ({ cancellableFetch: mocks.cancellableFetch }));
vi.mock('../utils/agent-workspace-identity', () => ({
  resolvePersistedAgentWorkspaceRegistry: mocks.resolvePersistedAgentWorkspaceRegistry,
  agentWorkspaceIdentityFailure: mocks.agentWorkspaceIdentityFailure,
}));
vi.mock('../SessionStore', () => ({ getSessionMetadata: mocks.getSessionMetadata }));

import { handleAdminSessionStart } from './start-admin-handler';

function registry(archived = false) {
  const identity = {
    agentId: 'agent-1',
    workspacePath: '/target/workspace',
    agent: { id: 'agent-1', name: 'Target', enabled: false },
    projectId: 'project-1',
    association: 'project-linked',
    canMutateProjectLifecycle: true,
    project: {
      id: 'project-1',
      name: 'Target',
      path: '/target/workspace',
      agentId: 'agent-1',
      ...(archived ? { archivedAt: '2026-08-01T00:00:00.000Z' } : {}),
    },
  };
  return {
    identities: [identity],
    agentProjections: [identity],
    diagnostics: [],
  };
}

describe('handleAdminSessionStart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MYAGENTS_MANAGEMENT_PORT = '43123';
    mocks.resolvePersistedAgentWorkspaceRegistry.mockResolvedValue(registry());
    mocks.getSessionMetadata.mockReturnValue({ title: 'Source chat', agentDir: '/source' });
  });

  it('returns a non-blocking accepted receipt from Rust admission', async () => {
    mocks.cancellableFetch.mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      outcome: {
        status: 'accepted',
        agentId: 'agent-1',
        sessionId: 'fresh-session',
        messageId: 'message-1',
        replyBack: true,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const result = await handleAdminSessionStart('source-session', {
      agentId: 'agent-1',
      prompt: 'Review this',
      replyBack: true,
    }, 'internal-session');

    expect(result).toEqual({
      status: 200,
      response: {
        accepted: true,
        asynchronous: true,
        agentId: 'agent-1',
        sessionId: 'fresh-session',
        messageId: 'message-1',
        replyBack: true,
        resultDelivery: 'send.result',
      },
    });
    expect(mocks.cancellableFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:43123/api/inbox/start-session',
      expect.objectContaining({
        method: 'POST',
        body: expect.not.stringContaining('birthFingerprint'),
      }),
      { timeoutMs: 180_000 },
    );
  });

  it('preserves IDs and warns against automatic retry when admission is unconfirmed', async () => {
    mocks.cancellableFetch.mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      outcome: {
        status: 'unconfirmed',
        agentId: 'agent-1',
        sessionId: 'fresh-session',
        messageId: 'message-1',
        replyBack: true,
        reason: 'ACK lost',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const result = await handleAdminSessionStart('source-session', {
      agentId: 'agent-1',
      prompt: 'Review this',
    }, 'internal-session');

    expect(result.status).toBe(502);
    expect(result.response).toMatchObject({
      accepted: null,
      unconfirmed: true,
      sessionId: 'fresh-session',
      messageId: 'message-1',
      error: { code: 'admission_unconfirmed' },
      recoveryHint: {
        recoveryCommand: 'myagents session list --agent agent-1',
        message: expect.stringContaining('do not automatically resend'),
      },
    });
  });

  it('treats a management transport failure as admission unconfirmed', async () => {
    mocks.cancellableFetch.mockRejectedValue(new Error('timeout'));

    const result = await handleAdminSessionStart('source-session', {
      agentId: 'agent-1',
      prompt: 'Review this',
    }, 'internal-session');

    expect(result).toMatchObject({
      status: 502,
      response: {
        accepted: null,
        unconfirmed: true,
        error: { code: 'admission_unconfirmed' },
      },
    });
  });

  it('treats an incomplete success receipt as admission unconfirmed', async () => {
    mocks.cancellableFetch.mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      outcome: { status: 'accepted' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const result = await handleAdminSessionStart('source-session', {
      agentId: 'agent-1',
      prompt: 'Review this',
    }, 'internal-session');

    expect(result).toMatchObject({
      status: 502,
      response: {
        accepted: null,
        unconfirmed: true,
        error: { code: 'admission_unconfirmed' },
      },
    });
  });

  it('admits an external source without a Session identity and forces one-way delivery', async () => {
    mocks.cancellableFetch.mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      outcome: {
        status: 'accepted',
        agentId: 'agent-1',
        sessionId: 'fresh-session',
        messageId: 'message-1',
        replyBack: false,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const result = await handleAdminSessionStart('', {
      agentId: 'agent-1',
      prompt: 'External work',
      replyBack: true,
    }, 'external-cli');

    expect(result.response).toMatchObject({ accepted: true, replyBack: false });
    const request = mocks.cancellableFetch.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      sourceKind: 'external-cli',
      fromLabel: 'External CLI',
      replyBack: false,
    });
    expect(body).not.toHaveProperty('fromSessionId');
  });

  it('rejects caller configuration overrides before delivery', async () => {
    const result = await handleAdminSessionStart('source-session', {
      agentId: 'agent-1',
      prompt: 'Review this',
      runtime: 'builtin',
    }, 'internal-session');

    expect(result).toMatchObject({
      status: 400,
      response: { error: { code: 'target_config_override_forbidden' } },
    });
    expect(mocks.cancellableFetch).not.toHaveBeenCalled();
  });

  it('requires a source Session and rejects archived targets', async () => {
    const missingSource = await handleAdminSessionStart('', {
      agentId: 'agent-1',
      prompt: 'Review this',
    }, 'internal-session');
    expect(missingSource.response).toMatchObject({
      error: { code: 'caller_session_required' },
    });

    mocks.resolvePersistedAgentWorkspaceRegistry.mockResolvedValue(registry(true));
    const archived = await handleAdminSessionStart('source-session', {
      agentId: 'agent-1',
      prompt: 'Review this',
    }, 'internal-session');
    expect(archived.response).toMatchObject({ error: { code: 'agent_archived' } });
    expect(mocks.cancellableFetch).not.toHaveBeenCalled();
  });
});

describe('project-aware local handoff admission', () => {
  const at = '2026-11-07T00:00:00Z';
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MYAGENTS_MANAGEMENT_PORT = '43123';
    const current = registry();
    mocks.resolvePersistedAgentWorkspaceRegistry.mockResolvedValue({ ...current,
      config: { agents: [{ id: 'lead', name: 'Lead' }, { id: 'agent-1', name: 'Target' }],
        projectSpaces: [{ id: 'A', name: 'Project', description: '', instructions: '', materials: [], resources: [],
          memberBotIds: ['lead', 'agent-1'], revision: 2, createdAt: at, updatedAt: at }] },
      projects: [{ id: 'lead-workspace', path: '/source', agentId: 'lead' }, current.agentProjections[0].project] });
    mocks.getSessionMetadata.mockReturnValue({ id: 'source-session', title: 'Source', agentDir: '/source',
      projectSpace: { schemaVersion: 1, projectId: 'A', projectName: 'Original project', projectRevision: 1,
        botId: 'lead', botName: 'Lead', workspacePath: '/source', capturedAt: at, description: '', instructions: '', materials: [], resources: [] } });
    mocks.cancellableFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true, outcome: {
      status: 'accepted', agentId: 'agent-1', sessionId: 'fresh-session', messageId: 'message-1', replyBack: true,
    } })));
  });
  it('derives inheritance from persisted source without sending caller-owned snapshots', async () => {
    expect((await handleAdminSessionStart('source-session', { agentId: 'agent-1', prompt: 'Work' }, 'internal-session')).response.accepted).toBe(true);
    const sent = JSON.parse(mocks.cancellableFetch.mock.calls[0][1].body);
    expect(sent).toMatchObject({ inheritProject: true, fromSessionId: 'source-session' });
    expect(sent.projectSpace).toBeUndefined();
  });
  it('rejects removed membership before starting a sidecar', async () => {
    const current = await mocks.resolvePersistedAgentWorkspaceRegistry();
    current.config.projectSpaces[0].memberBotIds = ['lead'];
    const result = await handleAdminSessionStart('source-session', { agentId: 'agent-1', prompt: 'Work' }, 'internal-session');
    expect(result.response).toMatchObject({ accepted: false, error: { code: 'project_handoff_rejected' } });
    expect(mocks.cancellableFetch).not.toHaveBeenCalled();
  });
  it.each(['inheritProject', 'projectSpace', 'projectSpaceSelection'])('does not accept caller %s override', async field => {
    const result = await handleAdminSessionStart('source-session', { agentId: 'agent-1', prompt: 'Work', [field]: false }, 'internal-session');
    expect(result.response).toMatchObject({ accepted: false, error: { code: 'target_config_override_forbidden' } });
    expect(mocks.cancellableFetch).not.toHaveBeenCalled();
  });
  it('never inherits a local source on an external CLI request', async () => {
    await handleAdminSessionStart('source-session', { agentId: 'agent-1', prompt: 'Work' }, 'external-cli');
    expect(mocks.getSessionMetadata).not.toHaveBeenCalled();
    expect(JSON.parse(mocks.cancellableFetch.mock.calls[0][1].body)).toMatchObject({ inheritProject: false, sourceKind: 'external-cli', replyBack: false });
  });
});
