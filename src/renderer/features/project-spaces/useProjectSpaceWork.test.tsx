import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionMetadata } from '@/api/sessionClient';
import type { ActivitySnapshot } from '../project-board/projection';
import { useProjectSpaceWork } from './useProjectSpaceWork';
const mocks = vi.hoisted(() => ({ tasks: vi.fn(), read: vi.fn() }));
vi.mock('@/api/taskCenter', () => ({ taskList: mocks.tasks }));
vi.mock('../project-board/activity', () => ({ readBoardSessionActivity: mocks.read }));
const at = '2026-11-07T00:00:00Z';
function session(id: string, projectId = 'a'): SessionMetadata {
  return { id, title: id, agentDir: '/shared', createdAt: at, lastActiveAt: at,
    projectSpace: { schemaVersion: 1, projectId, projectName: projectId, projectRevision: 1, botId: 'same', botName: 'Mino', workspacePath: '/shared', capturedAt: at, description: '', instructions: '', materials: [], resources: [] } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.tasks.mockResolvedValue([]);
  mocks.read.mockImplementation(async () => ({ state: 'idle', checkedAt: Date.now() }));
});
describe('visible logical-project observation', () => {
  it('reads only exact project sessions, keeps their workspace, and never reads while inactive', async () => {
    const sessions = [session('own'), session('other', 'b')];
    const { result, rerender } = renderHook(({ active }) => useProjectSpaceWork('a', sessions, active), { initialProps: { active: false } });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.tasks).not.toHaveBeenCalled();
    rerender({ active: true });
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith('own', '/shared');
    expect(result.current.rows.map(row => row.session.id)).toEqual(['own']);
  });
  it('drains old reads, ignores their late completion after project switch and retains a four-reader limit', async () => {
    const pending = deferred<ActivitySnapshot>();
    mocks.read.mockImplementation((id: string) => id.startsWith('a') ? pending.promise : Promise.resolve({ state: 'running', checkedAt: Date.now() }));
    const sessions = [...Array.from({ length: 8 }, (_, i) => session(`a${i}`)), session('b', 'b')];
    const { result, rerender } = renderHook(({ project }) => useProjectSpaceWork(project, sessions, true), { initialProps: { project: 'a' } });
    expect(mocks.read).toHaveBeenCalledTimes(4);
    rerender({ project: 'b' });
    expect(result.current.rows.every(row => row.session.id === 'b')).toBe(true);
    expect(mocks.read).toHaveBeenCalledTimes(4);
    await act(async () => { pending.resolve({ state: 'idle', checkedAt: Date.now() }); });
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(mocks.read).toHaveBeenCalledTimes(5);
    expect(result.current.rows.map(row => [row.session.id, row.status])).toEqual([['b', 'running']]);
  });
  it('reports partial failure, keeps original conversation links and recovers on explicit retry', async () => {
    mocks.tasks.mockRejectedValueOnce(new Error('tasks unavailable'));
    mocks.read.mockRejectedValueOnce(new Error('state unavailable'));
    const sessions = [session('own')];
    const { result } = renderHook(() => useProjectSpaceWork('a', sessions, true));
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.taskError).toBe(true);
    expect(result.current.failedCount).toBe(1);
    expect(result.current.rows[0].session).toBe(sessions[0]);
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.failedCount).toBe(0));
    expect(result.current.taskError).toBe(false);
    expect(result.current.rows[0].status).toBe('idle');
  });
  it('bounds observation to fifty sessions and reports the unobserved remainder', async () => {
    const sessions = Array.from({ length: 55 }, (_, i) => session(`s${i}`));
    const { result } = renderHook(() => useProjectSpaceWork('a', sessions, true));
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(mocks.read).toHaveBeenCalledTimes(50);
    expect(result.current.unobservedCount).toBe(5);
    expect(result.current.rows.filter(row => row.status === 'unknown')).toHaveLength(5);
  });
});
