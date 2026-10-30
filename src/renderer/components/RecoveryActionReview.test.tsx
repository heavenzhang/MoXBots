import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { RecoveryActionReview } from './RecoveryActionReview';
import type { RecoveryActionSnapshot } from '../../shared/recoveryReconciliation';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const snapshot: RecoveryActionSnapshot = { sessionId: 's', sdkSessionId: 'n', epoch: 1, reviewAuthority: 'a', ledgerDigest: 'd', resolvedCount: 0,
  actions: [{ actionHash: 'h', tool: 'TaskGet', eligible: true, reason: 'builtin_task_query' },
    { actionHash: 'mutating', tool: 'Other', eligible: false, reason: 'external_receipt_required' }] };

it('shows a batch session recovery action, settles eligible evidence, and keeps blockers visible', async () => {
  const inspect = vi.fn(async () => snapshot); const reconcile = vi.fn(async () => ({ ...snapshot, resolvedCount: 1, actions: snapshot.actions.slice(1) }));
  render(<RecoveryActionReview sessionId="s" inspect={inspect} reconcile={reconcile} disabled={false} />);
  fireEvent.click(await screen.findByText('recoveryReview.open'));
  const button = await screen.findByText('recoveryReview.recoverSession');
  fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1));
  expect(reconcile).toHaveBeenCalledWith({ sessionId: 's', sdkSessionId: 'n', epoch: 1, reviewAuthority: 'a', ledgerDigest: 'd', actionHash: 'h' });
  expect(screen.getByText('recoveryReview.pendingCount')).toBeVisible();
});
it('automatically inspects each settled session revision once and opens only actionable evidence', async () => {
  const inspect = vi.fn(async () => snapshot);
  const props = { sessionId: 's', inspect, reconcile: vi.fn(), disabled: false, inspectRevision: '7:a1' };
  const view = render(<RecoveryActionReview {...props} />);
  expect(await screen.findByText('recoveryReview.recoverSession')).toBeVisible();
  expect(inspect).toHaveBeenCalledTimes(1);
  view.rerender(<RecoveryActionReview {...props} />);
  expect(inspect).toHaveBeenCalledTimes(1);
  view.rerender(<RecoveryActionReview {...props} inspectRevision="8:a2" />);
  await waitFor(() => expect(inspect).toHaveBeenCalledTimes(2));
});
it('reopens the review for a new idle revision after the previous revision was fully settled', async () => {
  let currentSnapshot = snapshot;
  const inspect = vi.fn(async () => currentSnapshot);
  const reconcile = vi.fn(async () => {
    currentSnapshot = { ...snapshot, actions: [], resolvedCount: 2 };
    return currentSnapshot;
  });
  const props = { sessionId: 's', inspect, reconcile, disabled: false, inspectRevision: 'idle:1' };
  const view = render(<RecoveryActionReview {...props} />);
  fireEvent.click(await screen.findByText('recoveryReview.recoverSession'));
  expect(await screen.findByText('recoveryReview.sessionReady')).toBeVisible();
  currentSnapshot = snapshot;
  view.rerender(<RecoveryActionReview {...props} inspectRevision="idle:2" />);
  expect(await screen.findByText('recoveryReview.recoverSession')).toBeVisible();
  expect(inspect).toHaveBeenCalledTimes(3);
});
it('labels a proven native hook denial as not executed and permits only explicit settlement', async () => {
  const denied: RecoveryActionSnapshot = { ...snapshot, actions: [{ actionHash: 'denied', tool: 'Bash' as RecoveryActionSnapshot['actions'][number]['tool'], eligible: true,
    reason: 'native_hook_denied' as RecoveryActionSnapshot['actions'][number]['reason'] }] };
  const inspect = vi.fn(async () => denied);
  const reconcile = vi.fn(async () => ({ ...denied, resolvedCount: 1, actions: [] }));
  render(<RecoveryActionReview sessionId="s" inspect={inspect} reconcile={reconcile} disabled={false} inspectRevision="1:a1" />);
  expect(await screen.findByText('recoveryReview.hookDenied')).toBeVisible();
  fireEvent.click(screen.getByText('recoveryReview.recoverSession'));
  await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1));
  expect(reconcile).toHaveBeenCalledWith({ sessionId: 's', sdkSessionId: 'n', epoch: 1,
    reviewAuthority: 'a', ledgerDigest: 'd', actionHash: 'denied' });
  expect(await screen.findByText('recoveryReview.sessionReady')).toBeVisible();
});
it('settles eligible actions sequentially with the latest digest, never repeating a command', async () => {
  const two = { ...snapshot, actions: [
    { actionHash: 'denied', tool: 'Bash' as const, eligible: true, reason: 'native_hook_denied' as const },
    snapshot.actions[0], snapshot.actions[1],
  ] };
  const inspect = vi.fn(async () => two);
  const reconcile = vi.fn(async (request: { actionHash: string; ledgerDigest: string }) => {
    if (request.actionHash === 'denied') return { ...two, ledgerDigest: 'd2', actions: two.actions.slice(1), resolvedCount: 1 };
    return { ...two, ledgerDigest: 'd3', actions: two.actions.slice(2), resolvedCount: 2 };
  });
  render(<RecoveryActionReview sessionId="s" inspect={inspect} reconcile={reconcile} disabled={false} inspectRevision="2:a2" />);
  fireEvent.click(await screen.findByText('recoveryReview.recoverSession'));
  await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(2));
  expect(reconcile.mock.calls.map(([request]) => [request.actionHash, request.ledgerDigest])).toEqual([['denied', 'd'], ['h', 'd2']]);
  expect(await screen.findByText('recoveryReview.pendingCount')).toBeVisible();
});
it('stops a batch recovery after close while an in-flight reconciliation settles', async () => {
  const two = { ...snapshot, actions: [
    { actionHash: 'denied', tool: 'Bash' as const, eligible: true, reason: 'native_hook_denied' as const },
    snapshot.actions[0],
  ] };
  let finish!: (value: RecoveryActionSnapshot) => void;
  const reconcile = vi.fn(() => new Promise<RecoveryActionSnapshot>(resolve => { finish = resolve; }));
  render(<RecoveryActionReview sessionId="s" inspect={async () => two} reconcile={reconcile} disabled={false} inspectRevision="close:a1" />);
  fireEvent.click(await screen.findByText('recoveryReview.recoverSession'));
  await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByText('recoveryReview.close'));
  await act(async () => finish({ ...two, ledgerDigest: 'd2', actions: two.actions.slice(1) }));
  expect(reconcile).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('recoveryReview.sessionReady')).not.toBeInTheDocument();
});
it('queues a newer idle revision while inspection is pending and retries it after settlement', async () => {
  const resolvers: Array<(value: RecoveryActionSnapshot) => void> = [];
  const inspect = vi.fn(() => new Promise<RecoveryActionSnapshot>(resolve => resolvers.push(resolve)));
  const props = { sessionId: 's', inspect, reconcile: vi.fn(), disabled: false, inspectRevision: '1:a1' };
  const view = render(<RecoveryActionReview {...props} />);
  expect(inspect).toHaveBeenCalledTimes(1);
  view.rerender(<RecoveryActionReview {...props} inspectRevision="2:a2" />);
  await act(async () => resolvers[0](snapshot));
  await waitFor(() => expect(inspect).toHaveBeenCalledTimes(2));
  await act(async () => resolvers[1]({ ...snapshot, actions: [] }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('keeps automatic inspection failures quiet so normal sessions retain the manual entry', async () => {
  const inspect = vi.fn(async () => { throw new Error('not ready'); });
  render(<RecoveryActionReview sessionId="s" inspectRevision="1:a1" inspect={inspect} reconcile={vi.fn()} disabled={false} />);
  await waitFor(() => expect(inspect).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByText('recoveryReview.open')).toBeVisible();
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
  fireEvent.click(await screen.findByText('recoveryReview.recoverSession'));
  expect(await screen.findByRole('alert')).toHaveTextContent('recoveryReview.changed');
  expect(screen.queryByText('recoveryReview.recoverSession')).not.toBeInTheDocument();
});
