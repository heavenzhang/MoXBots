import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ContentBlock, Message as MessageType } from '@/types/chat';

vi.mock('@/context/ImagePreviewContext', () => ({ useImagePreview: () => ({ openPreview: vi.fn() }) }));
vi.mock('@/analytics', () => ({ track: vi.fn() }));

import Message from './Message';

const thought: ContentBlock = { id: 'thought', type: 'thinking', thinking: 'Inspect the fixture.', isComplete: true };
const tool: ContentBlock = {
  id: 'read', type: 'tool_use',
  tool: { id: 'read-tool', name: 'Read', streamIndex: 1, input: { file_path: '/tmp/fixture.txt' }, result: 'Fixture output', isLoading: false },
};
const message = (content: ContentBlock[]): MessageType => ({
  id: 'live', role: 'assistant', content, timestamp: new Date('2026-11-06T13:27:50Z'),
});

describe('Message process continuity between native blocks', () => {
  it('keeps the same process rows visible through tool, text and thinking gaps until the turn ends', () => {
    const activeTool = { ...tool, tool: { ...tool.tool!, result: undefined, isLoading: true } };
    const { container, rerender } = render(<Message message={message([thought, activeTool])} isLoading />);
    const thinkingRow = container.querySelector('[data-process-row="succeeded"]');
    expect(thinkingRow).toBeVisible();

    // A tool result closes the last open block before the next block arrives.
    rerender(<Message message={message([thought, tool])} isLoading />);
    expect(thinkingRow).toBeVisible();
    expect(container.querySelector('[data-process-row="succeeded"]')).toBe(thinkingRow);
    expect(container.querySelector('[data-process-row="running"]')).toBeNull();

    const text: ContentBlock = { id: 'progress', type: 'text', text: 'Checking the next sample.', isComplete: true };
    rerender(<Message message={message([thought, tool, text])} isLoading />);
    expect(thinkingRow).toBeVisible();
    const nextThought: ContentBlock = { id: 'next-thought', type: 'thinking', thinking: 'Next sample', isComplete: false };
    rerender(<Message message={message([thought, tool, text, nextThought])} isLoading />);
    expect(thinkingRow).toBeVisible();
    expect(container.querySelector('[data-process-row="running"]')).toBeVisible();
    const completed = [thought, tool, text, { ...nextThought, isComplete: true }];
    rerender(<Message message={message(completed)} isLoading />);
    expect(thinkingRow).toBeVisible();
    expect(container.querySelector('[data-process-row="running"]')).toBeNull();

    // Only the owning message lifecycle admits history folding.
    rerender(<Message message={message(completed)} isLoading={false} />);
    expect(thinkingRow).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '已完成 2 个执行步骤' }));
    expect(thinkingRow).toBeVisible();
  });

  it('retains an explicit user fold across inter-block gaps and never hides a failed row', () => {
    const text: ContentBlock = { id: 'progress', type: 'text', text: 'Continue', isComplete: true };
    const blocks = [thought, tool, text, { ...thought, id: 'second', isComplete: false }];
    const { container, rerender } = render(<Message message={message(blocks)} isLoading />);
    const row = container.querySelector('[data-process-row="succeeded"]')!;
    fireEvent.click(row.querySelector('button')!);
    const toggle = row.querySelector('button');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    rerender(<Message message={message(blocks.map(block => ({ ...block, isComplete: true })))} isLoading />);
    expect(row).toBeVisible();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const failed = { ...tool, id: 'failed', tool: { ...tool.tool!, id: 'failed-tool', name: 'Bash', isError: true, result: 'Exit code 1', resultMeta: { exitCode: 1 } } };
    rerender(<Message message={message([thought, failed])} isLoading={false} />);
    expect(container.querySelector('[data-process-row="failed"]')).toBeVisible();
  });
});
