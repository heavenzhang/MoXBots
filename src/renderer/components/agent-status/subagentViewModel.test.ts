import { describe, expect, it } from 'vitest';
import type { Message, ToolUseSimple } from '@/types/chat';
import { collectSubagentViews } from './subagentViewModel';

const tool = (overrides: Partial<ToolUseSimple> = {}): ToolUseSimple => ({
  id: 'child', name: 'Agent', input: {}, streamIndex: 0, ...overrides,
});
const assistant = (id: string, tools: ToolUseSimple[]): Message => ({
  id, role: 'assistant', timestamp: new Date(0),
  content: tools.map(item => ({ type: 'tool_use', tool: item })),
});
const user = (id: string, content = 'Continue'): Message => ({ id, role: 'user', content, timestamp: new Date(0) });
const notification = (status: string, summary?: string, runId?: string): Message => user(
  `task-notification-${status}-${runId ?? ''}`,
  `<task-notification>${JSON.stringify({ taskId: 'task', toolUseId: 'child', status, summary, runId })}</task-notification>`,
);

describe('collectSubagentViews', () => {
  it('recovers legacy inputJson and distinguishes requested aliases from resolved model', () => {
    const [view] = collectSubagentViews([assistant('a', [tool({
      inputJson: '{"description":"Audit payroll","prompt":"Check isolation","subagent_type":"reviewer","model":"sonnet"}',
      result: JSON.stringify({ status: 'completed', resolvedModel: 'gpt-6.1-sol', content: [{ type: 'text', text: 'Found a defect' }] }),
    })])]);
    expect(view).toMatchObject({ title: 'Audit payroll', prompt: 'Check isolation', agentType: 'reviewer',
      requestedModel: 'sonnet', model: 'gpt-6.1-sol', result: 'Found a defect', status: 'completed' });
  });

  it('uses parsedInput and raw input fallbacks without guessing an actual model', () => {
    const views = collectSubagentViews([assistant('a', [
      tool({ parsedInput: { description: 'Parsed input', prompt: 'Parsed prompt', model: 'haiku' } }),
      tool({ id: 'raw', inputJson: '{', input: { description: 'Raw input' } }),
    ])]);
    expect(views[0]).toMatchObject({ prompt: 'Parsed prompt', requestedModel: 'haiku' });
    expect(views[0].model).toBeUndefined();
    expect(views[1].title).toBe('Raw input');
  });

  it('does not turn an async launch receipt or stale loading flag into a completion or running child', () => {
    const [view] = collectSubagentViews([assistant('a', [tool({ isLoading: true, resultMeta: { status: 'completed' },
      executionTiming: { startedAt: 1, finishedAt: 2, source: 'observed' },
      result: JSON.stringify({ status: 'async_launched', outputFile: '/tmp/result', content: [{ type: 'text', text: 'Launched' }] }),
    })])]);
    expect(view.status).toBe('unknown');
    expect(view.result).toBeUndefined();
    expect(view.finishedAt).toBeUndefined();
    expect(collectSubagentViews([assistant('a', [tool({ isLoading: true })])])[0].status).toBe('unknown');
    expect(collectSubagentViews([assistant('a', [tool({ isLoading: true })])], 'a')[0].status).toBe('running');
  });

  it('restores terminal notification status and report without treating hidden notifications as a new turn', () => {
    const views = collectSubagentViews([user('u'), assistant('a', [tool({ result: '{"status":"async_launched"}' })]), notification('completed', 'Review done')]);
    expect(views[0]).toMatchObject({ currentTurn: true, status: 'completed', result: 'Review done' });
  });

  it('prefers current lifecycle and preserves verified times, parent identity and model', () => {
    const [view] = collectSubagentViews([assistant('a', [tool({ isError: true, result: '{"status":"completed","resolvedModel":"old"}',
      subagentLifecycle: { status: 'running', startedAt: 10, lastActivityAt: 20, agentId: 'agent',
        tree: { rootAgentId: 'root', parentAgentId: 'parent', depth: 1 }, model: 'actual' },
    })]), notification('failed')]);
    expect(view).toMatchObject({ status: 'running', startedAt: 10, lastActivityAt: 20, agentId: 'agent', parentAgentId: 'parent', model: 'actual' });
  });

  it('keeps failed attempts and interrupted states visible, suppressing unverified cold timing', () => {
    const views = collectSubagentViews([assistant('a', [
      tool({ isError: true, result: 'Unknown agent type' }),
      tool({ id: 'stopped', isStopped: true }),
      tool({ id: 'cold', subagentLifecycle: { status: 'completed', startedAt: 99, finishedAt: 100, timingVerified: false } }),
    ])]);
    expect(views.map(view => view.status)).toEqual(['failed', 'interrupted', 'completed']);
    expect(views[2].startedAt).toBeUndefined();
    expect(views[2].finishedAt).toBeUndefined();
  });

  it('includes all assistant messages after the latest visible user in the current turn', () => {
    const views = collectSubagentViews([user('u1'), assistant('old', [tool({ id: 'old' })]), user('u2'),
      assistant('a1', [tool({ id: 'one' })]), assistant('a2', [tool({ id: 'two' })]),
    ], 'a2');
    expect(views.map(view => view.currentTurn)).toEqual([false, true, true]);
  });

  it('counts Codex spawns once and does not count send/wait control operations or spawn receipt as report', () => {
    const views = collectSubagentViews([assistant('a', [
      tool({ name: 'CollabAgent', input: { tool: 'spawnAgent', prompt: 'Audit' }, result: 'Tool: spawnAgent\nStatus: completed', resultMeta: { status: 'completed' } }),
      tool({ id: 'send', name: 'CollabAgent', input: { tool: 'sendInput' } }),
      tool({ id: 'wait', name: 'CollabAgent', input: { tool: 'wait' } }),
    ])]);
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ status: 'unknown', prompt: 'Audit' });
    expect(views[0].result).toBeUndefined();
  });

  it('includes nested Agent attempts and attaches them to their parent', () => {
    const views = collectSubagentViews([assistant('a', [tool({ result: '{"status":"async_launched","agentId":"parent-agent"}',
      subagentCalls: [{ id: 'nested', name: 'Agent', input: { description: 'Nested review' }, result: 'Done' }],
    })])]);
    expect(views).toHaveLength(2);
    expect(views[1]).toMatchObject({ id: 'nested', parentAgentId: 'parent-agent', title: 'Nested review', status: 'completed', result: 'Done' });
  });

  it('ignores older run notifications arriving after newer ones', () => {
    const views = collectSubagentViews([assistant('a', [tool()]), notification('completed', 'New result', '002'), notification('failed', 'Old result', '001')]);
    expect(views[0]).toMatchObject({ status: 'completed', result: 'New result' });
  });

  it('does not attach a previous activation notification report to a running lifecycle', () => {
    const [view] = collectSubagentViews([assistant('a', [tool({ result: '{"status":"async_launched"}',
      subagentLifecycle: { status: 'running', startedAt: 50 },
    })]), notification('completed', 'Previous report')]);
    expect(view.status).toBe('running');
    expect(view.result).toBeUndefined();
  });

  it('does not let an old run notification complete a newer launch receipt', () => {
    const [view] = collectSubagentViews([assistant('a', [tool({
      result: '{"status":"async_launched","runId":"002"}', resultMeta: { status: 'completed' },
    })]), notification('completed', 'Previous report', '001')]);
    expect(view.status).toBe('unknown');
    expect(view.result).toBeUndefined();
  });

  it('recovers rejected historical attempts even if isError was not persisted', () => {
    const views = collectSubagentViews([assistant('a', [
      tool({ result: 'PreToolUse:Agent hook error: blocked in plan mode' }),
      tool({ id: 'missing', result: "Error: Agent type 'reviewer' not found." }),
      tool({ id: 'report', result: 'Checked that Agent type missing errors are handled.' }),
    ])]);
    expect(views.map(view => view.status)).toEqual(['failed', 'failed', 'completed']);
  });

  it('does not present the rejected dispatch duration as child execution time', () => {
    const [view] = collectSubagentViews([assistant('a', [tool({
      result: 'PreToolUse:Agent hook error: blocked in Plan mode', taskStartTime: 1000,
      executionTiming: { source: 'runtime', startedAt: 1000, finishedAt: 1001 },
    })])]);
    expect(view.status).toBe('failed');
    expect(view.startedAt).toBeUndefined();
    expect(view.finishedAt).toBeUndefined();
  });

  it('uses result prompt and description only as fallbacks for incomplete historical input', () => {
    const [view] = collectSubagentViews([assistant('a', [tool({ input: { prompt: '', description: '' },
      result: JSON.stringify({ status: 'completed', prompt: 'Recovered request', description: 'Recovered title' }),
    })])]);
    expect(view).toMatchObject({ prompt: 'Recovered request', title: 'Recovered title' });
  });
});
