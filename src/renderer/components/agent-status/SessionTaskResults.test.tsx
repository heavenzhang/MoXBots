import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/i18n';
import type { SessionTaskLedger } from '../../../shared/sessionTaskOrchestration';
import { SessionTaskOrchestrationProvider, useSessionTaskOrchestration } from './useSessionTaskOrchestration';
import { SessionTaskActionsContext } from './SessionTaskActionsContext';
import SessionTaskResults from './SessionTaskResults';
import ExecutionStatusBar from './ExecutionStatusBar';
import { emptyTaskLedger, materializeExecutionTodos, mergeTaskObservations } from '../../../shared/sessionTaskOrchestration';
import SessionTaskAssociation from './SessionTaskAssociation';

const tab = vi.hoisted(() => ({ tabId: 'tab', sessionId: 's1', sessionState: 'running', isLoading: false,
  isSessionLoading: false, queuedMessages: [], messages: [], streamingMessage: null, agentPlanTodos: [], apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock('@/context/TabContext', () => ({ useTabStateOptional: () => tab }));
const actions = { disabled: false, onInspect: vi.fn(), onReview: vi.fn(), onComposeRework: vi.fn() };
const EMPTY: [] = [];
function state(revision = 1, tool = 'tool', ordinal = 1, status: 'running' | 'completed' | 'failed' = 'completed'): SessionTaskLedger {
  return { revision, tasks: [{ id: 'work', title: '检查原布局', blockedBy: [] }], bindings: { [tool]: 'work' }, currentTools: { work: tool },
    attempts: [{ id: `attempt-${ordinal}`, toolUseId: tool, title: '检查原布局', executionVerified: true,
      lifecycle: { status, startedAt: 1, activation: { id: `activation-${ordinal}`, ordinal, state: status } } }], reviews: [] };
}
function Consumer() { const value = useSessionTaskOrchestration(EMPTY); return <span>{value.tasks[0]?.phase}</span>; }
function Host() { return <SessionTaskOrchestrationProvider><SessionTaskActionsContext.Provider value={actions}>
  <Consumer /><Consumer /><SessionTaskAssociation toolUseId="tool" activationId="activation-1" /><SessionTaskResults />
</SessionTaskActionsContext.Provider></SessionTaskOrchestrationProvider>; }
const event = (ledger: SessionTaskLedger, sessionId = 's1') => act(() => { window.dispatchEvent(new CustomEvent('session-task-orchestration', { detail: { sessionId, ledger } })); });
async function ready() { const ui = render(<Host />); await screen.findByRole('button', { name: '让主 Agent 验收' }); return ui; }
beforeEach(async () => {
  vi.resetAllMocks(); await i18n.changeLanguage('zh-CN'); tab.sessionId = 's1'; tab.sessionState = 'running'; actions.disabled = false;
  tab.apiGet.mockResolvedValue({ success: true, sessionId: 's1', ledger: state() }); actions.onReview.mockResolvedValue(true);
});

describe('Incremental task actions share the original conversation state', () => {
  it('shows a failed child and its cause without opening the inspector, with no review action', async () => {
    const failed = state(1, 'tool', 1, 'failed');
    failed.attempts[0].lifecycle.result = 'PreToolUse:Agent hook error: 当前处于 Plan（规划）模式，禁止本次派发。';
    failed.reviews = [{ taskId: 'work', attemptId: 'attempt-1', decision: 'accept', evidence: '旧版本误记为通过' }];
    tab.apiGet.mockResolvedValue({ success: true, sessionId: 's1', ledger: failed });
    render(<Host />);
    const error = await screen.findByText('规划模式拦截了本次派发，子 Agent 未开始执行。');
    expect(error).toBeVisible();
    const row = error.closest('li')!;
    expect(within(row).getByText('执行失败')).toBeVisible();
    expect(within(row).getByText('历史验收记录（本次执行未完成）')).toBeVisible();
    expect(screen.queryByRole('button', { name: '让主 Agent 验收' })).toBeNull();
    fireEvent.click(within(row).getByRole('button', { name: '查看原因' }));
    expect(actions.onInspect).toHaveBeenCalledWith('tool');
    fireEvent.click(within(row).getByRole('button', { name: '补充处理意见' }));
    expect(actions.onComposeRework).toHaveBeenCalledWith([{ sessionId: 's1', taskId: 'work', attemptId: 'attempt-1' }]);
    expect(actions.onReview).not.toHaveBeenCalled();
  });
  it('separates main-agent steps and excludes failed or running children from the review request', async () => {
    const ledger = state();
    for (const [id, status] of [['failed', 'failed'], ['running', 'running']] as const) {
      ledger.tasks.push({ id, title: `${id} child`, blockedBy: [] });
      ledger.bindings[id] = id;
      ledger.attempts.push({ id, toolUseId: id, title: `${id} child`, executionVerified: true, lifecycle: { status, startedAt: 1 } });
    }
    ledger.plan = [{ key: 'main-step', content: '主 Agent 独立准备环境', activeForm: '准备环境', status: 'pending' }];
    tab.apiGet.mockResolvedValue({ success: true, sessionId: 's1', ledger });
    await ready();
    expect(document.querySelectorAll('[data-task-result]')).toHaveLength(3);
    expect(document.querySelector('[data-task-result]')).toHaveAttribute('data-task-phase', 'failed');
    expect(screen.queryByText('主 Agent 独立准备环境')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '让主 Agent 验收' }));
    expect(actions.onReview).toHaveBeenCalledWith([{ sessionId: 's1', taskId: 'work', attemptId: 'attempt-1' }]);
  });
  it('does not offer acceptance for an unverified execution', async () => {
    const ledger = state(); ledger.attempts[0].executionVerified = false;
    tab.apiGet.mockResolvedValue({ success: true, sessionId: 's1', ledger });
    render(<Host />);
    await screen.findByText('暂时无法确认执行结果，需核对执行记录。');
    expect(screen.queryByRole('button', { name: '让主 Agent 验收' })).toBeNull();
    expect(screen.getAllByRole('button', { name: '查看记录' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: '查看成果' })).toBeNull();
  });
  it('uses one snapshot observer across rows, results and repeated status consumers', async () => {
    await ready(); expect(tab.apiGet).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole('button', { name: '查看成果' })[0]); expect(actions.onInspect).toHaveBeenCalledWith('tool');
  });
  it('requests the current attempt once and never accepts on chat admission', async () => {
    let finish!: (accepted: boolean) => void; actions.onReview.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await ready(); const button = screen.getByRole('button', { name: '让主 Agent 验收' });
    fireEvent.click(button); fireEvent.click(button); expect(actions.onReview).toHaveBeenCalledTimes(1);
    expect(actions.onReview).toHaveBeenCalledWith([{ sessionId: 's1', taskId: 'work', attemptId: 'attempt-1' }]);
    await act(async () => finish(true)); expect(screen.getByRole('button', { name: '验收请求已提交' })).toBeDisabled();
    expect(screen.getAllByText('awaiting_review')).toHaveLength(2);
    const accepted = state(2); accepted.reviews = [{ taskId: 'work', attemptId: 'attempt-1', decision: 'accept', evidence: '已核对原布局' }];
    event(accepted); expect(screen.getAllByText('completed')).toHaveLength(2); expect(screen.getByText('主 Agent 已验收 1 项成果')).toBeVisible();
  });
  it('offers an explicit retry after the original turn ends without a review', async () => {
    const ui = await ready(); fireEvent.click(screen.getByRole('button', { name: '让主 Agent 验收' }));
    await screen.findByRole('button', { name: '验收请求已提交' }); expect(screen.queryByRole('button', { name: '重新请求验收' })).toBeNull();
    tab.sessionState = 'idle'; ui.rerender(<Host />); fireEvent.click(screen.getByRole('button', { name: '重新请求验收' }));
    await waitFor(() => expect(actions.onReview).toHaveBeenCalledTimes(2));
  });
  it('keeps the same target and permits retry after rejected admission', async () => {
    actions.onReview.mockResolvedValueOnce(false).mockResolvedValueOnce(true); await ready();
    fireEvent.click(screen.getByRole('button', { name: '让主 Agent 验收' })); await screen.findByRole('status');
    fireEvent.click(screen.getByRole('button', { name: '让主 Agent 验收' })); await screen.findByRole('button', { name: '验收请求已提交' });
    expect(actions.onReview.mock.calls[1][0]).toEqual(actions.onReview.mock.calls[0][0]);
  });
  it('late completion cannot mark a retried attempt as requested or accepted', async () => {
    let finish!: (accepted: boolean) => void; actions.onReview.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await ready(); fireEvent.click(screen.getByRole('button', { name: '让主 Agent 验收' }));
    const next = state(2, 'new-tool', 2); next.bindings.tool = 'work'; next.attempts.unshift(state().attempts[0]); event(next);
    await act(async () => finish(true)); expect(screen.getByRole('button', { name: '让主 Agent 验收' })).toBeEnabled();
    expect(screen.getByText('历史尝试 1')).toBeVisible(); expect(screen.getAllByText('awaiting_review')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '让主 Agent 验收' }));
    expect(actions.onReview.mock.calls[1][0][0].attemptId).toBe('attempt-2');
  });
  it('historical tool rows cannot claim acceptance from the new attempt', async () => {
    await ready(); const next = state(2, 'new-tool', 2); next.bindings.tool = 'work'; next.attempts.unshift(state().attempts[0]);
    next.reviews = [{ taskId: 'work', attemptId: 'attempt-2', decision: 'accept', evidence: '新尝试通过' }]; event(next);
    const row = document.querySelector('[data-session-task-association="work"]')!;
    expect(row.textContent).toContain('历史尝试 1'); expect(row.textContent).not.toContain('已验收');
  });
  it('A/B/A never adopts the old review-request acknowledgment', async () => {
    let finish!: (accepted: boolean) => void;
    actions.onReview.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const ui = await ready(); fireEvent.click(screen.getByRole('button', { name: '让主 Agent 验收' }));
    tab.sessionId = 's2'; tab.apiGet.mockResolvedValue({ success: true, sessionId: 's2', ledger: state() });
    ui.rerender(<Host />); await screen.findByRole('button', { name: '让主 Agent 验收' });
    tab.sessionId = 's1'; tab.apiGet.mockResolvedValue({ success: true, sessionId: 's1', ledger: state() });
    ui.rerender(<Host />); await screen.findByRole('button', { name: '让主 Agent 验收' });
    await act(async () => finish(true)); expect(screen.getByRole('button', { name: '让主 Agent 验收' })).toBeEnabled();
  });
  it('reused native handles distinguish activation IDs', async () => {
    await ready(); const next = state(2, 'tool', 2); next.attempts.unshift(state().attempts[0]);
    next.reviews = [{ taskId: 'work', attemptId: 'attempt-2', decision: 'accept', evidence: '新尝试通过' }]; event(next);
    const row = document.querySelector('[data-session-task-association="work"]')!;
    expect(row.textContent).toContain('历史尝试 1'); expect(row.textContent).not.toContain('已验收');
  });
  it('original permission state disables actions and rework only composes feedback', async () => {
    actions.disabled = true; const ui = await ready(); expect(screen.getByRole('button', { name: '让主 Agent 验收' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '提出返工意见' })); expect(actions.onComposeRework).not.toHaveBeenCalled();
    actions.disabled = false; ui.rerender(<Host />); fireEvent.click(screen.getByRole('button', { name: '提出返工意见' }));
    expect(actions.onComposeRework).toHaveBeenCalledWith([{ sessionId: 's1', taskId: 'work', attemptId: 'attempt-1' }]); expect(actions.onReview).not.toHaveBeenCalled();
  });
});


describe('one live main-task disclosure', () => {
  it('shows each live task once in the composer, without repeating its owner', async () => {
    const ledger = emptyTaskLedger();
    ledger.executionAdmission = { requestId: 'human', queueId: 'queue', taskPlanId: 'compact' };
    materializeExecutionTodos(ledger, 'compact', ['定位现有页面', '完成布局调整']);
    tab.apiGet.mockResolvedValue({ success: true, sessionId: 's1', ledger });
    render(<SessionTaskOrchestrationProvider><SessionTaskActionsContext.Provider value={actions}>
      <SessionTaskResults />
      <ExecutionStatusBar activity={{ containerRef: { current: null }, onJumpToTool: vi.fn(), onSelectSubagent: vi.fn() }} />
    </SessionTaskActionsContext.Provider></SessionTaskOrchestrationProvider>);
    const trigger = await screen.findByRole('button', { name: /任务.*已验收 0\/2/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('定位现有页面')).toBeNull();
    expect(screen.queryByText(/主 Agent 任务/)).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getAllByText('定位现有页面')).toHaveLength(1);
    expect(screen.getAllByText('完成布局调整')).toHaveLength(1);
    expect(screen.queryByText('主 Agent 执行与验收')).toBeNull();
    fireEvent.keyDown(screen.getByRole('region', { name: '任务详情' }), { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('retains completed main tasks as collapsed transcript history', async () => {
    const initial = emptyTaskLedger();
    initial.executionAdmission = { requestId: 'human', queueId: 'queue', taskPlanId: 'compact' };
    materializeExecutionTodos(initial, 'compact', ['定位现有页面', '完成布局调整']);
    const ledger = mergeTaskObservations(initial, [], initial.plan!.map(todo => ({ ...todo, status: 'completed' })), 'queue');
    ledger.reviews = ledger.tasks.map(task => ({ taskId: task.id, attemptId: 'main', decision: 'accept', evidence: '已核对页面' }));
    tab.apiGet.mockResolvedValue({ success: true, sessionId: 's1', ledger });
    render(<SessionTaskOrchestrationProvider><SessionTaskActionsContext.Provider value={actions}>
      <SessionTaskResults />
    </SessionTaskActionsContext.Provider></SessionTaskOrchestrationProvider>);
    const summary = await screen.findByText(/主 Agent 任务 2 项/);
    const details = summary.closest('details')!;
    expect(details.open).toBe(false);
    expect(screen.getByText('定位现有页面')).not.toBeVisible();
    // jsdom does not implement native summary toggling; browser QA covers opening.
    expect(details.textContent).toContain('已验收 2 项');
  });
});
