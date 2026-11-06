import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ContentBlock, Message as MessageType, ToolUseSimple } from '@/types/chat';

vi.mock('@/context/ImagePreviewContext', () => ({ useImagePreview: () => ({ openPreview: vi.fn() }) }));
vi.mock('@/analytics', () => ({ track: vi.fn() }));
vi.mock('@/context/FileActionContext', () => ({
  useFileAction: () => ({ workspacePath: '/workspace', openFileTarget: vi.fn() }),
}));

import Message from './Message';

const TIMESTAMP = new Date('2026-06-27T08:00:00Z');

function assistantMsg(overrides: Partial<MessageType> = {}): MessageType {
  return {
    id: 'assistant-turn-meta',
    role: 'assistant',
    content: '这一轮已经完成。',
    timestamp: TIMESTAMP,
    ...overrides,
  };
}

function userMsg(): MessageType {
  return {
    id: 'user-rewind-anchor',
    role: 'user',
    content: '回到这里',
    timestamp: TIMESTAMP,
  };
}

describe('Message — assistant turn meta footer', () => {
  it('renders duration and total tokens in the hover-only action row', () => {
    render(
      <Message
        message={assistantMsg({
          durationMs: 134_000,
          usage: {
            inputTokens: 10_000,
            outputTokens: 2_400,
          },
        })}
      />
    );

    const meta = screen.getByText('本轮耗时 2m 14s · 12.4K tokens');
    expect(meta).toBeInTheDocument();
    expect(meta).toHaveClass('text-xs', 'opacity-0', 'group-hover/actions:opacity-100');
  });

  it('omits the meta label when both duration and token numbers are absent', () => {
    render(<Message message={assistantMsg()} />);

    expect(screen.queryByText(/本轮耗时|tokens/)).not.toBeInTheDocument();
  });

  it('re-renders when only completed turn metrics change', () => {
    const { rerender } = render(<Message message={assistantMsg()} />);
    expect(screen.queryByText(/tokens/)).not.toBeInTheDocument();

    rerender(
      <Message
        message={assistantMsg({
          durationMs: 1_500,
          usage: {
            inputTokens: 500,
            outputTokens: 20,
          },
        })}
      />
    );

    expect(screen.getByText('本轮耗时 1.5s · 520 tokens')).toBeInTheDocument();
  });

  it('offers fork for a Codex assistant anchor without a builtin SDK uuid', () => {
    render(
      <Message
        message={assistantMsg({
          runtimeTurnAnchor: { turnId: 'turn-1', rootUserMessageId: 'user-1' },
        })}
        onFork={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    expect(screen.getByRole('button', { name: '分支' })).toBeInTheDocument();
  });

  it('re-renders the same user row when rewind becomes available', () => {
    const message = userMsg();
    const { rerender } = render(<Message message={message} />);
    expect(screen.queryByRole('button', { name: '时间回溯' })).not.toBeInTheDocument();

    rerender(<Message message={message} onRewind={vi.fn()} />);

    expect(screen.getByRole('button', { name: '时间回溯' })).toBeInTheDocument();
  });

  it('re-renders the same anchored assistant row when fork becomes unavailable', () => {
    const message = assistantMsg({
      runtimeTurnAnchor: { turnId: 'turn-stable', rootUserMessageId: 'user-stable' },
    });
    const { rerender } = render(<Message message={message} onFork={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    expect(screen.getByRole('button', { name: '分支' })).toBeInTheDocument();

    rerender(<Message message={message} />);

    expect(screen.queryByRole('button', { name: '分支' })).not.toBeInTheDocument();
  });

  it('shows the Turn edit capsule only after the assistant message is terminal', () => {
    const message = assistantMsg({
      content: [{
        type: 'tool_use',
        tool: {
          id: 'edit-1',
          name: 'Edit',
          input: { file_path: 'src/a.ts', old_string: 'a', new_string: 'b' },
          result: 'completed',
        } as unknown as ToolUseSimple,
      }],
    });
    const streaming = render(<Message message={message} isLoading />);
    expect(screen.queryByRole('button', { name: /本轮编辑 1 个文件/ })).not.toBeInTheDocument();
    streaming.unmount();

    render(<Message message={message} />);
    expect(screen.getByRole('button', { name: /本轮编辑 1 个文件/ })).toBeInTheDocument();
  });
});

describe('completed turn process disclosure', () => {
  const read = (id: string, result?: string): ContentBlock => ({
    type: 'tool_use', tool: { id, name: 'Read', input: { file_path: id }, result, isLoading: false, streamIndex: 0 },
  });
  const message = assistantMsg({
    transcriptState: 'complete',
    runtimeTurnAnchor: { turnId: 'turn', rootUserMessageId: 'user' },
    content: [
      { type: 'text', text: '先查看文件。', textPhase: 'commentary', isComplete: true },
      read('checked.txt', 'checked'),
      read('unknown.txt'),
      { type: 'text', text: '接下来汇总。', textPhase: 'commentary', isComplete: true },
      { type: 'text', text: '成果已经交付。', textPhase: 'final_answer', isComplete: true },
    ],
  });

  it('folds interleaved commentary and successful tool calls behind one control while leaving unknown work visible', () => {
    const { container, rerender } = render(<Message message={message} />);
    const disclosure = screen.getByRole('button', { name: '查看执行过程' });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('成果已经交付。')).toBeVisible();
    expect(screen.getByText('先查看文件。')).not.toBeVisible();
    expect(screen.getByText('接下来汇总。')).not.toBeVisible();
    expect(container.querySelector('[data-process-row="succeeded"]')).not.toBeVisible();
    expect(container.querySelector('[data-process-row="unknown"]')).toBeVisible();
    fireEvent.click(disclosure);
    expect(screen.getByText('先查看文件。')).toBeVisible();
    expect(screen.getByText('接下来汇总。')).toBeVisible();
    expect(container.querySelector('[data-process-row="succeeded"]')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '收起执行过程' }));
    expect(screen.getByText('接下来汇总。')).not.toBeVisible();
    rerender(<Message message={message} revealTurnProcess />);
    expect(screen.getByText('接下来汇总。')).toBeVisible();
  });

  it('keeps selected progress and its DOM node when the live turn completes', () => {
    const { rerender } = render(<Message message={message} isLoading />);
    const progress = screen.getByText('先查看文件。');
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(progress);
    selection.removeAllRanges();
    selection.addRange(range);
    rerender(<Message message={message} />);
    expect(progress).toBeVisible();
    expect(screen.getByText('先查看文件。')).toBe(progress);
    expect(selection.toString()).toBe('先查看文件。');
    expect(screen.getByRole('button', { name: '收起执行过程' })).toBeVisible();
    selection.removeAllRanges();
    fireEvent.click(screen.getByRole('button', { name: '收起执行过程' }));
    expect(progress).not.toBeVisible();
    expect(screen.getByText('成果已经交付。')).toBeVisible();
  });

  it('still folds a live turn at completion when the reader has not interacted', () => {
    const { rerender } = render(<Message message={message} isLoading />);
    rerender(<Message message={message} />);
    expect(screen.getByRole('button', { name: '查看执行过程' })).toBeVisible();
    expect(screen.getByText('先查看文件。')).not.toBeVisible();
  });

  it('samples the latest reading intent at completion and keeps it until explicit collapse', () => {
    let reading = false;
    const isReadingProcess = () => reading;
    const { rerender, unmount } = render(<Message message={message} isLoading isReadingProcess={isReadingProcess} />);
    reading = true;
    rerender(<Message message={message} isReadingProcess={isReadingProcess} />);
    expect(screen.getByText('先查看文件。')).toBeVisible();
    reading = false;
    rerender(<Message message={{ ...message, durationMs: 1000 }} isReadingProcess={isReadingProcess} />);
    expect(screen.getByText('先查看文件。')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '收起执行过程' }));
    expect(screen.getByText('先查看文件。')).not.toBeVisible();
    unmount();
    render(<Message message={message} isReadingProcess={() => true} />);
    expect(screen.getByText('先查看文件。')).not.toBeVisible();
  });

  it('waits for delayed transcript completion before deciding whether to fold', () => {
    let reading = false;
    const isReadingProcess = () => reading;
    const streaming = { ...message, transcriptState: 'streaming' as const };
    const { rerender } = render(<Message message={streaming} isLoading isReadingProcess={isReadingProcess} />);
    rerender(<Message message={streaming} isReadingProcess={isReadingProcess} />);
    reading = true;
    rerender(<Message message={message} isReadingProcess={isReadingProcess} />);
    expect(screen.getByText('先查看文件。')).toBeVisible();
    expect(screen.getByRole('button', { name: '收起执行过程' })).toBeVisible();
  });

  it('preserves manually expanded tool detail through the terminal boundary', () => {
    const row = assistantMsg({ ...message, content: [
      { type: 'text', text: '检查中。', textPhase: 'commentary', isComplete: true },
      read('details.txt', 'READER_DETAIL_CONTENT'),
      { type: 'text', text: '检查完成。', textPhase: 'final_answer', isComplete: true },
    ] });
    const { container, rerender } = render(<Message message={row} isLoading />);
    const tool = container.querySelector('[data-process-row] button[aria-expanded="false"]')!;
    fireEvent.click(tool);
    expect(tool).toHaveAttribute('aria-expanded', 'true');
    rerender(<Message message={row} />);
    expect(tool).toBeVisible();
    expect(tool).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('检查中。')).toBeVisible();
  });

  it('reveals successful legacy process rows during search without changing their default fold', () => {
    const legacy = assistantMsg({
      content: [read('search-one.txt', 'checked'), read('search-two.txt', 'checked')],
    });
    const { container, rerender } = render(<Message message={legacy} />);
    expect(container.querySelectorAll('[data-process-row="succeeded"]')).toHaveLength(0);
    rerender(<Message message={legacy} revealTurnProcess />);
    expect(container.querySelectorAll('[data-process-row="succeeded"]')).toHaveLength(2);
    for (const row of container.querySelectorAll('[data-process-row="succeeded"]')) {
      expect(row).toBeVisible();
    }
  });

  it.each(['streaming', 'interrupted', 'missing-anchor', 'unmarked-answer'] as const)(
    'keeps progress visible when the terminal answer cannot be established (%s)', condition => {
      const row = { ...message };
      if (condition === 'streaming' || condition === 'interrupted') row.transcriptState = condition;
      if (condition === 'missing-anchor') row.runtimeTurnAnchor = undefined;
      if (condition === 'unmarked-answer') row.content = (row.content as ContentBlock[]).map(block =>
        block.textPhase === 'final_answer' ? { ...block, textPhase: undefined } : block);
      render(<Message message={row} />);
      expect(screen.queryByRole('button', { name: '查看执行过程' })).toBeNull();
      expect(screen.getByText('先查看文件。')).toBeVisible();
      expect(screen.getByText('成果已经交付。')).toBeVisible();
    },
  );
});
