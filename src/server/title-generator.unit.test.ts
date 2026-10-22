import { createHash } from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
const utilityMocks = vi.hoisted(() => ({ query: vi.fn(), close: vi.fn(), release: vi.fn(async () => {}), terminal: vi.fn(async () => {}), start: vi.fn(), stop: vi.fn(async () => {}) }));
vi.mock('./runtimes/codex', () => ({ CodexRuntime: class { startSession = utilityMocks.start; stopSession = utilityMocks.stop; } }));
vi.mock('./runtimes/claude-code', () => ({ ClaudeCodeRuntime: class { startSession = utilityMocks.start; stopSession = utilityMocks.stop; } }));
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: utilityMocks.query }));
vi.mock('./agent-session', () => ({ resolveClaudeCodeCli: () => '/fake/cli', buildClaudeSessionEnv: () => ({}), startOneShotBridge: () => null }));
vi.mock('./utils/fs-utils', () => ({ ensureDirSync: () => {} }));
vi.mock('./utils/sdk-child-launch-guard', () => ({ createGuardedSdkQuery: async (_path: string, create: () => unknown) => create() }));
vi.mock('./utils/managed-proxy-binding', () => ({ getPreparedSdkSystemPrompt: (_env: unknown, prompt: string) => prompt, prepareProviderBinding: async ({ providerEnv }: { providerEnv: unknown }) => ({ providerEnv, beforeTurn: async () => {}, release: utilityMocks.release, reportTerminal: utilityMocks.terminal }) }));
import {
  BUILTIN_TITLE_TIMEOUT_MS,
  generateUtilityText,
  generateTitle,
  generateTitleExternal,
  buildExternalTitleSessionOptions,
  extractTitleTextFromSdkMessage,
} from './title-generator';

describe('session title generation evidence', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  function response(messages: unknown[]) {
    return Object.assign((async function* () { for (const message of messages) yield message; })(), { close: utilityMocks.close });
  }
  function evidence(spy: { mock: { calls: unknown[][] } }) {
    return spy.mock.calls.filter(args => args[0] === '[title-generation]')
      .map(args => JSON.parse(args[1] as string));
  }

  it('correlates the actual SDK terminal with the returned title without logging private content or credentials', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    utilityMocks.query.mockImplementation(({ options }) => response([
      { type: 'result', subtype: 'success', result: '"报销审批错误排查。"', session_id: options.sessionId, modelUsage: { 'reported-wire-model': {} } },
    ]));
    const title = await generateTitle([{ user: 'private input requiring a summary', assistant: '' }], 'configured-model', {
      providerId: 'configured-provider', apiProtocol: 'anthropic', apiKey: 'never-log-this-api-key', baseUrl: 'https://private-endpoint.invalid',
    }, 'product-session');
    expect(title).toBe('报销审批错误排查');
    const events = evidence(log);
    expect(events.map(event => event.phase)).toEqual(['request', 'terminal', 'result']);
    expect(new Set(events.map(event => event.generationId)).size).toBe(1);
    expect(events[0]).toMatchObject({ sessionId: 'product-session', runtime: 'builtin', providerId: 'configured-provider', requestedModel: 'configured-model' });
    expect(events[0].utilitySessionId).toBe(utilityMocks.query.mock.calls.at(-1)![0].options.sessionId);
    expect(events[1]).toMatchObject({ success: true, reportedModels: ['reported-wire-model'], responseSessionId: events[0].utilitySessionId });
    expect(events[2]).toMatchObject({ outcome: 'generated', returnedTitle: { present: true, chars: Array.from(title!).length, hash: hash(title!) } });
    const serialized = JSON.stringify(log.mock.calls);
    for (const secret of ['private input requiring a summary', '报销审批错误排查', 'never-log-this-api-key', 'https://private-endpoint.invalid']) expect(serialized).not.toContain(secret);
  });

  it('does not certify partial output from a failed SDK terminal as a generated title', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    utilityMocks.query.mockReturnValue(response([
      { type: 'assistant', message: { content: [{ type: 'text', text: 'private partial response' }] } },
      { type: 'result', subtype: 'error_during_execution' },
    ]));
    expect(await generateTitle([{ user: 'private request', assistant: '' }], 'model', undefined, 'failed-session')).toBeNull();
    const events = evidence(log);
    expect(events.find(event => event.phase === 'terminal')).toMatchObject({ success: false });
    expect(events.at(-1)).toMatchObject({ phase: 'result', outcome: 'not-generated', returnedTitle: { present: false } });
    expect(JSON.stringify(events)).not.toContain('private partial response');
  });

  it('does not label other SDK text utilities as title generation', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    utilityMocks.query.mockReturnValue(response([{ type: 'result', subtype: 'success', result: 'ordinary utility result' }]));
    expect(await generateUtilityText({ prompt: 'generic prompt', systemPrompt: 'generic system', clean: text => text, requireSuccessfulTerminal: true }, 'model')).toBe('ordinary utility result');
    expect(evidence(log)).toEqual([]);
  });

  it('does not invent a Product Session identity for standalone title calls', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    utilityMocks.query.mockReturnValue(response([{ type: 'result', subtype: 'success', result: '独立标题' }]));
    expect(await generateTitle([{ user: '受控文字', assistant: '' }], 'model')).toBe('独立标题');
    const event = evidence(log)[0];
    expect(event.sessionId).toBeNull();
    expect(event.utilitySessionId).toBe(utilityMocks.query.mock.calls.at(-1)![0].options.sessionId);
  });

  it('keeps successful generation and cleanup intact when the diagnostic sink throws', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => { throw new Error('diagnostic sink unavailable'); });
    utilityMocks.query.mockReturnValue(response([{ type: 'result', subtype: 'success', result: '报销网络错误排查' }]));
    expect(await generateTitle([{ user: '报销网络错误', assistant: '' }], 'model', undefined, 'sink-failure')).toBe('报销网络错误排查');
    expect(utilityMocks.close).toHaveBeenCalled();
    expect(utilityMocks.release).toHaveBeenCalled();
  });

  it('does not certify a late SDK response after cancellation', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    let ready!: (value: unknown) => void;
    utilityMocks.query.mockImplementation(() => new Promise(resolve => { ready = resolve; }));
    const controller = new AbortController();
    const result = generateTitle([{ user: 'private cancelled request', assistant: '' }], 'model', undefined, 'cancelled-session', controller.signal);
    await vi.waitFor(() => expect(utilityMocks.query).toHaveBeenCalled());
    controller.abort();
    expect(await result).toBeNull();
    ready(response([{ type: 'result', subtype: 'success', result: 'late private response' }]));
    await vi.waitFor(() => expect(utilityMocks.close).toHaveBeenCalled());
    expect(evidence(log).filter(event => event.phase === 'result')).toEqual([
      expect.objectContaining({ outcome: 'not-generated', returnedTitle: { present: false, chars: 0, hash: null } }),
    ]);
    expect(evidence(log).some(event => event.success === true)).toBe(false);
  });

  it('correlates the external runtime terminal and returned hash to the Product Session', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    utilityMocks.start.mockImplementation(async (_options: unknown, emit: (event: unknown) => void) => {
      emit({ kind: 'text_delta', text: '"报销网络错误排查。"' });
      emit({ kind: 'session_complete', subtype: 'success' });
      return { id: 'external-title-child' };
    });
    // The optional Product Session correlation does not change external auth or runtime ownership.
    expect(await generateTitleExternal([{ user: 'private external prompt', assistant: '' }], 'codex', 'model', '/private/workspace', 'managed-provider', 'external-product-session')).toBe('报销网络错误排查');
    const events = evidence(log);
    expect(events.map(event => event.phase)).toEqual(['request', 'terminal', 'result']);
    expect(events[0]).toMatchObject({ sessionId: 'external-product-session', runtime: 'codex', runtimeSource: 'managed-provider' });
    expect(events[1]).toMatchObject({ success: true });
    expect(events[2]).toMatchObject({ outcome: 'generated', returnedTitle: { hash: hash('报销网络错误排查') } });
    expect(JSON.stringify(log.mock.calls)).not.toContain('报销网络错误排查');
    expect(JSON.stringify(events)).not.toContain('/private/workspace');
  });
});

describe('task summary title context', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('asks for a summary and sends the requirement beyond the former 200-character cut to builtin', async () => {
    utilityMocks.query.mockReturnValue(Object.assign((async function* () {
      yield { type: 'result', subtype: 'success', result: '费用包校验与毛利展示优化' };
    })(), { close: utilityMocks.close }));
    const user = '背景说明'.repeat(70) + '请调整费用包保存校验和毛利展示';
    expect(await generateTitle([{ user, assistant: '准备实施' }], 'model')).toBe('费用包校验与毛利展示优化');
    const call = utilityMocks.query.mock.calls.at(-1)![0];
    const messages = [];
    for await (const message of call.prompt) messages.push(message);
    expect(messages[0].message.content).toContain(user);
    expect(call.options.systemPrompt).toContain('concise task summary');
    expect(call.options.systemPrompt).toContain('NEVER just copy or truncate');
  });

  it('sends the tail request through external generation without cutting it again', async () => {
    utilityMocks.start.mockImplementation(async (_options: unknown, emit: (event: unknown) => void) => {
      emit({ kind: 'text_delta', text: '公司目标承接界面完善' });
      emit({ kind: 'session_complete', subtype: 'success' });
      return { id: 'title-child' };
    });
    const user = '项目背景\n' + '资料'.repeat(2000) + '\n请完善公司目标承接界面';
    expect(await generateTitleExternal([{ user, assistant: '准备实施' }], 'codex', 'model', '/workspace')).toBe('公司目标承接界面完善');
    const options = utilityMocks.start.mock.calls.at(-1)![0];
    expect(options.initialTurn.message).toContain('请完善公司目标承接界面');
    expect(options.initialTurn.message).toContain('项目背景');
    expect(options.systemPromptAppend).toContain('concise task summary');
  });

  it('rejects the observed login error before it can become a truncated title', async () => {
    utilityMocks.query.mockReturnValue(Object.assign((async function* () {
      yield { type: 'result', subtype: 'success', result: 'Not logged in · Please run /login' };
    })(), { close: utilityMocks.close }));
    expect(await generateTitle([{ user: '优化费用包毛利展示', assistant: '方案已整理' }], 'model')).toBeNull();
  });

  it('rejects partial summary text when the builtin terminal fails', async () => {
    utilityMocks.query.mockReturnValue(Object.assign((async function* () {
      yield { type: 'assistant', message: { content: [{ type: 'text', text: '费用包毛利优化' }] } };
      yield { type: 'result', subtype: 'error_during_execution' };
    })(), { close: utilityMocks.close }));
    expect(await generateTitle([{ user: '优化费用包毛利展示', assistant: '方案已整理' }], 'model')).toBeNull();
  });
});

describe('extractTitleTextFromSdkMessage', () => {
  it('reads text even when a thinking block precedes it', () => {
    expect(extractTitleTextFromSdkMessage({
      type: 'assistant',
      message: {
        content: [
          { type: 'thinking', thinking: 'hidden reasoning' },
          { type: 'text', text: '会话标题' },
        ],
      },
    })).toBe('会话标题');
  });

  it('joins multiple assistant text blocks and ignores non-text blocks', () => {
    expect(extractTitleTextFromSdkMessage({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'MyAgents ' },
          { type: 'tool_use', id: 'toolu_1' },
          { type: 'text', text: '标题修复' },
        ],
      },
    })).toBe('MyAgents 标题修复');
  });

  it('falls back to the last assistant message from a success result', () => {
    expect(extractTitleTextFromSdkMessage({
      type: 'result',
      subtype: 'success',
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'prompt' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'first draft' }] },
        { role: 'assistant', content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: '最终标题' }] },
      ],
    })).toBe('最终标题');
  });

  it('reads the SDK 0.3 result.result field when no assistant message is present', () => {
    expect(extractTitleTextFromSdkMessage({
      type: 'result',
      subtype: 'success',
      result: 'Result 字段标题',
    })).toBe('Result 字段标题');
  });

  it('returns null for whitespace-only or failed result messages', () => {
    expect(extractTitleTextFromSdkMessage({
      type: 'assistant',
      message: { content: [{ type: 'text', text: '   ' }] },
    })).toBeNull();
    expect(extractTitleTextFromSdkMessage({
      type: 'result',
      subtype: 'error_during_execution',
      messages: [{ role: 'assistant', content: [{ type: 'text', text: 'ignored' }] }],
    })).toBeNull();
  });
});

describe('BUILTIN_TITLE_TIMEOUT_MS', () => {
  it('keeps builtin title generation within the same 30s budget as external title generation', () => {
    expect(BUILTIN_TITLE_TIMEOUT_MS).toBe(30_000);
  });
});

describe('buildExternalTitleSessionOptions', () => {
  const base = {
    sessionId: 'title-session',
    workspacePath: '/workspace',
    userPrompt: 'Write the title',
    clientUserMessageId: 'title-user-message',
    runtimeType: 'codex' as const,
    model: 'gpt-5.6-sol',
  };

  it('keeps Managed Codex identity while disabling workspace MCP for the utility turn', () => {
    const options = buildExternalTitleSessionOptions({
      ...base,
      runtimeSource: 'managed-provider',
    });

    expect(options).toMatchObject({
      initialTurn: {
        message: 'Write the title',
        clientUserMessageId: 'title-user-message',
      },
      runtimeSource: 'managed-provider',
      mcpServers: [],
      permissionMode: 'suggest',
      reasoningEffort: 'low',
      ephemeral: true,
      maxTurns: 1,
      scenario: { type: 'desktop' },
    });
  });

  it('preserves system-cli ownership without pretending an empty injected set clears user config', () => {
    const options = buildExternalTitleSessionOptions({
      ...base,
      runtimeSource: 'system-cli',
    });

    expect(options).toMatchObject({
      initialTurn: {
        message: 'Write the title',
        clientUserMessageId: 'title-user-message',
      },
      runtimeSource: 'system-cli',
    });
    expect(options).not.toHaveProperty('mcpServers');
    expect(options).not.toHaveProperty('reasoningEffort');
    expect(options).not.toHaveProperty('ephemeral');
  });
});


describe('isolated SDK text utility', () => {
  afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });
  function response(messages: unknown[]) {
    return Object.assign((async function* () { for (const message of messages) yield message; })(), { close: utilityMocks.close });
  }
  const task = { prompt: 'transcript data', systemPrompt: 'utility instructions', clean: (text: string) => text, requireSuccessfulTerminal: true };
  it('uses supplied prompt and active model without tools, settings or persistence, closes child and binding', async () => {
    utilityMocks.query.mockReturnValue(response([{ type: 'assistant', message: { content: [{ type: 'text', text: '请验证刚才方案' }] } }, { type: 'result', subtype: 'success' }]));
    expect(await generateUtilityText(task, 'real-model')).toBe('请验证刚才方案');
    const options = utilityMocks.query.mock.calls.at(-1)![0].options;
    expect(options).toMatchObject({ model: 'real-model', tools: [], mcpServers: {}, strictMcpConfig: true, persistSession: false, maxTurns: 1, settingSources: [], systemPrompt: 'utility instructions' });
    expect(utilityMocks.close).toHaveBeenCalled(); expect(utilityMocks.release).toHaveBeenCalled();
  });
  it('does not publish partial text from an unsuccessful terminal', async () => {
    utilityMocks.query.mockReturnValue(response([{ type: 'assistant', message: { content: [{ type: 'text', text: 'partial' }] } }, { type: 'result', subtype: 'error_during_execution' }]));
    expect(await generateUtilityText(task, 'model')).toBeNull();
    expect(utilityMocks.terminal).toHaveBeenCalledWith(false);
  });
  it('returns null on request cancellation and closes a late-created child', async () => {
    let ready!: (value: unknown) => void;
    utilityMocks.query.mockImplementation(() => new Promise(resolve => { ready = resolve; }));
    const controller = new AbortController();
    const result = generateUtilityText({ ...task, signal: controller.signal }, 'model');
    await vi.waitFor(() => expect(utilityMocks.query).toHaveBeenCalled());
    controller.abort();
    expect(await result).toBeNull();
    ready(response([]));
    await vi.waitFor(() => expect(utilityMocks.close).toHaveBeenCalled());
  });
  it('bounds an unresponsive SDK launch to 30 seconds and clears deadline timers', async () => {
    vi.useFakeTimers();
    utilityMocks.query.mockImplementation(() => new Promise(() => {}));
    const result = generateUtilityText(task, 'model');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(utilityMocks.release).toHaveBeenCalled();
  });

});


describe('external title utility cleanup and permission failure', () => {
  afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });
  it('rejects partial title text on permission request and clears its timeout', async () => {
    vi.useFakeTimers();
    const handle = { id: 'external-child' };
    utilityMocks.start.mockImplementation(async (_options: unknown, emit: (event: unknown) => void) => {
      emit({ kind: 'text_delta', text: 'Partial title' });
      emit({ kind: 'permission_request' });
      return handle;
    });
    expect(await generateTitleExternal([{ user: 'Analyze code', assistant: 'Analyzed' }], 'codex', 'model', '/workspace', 'managed-provider')).toBeNull();
    expect(utilityMocks.stop).toHaveBeenCalledWith(handle);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('preserves successful title cleanup while clearing both startup grace and deadline timers', async () => {
    vi.useFakeTimers();
    const handle = { id: 'external-child' };
    utilityMocks.start.mockImplementation(async (_options: unknown, emit: (event: unknown) => void) => {
      emit({ kind: 'text_delta', text: '"MyAgents title test。"' });
      emit({ kind: 'session_complete', subtype: 'success' });
      return handle;
    });
    expect(await generateTitleExternal([{ user: 'Analyze code', assistant: 'Analyzed' }], 'codex', 'model', '/workspace', 'managed-provider')).toBe('MyAgents title test');
    expect(utilityMocks.stop).toHaveBeenCalledWith(handle);
    expect(vi.getTimerCount()).toBe(0);
  });
});
