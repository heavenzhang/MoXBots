import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import userEvent from '@testing-library/user-event';

import { i18n } from '@/i18n';
import ConfirmDialog from './ConfirmDialog';

describe('ConfirmDialog i18n', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en-US');
  });

  it('uses translated default action labels', () => {
    render(
      <ConfirmDialog
        title="Delete item"
        message="This cannot be undone."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });
  it('lets Enter activate Cancel or Confirm according to actual modal focus', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmDialog modal title="Maintain pool" message="Proceed?" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    screen.getByRole('button', { name: 'Confirm' }).focus();
    await user.keyboard('{Enter}');
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('traps focus in opt-in modal, starts on cancel, restores trigger, and ignores close while loading', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    function Harness({ loading = false }: { loading?: boolean }) {
      const [open, setOpen] = React.useState(false);
      return <><button onClick={() => setOpen(true)}>Open</button>{open && <ConfirmDialog modal loading={loading} title="Confirm change" message="Proceed?" onConfirm={onConfirm} onCancel={() => { onCancel(); setOpen(false); }} />}</>;
    }
    const { rerender } = render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Confirm change' });
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(cancel).toHaveFocus();

    rerender(<Harness loading />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    rerender(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });
});
