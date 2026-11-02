import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSpaceSelection } from '../../../shared/projectSpaces';
const mocks = vi.hoisted(() => ({
  apiPostJson: vi.fn(), ensureSessionSidecar: vi.fn(), releaseSessionSidecar: vi.fn(),
  sessionSidecarFetch: vi.fn(), upgradeSessionId: vi.fn(),
}));
vi.mock('../apiFetch', () => ({ apiFetch: vi.fn(), apiGetJson: vi.fn(), apiPostJson: mocks.apiPostJson }));
vi.mock('../tauriClient', () => ({ ...mocks, isTauri: vi.fn() }));
import { createSession } from '../sessionClient';
import { SessionMaterializationError } from '../sessionMaterialize';

const selection: ProjectSpaceSelection = { projectId: 'project-A', botId: 'bot', projectRevision: 3 };
const owner = { type: 'tab' as const, id: 'tab-A', pendingSessionId: 'pending-A' };
const metadata = { id: 'born-A', agentDir: '/bot-cwd', title: 'New Chat', createdAt: 't', lastActiveAt: 't' };
const bodyOf = (call: unknown[]) => JSON.parse((call[3] as { body: string }).body);
function installSuccess() {
  mocks.sessionSidecarFetch.mockImplementation(async (_id: string, _owner: unknown, path: string) =>
    Response.json(path === '/api/session/birth' ? { success: true, session: metadata } : { success: true, sessionId: metadata.id, metadata }));
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.ensureSessionSidecar.mockResolvedValue({ isNew: true });
  mocks.upgradeSessionId.mockResolvedValue(true);
  mocks.releaseSessionSidecar.mockResolvedValue(true);
});
describe('project createSession through real materialization client', () => {
  it.each(['builtin', 'managed'] as const)('births %s with IDs only and prepares, rekeys, then commits', async kind => {
    installSuccess();
    const managed = kind === 'managed';
    const opts = { projectSpaceSelection: { ...selection, instructions: 'must never be sent' } as ProjectSpaceSelection,
      ...(managed ? { runtimeSource: 'managed-provider' as const, providerExecutionIdentity: {
        kind: 'runtime-backed-provider' as const, providerId: 'codex-sub' as const,
        runtime: 'codex' as const, runtimeSource: 'managed-provider' as const, model: 'gpt-test',
      }, prepareForFirstUserMessage: true } : {}) };
    await expect(createSession('/bot-cwd', managed ? 'codex' : 'builtin', opts, owner)).resolves.toEqual(metadata);
    const calls = mocks.sessionSidecarFetch.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0].slice(0, 3)).toEqual([owner.pendingSessionId, owner, '/api/session/birth']);
    expect(bodyOf(calls[0]).projectSpaceSelection).toEqual(selection);
    expect(bodyOf(calls[0])).not.toHaveProperty('projectSpace');
    expect(bodyOf(calls[0])).not.toHaveProperty('birthSnapshot');
    expect(bodyOf(calls[0]).prepareForFirstUserMessage).toBe(managed ? true : undefined);
    expect(Boolean(bodyOf(calls[0]).providerExecutionIdentity)).toBe(managed);
    expect(calls[1].slice(0, 3)).toEqual([metadata.id, owner, '/api/session/materialize']);
    expect(bodyOf(calls[1])).toEqual({ workspacePath: '/bot-cwd', phase: 'commit', preparedSessionId: metadata.id });
    expect(mocks.upgradeSessionId).toHaveBeenCalledExactlyOnceWith(owner.pendingSessionId, metadata.id, owner.id, owner.type);
    expect(mocks.sessionSidecarFetch.mock.invocationCallOrder[0]).toBeLessThan(mocks.upgradeSessionId.mock.invocationCallOrder[0]);
    expect(mocks.upgradeSessionId.mock.invocationCallOrder[0]).toBeLessThan(mocks.sessionSidecarFetch.mock.invocationCallOrder[1]);
    expect(mocks.apiPostJson).not.toHaveBeenCalled();
    expect(mocks.releaseSessionSidecar).not.toHaveBeenCalled();
  });
  it('freezes the ID selection before awaiting Sidecar startup', async () => {
    installSuccess();
    let ready!: () => void;
    mocks.ensureSessionSidecar.mockReturnValue(new Promise<void>(resolve => { ready = resolve; }));
    const chosen = { ...selection };
    const birth = createSession('/bot-cwd', 'builtin', { projectSpaceSelection: chosen }, owner);
    chosen.projectId = 'project-B';
    ready();
    await birth;
    expect(bodyOf(mocks.sessionSidecarFetch.mock.calls[0]).projectSpaceSelection).toEqual(selection);
  });
  it('rejects project creation without an owner before any Sidecar or Global write', async () => {
    await expect(createSession('/bot-cwd', 'builtin', { projectSpaceSelection: selection })).rejects.toThrow(/owner/);
    expect(mocks.ensureSessionSidecar).not.toHaveBeenCalled();
    expect(mocks.apiPostJson).not.toHaveBeenCalled();
  });
  it('releases the pending owner after a definite revision rejection without rekeying', async () => {
    mocks.sessionSidecarFetch.mockResolvedValue(Response.json({ success: false, error: 'Project changed' }, { status: 409 }));
    await expect(createSession('/bot-cwd', 'builtin', { projectSpaceSelection: selection }, owner))
      .rejects.toMatchObject({ outcome: 'failed', pendingSessionId: owner.pendingSessionId });
    expect(mocks.upgradeSessionId).not.toHaveBeenCalled();
    expect(mocks.releaseSessionSidecar).toHaveBeenCalledExactlyOnceWith(owner.pendingSessionId, owner.type, owner.id);
  });
  it('retains the pending owner when birth preparation acknowledgement is unknown', async () => {
    mocks.sessionSidecarFetch.mockRejectedValue(new Error('prepare ACK lost'));
    await expect(createSession('/bot-cwd', 'builtin', { projectSpaceSelection: selection }, owner))
      .rejects.toMatchObject({ outcome: 'unknown', pendingSessionId: owner.pendingSessionId });
    expect(mocks.sessionSidecarFetch).toHaveBeenCalledTimes(1);
    expect(mocks.upgradeSessionId).not.toHaveBeenCalled();
    expect(mocks.releaseSessionSidecar).not.toHaveBeenCalled();
  });
  it('rolls back metadata and Rust after a definite commit failure, then releases only the restored pending owner', async () => {
    mocks.sessionSidecarFetch.mockResolvedValueOnce(Response.json({ success: true, session: metadata }))
      .mockResolvedValueOnce(Response.json({ success: false, error: 'commit rejected' }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ success: true }));
    await expect(createSession('/bot-cwd', 'builtin', { projectSpaceSelection: selection }, owner)).rejects.toMatchObject({ outcome: 'failed' });
    expect(mocks.sessionSidecarFetch.mock.calls.map(call => [call[0], bodyOf(call).phase ?? 'prepare'])).toEqual([
      [owner.pendingSessionId, 'prepare'], [metadata.id, 'commit'], [metadata.id, 'rollback'],
    ]);
    expect(mocks.upgradeSessionId).toHaveBeenNthCalledWith(2, metadata.id, owner.pendingSessionId, owner.id, owner.type);
    expect(mocks.releaseSessionSidecar).toHaveBeenCalledExactlyOnceWith(owner.pendingSessionId, owner.type, owner.id);
  });
  it('confirms a lost commit acknowledgement on the same transaction without reverting or releasing its owner', async () => {
    mocks.sessionSidecarFetch.mockResolvedValueOnce(Response.json({ success: true, session: metadata }))
      .mockRejectedValueOnce(new Error('commit ACK lost'))
      .mockResolvedValueOnce(Response.json({ success: false, error: 'already committed' }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ success: true, sessionId: metadata.id, metadata }));
    await expect(createSession('/bot-cwd', 'builtin', { projectSpaceSelection: selection }, owner)).resolves.toEqual(metadata);
    expect(mocks.sessionSidecarFetch.mock.calls.map(call => bodyOf(call).phase ?? 'prepare')).toEqual(['prepare', 'commit', 'rollback', 'commit']);
    expect(mocks.upgradeSessionId).toHaveBeenCalledTimes(1);
    expect(mocks.releaseSessionSidecar).not.toHaveBeenCalled();
  });
  it('preserves target ownership and both IDs if commit, rollback and confirmation remain unknown', async () => {
    mocks.sessionSidecarFetch.mockResolvedValueOnce(Response.json({ success: true, session: metadata }))
      .mockRejectedValue(new Error('transport unavailable'));
    const error = await createSession('/bot-cwd', 'builtin', { projectSpaceSelection: selection }, owner).catch(error => error);
    expect(error).toBeInstanceOf(SessionMaterializationError);
    expect(error).toMatchObject({ outcome: 'unknown', pendingSessionId: owner.pendingSessionId, preparedSessionId: metadata.id, ownerSessionId: metadata.id });
    expect(mocks.upgradeSessionId).toHaveBeenCalledTimes(1);
    expect(mocks.releaseSessionSidecar).not.toHaveBeenCalled();
  });
  it('does not rollback or release either candidate after a lost Rust rekey acknowledgement', async () => {
    installSuccess();
    mocks.upgradeSessionId.mockRejectedValue(new Error('rekey ACK lost'));
    await expect(createSession('/bot-cwd', 'builtin', { projectSpaceSelection: selection }, owner))
      .rejects.toMatchObject({ outcome: 'unknown', pendingSessionId: owner.pendingSessionId, preparedSessionId: metadata.id });
    expect(mocks.sessionSidecarFetch).toHaveBeenCalledTimes(1);
    expect(mocks.releaseSessionSidecar).not.toHaveBeenCalled();
  });
});
