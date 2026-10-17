import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import CurrentPageHeader from './CurrentPageHeader';

describe('current page window chrome', () => {
  it('shows only the current identity and keeps close separate from window dragging', () => {
    const close = vi.fn();
    const { container, rerender } = render(<CurrentPageHeader chrome={{ title: '会话 A', subtitle: '项目一' }} onClose={close} />);
    expect(screen.getByText('会话 A')).toBeTruthy();
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    const button = screen.getByRole('button');
    expect(button.hasAttribute('data-tauri-drag-region')).toBe(false);
    fireEvent.click(button);
    expect(close).toHaveBeenCalledTimes(1);
    rerender(<CurrentPageHeader chrome={{ title: '会话 B', subtitle: '项目二' }} />);
    expect(screen.queryByText('会话 A')).toBeNull();
    expect(screen.getByText('会话 B')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
