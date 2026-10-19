import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithTheme as render } from '@/test/renderWithTheme';
import { i18n } from '@/i18n';
import type { BackgroundTaskDetail } from '../../../shared/types/background-task';
import { clearAllBackgroundTaskStatuses, registerBackgroundTask, setBackgroundTaskStatus } from '@/utils/backgroundTaskStatus';
import type { Message } from '@/types/chat';
import AgentStatusPanel from './AgentStatusPanel';
import BackgroundTaskDialog from './BackgroundTaskDialog';
import type { SubagentStatus } from './types';

const harness = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn(), sessionId: 's1', messages: [] as Message[] }));
vi.mock('@/context/TabContext', () => ({
  useTabStateOptional: () => ({ sessionId: harness.sessionId, apiGet: harness.apiGet, apiPost: harness.apiPost, messages: harness.messages, sessionState: 'running' }),
}));
const agent: SubagentStatus = { id: 'tool-shell', agentType: 'local_bash', description: '建立独立端口的测试验收隧道', mode: 'background', startedAt: 1000, status: 'running', inputTokens: 0, outputTokens: 0, toolCount: 0 };
function task(patch: Partial<BackgroundTaskDetail> = {}): BackgroundTaskDetail {
  return { taskId: 'b123', toolUseId: agent.id, status: 'running', output: 'Listening on 127.0.0.1:4321', outputState: 'ready', truncated: false, totalBytes: 32, updatedAt: 1000, ...patch };
}
function dialog(onClose = vi.fn(), sessionId = harness.sessionId) {
  return <BackgroundTaskDialog subagent={agent} sessionId={sessionId} messages={[]} onClose={onClose} onJumpToTool={vi.fn()} />;
}
async function settle() { await act(async () => { await Promise.resolve(); }); }

describe('background task details', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    harness.sessionId = 's1'; harness.messages = [];
    harness.apiGet.mockReset().mockResolvedValue({ success: true, task: task() });
    harness.apiPost.mockReset();
    clearAllBackgroundTaskStatuses();
    await i18n.changeLanguage('zh-CN');
  });
  afterEach(() => { cleanup(); clearAllBackgroundTaskStatuses(); vi.clearAllTimers(); vi.useRealTimers(); });

  const identity = { taskId: 'b123', runId: 'run-1', queryId: 'query-1' };
  const controllableTask = () => task({ runId: identity.runId, continuation: { identity, acknowledged: false } });

  it('does not infer confirmation authority from a shell row without a current runtime identity', async () => {
    render(dialog()); await settle();
    expect(screen.queryByRole('button', { name: '允许与此运行并行接续' })).toBeNull();
    expect(harness.apiPost).not.toHaveBeenCalled();
  });

  it('confirms and revokes only the observed run through the current Tab API', async () => {
    harness.apiGet.mockResolvedValue({ success: true, task: controllableTask() });
    harness.apiPost.mockImplementation((_url, body) => Promise.resolve({ allow: body.allow, acknowledged: body.tasks, rejected: [] }));
    render(dialog()); await settle();
    fireEvent.click(screen.getByRole('button', { name: '允许与此运行并行接续' })); await settle();
    expect(harness.apiPost).toHaveBeenLastCalledWith('/api/session/background-work/acknowledge', { tasks: [identity], allow: true });
    fireEvent.click(screen.getByRole('button', { name: '恢复阻挡后续接续' })); await settle();
    expect(harness.apiPost).toHaveBeenLastCalledWith('/api/session/background-work/acknowledge', { tasks: [identity], allow: false });
    expect(screen.getByRole('button', { name: '允许与此运行并行接续' })).toBeTruthy();
  });

  it('shows owner rejection without treating it as confirmation', async () => {
    harness.apiGet.mockResolvedValue({ success: true, task: controllableTask() });
    harness.apiPost.mockResolvedValue({ allow: true, acknowledged: [], rejected: [{ taskId: 'b123', reason: 'changed' }] });
    render(dialog()); await settle();
    fireEvent.click(screen.getByRole('button', { name: '允许与此运行并行接续' })); await settle();
    expect(screen.getByRole('alert').textContent).toContain('任务运行或会话已变化');
    expect(screen.queryByRole('button', { name: '恢复阻挡后续接续' })).toBeNull();
  });

  it('ignores a late confirmation receipt after the visible run changes', async () => {
    let respond!: (value: unknown) => void;
    harness.apiGet.mockResolvedValue({ success: true, task: controllableTask() });
    harness.apiPost.mockImplementation(() => new Promise(resolve => { respond = resolve; }));
    render(dialog()); await settle();
    fireEvent.click(screen.getByRole('button', { name: '允许与此运行并行接续' })); await settle();
    expect(screen.getByRole('button', { name: '正在应用…' }).hasAttribute('disabled')).toBe(true);
    const next = { ...identity, runId: 'run-2' };
    harness.apiGet.mockResolvedValue({ success: true, task: task({ runId: 'run-2', continuation: { identity: next, acknowledged: false } }) });
    await act(async () => { vi.advanceTimersByTime(2000); });
    await act(async () => { respond({ allow: true, acknowledged: [identity], rejected: [] }); });
    expect(screen.getByRole('button', { name: '允许与此运行并行接续' }).hasAttribute('disabled')).toBe(false);
    expect(screen.queryByRole('button', { name: '恢复阻挡后续接续' })).toBeNull();
  });

  it('removes the old confirmation capability while a different Session is loading', async () => {
    harness.apiGet.mockResolvedValueOnce({ success: true, task: controllableTask() });
    const view = render(dialog()); await settle();
    expect(screen.getByRole('button', { name: '允许与此运行并行接续' })).toBeTruthy();
    harness.apiGet.mockImplementation(() => new Promise(() => {}));
    harness.sessionId = 's2'; view.rerender(dialog(vi.fn(), 's2')); await settle();
    expect(screen.queryByRole('button', { name: '允许与此运行并行接续' })).toBeNull();
    expect(harness.apiPost).not.toHaveBeenCalled();
  });

  it('opens from a real background row with no tool message and stays open after completion/fade', async () => {
    registerBackgroundTask('b123', agent.id, { description: agent.description, taskType: 'local_bash' }, 's1');
    render(<AgentStatusPanel containerRef={createRef<HTMLElement>()} onJumpToTool={vi.fn()} />);
    await act(async () => { vi.advanceTimersByTime(100); });
    fireEvent.click(screen.getByRole('button', { name: '展开 Agent 状态面板' }));
    fireEvent.click(screen.getByRole('button', { name: /local_bash/ }));
    await settle();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('region', { name: '执行日志' }).textContent).toContain('Listening');
    expect(screen.queryByRole('button', { name: '定位原消息' })).toBeNull();
    harness.apiGet.mockResolvedValue({ success: true, task: task({ status: 'completed' }) });
    act(() => { setBackgroundTaskStatus('b123', 'completed', agent.id, 's1'); });
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('已完成');
  });

  it('polls serially and stops after authoritative completion', async () => {
    render(dialog()); await settle();
    harness.apiGet.mockResolvedValue({ success: true, task: task({ status: 'completed', output: 'Done' }) });
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('status').textContent).toContain('已完成');
    expect(screen.getByText('Done')).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(harness.apiGet).toHaveBeenCalledTimes(2);
  });

  it('retains terminal status and the last log when the completed Query has retired', async () => {
    registerBackgroundTask('b123', agent.id, { taskType: 'local_bash' }, 's1');
    render(dialog()); await settle();
    harness.apiGet.mockResolvedValue({ success: false, errorCode: 'BACKGROUND_TASK_NOT_FOUND' });
    act(() => { setBackgroundTaskStatus('b123', 'completed', agent.id, 's1'); });
    await settle();
    expect(screen.getByRole('status').textContent).toContain('已完成');
    expect(screen.getByRole('region', { name: '执行日志' }).textContent).toContain('Listening');
    expect(screen.getByText(/任务运行记录已释放/)).toBeTruthy();
    expect(screen.queryByText('运行中每 2 秒刷新')).toBeNull();
  });

  it('clears the old terminal presentation when a new run reuses the task tool identity', async () => {
    registerBackgroundTask('b123', agent.id, { runId: 'run-1' }, 's1');
    render(dialog()); await settle();
    harness.apiGet.mockResolvedValue({ success: true, task: task({ status: 'completed', runId: 'run-1' }) });
    act(() => { setBackgroundTaskStatus('b123', 'completed', agent.id, 's1', 'run-1'); });
    await settle();
    expect(screen.getByRole('status').textContent).toContain('已完成');
    harness.apiGet.mockResolvedValue({ success: true, task: task({ status: 'running', runId: 'run-2', output: 'New run' }) });
    act(() => { registerBackgroundTask('b123', agent.id, { runId: 'run-2' }, 's1'); });
    await settle();
    expect(screen.getByRole('status').textContent).toContain('运行中');
    expect(screen.getByText('New run')).toBeTruthy();
    expect(screen.getByText('运行中每 2 秒刷新')).toBeTruthy();
  });

  it.each(['empty', 'missing', 'unavailable'] as const)('explains %s output without declaring completion', async outputState => {
    harness.apiGet.mockResolvedValue({ success: true, task: task({ output: '', outputState }) });
    render(dialog()); await settle();
    expect(screen.getByRole('status').textContent).toContain('运行中');
    expect(screen.queryByText(/正在读取/)).toBeNull();
    expect(screen.getByText(outputState === 'empty' ? /任务尚未输出/ : outputState === 'missing' ? /日志文件暂不存在/ : /当前运行时未提供/)).toBeTruthy();
  });

  it('retains logs on read failure, marks status unconfirmed, and recovers on refresh', async () => {
    render(dialog()); await settle();
    harness.apiGet.mockRejectedValue(new Error('offline'));
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('alert').textContent).toContain('读取失败');
    expect(screen.getByRole('status').textContent).toContain('状态未确认');
    expect(screen.getByRole('region', { name: '执行日志' }).textContent).toContain('Listening');
    harness.apiGet.mockResolvedValue({ success: true, task: task({ status: 'failed', output: 'Address already in use' }) });
    fireEvent.click(screen.getByRole('button', { name: '刷新' })); await settle();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('失败');
    expect(screen.getByText('Address already in use')).toBeTruthy();
  });

  it('aborts and ignores late results on close and session change', async () => {
    let resolveFirst!: (value: unknown) => void;
    harness.apiGet.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
    const view = render(dialog()); await settle();
    const signal = harness.apiGet.mock.calls[0][1].signal as AbortSignal;
    harness.sessionId = 's2';
    view.rerender(dialog(vi.fn(), 's2')); await settle();
    expect(signal.aborted).toBe(true);
    await act(async () => { resolveFirst({ success: true, task: task({ output: 'old private output' }) }); });
    expect(screen.queryByText('old private output')).toBeNull();
    const nextSignal = harness.apiGet.mock.calls[1][1].signal as AbortSignal;
    view.unmount(); expect(nextSignal.aborted).toBe(true);
  });

  it('uses plain text for terminal escapes/HTML, shows truncation and restores keyboard focus', async () => {
    harness.apiGet.mockResolvedValue({ success: true, task: task({ output: '<script>unsafe()</script>', truncated: true, totalBytes: 99000 }) });
    const trigger = document.createElement('button'); document.body.appendChild(trigger); trigger.focus();
    const onClose = vi.fn(); const view = render(dialog(onClose)); await settle();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭任务详情' }));
    expect(screen.getByRole('region', { name: '执行日志' }).querySelector('script')).toBeNull();
    expect(screen.getByText(/仅显示日志末尾/)).toBeTruthy();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('region', { name: '执行日志' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' }); expect(onClose).toHaveBeenCalledOnce();
    view.unmount(); expect(document.activeElement).toBe(trigger); trigger.remove();
  });
});
