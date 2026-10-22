import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ home: '', broadcast: vi.fn(), generate: vi.fn() }));
vi.mock('os', async original => ({ ...await original<typeof import('os')>(), homedir: () => state.home }));
vi.mock('./sse', () => ({ broadcast: state.broadcast }));
vi.mock('./title-generator', () => ({ generateTitle: state.generate, generateTitleExternal: state.generate }));

let store: typeof import('./SessionStore');
let service: typeof import('./session-title-service');
let sessionId: string;
beforeAll(async () => {
  state.home = await mkdtemp(join(tmpdir(), 'moxbots-title-summary-'));
  vi.resetModules();
  store = await import('./SessionStore');
  service = await import('./session-title-service');
});
afterAll(async () => {
  await store.getActiveSessionTranscript(sessionId)?.revoke();
  await rm(state.home, { recursive: true, force: true });
});

it('persists the first-turn task summary in real V2 storage and reloads it', async () => {
  const metadata = await store.createSession('/synthetic-title-workspace', {
    title: '【需求：费用包编辑页】调整保存校验和毛利展示', titleSource: 'default',
    runtime: 'codex', stats: { messageCount: 1, totalInputTokens: 0, totalOutputTokens: 0 },
  });
  sessionId = metadata.id;
  const active = store.getActiveSessionTranscript(sessionId)!;
  const { ProductTranscriptContent } = await import('./session-transcript/content');
  const content = new ProductTranscriptContent(active.writer);
  content.admitUser({ id: 'user-1', role: 'user', content: '【需求：费用包编辑页】调整保存校验和毛利展示', timestamp: 't' });
  content.append(content.block('text', 'text', { text: '' }), 'text', '已整理实施方案');
  content.finishTurn('complete');
  expect(await active.writer.flush()).toBe(true);
  state.generate.mockResolvedValue('费用包校验与毛利展示优化');
  await service.maybeGenerateTitleAfterTurn(sessionId, 'codex', 'model');
  expect(await active.writer.flush()).toBe(true);
  const rows = JSON.parse(await readFile(join(state.home, '.myagents', 'sessions.json'), 'utf8'));
  expect(rows.find((row: { id: string }) => row.id === sessionId)).toMatchObject({
    title: '费用包校验与毛利展示优化', titleSource: 'auto', titleGenAttempts: 1,
  });
  expect(state.broadcast).toHaveBeenCalledWith('chat:session-title-changed', {
    sessionId, title: '费用包校验与毛利展示优化', titleSource: 'auto',
  });
  await active.revoke();
  vi.resetModules();
  const reloaded = await import('./SessionStore');
  expect(reloaded.getSessionMetadata(sessionId)?.title).toBe('费用包校验与毛利展示优化');
  expect((await reloaded.getSessionData(sessionId))?.messages).toHaveLength(2);
});

it('persists and reloads an AI title while the first business turn is still running', async () => {
  store = await import('./SessionStore');
  service = await import('./session-title-service');
  const request = '【发生时间】2026年10月20日第一次出现\n【操作步骤】个人报销-提交审批\n【实际结果】网络错误无法提交';
  const metadata = await store.createSession('/synthetic-title-workspace', {
    title: request.slice(0, 40), runtime: 'codex', runtimeSource: 'managed-provider',
    stats: { messageCount: 0, totalInputTokens: 0, totalOutputTokens: 0 },
  });
  sessionId = metadata.id;
  const active = store.getActiveSessionTranscript(sessionId)!;
  const { ProductTranscriptContent } = await import('./session-transcript/content');
  const content = new ProductTranscriptContent(active.writer);
  content.admitUser({ id: 'pending-user', role: 'user', content: request, timestamp: 't' });
  state.generate.mockResolvedValue('报销审批提交失败排查');
  await service.maybeGenerateTitleAfterTurn(sessionId, 'codex', 'model', undefined, 'accepted-user');
  expect(state.generate).toHaveBeenLastCalledWith([{ user: request, assistant: '' }], 'codex', 'model', '/synthetic-title-workspace', 'managed-provider');
  expect(await active.writer.flush()).toBe(true);
  const data = await store.getSessionData(sessionId);
  expect(data?.title).toBe('报销审批提交失败排查');
  expect(data?.messages).toHaveLength(1);
  expect([...active.writer.projection.turns.values()].at(-1)?.status).toBe('running');
  await active.revoke();
  vi.resetModules();
  const reloaded = await import('./SessionStore');
  expect(reloaded.getSessionMetadata(sessionId)?.title).toBe('报销审批提交失败排查');
  expect((await reloaded.getSessionData(sessionId))?.messages).toHaveLength(1);
});
