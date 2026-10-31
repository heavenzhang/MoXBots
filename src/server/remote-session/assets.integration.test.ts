import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  registry: vi.fn(), metadata: vi.fn(), data: vi.fn(), visible: vi.fn(), context: vi.fn(), overlay: vi.fn(),
  attachmentRoot: vi.fn(), external: vi.fn(),
}));
vi.mock('../utils/agent-workspace-identity', () => ({ resolvePersistedAgentWorkspaceRegistry: f.registry }));
vi.mock('../SessionStore', () => ({ getSessionMetadata: f.metadata, getSessionData: f.data, isHistoryVisibleSession: f.visible }));
vi.mock('../session-engine', () => ({ getSessionEngine: () => ({
  getCurrentSessionContext: f.context, getLiveSessionOverlay: f.overlay,
}) }));
vi.mock('../runtimes/tool-attachments', () => ({ lookupExternalAttachment: f.external }));
vi.mock('../utils/path-safety', () => ({
  getToolAttachmentRoot: f.attachmentRoot,
  validateTrustedAttachmentRoot: (target: string) => {
    const relative = path.relative(path.resolve(f.attachmentRoot()), path.resolve(target));
    return relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
      ? { ok: true, canonical: path.resolve(target) }
      : { ok: false, reason: 'outside test owner root' };
  },
  validateExternalReadPathNode: () => ({ ok: false, reason: 'not registered' }),
}));

import { resolveDesktopRemoteArtifacts } from './assets';

let root: string;
const project = { id: 'project', path: '/workspace' };
const agent = { agentId: 'agent', workspacePath: '/workspace', agent: { id: 'agent', enabled: true }, project };
const sessionId = 'session-1';
function toolMessage(refPath: string, savedPath?: string) {
  const attachment = { kind: 'file', mimeType: 'text/plain', refPath, ...(savedPath ? { savedPath } : {}) };
  return { id: 'message-1', role: 'assistant', content: JSON.stringify([{ type: 'tool_use', tool: { attachments: [attachment] } }]) };
}

beforeEach(async () => {
  vi.resetAllMocks();
  root = await mkdtemp(path.join(os.tmpdir(), 'remote-assets-owner-'));
  const attachRoot = path.join(root, 'attachments');
  await mkdir(attachRoot);
  f.attachmentRoot.mockReturnValue(attachRoot);
  f.registry.mockResolvedValue({ agentProjections: [agent], diagnostics: [] });
  f.metadata.mockReturnValue({ id: sessionId, agentDir: '/workspace' });
  f.visible.mockReturnValue(true);
  f.context.mockReturnValue({ sessionId, workspacePath: '/workspace' });
  f.overlay.mockReturnValue({ isActive: false, inMemoryMessages: [], liveStreamingMessage: undefined });
  f.data.mockResolvedValue({ messages: [], transcriptFormat: 1 });
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

it('resolves only the original session attachment and returns owner-root-relative source metadata', async () => {
  const attachRoot = path.join(root, 'attachments');
  const file = path.join(attachRoot, sessionId, 'turn-1', 'out.txt');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, 'real output');
  f.data.mockResolvedValue({ messages: [toolMessage(`/api/attachment/tool/${sessionId}/turn-1/out.txt`, file)], transcriptFormat: 1 });

  const result = await resolveDesktopRemoteArtifacts({ agentId: 'agent', sessionId, limit: 30 });
  expect(result).toMatchObject({ success: true, data: {
    agentId: 'agent', sessionId, hasMore: false, nextBefore: null,
    items: [{ root: await import('node:fs/promises').then(fs => fs.realpath(attachRoot)), relative: `${sessionId}/turn-1/out.txt`, name: 'out.txt', mimeType: 'text/plain' }],
  } });
});

it('rejects cross-session references, a current ref paired with a foreign savedPath, and encoded turn traversal', async () => {
  f.data.mockResolvedValueOnce({ messages: [toolMessage('/api/attachment/tool/other/turn/out.txt')], transcriptFormat: 1 });
  expect(await resolveDesktopRemoteArtifacts({ agentId: 'agent', sessionId, limit: 30 })).toMatchObject({ success: false });

  const foreignPath = path.join(root, 'attachments', 'foreign-session', 'turn-1', 'out.txt');
  await mkdir(path.dirname(foreignPath), { recursive: true });
  await writeFile(foreignPath, 'foreign session');
  f.data.mockResolvedValueOnce({ messages: [toolMessage(`/api/attachment/tool/${sessionId}/turn-1/out.txt`, foreignPath)], transcriptFormat: 1 });
  expect(await resolveDesktopRemoteArtifacts({ agentId: 'agent', sessionId, limit: 30 })).toMatchObject({ success: false });

  f.data.mockResolvedValueOnce({ messages: [toolMessage(`/api/attachment/tool/${sessionId}/turn%2F..%2Fforeign/out.txt`)], transcriptFormat: 1 });
  expect(await resolveDesktopRemoteArtifacts({ agentId: 'agent', sessionId, limit: 30 })).toMatchObject({ success: false });
  expect(f.external).not.toHaveBeenCalled();
});

it('resolves artifacts while proactive mode is off without changing the switch', async () => {
  const passive = { ...agent, agent: { ...agent.agent, enabled: false } };
  f.registry.mockResolvedValue({ agentProjections: [passive], diagnostics: [], config: {} });
  const file = path.join(root, 'attachments', sessionId, 'turn-1', 'out.txt');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, 'passive workspace output');
  f.data.mockResolvedValue({ messages: [toolMessage(`/api/attachment/tool/${sessionId}/turn-1/out.txt`, file)], transcriptFormat: 1 });
  expect(await resolveDesktopRemoteArtifacts({ agentId: 'agent', sessionId, limit: 30 })).toMatchObject({ success: true, data: {
    items: [{ relative: `${sessionId}/turn-1/out.txt`, name: 'out.txt' }],
  } });
  expect(passive.agent.enabled).toBe(false);
});

it.each([
  { agentProjections: [], diagnostics: [] },
  { agentProjections: [{ ...agent, project: { ...project, hidden: true } }], diagnostics: [] },
  { agentProjections: [{ ...agent, project: { ...project, archivedAt: '2026-10-21T00:00:00Z' } }], diagnostics: [] },
  { agentProjections: [agent], diagnostics: [{ agentIds: ['agent'] }] },
])('preserves artifact workspace availability boundaries (%#)', async registry => {
  f.registry.mockResolvedValue({ ...registry, config: {} });
  expect(await resolveDesktopRemoteArtifacts({ agentId: 'agent', sessionId, limit: 30 })).toMatchObject({ success: false, code: 'REMOTE_AGENT_UNAVAILABLE' });
  expect(f.data).not.toHaveBeenCalled();
});

it('rejects arbitrary external paths and wrong workspace ownership', async () => {
  f.data.mockResolvedValueOnce({ messages: [toolMessage(`/api/attachment/tool/${sessionId}/turn/out.txt`, path.join(root, 'outside.txt'))], transcriptFormat: 1 });
  expect(await resolveDesktopRemoteArtifacts({ agentId: 'agent', sessionId, limit: 30 })).toMatchObject({ success: false });

  f.metadata.mockReturnValueOnce({ id: sessionId, agentDir: '/other-workspace' });
  expect(await resolveDesktopRemoteArtifacts({ agentId: 'agent', sessionId, limit: 30 })).toMatchObject({ success: false, code: 'REMOTE_AGENT_UNAVAILABLE' });
});

it('an authorized deleted source becomes an empty live page so immutable history can still be listed', async () => {
  const file = path.join(root, 'attachments', sessionId, 'turn-1', 'out.txt');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, 'delivered before the source disappeared');
  f.data.mockResolvedValue({ messages: [toolMessage(`/api/attachment/tool/${sessionId}/turn-1/out.txt`, file)], transcriptFormat: 1 });
  expect(await resolveDesktopRemoteArtifacts({ agentId: 'agent', sessionId, limit: 1 })).toMatchObject({ success: true, data: { items: [{ name: 'out.txt' }] } });
  await rm(file);
  expect(await resolveDesktopRemoteArtifacts({ agentId: 'agent', sessionId, limit: 1 })).toMatchObject({ success: true, data: { items: [], hasMore: false, nextBefore: null } });
  f.visible.mockReturnValue(false);
  expect(await resolveDesktopRemoteArtifacts({ agentId: 'agent', sessionId, limit: 1 })).toMatchObject({ success: false, code: 'REMOTE_SESSION_NOT_FOUND' });
});

it('missing attachments advance the genuine transcript cursor without hiding later valid files', async () => {
  const turnRoot = path.join(root, 'attachments', sessionId, 'turn-1');
  await mkdir(turnRoot, { recursive: true });
  await writeFile(path.join(turnRoot, 'second.txt'), 'second');
  await writeFile(path.join(turnRoot, 'third.txt'), 'third');
  f.data.mockResolvedValue({ messages: ['missing.txt', 'second.txt', 'third.txt'].map((name, index) => ({ ...toolMessage(`/api/attachment/tool/${sessionId}/turn-1/${name}`, path.join(turnRoot, name)), id: `message-${index}` })), transcriptFormat: 1 });
  const firstPage = await resolveDesktopRemoteArtifacts({ agentId: 'agent', sessionId, limit: 1 });
  expect(firstPage).toMatchObject({ success: true, data: { items: [{ name: 'second.txt' }], hasMore: true } });
  if (!firstPage.success || !firstPage.data.nextBefore) throw new Error('expected actual owner cursor');
  expect(await resolveDesktopRemoteArtifacts({ agentId: 'agent', sessionId, limit: 1, before: firstPage.data.nextBefore })).toMatchObject({ success: true, data: { items: [{ name: 'third.txt' }], hasMore: false, nextBefore: null } });
});

it('a dangling symlink remains a rejection rather than a missing-source history fallback', async () => {
  const { symlink } = await import('node:fs/promises');
  const file = path.join(root, 'attachments', sessionId, 'turn-1', 'out.txt');
  await mkdir(path.dirname(file), { recursive: true });
  await symlink(path.join(root, 'missing-outside.txt'), file);
  f.data.mockResolvedValue({ messages: [toolMessage(`/api/attachment/tool/${sessionId}/turn-1/out.txt`, file)], transcriptFormat: 1 });
  expect(await resolveDesktopRemoteArtifacts({ agentId: 'agent', sessionId, limit: 30 })).toMatchObject({ success: false, code: 'REMOTE_ARTIFACT_UNAVAILABLE' });
});

it('a dangling parent symlink cannot masquerade as a deleted trusted source', async () => {
  const { symlink } = await import('node:fs/promises');
  const sessionRoot = path.join(root, 'attachments', sessionId);
  await mkdir(sessionRoot, { recursive: true });
  await symlink(path.join(root, 'missing-foreign-turn'), path.join(sessionRoot, 'turn-1'));
  const file = path.join(sessionRoot, 'turn-1', 'out.txt');
  f.data.mockResolvedValue({ messages: [toolMessage(`/api/attachment/tool/${sessionId}/turn-1/out.txt`, file)], transcriptFormat: 1 });
  expect(await resolveDesktopRemoteArtifacts({ agentId: 'agent', sessionId, limit: 30 })).toMatchObject({ success: false, code: 'REMOTE_ARTIFACT_UNAVAILABLE' });
});

it.skipIf(process.getuid?.() === 0 || process.platform === 'win32')('source permission failures cannot become a missing-source history fallback', async () => {
  const { chmod } = await import('node:fs/promises');
  const turnRoot = path.join(root, 'attachments', sessionId, 'turn-1');
  const file = path.join(turnRoot, 'out.txt');
  await mkdir(turnRoot, { recursive: true });
  await writeFile(file, 'access controlled output');
  f.data.mockResolvedValue({ messages: [toolMessage(`/api/attachment/tool/${sessionId}/turn-1/out.txt`, file)], transcriptFormat: 1 });
  await chmod(turnRoot, 0o000);
  try {
    expect(await resolveDesktopRemoteArtifacts({ agentId: 'agent', sessionId, limit: 30 })).toMatchObject({ success: false, code: 'REMOTE_ARTIFACT_UNAVAILABLE' });
  } finally { await chmod(turnRoot, 0o700); }
});
