import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { RecoveryActionReview } from './RecoveryActionReview';
import type { RecoveryActionSnapshot, RecoveryActionRequest } from '../../shared/recoveryReconciliation';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const snapshot: RecoveryActionSnapshot = { sessionId: 's', sdkSessionId: 'n', epoch: 1, reviewAuthority: 'a', ledgerDigest: 'd', resolvedCount: 0,
  actions: [{ actionHash: 'query', tool: 'TaskGet', eligible: true, reason: 'builtin_task_query' },
    { actionHash: 'mutating', tool: 'Other', eligible: false, reason: 'external_receipt_required', presentation: { kind: 'write_file', target: '方案.docx' } }] };
const props = () => ({ sessionId: 's', inspectRevision: 'idle:1', disabled: false,
  inspect: vi.fn(async () => snapshot),
  reconcile: vi.fn(async (_request: RecoveryActionRequest) => ({ ...snapshot, ledgerDigest: 'd2', resolvedCount: 1, actions: snapshot.actions.slice(1) })) });

it('automatically saves only eligible proof and leaves unknown operations protected behind compact details', async () => {
  const p = props(); render(<RecoveryActionReview {...p} />);
  await waitFor(() => expect(p.reconcile).toHaveBeenCalledExactlyOnceWith({ sessionId: 's', sdkSessionId: 'n', epoch: 1,
    reviewAuthority: 'a', ledgerDigest: 'd', actionHash: 'query' }));
  expect(await screen.findByText('recoveryReview.states.pending')).toBeVisible();
  expect(screen.queryByText('方案.docx')).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('recoveryReview.details'));
  expect(await screen.findByRole('dialog')).toHaveTextContent('方案.docx');
  expect(screen.queryByText('recoveryReview.recoverSession')).not.toBeInTheDocument();
});
it('has no recovery UI for a normal session with no uncertain operations', async () => {
  const p = props(); p.inspect.mockResolvedValue({ ...snapshot, actions: [] });
  render(<RecoveryActionReview {...p} />);
  await waitFor(() => expect(p.inspect).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(p.reconcile).not.toHaveBeenCalled();
});
it('checks each settled revision once and checks again when returning from busy', async () => {
  const p = props(); const view = render(<RecoveryActionReview {...p} />);
  await screen.findByText('recoveryReview.states.pending');
  view.rerender(<RecoveryActionReview {...p} />);
  expect(p.inspect).toHaveBeenCalledTimes(1);
  view.rerender(<RecoveryActionReview {...p} inspectRevision="idle:2" />);
  await waitFor(() => expect(p.inspect).toHaveBeenCalledTimes(2));
  await screen.findByText('recoveryReview.states.pending');
  view.rerender(<RecoveryActionReview {...p} disabled />);
  view.rerender(<RecoveryActionReview {...p} />);
  await waitFor(() => expect(p.inspect).toHaveBeenCalledTimes(3));
});
it('records exact denials and queries sequentially with the current digest without executing a task', async () => {
  const initial: RecoveryActionSnapshot = { ...snapshot, actions: [{ actionHash: 'denied', tool: 'Bash', eligible: true, reason: 'native_hook_denied' }, snapshot.actions[0]] };
  const p = props(); p.inspect.mockResolvedValue(initial);
  p.reconcile.mockImplementation(async request => request.actionHash === 'denied'
    ? { ...initial, ledgerDigest: 'd2', resolvedCount: 1, actions: initial.actions.slice(1) }
    : { ...initial, ledgerDigest: 'd3', resolvedCount: 2, actions: [] });
  render(<RecoveryActionReview {...p} continuation={<button>existing continuation</button>} />);
  expect(await screen.findByText('recoveryReview.states.ready')).toBeVisible();
  expect(p.reconcile.mock.calls.map(([r]) => [r.actionHash, r.ledgerDigest])).toEqual([['denied', 'd'], ['query', 'd2']]);
  expect(screen.getByText('existing continuation')).toBeVisible();
});
it('refreshes after a lost commit response and never resends the same hash', async () => {
  const p = props(); let latest = snapshot;
  p.inspect.mockImplementation(async () => latest);
  p.reconcile.mockImplementation(async () => { latest = { ...snapshot, actions: snapshot.actions.slice(1) }; throw new Error('response lost'); });
  render(<RecoveryActionReview {...p} />);
  await screen.findByText('recoveryReview.states.pending');
  expect(p.reconcile).toHaveBeenCalledTimes(1); expect(p.inspect).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('preserves known blockers on failed reconciliation and stops without spinning', async () => {
  const p = props(); p.reconcile.mockRejectedValue(new Error('stale'));
  render(<RecoveryActionReview {...p} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('recoveryReview.changed');
  expect(p.reconcile).toHaveBeenCalledTimes(1); expect(p.inspect).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByText('recoveryReview.details'));
  expect(await screen.findByRole('dialog')).toHaveTextContent('方案.docx');
});
it('makes failed automatic checks visible for interrupted work with a retry action', async () => {
  const p = props(); p.inspect.mockRejectedValue(new Error('unavailable'));
  render(<RecoveryActionReview {...p} interrupted />);
  expect(await screen.findByRole('alert')).toHaveTextContent('recoveryReview.changed');
  expect(screen.getByText('recoveryReview.checkAgain')).toBeVisible();
  expect(p.inspect).toHaveBeenCalledTimes(1);
});
it.each(['session', 'busy', 'unmount'])('drops late results on %s changes before any settlement', async mode => {
  const p = props(); let finish!: (v: RecoveryActionSnapshot) => void;
  p.inspect.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<RecoveryActionReview {...p} />);
  if (mode === 'session') view.rerender(<RecoveryActionReview {...p} sessionId="other" disabled />);
  else if (mode === 'busy') view.rerender(<RecoveryActionReview {...p} disabled />);
  else view.unmount();
  await act(async () => finish(snapshot));
  expect(p.reconcile).not.toHaveBeenCalled();
  expect(screen.queryByText('recoveryReview.states.pending')).not.toBeInTheDocument();
});
it('handles StrictMode cleanup and setup while only the live generation settles', async () => {
  const p = props(); render(<StrictMode><RecoveryActionReview {...p} /></StrictMode>);
  await screen.findByText('recoveryReview.states.pending');
  expect(p.reconcile).toHaveBeenCalledTimes(1);
});
it('queues a newer revision during inspection and processes it once the current check finishes', async () => {
  const p = props(); const resolve: Array<(v: RecoveryActionSnapshot) => void> = [];
  p.inspect.mockImplementation(() => new Promise(done => resolve.push(done)));
  const view = render(<RecoveryActionReview {...p} />);
  view.rerender(<RecoveryActionReview {...p} inspectRevision="idle:2" />);
  await act(async () => resolve[0]({ ...snapshot, actions: [] }));
  await waitFor(() => expect(p.inspect).toHaveBeenCalledTimes(2));
  await act(async () => resolve[1]({ ...snapshot, actions: [] }));
  expect(p.reconcile).not.toHaveBeenCalled();
});
it('rejects changed authority after a response without processing subsequent candidates', async () => {
  const p = props(); p.reconcile.mockResolvedValue({ ...snapshot, reviewAuthority: 'foreign' });
  render(<RecoveryActionReview {...p} />);
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(p.reconcile).toHaveBeenCalledTimes(1);
});
it('opens one scrolling detail panel, traps focus, closes with Escape, and prepares an unsent check', async () => {
  const p = props(); const onPrepareCheck = vi.fn(); render(<RecoveryActionReview {...p} onPrepareCheck={onPrepareCheck} />);
  await screen.findByText('recoveryReview.states.pending');
  const trigger = screen.getByText('recoveryReview.details'); trigger.focus(); fireEvent.click(trigger);
  const dialog = screen.getByRole('dialog'); const close = within(dialog).getByText('recoveryReview.close');
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
  expect(within(dialog).getByText('recoveryReview.technical')).toHaveFocus();
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
  fireEvent.click(trigger); fireEvent.click(screen.getByText('recoveryReview.prepareCheck'));
  expect(onPrepareCheck).toHaveBeenCalledExactlyOnceWith(snapshot.actions[1]);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('closing details leaves automatic proof collection running', async () => {
  const p = props(); let finish!: (v: RecoveryActionSnapshot) => void;
  p.reconcile.mockImplementation(() => new Promise(done => { finish = done; }));
  render(<RecoveryActionReview {...p} />);
  await waitFor(() => expect(p.reconcile).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByText('recoveryReview.details'));
  fireEvent.click(screen.getByText('recoveryReview.close'));
  await act(async () => finish({ ...snapshot, actions: [], resolvedCount: 1 }));
  expect(await screen.findByText('recoveryReview.states.ready')).toBeVisible();
});
