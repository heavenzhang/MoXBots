import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { RecoveryActionReview } from './RecoveryActionReview';
import type { RecoveryActionSnapshot, RecoveryMutationRequest } from '../../shared/recoveryReconciliation';
const publishRecovery = vi.hoisted(() => vi.fn());
vi.mock('./agent-status/useSessionTaskOrchestration', () => ({ useSessionTaskOrchestrationContext: () => ({publishRecoveryReview:publishRecovery}) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const snapshot: RecoveryActionSnapshot = { sessionId: 's', sdkSessionId: 'n', epoch: 1, reviewAuthority: 'a', ledgerDigest: 'd', resolvedCount: 0, attention: { executionId: 'execution', actionHashes: ['mutating'] },
  actions: [{ actionHash: 'query', tool: 'TaskGet', eligible: true, reason: 'builtin_task_query' },
    { actionHash: 'mutating', tool: 'Other', eligible: false, reason: 'external_receipt_required', presentation: { kind: 'write_file', target: '方案.docx' } }] };
const props = () => ({ sessionId: 's', inspectRevision: 'idle:1', disabled: false,
  inspect: vi.fn(async () => snapshot),
  reconcile: vi.fn(async (_request: RecoveryMutationRequest) => ({ ...snapshot, ledgerDigest: 'd2', resolvedCount: 1, actions: snapshot.actions.slice(1) })) });

it('automatically saves only eligible proof and leaves unknown operations protected behind compact details', async () => {
  const p = props(); render(<RecoveryActionReview {...p} />);
  await waitFor(() => expect(p.reconcile).toHaveBeenCalledExactlyOnceWith({ sessionId: 's', sdkSessionId: 'n', epoch: 1,
    reviewAuthority: 'a', ledgerDigest: 'd', actionHash: 'query' }));
  expect(await screen.findByText('recoveryReview.decision.title')).toBeVisible();
  expect(screen.getByText(/方案.docx/)).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('recoveryReview.decision.resolve'));
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
  await screen.findByText('recoveryReview.decision.title');
  view.rerender(<RecoveryActionReview {...p} />);
  expect(p.inspect).toHaveBeenCalledTimes(1);
  view.rerender(<RecoveryActionReview {...p} inspectRevision="idle:2" />);
  await waitFor(() => expect(p.inspect).toHaveBeenCalledTimes(2));
  await screen.findByText('recoveryReview.decision.title');
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
  await waitFor(() => expect(p.reconcile).toHaveBeenCalledTimes(2));
  expect(screen.queryByText('recoveryReview.decision.title')).not.toBeInTheDocument();
  expect(p.reconcile.mock.calls.map(([r]) => [r.actionHash, r.ledgerDigest])).toEqual([['denied', 'd'], ['query', 'd2']]);
  expect(screen.getByText('existing continuation')).toBeVisible();
});
it('refreshes after a lost commit response and never resends the same hash', async () => {
  const p = props(); let latest = snapshot;
  p.inspect.mockImplementation(async () => latest);
  p.reconcile.mockImplementation(async () => { latest = { ...snapshot, actions: snapshot.actions.slice(1) }; throw new Error('response lost'); });
  render(<RecoveryActionReview {...p} />);
  await screen.findByText('recoveryReview.decision.title');
  expect(p.reconcile).toHaveBeenCalledTimes(1); expect(p.inspect).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('keeps failed automatic checks silent without spinning or hiding continuation', async () => {
  const p = props(); p.reconcile.mockRejectedValue(new Error('stale'));
  render(<RecoveryActionReview {...p} continuation={<button>existing continuation</button>} />);
  await waitFor(() => expect(p.inspect).toHaveBeenCalledTimes(2));
  expect(p.reconcile).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByText('recoveryReview.decision.title')).not.toBeInTheDocument();
  expect(screen.getByText('existing continuation')).toBeVisible();
});
it('does not turn an unavailable inspection into a user decision', async () => {
  const p = props(); p.inspect.mockRejectedValue(new Error('unavailable'));
  render(<RecoveryActionReview {...p} />);
  await waitFor(() => expect(p.inspect).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
  expect(screen.queryByText('recoveryReview.decision.title')).not.toBeInTheDocument();
});
it('handles StrictMode cleanup and setup while only the live generation settles', async () => {
  const p = props(); render(<StrictMode><RecoveryActionReview {...p} /></StrictMode>);
  await screen.findByText('recoveryReview.decision.title');
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
  await waitFor(() => expect(p.reconcile).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByText('recoveryReview.decision.title')).not.toBeInTheDocument();
});
it('opens one scrolling detail panel, traps focus, closes with Escape, and prepares an unsent check', async () => {
  const p = props(); const onPrepareCheck = vi.fn(); render(<RecoveryActionReview {...p} onPrepareCheck={onPrepareCheck} />);
  await screen.findByText('recoveryReview.decision.title');
  const trigger = screen.getByText('recoveryReview.decision.resolve'); trigger.focus(); fireEvent.click(trigger);
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
it('collects proof silently and never flashes a successful recovery card', async () => {
  const p = props(); let finish!: (v: RecoveryActionSnapshot) => void;
  p.reconcile.mockImplementation(() => new Promise(done => { finish = done; }));
  render(<RecoveryActionReview {...p} />);
  await waitFor(() => expect(p.reconcile).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  await act(async () => finish({ ...snapshot, actions: [], resolvedCount: 1, attention: undefined }));
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('saves user evidence durably through the original endpoint and keeps unknown operations protected', async () => {
  let latest: RecoveryActionSnapshot = { ...snapshot, actions: snapshot.actions.slice(1) };
  const p = props(); p.inspect.mockImplementation(async () => latest);
  p.reconcile.mockImplementation(async request => {
    if (!('kind' in request) || request.kind === 'investigate') throw new Error('unexpected operation');
    latest = { ...latest, actions: latest.actions.map(action => ({ ...action, followups: [...(action.followups ?? []), {
      actionHash: request.actionHash, sdkSessionId: request.sdkSessionId, kind: request.kind, text: request.text.trim(), requestId: request.requestId, createdAt: 'now',
    }] })) };
    return latest;
  });
  render(<RecoveryActionReview {...p} />);
  fireEvent.click(await screen.findByText('recoveryReview.decision.resolve'));
  fireEvent.click(screen.getByText('recoveryReview.addNote'));
  fireEvent.change(screen.getByRole('textbox'), {target: {value: '记录 ABC，需核实'}});
  fireEvent.click(screen.getByText('recoveryReview.saveNote'));
  expect(await screen.findByText('recoveryReview.saved')).toBeVisible();
  expect(screen.getByText('记录 ABC，需核实')).toBeVisible();
  expect(latest.actions[0].eligible).toBe(false);
  fireEvent.click(screen.getByText('recoveryReview.defer'));
  await waitFor(() => expect(latest.actions[0].followups?.map(note => note.kind)).toEqual(['note','defer']));
  fireEvent.click(screen.getByText('recoveryReview.close'));
  fireEvent.click(screen.getByText('recoveryReview.decision.resolve'));
  expect(screen.getByText('记录 ABC，需核实')).toBeVisible();
});
it('prepares one original-owner investigation after automatic checks when the server grants it', async () => {
  const p = props();
  const initial = { ...snapshot, actions: snapshot.actions.slice(1), investigationAvailable: true };
  p.inspect.mockResolvedValue(initial);
  p.reconcile.mockResolvedValue({ ...initial, investigationAvailable: false });
  render(<RecoveryActionReview {...p} />);
  await waitFor(() => expect(p.reconcile).toHaveBeenCalledTimes(1));
  expect(p.reconcile.mock.calls[0][0]).toMatchObject({kind:'investigate',actionHash:'mutating'});
});
it('preserves a note draft on storage failure without reporting it saved', async () => {
  const p = props(); p.inspect.mockResolvedValue({...snapshot,actions:snapshot.actions.slice(1)});
  p.reconcile.mockRejectedValue(new Error('disk full'));
  render(<RecoveryActionReview {...p} />);
  fireEvent.click(await screen.findByText('recoveryReview.decision.resolve'));
  fireEvent.click(screen.getByText('recoveryReview.addNote'));
  fireEvent.change(screen.getByRole('textbox'), {target:{value:'keep my draft'}});
  fireEvent.click(screen.getByText('recoveryReview.saveNote'));
  await waitFor(() => expect(p.reconcile).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('textbox')).toHaveValue('keep my draft');
  expect(screen.queryByText('recoveryReview.saved')).not.toBeInTheDocument();
});

it('keeps six historical uncertainties silent while continuing to collect proof', async () => {
  publishRecovery.mockClear();
  const p = props();
  p.inspect.mockResolvedValue({ ...snapshot, attention: undefined, actions: Array.from({length:6}, (_, i) => ({...snapshot.actions[1], actionHash:`old-${i}`})) });
  render(<RecoveryActionReview {...p} />);
  await waitFor(() => expect(p.inspect).toHaveBeenCalledOnce());
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(publishRecovery.mock.calls.every(([value]) => value === undefined)).toBe(true);
});
it('shows only the exact blocking operations and links to the original call', async () => {
  const p = props(); const onViewOperation = vi.fn();
  let finishInspection!: (value: RecoveryActionSnapshot) => void;
  p.inspect.mockImplementation(() => new Promise(resolve => { finishInspection = resolve; }));
  const view = render(<RecoveryActionReview {...p} onViewOperation={onViewOperation} />);
  expect(screen.queryByText(/方案.docx/)).not.toBeInTheDocument();
  expect(publishRecovery).toHaveBeenLastCalledWith(undefined);
  // The decision DOM can commit before its passive summary publication. Settle
  // the read inside act so both parts of this assertion observe that same commit.
  await act(async () => finishInspection({...snapshot, actions:[{...snapshot.actions[1],toolUseIds:['original-call']}, {...snapshot.actions[1],actionHash:'old',presentation:{kind:'write_file',target:'unrelated.txt'}}]}));
  expect(screen.getByText(/方案.docx/)).toBeVisible();
  expect(screen.queryByText(/unrelated.txt/)).not.toBeInTheDocument();
  expect(screen.getByText('recoveryReview.decision.currentTask')).toBeVisible();
  expect(publishRecovery).toHaveBeenLastCalledWith(expect.objectContaining({sessionId:'s',count:1,checking:false,failed:false,inline:true}));
  expect(screen.getByText('recoveryReview.decision.next.write_file')).toBeVisible();
  fireEvent.click(screen.getByText('recoveryReview.decision.viewOperation'));
  expect(onViewOperation).toHaveBeenCalledExactlyOnceWith('original-call');
  expect(p.reconcile).not.toHaveBeenCalled();
  view.unmount();
  expect(publishRecovery).toHaveBeenLastCalledWith(undefined);
});
it('removes a decision when the original task resumes without clearing its unknown history', async () => {
  const p = props(); const view=render(<RecoveryActionReview {...p} />);
  await screen.findByText('recoveryReview.decision.title');
  p.inspect.mockResolvedValue({...snapshot, attention:undefined, actions:snapshot.actions.slice(1)});
  view.rerender(<RecoveryActionReview {...p} inspectRevision="idle:2" />);
  await waitFor(()=>expect(p.inspect).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});


it('keeps the same read-only details and unsent note through a busy transition', async () => {
  const p = props();
  p.inspect.mockResolvedValue({ ...snapshot, actions: snapshot.actions.slice(1) });
  const onPrepareCheck = vi.fn();
  const view = render(<RecoveryActionReview {...p} onPrepareCheck={onPrepareCheck} />);
  fireEvent.click(await screen.findByText('recoveryReview.decision.resolve'));
  fireEvent.click(screen.getByText('recoveryReview.addNote'));
  const dialog = screen.getByRole('dialog');
  const draft = screen.getByRole('textbox');
  fireEvent.change(draft, { target: { value: 'keep original unsent evidence' } });
  view.rerender(<RecoveryActionReview {...p} onPrepareCheck={onPrepareCheck} disabled />);
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(screen.getByRole('textbox')).toBe(draft);
  expect(draft).toHaveValue('keep original unsent evidence');
  expect(draft).toBeDisabled();
  expect(screen.queryByText('recoveryReview.prepareCheck')).not.toBeInTheDocument();
  fireEvent.submit(draft.closest('form')!);
  expect(p.reconcile).not.toHaveBeenCalled();
  expect(onPrepareCheck).not.toHaveBeenCalled();
  expect(p.inspect).toHaveBeenCalledTimes(1);
  view.rerender(<RecoveryActionReview {...p} onPrepareCheck={onPrepareCheck} />);
  await waitFor(() => expect(p.inspect).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(screen.getByRole('textbox')).toBe(draft);
  expect(draft).toHaveValue('keep original unsent evidence');
  expect(draft).not.toBeDisabled();
  view.rerender(<RecoveryActionReview {...p} sessionId="other" disabled />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(p.reconcile).not.toHaveBeenCalled();
});

it('keeps stopped-turn uncertainty outside collapsed process without implying a paused task or continuing it', async () => {
  const p = props();
  p.inspect.mockResolvedValue({ ...snapshot, attention: undefined,
    unresolvedTurn: { turnId: 'stopped-turn', actionHashes: ['mutating'] }, actions: snapshot.actions.slice(1) });
  const onViewOperation = vi.fn();
  const view = render(<><div hidden>collapsed process</div><p>Final result and artifact</p>
    <RecoveryActionReview {...p} onViewOperation={onViewOperation} /></>);
  expect(await screen.findByText('recoveryReview.unresolved.title')).toBeVisible();
  expect(screen.getByText('Final result and artifact')).toBeVisible();
  expect(screen.queryByText('recoveryReview.decision.currentTask')).not.toBeInTheDocument();
  expect(screen.queryByText('recoveryReview.decision.explanation')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('recoveryReview.unresolved.details'));
  expect(await screen.findByRole('dialog')).toBeVisible();
  expect(screen.queryByText('recoveryReview.addNote')).not.toBeInTheDocument();
  expect(p.reconcile).not.toHaveBeenCalled();
  view.unmount();
  render(<RecoveryActionReview {...p} />);
  expect(await screen.findByText('recoveryReview.unresolved.title')).toBeVisible();
  expect(p.reconcile).not.toHaveBeenCalled();
});
