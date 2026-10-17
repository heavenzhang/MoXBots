import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import QueuedMessagesPanel from './QueuedMessageBubble';

describe('QueuedMessagesPanel', () => {
  const message = { queueId: 'q-compact', text: '/compact', timestamp: 1 };

  it('keeps edit and cancel as separate, keyboard-accessible actions', async () => {
    const onEdit = vi.fn();
    const onCancel = vi.fn();
    render(<QueuedMessagesPanel messages={[message]} onEdit={onEdit} onCancel={onCancel} onForceExecute={vi.fn()} />);
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole('button', { name: '编辑' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onEdit).toHaveBeenCalledExactlyOnceWith(message.queueId);
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '取消排队' }));
    expect(onCancel).toHaveBeenCalledExactlyOnceWith(message.queueId);
  });

  it('shows an accepted-input refusal without hiding the message or claiming cancellation', async () => {
    const onCancel = vi.fn().mockRejectedValue(Object.assign(new Error('accepted'), { status: 409, errorCode: 'queue_already_accepted' }));
    render(<QueuedMessagesPanel messages={[message]} onEdit={vi.fn()} onCancel={onCancel} onForceExecute={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '取消排队' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('已被接收，无法再撤回或编辑');
    expect(screen.getByText('/compact')).toBeVisible();
    expect(screen.queryByRole('button', { name: '取消排队' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
  });

  it('prevents repeated and conflicting actions while a request is pending', async () => {
    let settle!: () => void;
    const onCancel = vi.fn(() => new Promise<void>(resolve => { settle = resolve; }));
    const onEdit = vi.fn();
    const onForceExecute = vi.fn();
    render(<QueuedMessagesPanel messages={[message]} onCancel={onCancel} onEdit={onEdit} onForceExecute={onForceExecute} />);
    const cancel = screen.getByRole('button', { name: '取消排队' });
    await userEvent.dblClick(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('正在处理');
    expect(screen.getByRole('button', { name: '编辑' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '立即发送' })).toBeDisabled();
    await act(async () => { settle(); });
    await waitFor(() => expect(cancel).toBeEnabled());
  });

  it('preserves a failed request and allows retry after a network failure', async () => {
    const onCancel = vi.fn().mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(true);
    render(<QueuedMessagesPanel messages={[message]} onCancel={onCancel} />);
    const cancel = screen.getByRole('button', { name: '取消排队' });
    await userEvent.click(cancel);
    expect(await screen.findByRole('alert')).toHaveTextContent('请稍后重试');
    expect(screen.getByText('/compact')).toBeVisible();
    await userEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('explains why editing cannot replace an existing composer draft', async () => {
    const onEdit = vi.fn().mockRejectedValue(Object.assign(new Error('draft'), { errorCode: 'queue_draft_not_empty' }));
    render(<QueuedMessagesPanel messages={[message]} onEdit={onEdit} />);
    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('输入框中有未发送的草稿');
    expect(screen.getByRole('button', { name: '编辑' })).toBeEnabled();
  });

  it('keeps long content intact and hides all actions for optimistic input', () => {
    const text = '长消息'.repeat(80);
    render(<QueuedMessagesPanel messages={[{ ...message, text, queueId: 'opt-local' }]} onCancel={vi.fn()} onEdit={vi.fn()} onForceExecute={vi.fn()} />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps the cancel button available for the in-flight head item', async () => {
    const onCancel = vi.fn();
    const onForceExecute = vi.fn();

    render(
      <QueuedMessagesPanel
        messages={[{
          queueId: 'q-1',
          text: '检查一下排队消息',
          timestamp: Date.now(),
          isInFlight: true,
        }]}
        onCancel={onCancel}
        onForceExecute={onForceExecute}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '撤回发送' }));
    expect(onCancel).toHaveBeenCalledWith('q-1');
  });

  it('does not render delivery-state tags next to queued messages', () => {
    render(
      <QueuedMessagesPanel
        messages={[
          {
            queueId: 'q-2',
            text: '第二条消息',
            timestamp: Date.now(),
            deliveryMode: 'turn',
          },
          {
            queueId: 'q-3',
            text: '第三条消息',
            timestamp: Date.now(),
            isInFlight: true,
            deliveryMode: 'realtime',
          },
        ]}
        onCancel={vi.fn()}
        onForceExecute={vi.fn()}
      />,
    );

    expect(screen.getByText('第二条消息')).toBeInTheDocument();
    expect(screen.getByText('第三条消息')).toBeInTheDocument();
    expect(screen.queryByText('下一轮')).not.toBeInTheDocument();
    expect(screen.queryByText('已发送')).not.toBeInTheDocument();
    expect(screen.queryByText('排队')).not.toBeInTheDocument();
  });

  it('hides queue action buttons when runtime queue controls are unavailable', () => {
    render(
      <QueuedMessagesPanel
        messages={[{
          queueId: 'xq-codex-steer',
          text: '继续输入会咋样',
          timestamp: Date.now(),
          isInFlight: true,
          deliveryMode: 'realtime',
          canCancel: false,
          canForceExecute: false,
        }]}
        onCancel={vi.fn()}
        onForceExecute={vi.fn()}
      />,
    );

    expect(screen.getByText('继续输入会咋样')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '立即发送' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '撤回发送' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '取消排队' })).not.toBeInTheDocument();
  });
});
