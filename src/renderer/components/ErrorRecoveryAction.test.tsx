import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorRecoveryAction } from './ErrorRecoveryAction';
import type { ErrorRecovery } from '../pages/errorMessageResend';

describe('error recovery action', () => {
  it.each(['continue', 'inspect', 'resend'] as const)('dispatches only explicit %s clicks and blocks rapid duplicates', async kind => {
    let resolve!: () => void;
    const onRecover = vi.fn(() => new Promise<void>(done => { resolve = done; }));
    const onUnavailable = vi.fn();
    const recovery: ErrorRecovery = kind === 'continue' ? { kind, turnId: 'exact-turn' }
      : kind === 'resend' ? { kind, message: { id: 'failed', role: 'user', content: 'original', timestamp: new Date(0), deliveryStatus: 'failed' } }
      : { kind };
    const { rerender } = render(<ErrorRecoveryAction sessionId="s" recovery={recovery} disabled={false} onRecover={onRecover} onUnavailable={onUnavailable} />);
    expect(onRecover).not.toHaveBeenCalled();
    const button = screen.getByRole('button');
    fireEvent.click(button); fireEvent.click(button);
    expect(onRecover).toHaveBeenCalledExactlyOnceWith(recovery);
    expect(button).toBeDisabled();
    await act(async () => { resolve(); });
    rerender(<ErrorRecoveryAction sessionId="s" recovery={{ kind: 'inspect' }} disabled onRecover={onRecover} onUnavailable={onUnavailable} />);
    fireEvent.click(button);
    expect(onRecover).toHaveBeenCalledOnce();
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it('keeps the recovery available after a failure and reports it without automatic retries', async () => {
    const onRecover = vi.fn().mockRejectedValue(new Error('offline'));
    const onUnavailable = vi.fn();
    render(<ErrorRecoveryAction sessionId="s" recovery={{ kind: 'continue', turnId: 't' }} disabled={false} onRecover={onRecover} onUnavailable={onUnavailable} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(onUnavailable).toHaveBeenCalledOnce());
    expect(onRecover).toHaveBeenCalledOnce();
    expect(screen.getByRole('button')).toBeEnabled();
  });
});
