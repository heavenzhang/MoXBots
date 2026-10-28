import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithTheme as render } from '@/test/renderWithTheme';
import type { Message, ToolUseSimple } from '@/types/chat';
import { clearAllBackgroundTaskStatuses, registerBackgroundTask, setBackgroundTaskStatus } from '@/utils/backgroundTaskStatus';
import SubagentActivityPanel from './SubagentActivityPanel';
import SubagentInspector from './SubagentInspector';

const harness = vi.hoisted(() => ({ messages: [] as Message[], sessionId: 's1', streamingMessage: null as Message | null, hasMoreBefore: false, loadOlderMessages: vi.fn() }));
vi.mock('@/context/TabContext', () => ({ useTabStateOptional: () => harness }));
vi.mock('@/components/Markdown', () => ({ default: ({ children }: { children: string }) => <div>{children}</div> }));

function fixture(id: string, patch: Partial<ToolUseSimple> = {}): Message {
  return { id, role: 'assistant', timestamp: new Date(1000), content: [{ id: id + '-b', type: 'tool_use', tool: {
    id: id + '-tool', name: 'Agent', input: {}, streamIndex: 0,
    inputJson: JSON.stringify({ description: '审阅工资主体链路', prompt: '只读检查工资核算，不修改文件。', model: 'sonnet' }),
    result: JSON.stringify({ status: 'async_launched', agentId: id + '-child', resolvedModel: 'gpt-6.1-sol' }), ...patch,
  } }] };
}

beforeEach(() => {
  clearAllBackgroundTaskStatuses(); harness.sessionId = 's1'; harness.hasMoreBefore = false;
  harness.messages = [fixture('old', { subagentLifecycle: { status: 'completed', startedAt: 1000, finishedAt: 3000, model: 'gpt-6.1-sol', result: '发现主体隔离缺口。' } }),
    { id: 'user2', role: 'user', content: '继续', timestamp: new Date(4000) }];
  harness.streamingMessage = null; harness.loadOlderMessages.mockReset();
});

describe('in-chat subagent visibility', () => {
  it('explains plan-mode rejection in the list and inspector while preserving the raw error', () => {
    harness.messages = [fixture('rejected', { result: 'PreToolUse:Agent hook error: 当前处于 Plan（规划）模式，禁止派发 Agent。' })];
    render(<SubagentInspector toolId="rejected-tool" overlay={false} onClose={() => undefined} onJumpToTool={() => undefined} />);
    expect(screen.getByText('规划模式拦截了本次派发，子 Agent 未开始执行。')).toBeVisible();
    expect(screen.queryByText(/报告回传不等于/)).toBeNull();
    fireEvent.click(screen.getByText('展开原始错误'));
    expect(screen.getByText(/PreToolUse:Agent hook error/)).toBeVisible();
  });
  it('keeps historical access after completion and switches between current turn and history', () => {
    const select = vi.fn(); render(<SubagentActivityPanel onSelect={select} />);
    fireEvent.click(screen.getByRole('button', { name: /子 Agent.*已回传 1/ }));
    expect(screen.getByText(/本轮没有子 Agent/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '整个会话 1' }));
    fireEvent.click(screen.getByRole('button', { name: /审阅工资主体链路.*gpt-6.1-sol/ }));
    expect(select).toHaveBeenCalledWith('old-tool');
  });

  it('updates through session-scoped live events without changing another session', () => {
    harness.messages = [fixture('live')];
    registerBackgroundTask('child', 'live-tool', {}, 's1');
    render(<SubagentActivityPanel onSelect={() => undefined} />);
    expect(screen.getByRole('button', { name: /运行中 1/ })).toBeInTheDocument();
    act(() => setBackgroundTaskStatus('child', 'failed', 'live-tool', 's2'));
    expect(screen.getByRole('button', { name: /运行中 1/ })).toBeInTheDocument();
    act(() => setBackgroundTaskStatus('child', 'completed', 'live-tool', 's1'));
    expect(screen.getByRole('button', { name: /运行中 0.*已回传 1/ })).toBeInTheDocument();
  });

  it('shows inputJson assignment and runtime model, keeps acceptance distinct and closes on Escape', () => {
    const close = vi.fn(), jump = vi.fn();
    render(<SubagentInspector toolId="old-tool" overlay onClose={close} onJumpToTool={jump} />);
    const pane = screen.getByRole('dialog');
    expect(within(pane).getByText('发现主体隔离缺口。')).toBeInTheDocument();
    expect(within(pane).getByText(/报告回传不等于已采纳/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '任务' }));
    expect(screen.getByText('只读检查工资核算，不修改文件。')).toBeInTheDocument();
    expect(screen.getByText('sonnet')).toBeInTheDocument();
    expect(screen.getAllByText('gpt-6.1-sol')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '定位到聊天中的委派记录' }));
    expect(jump).toHaveBeenCalledWith('old-tool');
    fireEvent.keyDown(pane, { key: 'Escape' }); expect(close).toHaveBeenCalledOnce();
  });

  it('never renders private thinking in progress or tools', () => {
    harness.messages = [fixture('private', { subagentCalls: [{ id: 'think', name: 'Thinking', input: {}, result: 'SECRET THOUGHT' }, { id: 'read', name: 'Read', input: {}, result: 'public file result' }] })];
    render(<SubagentInspector toolId="private-tool" overlay={false} onClose={() => undefined} onJumpToTool={() => undefined} />);
    fireEvent.click(screen.getByRole('tab', { name: '进展' }));
    expect(screen.queryByText(/SECRET THOUGHT/)).not.toBeInTheDocument();
    expect(screen.getByText(/public file result/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '工具' }));
    expect(screen.queryByText(/SECRET THOUGHT/)).not.toBeInTheDocument();
  });
  it('does not let a cached older execution complete a new launch', () => {
    harness.messages = [fixture('rerun', { result: JSON.stringify({ status: 'async_launched', runId: 'run-002' }) })];
    setBackgroundTaskStatus('child', 'completed', 'rerun-tool', 's1', 'run-001');
    render(<SubagentActivityPanel onSelect={() => undefined} />);
    expect(screen.getByRole('button', { name: /运行中 0.*已回传 0/ })).toBeInTheDocument();
    act(() => setBackgroundTaskStatus('child', 'completed', 'rerun-tool', 's1', 'run-002'));
    expect(screen.getByRole('button', { name: /运行中 0.*已回传 1/ })).toBeInTheDocument();
  });

  it('offers earlier history with zero loaded agents and reports a loading failure', async () => {
    harness.messages = []; harness.hasMoreBefore = true;
    harness.loadOlderMessages.mockImplementation(async (options) => options.onError(new Error('offline')));
    render(<SubagentActivityPanel onSelect={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /子 Agent/ }));
    fireEvent.click(screen.getByRole('button', { name: '整个会话 0+' }));
    fireEvent.click(screen.getByRole('button', { name: /载入更早/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(harness.loadOlderMessages).toHaveBeenCalledOnce();
  });

  it('shows the main agent for a root with no recorded agent ID', () => {
    harness.messages = [fixture('root', { result: 'A completed report' })];
    render(<SubagentInspector toolId="root-tool" overlay={false} onClose={() => undefined} onJumpToTool={() => undefined} />);
    expect(screen.getByText(/主 Agent.*委派|委派.*主 Agent/)).toBeInTheDocument();
  });

  it('locates the top-level delegation for a nested child and supports keyboard tabs', () => {
    const jump = vi.fn();
    harness.messages = [fixture('root', { result: undefined, subagentCalls: [{ id: 'nested-tool', name: 'Agent', input: { description: 'Nested review' }, result: 'Nested report' }] })];
    render(<SubagentInspector toolId="nested-tool" overlay={false} onClose={() => undefined} onJumpToTool={jump} />);
    expect(screen.getByText(/审阅工资主体链路/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '定位到聊天中的委派记录' }));
    expect(jump).toHaveBeenCalledWith('root-tool');
    fireEvent.keyDown(screen.getByRole('tab', { name: '结果' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: '任务' })).toHaveAttribute('aria-selected', 'true');
  });

});
