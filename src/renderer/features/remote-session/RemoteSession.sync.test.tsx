import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RemoteSnapshot } from '../../../shared/remoteSession';
import type { RemoteSessionTab } from './tabContract';
const mocks = vi.hoisted(() => ({ request: vi.fn(), current: { state: 'ready', principalId: 'p', networkId: 'n', authGeneration: 4 } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/features/agent-network/store', () => ({ useAgentNetworkRegistry: () => ({ connections: [{ id: 'owned:test', snapshot: mocks.current }] }) }));
vi.mock('@/api/remoteSession', () => ({ remoteSessionRequest: mocks.request, remoteErrorCode: (e: {code: string}) => e.code,
  remoteAccountMatches: (l: {authGeneration: number}) => mocks.current.principalId === 'p' && mocks.current.authGeneration === l.authGeneration }));
vi.mock('./RemoteConversation', () => ({ RemoteConversation: ({source}: {source: {id: string; content: string}[]}) => <div>{source.map(m => <p key={m.id}>{m.content}</p>)}</div> }));
vi.mock('@/config/useConfigData', () => ({ useConfigData: () => ({config:{}}) }));
vi.mock('@/hooks/useUpdateEditorAdmission', () => ({ useUpdateEditorAdmission: () => {} }));
import RemoteSession from './RemoteSession';
import { clearRemoteDrafts } from './drafts';
const scope = { serviceId: 'service', environment: 'test', principalId: 'p', networkId: 'n', deviceId: 'd', keyGeneration: 2 };
const tab: RemoteSessionTab = { id: 'remote', view: 'remote-session', title: 'Title', agentName: 'Agent', agentId: 'a', deviceName: 'Device', sessionId: 's', targetScope: scope,
  locator: { connectionId: 'owned:test', principalId: 'p', networkId: 'n', deviceId: 'd', authGeneration: 4 } };
let snapshot: RemoteSnapshot;
let binding: {onOpen: ReturnType<typeof vi.fn>; onBound: ReturnType<typeof vi.fn>; onObservation: ReturnType<typeof vi.fn>};
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear(); clearRemoteDrafts();
  Object.assign(mocks.current, { state: 'ready', principalId: 'p', authGeneration: 4 });
  snapshot = { kind: 'snapshot', agentId: 'a', sessionId: 's', generation: 'g', turnId: 'turn', revision: '1', title: 'Remote title', state: 'running', runtime: 'builtin', model: null, terminal: null,
    messages: [{ id: 'm', role: 'assistant', content: 'Initial text', timestamp: '', truncated: false, tools: [] }], interactions: [], hasMoreBefore: false, nextBefore: null };
  binding = {onOpen: vi.fn(), onBound: vi.fn(), onObservation: vi.fn()};
  mocks.request.mockReset().mockImplementation(async (_l, _s, req) => ({scope, data: req.kind === 'capabilities' ? {kind: 'capabilities'} : structuredClone(snapshot)}));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('updates an existing message in the background, marks unread, and clears it on return', async () => {
  const view = render(<RemoteSession tab={tab} isActive binding={binding} />); await act(async () => {});
  expect(screen.getByText('Initial text')).toBeInTheDocument();
  view.rerender(<RemoteSession tab={tab} isActive={false} binding={binding} />);
  snapshot.messages[0].content = 'Initial text plus remote output'; snapshot.revision = '2';
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.getByText('Initial text plus remote output')).toBeInTheDocument();
  expect(binding.onObservation).toHaveBeenLastCalledWith('remote', 4, expect.objectContaining({ hasUnread: true, title: 'Remote title', sync: 'current' }));
  view.rerender(<RemoteSession tab={tab} isActive binding={binding} />); await act(async () => {});
  expect(binding.onObservation).toHaveBeenLastCalledWith('remote', 4, expect.objectContaining({ hasUnread: false }));
  expect(screen.getAllByText('Initial text plus remote output')).toHaveLength(1);
  expect(mocks.request.mock.calls.some(call => ['send','start','stop','respond'].includes(call[2].kind))).toBe(false);
});
it('retains content and draft while disconnected, resumes reads, and aborts observation without remote Stop', async () => {
  const view = render(<RemoteSession tab={tab} isActive binding={binding} />); await act(async () => {});
  fireEvent.change(screen.getByRole('textbox'), {target:{value:'KEEP DRAFT'}});
  mocks.current.state='disconnected'; view.rerender(<RemoteSession tab={tab} isActive binding={binding} />);
  expect(screen.getByRole('textbox')).toHaveValue('KEEP DRAFT');
  expect(screen.getByRole('button',{name:'remoteSession.send'})).toBeDisabled();
  expect(screen.getByText('Initial text')).toBeInTheDocument();
  const before=mocks.request.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(mocks.request).toHaveBeenCalledTimes(before);
  mocks.current.state='ready'; snapshot.messages[0].content='New after reconnect';
  view.rerender(<RemoteSession tab={tab} isActive binding={binding} />); await act(async () => {});
  expect(screen.getByText('New after reconnect')).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveValue('KEEP DRAFT');
  view.unmount(); await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(mocks.request.mock.calls.some(call => ['send','start','stop','respond'].includes(call[2].kind))).toBe(false);
});
it('rejects a late response from the old auth generation after a same-account refresh', async () => {
  let complete!: (v: unknown) => void;
  let delayed=true;
  mocks.request.mockImplementation(async (_l,_s,req) => {
    if(req.kind==='capabilities')return {scope,data:{kind:'capabilities'}};
    if(delayed){ delayed=false; return new Promise(resolve=>{complete=resolve}); }
    return {scope,data:{...snapshot,messages:[{...snapshot.messages[0],content:'New generation'}]}};
  });
  const view=render(<RemoteSession tab={tab} isActive binding={binding} />); await act(async()=>{});
  mocks.current.authGeneration=5;
  view.rerender(<RemoteSession tab={tab} isActive binding={binding} />); await act(async()=>{});
  await act(async()=>{complete({scope,data:{...snapshot,messages:[{...snapshot.messages[0],content:'STALE PRIVATE CONTENT'}]}})});
  expect(screen.getByText('New generation')).toBeInTheDocument();
  expect(screen.queryByText('STALE PRIVATE CONTENT')).not.toBeInTheDocument();
  expect(binding.onObservation.mock.calls.filter(call=>call[1]===4).every(call=>call[2].sync==='loading')).toBe(true);
});
