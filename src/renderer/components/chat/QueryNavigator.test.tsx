import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QueryNavigator from './QueryNavigator';
import type { Message } from '../../types/chat';
import { SPACE_ISSUE_CONTEXT_TAG, buildFloatingBallContextReminder } from '../../../shared/systemReminder';
import { projectVisibleChatTimelineRows } from '@/utils/chatTimelineRows';

class IntersectionObserverMock {
  observe() {}
  disconnect() {}
}

class MutationObserverMock {
  observe() {}
  disconnect() {}
}

function userMessage(id: string, content: string): Message {
  return {
    id,
    role: 'user',
    content,
    timestamp: new Date('2026-05-26T00:00:00Z'),
  };
}

describe('QueryNavigator', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
    vi.stubGlobal('MutationObserver', MutationObserverMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the query rail on the left, separate from the message scrollbar edge', () => {
    const scrollContainerRef = { current: document.createElement('div') };

    const { container } = render(
      <QueryNavigator
        messages={[
          userMessage('u1', 'First question'),
          userMessage('u2', 'Second question'),
          userMessage('u3', 'Third question'),
        ]}
        scrollContainerRef={scrollContainerRef}
        pauseAutoScroll={vi.fn()}
      />,
    );

    expect(container.firstElementChild).toHaveClass('left-2');
    expect(container.firstElementChild).not.toHaveClass('right-4');
  });

  const questions = () => [
    userMessage('u1', 'First question'),
    userMessage('u2', 'Second question'),
    userMessage('u3', 'Third question'),
  ];

  it('lets keyboard users enter the index, navigate a virtualized query and exit with Escape', () => {
    const navigate = vi.fn();
    const { getByRole, getByText } = render(
      <QueryNavigator messages={questions()} scrollContainerRef={{ current: document.createElement('div') }}
        pauseAutoScroll={vi.fn()} onNavigateToQuery={navigate} />,
    );
    const panel = getByRole('navigation');
    expect(panel).toHaveAttribute('tabindex', '0');
    expect(getByText('Third question').closest('button')).toHaveAttribute('tabindex', '-1');
    act(() => panel.focus());
    const lastQuery = getByRole('button', { name: 'Third question' });
    expect(lastQuery).toHaveAttribute('tabindex', '0');
    act(() => lastQuery.focus());
    fireEvent.click(lastQuery);
    expect(navigate).toHaveBeenCalledExactlyOnceWith('u3');
    fireEvent.keyDown(lastQuery, { key: 'Escape' });
    expect(panel).toHaveFocus();
    expect(lastQuery).toHaveAttribute('tabindex', '-1');
  });

  it('keeps the focused index open when the pointer leaves and closes after keyboard focus leaves', () => {
    const { getByRole, getByText } = render(
      <QueryNavigator messages={questions()} scrollContainerRef={{ current: document.createElement('div') }}
        pauseAutoScroll={vi.fn()} />,
    );
    const panel = getByRole('navigation');
    act(() => panel.focus());
    fireEvent.mouseLeave(panel);
    expect(getByRole('button', { name: 'First question' })).toHaveAttribute('tabindex', '0');
    act(() => panel.blur());
    expect(getByText('First question').closest('button')).toHaveAttribute('tabindex', '-1');
  });

  it('preserves fallback navigation and pauses automatic following before scrolling', () => {
    const target = document.createElement('div');
    target.dataset.messageId = 'u2';
    target.scrollIntoView = vi.fn();
    const scroller = document.createElement('div');
    scroller.append(target);
    const pause = vi.fn();
    const { getByRole } = render(
      <QueryNavigator messages={questions()} scrollContainerRef={{ current: scroller }} pauseAutoScroll={pause} />,
    );
    fireEvent.mouseEnter(getByRole('navigation'));
    fireEvent.click(getByRole('button', { name: 'Second question' }));
    expect(pause).toHaveBeenCalledOnce();
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(pause.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(target.scrollIntoView).mock.invocationCallOrder[0]);
  });

  it('does not count task notifications toward the navigator threshold', () => {
    const scrollContainerRef = { current: document.createElement('div') };

    const { container } = render(
      <QueryNavigator
        messages={projectVisibleChatTimelineRows([
          userMessage('u1', 'First question'),
          userMessage(
            'task-notification-bg-1',
            '<task-notification>{"taskId":"bg-1","status":"completed"}</task-notification>',
          ),
          userMessage('u2', 'Second question'),
        ])}
        scrollContainerRef={scrollContainerRef}
        pauseAutoScroll={vi.fn()}
      />,
    );

    expect(container.firstElementChild).toBeNull();
  });

  it('hides task notifications when real user queries are present', () => {
    const scrollContainerRef = { current: document.createElement('div') };

    const { container } = render(
      <QueryNavigator
        messages={projectVisibleChatTimelineRows([
          userMessage('u1', 'First question'),
          userMessage(
            'task-notification-bg-1',
            '<task-notification>{"taskId":"bg-1","status":"completed"}</task-notification>',
          ),
          userMessage('u2', 'Second question'),
          userMessage('u3', 'Third question'),
        ])}
        scrollContainerRef={scrollContainerRef}
        pauseAutoScroll={vi.fn()}
      />,
    );

    expect(container).toHaveTextContent('First question');
    expect(container).toHaveTextContent('Second question');
    expect(container).toHaveTextContent('Third question');
    expect(container).not.toHaveTextContent('task-notification');
    expect(container).not.toHaveTextContent('bg-1');
  });

  it('uses the visible user query after a floating-ball context reminder', () => {
    const scrollContainerRef = { current: document.createElement('div') };
    const mixed = `${buildFloatingBallContextReminder({
      appName: 'Safari',
      selectedText: 'selected text',
    })}\n\nExplain this`;

    const { container } = render(
      <QueryNavigator
        messages={[
          userMessage('u1', 'First question'),
          userMessage('u2', mixed),
          userMessage('u3', 'Third question'),
        ]}
        scrollContainerRef={scrollContainerRef}
        pauseAutoScroll={vi.fn()}
      />,
    );

    expect(container).toHaveTextContent('First question');
    expect(container).toHaveTextContent('Explain this');
    expect(container).toHaveTextContent('Third question');
    expect(container).not.toHaveTextContent('FLOATING_BALL_CONTEXT');
    expect(container).not.toHaveTextContent('selected text');
  });

  it('uses the visible Space issue status after a hidden delivery reminder', () => {
    const scrollContainerRef = { current: document.createElement('div') };
    const visible = 'MyAgents Space 已投递一个 Issue 通知，Registered Agent 开始处理。';
    const mixed = [
      '<system-reminder>',
      `<${SPACE_ISSUE_CONTEXT_TAG}>`,
      '<issue-instruction>hidden issue instructions</issue-instruction>',
      `</${SPACE_ISSUE_CONTEXT_TAG}>`,
      '</system-reminder>',
      visible,
    ].join('\n');

    const { container } = render(
      <QueryNavigator
        messages={[
          userMessage('u1', 'First question'),
          userMessage('u2', mixed),
          userMessage('u3', 'Third question'),
        ]}
        scrollContainerRef={scrollContainerRef}
        pauseAutoScroll={vi.fn()}
      />,
    );

    expect(container).toHaveTextContent('First question');
    expect(container).toHaveTextContent(visible);
    expect(container).toHaveTextContent('Third question');
    expect(container).not.toHaveTextContent('hidden issue instructions');
  });

  it('navigates a visible turn even when its hidden reminder is maintenance-shaped', () => {
    const scrollContainerRef = { current: document.createElement('div') };
    const mixed = '<system-reminder><HEARTBEAT>hidden schedule state</HEARTBEAT></system-reminder>Visible follow-up';

    const { container } = render(
      <QueryNavigator
        messages={[
          userMessage('u1', 'First question'),
          userMessage('u2', mixed),
          userMessage('u3', 'Third question'),
        ]}
        scrollContainerRef={scrollContainerRef}
        pauseAutoScroll={vi.fn()}
      />,
    );

    expect(container).toHaveTextContent('Visible follow-up');
    expect(container).not.toHaveTextContent('hidden schedule state');
  });
});
