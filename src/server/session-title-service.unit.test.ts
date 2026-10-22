import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionData: vi.fn(),
  getSessionMetadata: vi.fn(),
  updateSessionMetadata: vi.fn(),
  broadcast: vi.fn(),
  setPostTurnTitleHook: vi.fn(),
  generateTitle: vi.fn(),
  generateTitleExternal: vi.fn(),
}));

vi.mock('./SessionStore', () => ({
  getSessionData: mocks.getSessionData,
  getSessionMetadata: mocks.getSessionMetadata,
  updateSessionMetadata: mocks.updateSessionMetadata,
}));

vi.mock('./sse', () => ({
  broadcast: mocks.broadcast,
}));

vi.mock('./turn-hooks', () => ({
  setPostTurnTitleHook: mocks.setPostTurnTitleHook,
}));

vi.mock('./title-generator', () => ({
  generateTitle: mocks.generateTitle,
  generateTitleExternal: mocks.generateTitleExternal,
}));

import { generateAndApplyTitle, maybeGenerateTitleAfterTurn } from './session-title-service';

describe('generateAndApplyTitle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionMetadata.mockReturnValue({
      id: 'session-1',
      runtime: 'codex',
      runtimeSource: 'managed-provider',
      titleSource: 'default',
    });
    mocks.generateTitleExternal.mockResolvedValue(null);
  });

  it('preserves the Session runtime source for external title generation', async () => {
    const rounds = [{ user: '原始问题', assistant: '回答' }];

    await generateAndApplyTitle(
      'session-1',
      rounds,
      'codex',
      'gpt-5.6-sol',
      undefined,
      '/workspace',
    );

    expect(mocks.generateTitleExternal).toHaveBeenCalledWith(
      rounds,
      'codex',
      'gpt-5.6-sol',
      '/workspace',
      'managed-provider',
      'session-1',
    );
  });
});

describe('first-turn task summary lifecycle', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSessionMetadata.mockReturnValue({
      id: 'session-1', agentDir: '/workspace', origin: { type: 'chat' },
      runtime: 'codex', runtimeSource: 'managed-provider', titleSource: 'default',
      stats: { messageCount: 1 },
    });
    mocks.getSessionData.mockResolvedValue({ messages: [
      { role: 'user', content: '【需求：费用包编辑页】调整保存校验和毛利展示' },
      { role: 'assistant', content: '已整理实现方案' },
    ] });
    mocks.updateSessionMetadata.mockResolvedValue(true);
    mocks.generateTitleExternal.mockResolvedValue('费用包校验与毛利展示优化');
  });

  it('generates, persists and broadcasts a summary after one completed turn', async () => {
    await maybeGenerateTitleAfterTurn('session-1', 'codex', 'model');
    expect(mocks.generateTitleExternal).toHaveBeenCalledOnce();
    expect(mocks.updateSessionMetadata).toHaveBeenCalledWith('session-1', { titleGenAttempts: 1 });
    expect(mocks.updateSessionMetadata).toHaveBeenCalledWith('session-1',
      { title: '费用包校验与毛利展示优化', titleSource: 'auto' }, expect.any(Function));
    expect(mocks.broadcast).toHaveBeenCalledWith('chat:session-title-changed', {
      sessionId: 'session-1', title: '费用包校验与毛利展示优化', titleSource: 'auto',
    });
  });

  it('summarizes an admitted unfinished request, including when async stats still say zero', async () => {
    const request = '【发生时间】2026年10月20日第一次出现\n【实际结果】报销审批提交时提示网络错误';
    mocks.getSessionMetadata.mockReturnValue({ agentDir: '/workspace', stats: { messageCount: 0 } });
    mocks.getSessionData.mockResolvedValue({ messages: [{ role: 'user', content: request }] });
    mocks.generateTitleExternal.mockResolvedValue('报销审批提交失败排查');
    await maybeGenerateTitleAfterTurn('session-1', 'codex', 'model', undefined, 'accepted-user');
    expect(mocks.generateTitleExternal).toHaveBeenCalledWith([{ user: request, assistant: '' }], 'codex', 'model', '/workspace', undefined, 'session-1');
    expect(mocks.broadcast).toHaveBeenCalledWith('chat:session-title-changed', {
      sessionId: 'session-1', title: '报销审批提交失败排查', titleSource: 'auto',
    });
  });

  it('does not wait for or summarize a failed business response', async () => {
    mocks.getSessionData.mockResolvedValue({ messages: [
      { role: 'user', content: '报销审批提交时提示网络错误' },
      { role: 'assistant', content: 'Error: 401 Unauthorized' },
    ] });
    await maybeGenerateTitleAfterTurn('session-1', 'codex', 'model', undefined, 'accepted-user');
    expect(mocks.generateTitleExternal.mock.calls[0][0]).toEqual([{ user: '报销审批提交时提示网络错误', assistant: '' }]);
  });

  it('keeps prepared sessions and automatic requests out of admission titling', async () => {
    mocks.getSessionMetadata.mockReturnValue({ materializationState: 'prepared', stats: { messageCount: 1 } });
    await maybeGenerateTitleAfterTurn('session-1', 'codex', 'model', undefined, 'accepted-user');
    expect(mocks.getSessionData).not.toHaveBeenCalled();
    mocks.getSessionMetadata.mockReturnValue({ origin: { kind: 'automation', surface: 'unknown' }, stats: { messageCount: 1 } });
    await maybeGenerateTitleAfterTurn('session-1', 'codex', 'model', undefined, 'accepted-user');
    expect(mocks.generateTitleExternal).not.toHaveBeenCalled();
  });

  it('deduplicates admission and successful-terminal triggers in flight', async () => {
    let finish!: (title: string) => void;
    mocks.generateTitleExternal.mockImplementation(() => new Promise<string>(resolve => { finish = resolve; }));
    const pending = maybeGenerateTitleAfterTurn('session-1', 'codex', 'model', undefined, 'accepted-user');
    await vi.waitFor(() => expect(mocks.generateTitleExternal).toHaveBeenCalledOnce());
    await maybeGenerateTitleAfterTurn('session-1', 'codex', 'model');
    expect(mocks.generateTitleExternal).toHaveBeenCalledOnce();
    finish('报销审批提交失败排查');
    await pending;
  });

  it('preserves manual titles and the attempt budget at admission too', async () => {
    for (const fields of [{ titleSource: 'user' }, { titleSource: 'auto' }, { titleGenAttempts: 10 }]) {
      mocks.getSessionMetadata.mockReturnValue({ ...fields, stats: { messageCount: 1 } });
      await maybeGenerateTitleAfterTurn('session-1', 'codex', 'model', undefined, 'accepted-user');
    }
    expect(mocks.getSessionData).not.toHaveBeenCalled();
    expect(mocks.updateSessionMetadata).not.toHaveBeenCalled();
  });

  it('cannot overwrite a rename inside the metadata lock after admission generation', async () => {
    mocks.updateSessionMetadata.mockImplementation(async (_id, patch, guard) => patch.title ? guard({ titleSource: 'user' }) : true);
    await maybeGenerateTitleAfterTurn('session-1', 'codex', 'model', undefined, 'accepted-user');
    expect(mocks.generateTitleExternal).toHaveBeenCalledOnce();
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });

  it('does not overwrite a manual rename arriving during generation', async () => {
    mocks.generateTitleExternal.mockImplementation(async () => {
      mocks.getSessionMetadata.mockReturnValue({ titleSource: 'user' });
      return '费用包校验与毛利展示优化';
    });
    await maybeGenerateTitleAfterTurn('session-1', 'codex', 'model');
    expect(mocks.updateSessionMetadata).toHaveBeenCalledTimes(1);
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });

  it('enforces the rename guard inside the storage lock', async () => {
    mocks.updateSessionMetadata.mockImplementation(async (_id, patch, guard) => {
      if (patch.title) return guard({ titleSource: 'user' });
      return true;
    });
    await maybeGenerateTitleAfterTurn('session-1', 'codex', 'model');
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });

  it('leaves the task intact when summary generation fails and retries on a later success', async () => {
    mocks.generateTitleExternal.mockRejectedValueOnce(new Error('utility unavailable'));
    await expect(maybeGenerateTitleAfterTurn('session-1', 'codex', 'model')).resolves.toBeUndefined();
    expect(mocks.broadcast).not.toHaveBeenCalled();
    await maybeGenerateTitleAfterTurn('session-1', 'codex', 'model');
    expect(mocks.generateTitleExternal).toHaveBeenCalledTimes(2);
    expect(mocks.broadcast).toHaveBeenCalledOnce();
  });

  it('never generates for a user title or an incomplete first turn', async () => {
    mocks.getSessionMetadata.mockReturnValue({ titleSource: 'user', stats: { messageCount: 1 } });
    await maybeGenerateTitleAfterTurn('session-1', 'codex', 'model');
    expect(mocks.getSessionData).not.toHaveBeenCalled();
    mocks.getSessionMetadata.mockReturnValue({ titleSource: 'default', stats: { messageCount: 1 } });
    mocks.getSessionData.mockResolvedValue({ messages: [{ role: 'user', content: '尚未完成' }] });
    await maybeGenerateTitleAfterTurn('session-1', 'codex', 'model');
    expect(mocks.generateTitleExternal).not.toHaveBeenCalled();
  });
});
