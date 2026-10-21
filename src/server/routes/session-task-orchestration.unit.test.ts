import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), mutate: vi.fn(), plan: vi.fn(), act: vi.fn(), proof: vi.fn() }));
vi.mock('../session-engine', () => ({ getSessionEngine: () => ({ getRuntimeIdentity: () => ({ sessionId: 's1' }) }) }));
vi.mock('../session-engine/task-orchestration', () => ({ readSessionTasks: mocks.read, mutateSessionTasks: mocks.mutate, mutateSessionPlan: mocks.plan, actOnSessionPlan: mocks.act }));
vi.mock('../session-engine/user-action-proof', () => ({ verifySessionUserAction: mocks.proof }));
import { handleSessionTaskCommand, handleSessionTaskRoute } from './session-task-orchestration';
beforeEach(() => { vi.clearAllMocks(); mocks.proof.mockReturnValue(false); mocks.read.mockResolvedValue({ sessionId: 's1', ledger: { revision: 2 }, tasks: [], messages: ['private transcript'] }); });
describe('Session task route boundaries', () => {
  it('returns only the task snapshot and requires exact current Session identity', async () => {
    expect(await handleSessionTaskCommand({ kind: 'list', sessionId: 's1' })).toEqual({ success: true, sessionId: 's1', ledger: { revision: 2 }, tasks: [] });
    expect(await handleSessionTaskCommand({ kind: 'list', sessionId: 's2' })).toMatchObject({ success: false, error: 'TASK_SESSION_CHANGED' });
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it.each([
    { kind: 'review', taskId: 't', attemptId: 'a', decision: 'accept', evidence: '', expectedRevision: 0 },
    { kind: 'ensure', taskId: 't', title: 'Task', expectedRevision: -1 },
    { kind: 'bind', taskId: 't', toolUseId: 'a', expectedRevision: 0, root: true },
    { kind: 'list', unexpected: true },
  ])('rejects malformed actions and client-supplied authority: %j', async action => {
    expect(await handleSessionTaskCommand({ ...action, sessionId: 's1' })).toMatchObject({ success: false });
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it('preserves the pending-main-review receipt instead of promoting it to accepted', async () => {
    mocks.mutate.mockResolvedValue({ pendingMainAgentReview: true, taskReviewReceipt: 'opaque' });
    const result = await handleSessionTaskCommand({ kind: 'review', sessionId: 's1', taskId: 't', attemptId: 'a', decision: 'accept', evidence: 'Verified', expectedRevision: 2 });
    expect(result).toEqual({ success: true, pendingMainAgentReview: true, taskReviewReceipt: 'opaque' });
  });
  it('exposes only a read surface to the renderer route', async () => {
    const url = 'http://local/api/session/task-orchestration?sessionId=s1';
    expect((await handleSessionTaskRoute('/api/session/task-orchestration', new Request(url)))?.status).toBe(200);
    expect(await handleSessionTaskRoute('/api/session/task-orchestration', new Request(url, { method: 'POST' }))).toBeNull();
  });
  it('rejects a forged human button POST even with an internal CLI credential', async () => {
    const response = await handleSessionTaskRoute('/api/session/task-orchestration/plan', new Request('http://local/api/session/task-orchestration/plan', { method: 'POST', body: JSON.stringify({ kind: 'confirm', sessionId: 's1', proposalId: 'p', expectedRevision: 1, requestId: '00000000-0000-4000-8000-000000000001' }), headers: { 'x-myagents-internal-cli-token': 'tool-token' } }));
    expect(await response?.json()).toMatchObject({ success: false, error: 'PLAN_NATIVE_USER_ACTION_REQUIRED' });
    expect(mocks.act).not.toHaveBeenCalled();
  });
  it('uses the native-stamped exact action and preserves the authoritative ledger response', async () => {
    mocks.proof.mockReturnValue(true);
    mocks.act.mockResolvedValue({ sessionId: 's1', ledger: { revision: 3, proposal: { state: 'confirmed' } }, tasks: [] });
    const action = { kind: 'confirm', sessionId: 's1', proposalId: 'p', expectedRevision: 1, requestId: '00000000-0000-4000-8000-000000000001' };
    const response = await handleSessionTaskRoute('/api/session/task-orchestration/plan', new Request('http://local/api/session/task-orchestration/plan', { method: 'POST', body: JSON.stringify(action) }));
    expect(mocks.act).toHaveBeenCalledWith(expect.anything(), action);
    expect(await response?.json()).toMatchObject({ success: true, ledger: { revision: 3 } });
  });
});
