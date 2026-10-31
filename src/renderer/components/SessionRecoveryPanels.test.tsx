import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SessionRecoveryPanels } from './SessionRecoveryPanels';
import type { RecoveryActionSnapshot } from '../../shared/recoveryReconciliation';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

function props(sessionId: string, hidden = false) {
  return {
    continuation: { sessionId, turnId: `turn-${sessionId}`, ready: true, blocked: false, hidden,
      onContinue: vi.fn(async () => false), onUnavailable: vi.fn() },
    review: { sessionId, disabled: false,
      inspect: vi.fn(async () => ({ sessionId, sdkSessionId: sessionId, epoch: 'fixture', actions: [], resolutions: [] }) as unknown as RecoveryActionSnapshot),
      reconcile: vi.fn() },
  };
}

describe('Session recovery panel reconciliation', () => {
  it('keeps only the current continuation when restored sessions and error state change repeatedly', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      let current = props('initial');
      const view = render(<SessionRecoveryPanels {...current} />);
      for (let i = 0; i < 8; i++) {
        current = props(`session-${i}`);
        view.rerender(<SessionRecoveryPanels {...current} />);
        expect(screen.getAllByRole('button', { name: 'shell.continuation.continue' })).toHaveLength(1);
        view.rerender(<SessionRecoveryPanels {...current} continuation={{ ...current.continuation, hidden: true }}>
          <div role="alert">current error</div>
        </SessionRecoveryPanels>);
        expect(screen.queryByRole('button', { name: 'shell.continuation.continue' })).not.toBeInTheDocument();
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        view.rerender(<SessionRecoveryPanels {...current} />);
      }
      fireEvent.click(screen.getByRole('button', { name: 'shell.continuation.continue' }));
      await waitFor(() => expect(current.continuation.onContinue).toHaveBeenCalledExactlyOnceWith('turn-session-7'));
      expect(errors.mock.calls.filter(args => args.some(x => String(x).includes('same key')))).toEqual([]);
      view.unmount();
      expect(screen.queryByText('shell.continuation.title')).not.toBeInTheDocument();
    } finally { errors.mockRestore(); }
  });

  it('does not apply a late continuation admission to the next Session', async () => {
    let complete!: (value: boolean) => void;
    const a = props('a'); a.continuation.onContinue = vi.fn(() => new Promise<boolean>(resolve => { complete = resolve; }));
    const b = props('b');
    const { rerender } = render(<SessionRecoveryPanels {...a} />);
    fireEvent.click(screen.getByRole('button', { name: 'shell.continuation.continue' }));
    rerender(<SessionRecoveryPanels {...b} />);
    await act(async () => complete(true));
    expect(screen.getAllByRole('button', { name: 'shell.continuation.continue' })).toHaveLength(1);
    expect(b.continuation.onContinue).not.toHaveBeenCalled();
  });
});
