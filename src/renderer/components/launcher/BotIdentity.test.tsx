import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WorkspaceIcon from './WorkspaceIcon';
import WorkspaceIconGrid from './WorkspaceIconGrid';
import BotIdentityButton from './BotIdentityButton';

describe('Bot identity surfaces', () => {
  it('uses one selected character across the picker and identity button, and opens its settings', () => {
    const select = vi.fn();
    const open = vi.fn();
    const { container, rerender } = render(<>
      <WorkspaceIconGrid value="bot:moss" onSelect={select} />
      <BotIdentityButton name="销售业绩提升" icon="bot:moss" onOpen={open} />
    </>);
    expect(screen.getByRole('button', { name: '青芽' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '默认' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: '打开 销售业绩提升 的 Bot 设置' }));
    expect(open).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '火花' }));
    expect(select).toHaveBeenCalledWith('bot:spark');
    expect(container.querySelectorAll('[data-workspace-icon="bot:moss"]')).toHaveLength(2);
    rerender(<BotIdentityButton name="新名称" icon="bot:moss" onOpen={open} />);
    expect(container.querySelector('[data-workspace-icon="bot:moss"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: '打开 新名称 的 Bot 设置' })).toBeInTheDocument();
  });

  it('keeps classic IDs, emoji and the explicit default selection available', () => {
    const select = vi.fn();
    const { container } = render(<>
      <WorkspaceIconGrid value="moon-stars" onSelect={select} />
      <WorkspaceIcon icon="⚡" />
    </>);
    expect(screen.getByRole('button', { name: 'moon' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '默认' }));
    expect(select).toHaveBeenCalledWith('');
    expect(container).toHaveTextContent('⚡');
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
    expect(container.querySelector('img')).toHaveAttribute('aria-hidden', 'true');
  });
});
