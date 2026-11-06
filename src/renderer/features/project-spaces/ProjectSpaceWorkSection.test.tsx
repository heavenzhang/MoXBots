import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SessionMetadata } from '@/api/sessionClient';
import ProjectSpaceWorkSection, { type ProjectSpaceWorkData } from './ProjectSpaceWorkSection';
const session: SessionMetadata = { id: 'original', title: 'Original', agentDir: '/demo', createdAt: '2026-11-07T00:00:00Z', lastActiveAt: '2026-11-07T00:00:00Z' };
const work = (patch: Partial<ProjectSpaceWorkData> = {}): ProjectSpaceWorkData => ({ rows: [], checking: false, taskError: false, failedCount: 0, unobservedCount: 0, checkedAt: undefined, refresh: vi.fn(), ...patch });
describe('project current work and results', () => {
  it('opens the exact original Session without an execution or review action', () => {
    const onOpen = vi.fn();
    render(<ProjectSpaceWorkSection mode="results" work={work({ rows: [
      { id: 'done', title: 'Completed result', session, status: 'completed' },
      { id: 'idle', title: 'Idle is not a result', session, status: 'idle' },
    ] })} onOpenConversation={onOpen} />);
    expect(screen.queryByText('Idle is not a result')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Completed result/ }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(session);
    expect(screen.queryByRole('button', { name: /验收|接受|重试执行/ })).toBeNull();
  });
  it('does not claim there is no work when reading failed and offers the original retry', () => {
    const data = work({ taskError: true });
    render(<ProjectSpaceWorkSection mode="current" work={data} onOpenConversation={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText(/暂无进行中的工作/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '更新工作状态' }));
    expect(data.refresh).toHaveBeenCalledOnce();
  });
  it('keeps a long current-work list folded without losing its original links', () => {
    const data = work({ rows: Array.from({ length: 10 }, (_, i) => ({ id: String(i), title: `Work ${i}`, session, status: 'running' })) });
    const { container } = render(<ProjectSpaceWorkSection mode="current" work={data} onOpenConversation={vi.fn()} />);
    const details = container.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(within(details).getAllByRole('button', { hidden: true })).toHaveLength(4);
    fireEvent.click(screen.getByText('更多工作（4）'));
    expect(details.open).toBe(true);
  });
  it('preserves the session-index failure and retries its actual owner as well as work observations', () => {
    const data = work(); const retry = vi.fn();
    render(<ProjectSpaceWorkSection mode="current" work={data} sessionRead={{ loading: false, error: 'unavailable', retry }} onOpenConversation={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText(/暂无进行中的工作/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '更新工作状态' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(data.refresh).toHaveBeenCalledOnce();
  });
  it('does not report empty results before the session index finishes reading', () => {
    render(<ProjectSpaceWorkSection mode="results" work={work()} sessionRead={{ loading: true, retry: vi.fn() }} onOpenConversation={vi.fn()} />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByText('还没有明确完成的记录。')).toBeNull();
  });
});
