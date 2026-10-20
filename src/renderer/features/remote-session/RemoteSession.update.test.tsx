import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RemoteSessionTab } from './tabContract';

const mocks = vi.hoisted(() => ({ request: vi.fn(), snapshot: {
  kind: 'snapshot', agentId: 'a', sessionId: 's', generation: 'generation', turnId: 'turn', revision: '1',
  state: 'running', title: 'Remote task', runtime: 'builtin', model: 'model', terminal: null,
  messages: [], interactions: [] as unknown[], hasMoreBefore: false, nextBefore: null,
} }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/../shared/appProfile', async importOriginal => ({
  ...await importOriginal<typeof import('@/../shared/appProfile')>(), APP_BUILD_PROFILE: 'moxbot',
}));
vi.mock('@/features/agent-network/store', () => ({ useAgentNetworkRegistry: () => ({ connections: [{
  id: 'owned:test', removing: false, snapshot: { state: 'ready', principalId: 'p', networkId: 'n', authGeneration: 4 },
}] }) }));
vi.mock('@/api/remoteSession', async importOriginal => ({
  ...await importOriginal<typeof import('@/api/remoteSession')>(),
  remoteSessionRequest: mocks.request, remoteAccountMatches: () => true,
  remoteErrorCode: (error: { code: string }) => error.code,
}));
vi.mock('react-virtuoso', () => import('../../../test/ConversationVirtuoso'));
vi.mock('@/config/useConfigData', () => ({ useConfigData: () => ({ config: {} }) }));
vi.mock('@/context/ImagePreviewContext', () => ({ useImagePreview: () => ({ openPreview: vi.fn() }) }));
vi.mock('@/components/Markdown', () => ({ default: ({ children }: { children: string }) => <p>{children}</p> }));
vi.mock('@/utils/browserMock', () => ({ isBrowserDevMode: () => false }));
vi.mock('@tauri-apps/api/path', () => ({ join: async (...parts: string[]) => parts.join('/') }));
vi.mock('@tauri-apps/plugin-fs', () => ({ exists: async () => false, remove: vi.fn() }));
vi.mock('@/config/services/configStore', () => ({
  getConfigDir: async () => '/synthetic/qa', safeLoadJson: async () => null, safeWriteJson: vi.fn(),
}));

import RemoteSession from './RemoteSession';
import { clearRemoteDrafts, readRemoteDraft } from './drafts';
import { assertUpdateTabsSafe, beginComposerUpdateCheckpoint, loadComposerUpdateHandoff } from '@/utils/composerUpdateCheckpoint';
import { serializeTabs, deserializeTabs } from '@/utils/tabPersistence';

const scope = { serviceId: 'service', environment: 'test', principalId: 'p', networkId: 'n', deviceId: 'd', keyGeneration: 2 };
const tab: RemoteSessionTab = {
  id: 'tab-remote', view: 'remote-session', title: 'Remote Agent', agentId: 'a', agentName: 'Agent A', deviceName: 'Host D',
  sessionId: 's', targetScope: scope,
  locator: { connectionId: 'owned:test', principalId: 'p', networkId: 'n', deviceId: 'd', authGeneration: 4 },
};
const binding = { onOpen: vi.fn(), onBound: vi.fn() };
beforeEach(async () => {
  clearRemoteDrafts(); localStorage.clear(); vi.clearAllMocks(); mocks.snapshot.interactions = [];
  mocks.request.mockImplementation(async (_locator, _scope, request) => ({ scope,
    data: request.kind === 'capabilities'
      ? { kind: 'capabilities', version: 1, agentId: 'a', runtime: 'builtin', maxActiveSessions: 1, liveUpdates: 'snapshot' }
      : request.kind === 'get' ? mocks.snapshot
        : { kind: 'receipt', agentId: 'a', sessionId: 's', operationId: request.operationId, status: 'accepted', code: null },
  }));
  await loadComposerUpdateHandoff(deserializeTabs);
});
afterEach(cleanup);
const mutations = () => mocks.request.mock.calls.filter(call => ['start', 'send', 'respond', 'stop'].includes(call[2].kind));

it('admits a running remote task, freezes local controls without remote Stop, then releases after failed install', async () => {
  render(<RemoteSession tab={tab} isActive binding={binding} />);
  await screen.findByText('remoteSession.states.running');
  expect(() => assertUpdateTabsSafe([tab])).not.toThrow();
  const lease = beginComposerUpdateCheckpoint(serializeTabs);
  try {
    await lease.persist([tab], tab.id); lease.verify([tab], tab.id);
    const input = screen.getByRole('textbox');
    expect(input).toHaveProperty('readOnly', true);
    fireEvent.change(input, { target: { value: 'must not send during update' } });
    fireEvent.click(screen.getByRole('button', { name: 'remoteSession.send' }));
    fireEvent.click(screen.getByRole('button', { name: 'remoteSession.stop' }));
    fireEvent.click(screen.getByRole('button', { name: 'remoteSession.newSession' }));
    expect(mutations()).toHaveLength(0); expect(binding.onOpen).not.toHaveBeenCalled();
    expect(readRemoteDraft(tab)).toBe('');
  } finally { await lease.abort(); lease.release(); }
  expect(screen.getByRole('textbox')).toHaveProperty('readOnly', false);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'send after release' } });
  fireEvent.click(screen.getByRole('button', { name: 'remoteSession.send' }));
  await waitFor(() => expect(mutations()).toHaveLength(1));
  expect(mutations()[0][2]).toMatchObject({ kind: 'send', text: 'send after release' });
});

it('retains unsent remote text and allows retry after the user handles it', async () => {
  render(<RemoteSession tab={tab} isActive binding={binding} />);
  await screen.findByText('remoteSession.states.running');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'KEEP REMOTE DRAFT' } });
  expect(() => assertUpdateTabsSafe([tab])).toThrow('未发送的草稿');
  expect(() => beginComposerUpdateCheckpoint(serializeTabs)).toThrow('当前内容已保留');
  expect(screen.getByRole('textbox')).toHaveValue('KEEP REMOTE DRAFT');
  expect(screen.getByRole('textbox')).toHaveProperty('readOnly', false);
  expect(mutations()).toHaveLength(0);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
  const lease = beginComposerUpdateCheckpoint(serializeTabs);
  try { await lease.persist([tab], tab.id); lease.verify([tab], tab.id); }
  finally { await lease.abort(); lease.release(); }
});

it('rejects IME before freeze, preserving uncommitted remote input', async () => {
  render(<RemoteSession tab={tab} isActive binding={binding} />);
  await screen.findByText('remoteSession.states.running');
  const input = screen.getByRole('textbox');
  fireEvent.compositionStart(input);
  expect(() => beginComposerUpdateCheckpoint(serializeTabs)).toThrow('未完成的输入');
  expect(input).toHaveProperty('readOnly', false);
  fireEvent.compositionEnd(input);
  const lease = beginComposerUpdateCheckpoint(serializeTabs); lease.release();
});

it('protects unanswered question edits and blocks response handlers during the update handoff', async () => {
  mocks.snapshot.interactions = [{ requestId: 'question-1', generation: 'generation', turnId: 'turn',
    interaction: 'question', title: 'Question', description: 'Input', actionable: true,
    questions: [{ answerKey: 'answer', question: 'Your answer', options: [], multiSelect: false }],
  }];
  render(<RemoteSession tab={tab} isActive binding={binding} />);
  const answer = await screen.findByRole('textbox', { name: 'Your answer' });
  fireEvent.change(answer, { target: { value: 'KEEP ANSWER' } });
  expect(() => beginComposerUpdateCheckpoint(serializeTabs)).toThrow('尚未提交的回答');
  expect(answer).toHaveValue('KEEP ANSWER'); expect(mutations()).toHaveLength(0);
  fireEvent.change(answer, { target: { value: '' } });
  const lease = beginComposerUpdateCheckpoint(serializeTabs);
  try {
    await lease.persist([tab], tab.id);
    fireEvent.change(answer, { target: { value: 'late answer' } });
    fireEvent.click(screen.getByRole('button', { name: 'remoteSession.deny' }));
    lease.verify([tab], tab.id);
    expect(mutations()).toHaveLength(0);
    expect(answer).toHaveValue('');
  } finally { await lease.abort(); lease.release(); }
});
