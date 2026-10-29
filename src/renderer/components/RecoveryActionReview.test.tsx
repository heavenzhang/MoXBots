import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { RecoveryActionReview } from './RecoveryActionReview';
import type { RecoveryActionSnapshot } from '../../shared/recoveryReconciliation';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const snapshot: RecoveryActionSnapshot = { sessionId: 's', sdkSessionId: 'n', epoch: 1, reviewAuthority: 'a', ledgerDigest: 'd', resolvedCount: 0,
  actions: [{ actionHash: 'h', tool: 'TaskGet', eligible: true, reason: 'builtin_task_query' },
    { actionHash: 'mutating', tool: 'Other', eligible: false, reason: 'external_receipt_required' }] };

it('reviews explicitly, sends the exact selected identity once, never resumes tasks', async () => {
  const inspect = vi.fn(async () => snapshot); const reconcile = vi.fn(async () => ({ ...snapshot, resolvedCount: 1, actions: snapshot.actions.slice(1) }));
  render(<RecoveryActionReview sessionId="s" inspect={inspect} reconcile={reconcile} disabled={false} />);
  expect(inspect).not.toHaveBeenCalled(); fireEvent.click(screen.getByText('recoveryReview.open'));
  const button = await screen.findByText('recoveryReview.resolve');
  expect(screen.getAllByText('recoveryReview.resolve')).toHaveLength(1);
  fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1));
  expect(reconcile).toHaveBeenCalledWith({ sessionId: 's', sdkSessionId: 'n', epoch: 1, reviewAuthority: 'a', ledgerDigest: 'd', actionHash: 'h' });
  await waitFor(() => expect(screen.queryByText('recoveryReview.resolve')).not.toBeInTheDocument());
});
it('drops delayed inspection on session switch or busy transition', async () => {
  let resolve!: (v: RecoveryActionSnapshot) => void;
  const inspect = vi.fn(() => new Promise<RecoveryActionSnapshot>(r => { resolve = r; }));
  const props = { inspect, reconcile: vi.fn(), disabled: false, sessionId: 's' };
  const view = render(<RecoveryActionReview {...props} />);
  fireEvent.click(screen.getByText('recoveryReview.open'));
  view.rerender(<RecoveryActionReview {...props} sessionId="other" disabled />);
  await act(async () => resolve(snapshot));
  expect(screen.queryByText('recoveryReview.resolve')).not.toBeInTheDocument();
  expect(screen.getByRole('button')).toBeDisabled();
});
it('drops old actionable evidence after a failed commit and requires refresh', async () => {
  const reconcile = vi.fn(async () => { throw new Error('stale'); });
  render(<RecoveryActionReview sessionId="s" inspect={async () => snapshot} reconcile={reconcile} disabled={false} />);
  fireEvent.click(screen.getByText('recoveryReview.open'));
  fireEvent.click(await screen.findByText('recoveryReview.resolve'));
  expect(await screen.findByRole('alert')).toHaveTextContent('recoveryReview.changed');
  expect(screen.queryByText('recoveryReview.resolve')).not.toBeInTheDocument();
});
