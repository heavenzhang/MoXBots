import { describe, expect, it } from 'vitest';
import type { ContentBlock, Message, ToolUseSimple } from '@/types/chat';
import { currentActivity } from './currentActivity';

const t = (key: string, options?: Record<string, unknown>) => `${key}:${JSON.stringify(options ?? {})}`;
const tool = (name: string, input: Record<string, unknown> = {}, patch: Partial<ToolUseSimple> = {}): ContentBlock => ({
  type: 'tool_use', tool: { id: name, name, input, streamIndex: 0, isLoading: true, ...patch },
});
const message = (content: ContentBlock[], patch: Partial<Message> = {}): Message => ({
  id: 'live', role: 'assistant', timestamp: new Date(0), content, ...patch,
});

describe('current action from live transcript evidence', () => {
  it('does not claim that absent/finished tool events are current execution', () => {
    expect(currentActivity(null, t)).toContain('waitingModel');
    expect(currentActivity(message([tool('Read', { file_path: 'old.ts' }, { isLoading: false, result: 'ok' })]), t)).toContain('waitingModel');
    expect(currentActivity(message([tool('Read', {}, { isFailed: true })]), t)).toContain('waitingModel');
    expect(currentActivity(message([tool('Read', {}, { isStopped: true })]), t)).toContain('waitingModel');
  });
  it('uses runtime aliases and Windows basenames without exposing an entire path', () => {
    const output = currentActivity(message([tool('read', { file_path: 'C:\\private\\report.md' })]), t);
    expect(output).toContain('reading');
    expect(output).toContain('report.md');
    expect(output).not.toContain('private');
  });
  it('shows a public command description but never raw shell credentials', () => {
    const secret = 'curl -H Authorization:secret-value https://example.test';
    expect(currentActivity(message([tool('Bash', { command: secret })]), t)).toContain('activity.command');
    const output = currentActivity(message([tool('Bash', { command: secret, description: '核对类型与回归' })]), t);
    expect(output).toContain('核对类型与回归');
    expect(output).not.toContain('secret-value');
  });
  it('bounds malformed long public descriptions and never displays private thinking', () => {
    expect(currentActivity(message([{ type: 'thinking', thinking: 'private internal reasoning' }]), t)).not.toContain('private');
    const output = currentActivity(message([tool('CustomTool', { description: 'x'.repeat(9000) })]), t);
    expect(output.length).toBeLessThan(300);
  });
  it('recognizes public text streaming in the legacy string message shape', () => {
    expect(currentActivity({ ...message([]), content: '公开回复', streamingTextActive: true }, t)).toContain('answering');
  });
  it('retains all active calls in the count while preferring the latest executing action', () => {
    const output = currentActivity(message([tool('Read', { file_path: 'a.ts' }), tool('Edit', { file_path: 'b.ts' })]), t);
    expect(output).toContain('parallel');
    expect(output).toContain('b.ts');
    expect(output).toContain('"count":2');
  });
  it.each([tool('TaskOutput'), tool('BashOutput'), tool('CollabAgent', { tool: 'wait' }), tool('mcp__codex_app__wait_threads')])('distinguishes explicit task waiting from model waiting', block => {
    expect(currentActivity(message([block]), t)).toContain('waitingTask');
  });
  it('does not call background child execution a parent wait while public text streams', () => {
    const child = tool('Agent', { description: '独立审阅' }, {
      isLoading: false, result: 'accepted',
      subagentLifecycle: { status: 'running', startedAt: 1 } as ToolUseSimple['subagentLifecycle'],
    });
    expect(currentActivity(message([child], { streamingTextActive: true }), t)).toContain('answering');
    expect(currentActivity(message([child]), t)).toContain('delegating');
  });
});
