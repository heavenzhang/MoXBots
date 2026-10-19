import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { ToolUseSimple } from '@/types/chat';
import { clearAllBackgroundTaskStatuses, registerBackgroundTask, setBackgroundTaskStatus } from '@/utils/backgroundTaskStatus';
import TaskTool from './TaskTool';

afterEach(() => { cleanup(); clearAllBackgroundTaskStatuses(); });

it('keeps observing a task card after completion so a resumed run returns to running', async () => {
  registerBackgroundTask('agent', 'tool', { runId: 'run-1' });
  setBackgroundTaskStatus('agent', 'completed', 'tool', undefined, 'run-1');
  const tool: ToolUseSimple = { id: 'tool', name: 'Task', input: {}, streamIndex: 0,
    parsedInput: { prompt: 'Audit', description: 'Audit', run_in_background: true }, isLoading: false };
  render(<TaskTool tool={tool} />);
  await waitFor(() => expect(screen.getByText('后台完成')).toBeInTheDocument());
  act(() => { registerBackgroundTask('agent', 'tool', { runId: 'run-2' }); });
  await waitFor(() => expect(screen.getByText('后台运行中')).toBeInTheDocument());
  act(() => { setBackgroundTaskStatus('agent', 'completed', 'tool', undefined, 'run-1'); });
  expect(screen.getByText('后台运行中')).toBeInTheDocument();
  act(() => { setBackgroundTaskStatus('agent', 'completed', 'tool', undefined, 'run-2'); });
  await waitFor(() => expect(screen.getByText('后台完成')).toBeInTheDocument());
});


it('restores a historical Agent assignment from raw inputJson instead of showing initialization', () => {
  const tool: ToolUseSimple = { id: 'history-agent', name: 'Agent', input: {}, streamIndex: 0,
    inputJson: JSON.stringify({ description: '核查隔离', prompt: '只读审阅工资主体。' }),
    result: JSON.stringify({ status: 'completed', resolvedModel: 'gpt-6.1-sol', content: [{ type: 'text', text: '隔离报告已返回。' }] }), isLoading: false };
  render(<TaskTool tool={tool} />);
  expect(screen.getByText(/只读审阅工资主体/)).toBeInTheDocument();
  expect(screen.getByText('隔离报告已返回。')).toBeInTheDocument();
  expect(screen.queryByText('正在初始化任务...')).not.toBeInTheDocument();
});
