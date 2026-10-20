import { describe, expect, it } from 'vitest';
import { StreamTranslator } from './stream';
import { ResponsesStreamTranslator } from './stream-responses';
import type { AnthropicStreamEvent } from '../types/anthropic';
import type { OpenAIStreamChunk } from '../types/openai';
import type { ResponsesOutputItem, ResponsesStreamEvent } from '../types/openai-responses';

const chatChunk = (delta: Record<string, unknown>, finish_reason: string | null = null) => ({
  id: 'fixture', object: 'chat.completion.chunk', created: 0, model: 'fixture',
  choices: [{ index: 0, delta, finish_reason }],
});

const toolBlocks = (events: AnthropicStreamEvent[]) => {
  const blocks = new Map<number, { id: string; name: string; json: string; stops: number }>();
  for (const event of events) {
    if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
      blocks.set(event.index, { id: event.content_block.id, name: event.content_block.name, json: '', stops: 0 });
    }
    if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
      const block = blocks.get(event.index);
      if (block) block.json += event.delta.partial_json;
    }
    if (event.type === 'content_block_stop') {
      const block = blocks.get(event.index);
      if (block) block.stops++;
    }
  }
  return blocks;
};

describe('parallel tool input block ownership', () => {
  it('serializes four interleaved Chat calls with sparse indices and late id into complete blocks', () => {
    const t = new StreamTranslator('fixture');
    const events = [
      ...t.feed(chatChunk({ reasoning_content: 'thinking before' }) as OpenAIStreamChunk),
      ...t.feed(chatChunk({ tool_calls: [
        { index: 2, id: 'call-a', type: 'function', function: { name: 'alpha', arguments: '{"a":' } },
        { index: 7, type: 'function', function: { name: 'beta', arguments: '{"b":' } },
      ] }) as OpenAIStreamChunk),
      ...t.feed(chatChunk({ content: 'text between' }) as OpenAIStreamChunk),
      ...t.feed(chatChunk({ tool_calls: [
        { index: 11, id: 'call-c', type: 'function', function: { name: 'gamma', arguments: '{"c":3}' } },
        { index: 15, id: 'call-d', type: 'function', function: { name: 'empty', arguments: '' } },
      ] }) as OpenAIStreamChunk),
      ...t.feed(chatChunk({ tool_calls: [
        { index: 2, function: { arguments: '1}' } },
        { index: 7, id: 'call-b', function: { arguments: '2}' } },
      ] }) as OpenAIStreamChunk),
      ...t.feed(chatChunk({ reasoning_content: 'thinking after' }) as OpenAIStreamChunk),
      ...t.feed(chatChunk({}, 'tool_calls') as OpenAIStreamChunk),
      ...t.finalize(),
    ];
    const blocks = toolBlocks(events);
    expect([...blocks.values()].map(({ id, name, json, stops }) => ({ id, name, input: JSON.parse(json || '{}'), stops }))).toEqual([
      { id: 'call-a', name: 'alpha', input: { a: 1 }, stops: 1 },
      { id: 'call-b', name: 'beta', input: { b: 2 }, stops: 1 },
      { id: 'call-c', name: 'gamma', input: { c: 3 }, stops: 1 },
      { id: 'call-d', name: 'empty', input: {}, stops: 1 },
    ]);
    expect(events.filter(event => event.type === 'content_block_start' && event.content_block.type === 'thinking')).toHaveLength(2);
    expect(events.filter(event => event.type === 'content_block_start' && event.content_block.type === 'text')).toHaveLength(1);
    expect(events.some(event => event.type === 'message_stop')).toBe(true);
  });

  it.each(['truncated', 'upstream error'])('does not dispatch buffered Chat tools after %s', scenario => {
    const t = new StreamTranslator('fixture');
    t.feed(chatChunk({ tool_calls: [{ index: 0, id: 'call', type: 'function', function: { name: 'danger', arguments: '{"x":' } }] }) as OpenAIStreamChunk);
    const events = scenario === 'truncated'
      ? t.finalize()
      : t.feed({ error: { message: 'redacted' } } as unknown as OpenAIStreamChunk);
    expect(events.some(event => event.type === 'content_block_start' && event.content_block.type === 'tool_use')).toBe(false);
    expect(events.some(event => event.type === 'message_stop')).toBe(false);
    expect(events.some(event => event.type === 'error')).toBe(true);
  });

  it('rejects new Chat deltas after finish_reason instead of dispatching late tools', () => {
    const t = new StreamTranslator('fixture');
    t.feed(chatChunk({ tool_calls: [{ index: 0, id: 'call-a', type: 'function', function: { name: 'first', arguments: '{}' } }] }) as OpenAIStreamChunk);
    t.feed(chatChunk({}, 'tool_calls') as OpenAIStreamChunk);
    const lateEvents = t.feed(chatChunk({ tool_calls: [{ index: 1, id: 'call-b', type: 'function', function: { name: 'late', arguments: '{}' } }] }) as OpenAIStreamChunk);
    const events = [...lateEvents, ...t.finalize()];
    expect(events.some(event => event.type === 'content_block_start' && event.content_block.type === 'tool_use')).toBe(false);
    expect(events.some(event => event.type === 'message_stop')).toBe(false);
    expect(events.some(event => event.type === 'error')).toBe(true);
  });

  it('rejects duplicate Chat tool IDs across provider indices before emitting any tool block', () => {
    const t = new StreamTranslator('fixture');
    t.feed(chatChunk({ tool_calls: [
      { index: 0, id: 'same-call', type: 'function', function: { name: 'first', arguments: '{}' } },
      { index: 1, id: 'same-call', type: 'function', function: { name: 'second', arguments: '{}' } },
    ] }) as OpenAIStreamChunk);
    t.feed(chatChunk({}, 'tool_calls') as OpenAIStreamChunk);
    const events = t.finalize();
    expect(events.some(event => event.type === 'content_block_start' && event.content_block.type === 'tool_use')).toBe(false);
    expect(events.some(event => event.type === 'message_stop')).toBe(false);
    expect(events.some(event => event.type === 'error')).toBe(true);
  });

  it('serializes Responses calls once, using done/item metadata and preserving empty input', () => {
    const t = new ResponsesStreamTranslator('fixture');
    const events: AnthropicStreamEvent[] = [];
    const feed = (event: ResponsesStreamEvent) => events.push(...t.feed(event));
    feed({ type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'before' });
    feed({ type: 'response.output_item.added', output_index: 4, item: { type: 'function_call', id: 'item-a', call_id: 'call-a', name: 'alpha', arguments: '', status: 'in_progress' } });
    feed({ type: 'response.function_call_arguments.delta', output_index: 4, delta: '{"a":' });
    feed({ type: 'response.output_item.added', output_index: 9, item: { type: 'function_call', id: 'item-b', call_id: 'call-b', name: 'beta', arguments: '', status: 'in_progress' } });
    feed({ type: 'response.function_call_arguments.delta', output_index: 9, delta: '{"b":2}' });
    feed({ type: 'response.function_call_arguments.delta', output_index: 4, delta: '1}' });
    feed({ type: 'response.function_call_arguments.done', output_index: 4, arguments: '{"a":1}' });
    feed({ type: 'response.function_call_arguments.done', output_index: 4, arguments: '{"a":1}' });
    feed({ type: 'response.output_item.done', output_index: 9, item: { type: 'function_call', id: 'item-b', call_id: 'call-b', name: 'beta', arguments: '{"b":2}', status: 'completed' } });
    feed({ type: 'response.output_item.added', output_index: 12, item: { type: 'function_call', id: 'item-c', call_id: 'call-c', name: 'empty', arguments: '', status: 'in_progress' } });
    feed({ type: 'response.function_call_arguments.done', output_index: 12, arguments: '' });
    feed({ type: 'response.reasoning_summary_text.delta', output_index: 13, delta: 'reasoning' });
    const terminalOutput: ResponsesOutputItem[] = Array.from({ length: 13 }, (_, index) => ({
      type: 'message' as const, id: `message-${index}`, role: 'assistant' as const, status: 'completed', content: [],
    }));
    terminalOutput[4] = { type: 'function_call', id: 'item-a', call_id: 'call-a', name: 'alpha', arguments: '{"a":1}', status: 'completed' };
    terminalOutput[9] = { type: 'function_call', id: 'item-b', call_id: 'call-b', name: 'beta', arguments: '{"b":2}', status: 'completed' };
    terminalOutput[12] = { type: 'function_call', id: 'item-c', call_id: 'call-c', name: 'empty', arguments: '', status: 'completed' };
    feed({ type: 'response.completed', response: { id: 'r', object: 'response', model: 'fixture', status: 'completed', output: terminalOutput, usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } });
    const blocks = toolBlocks(events);
    expect([...blocks.values()].map(({ id, name, json, stops }) => ({ id, name, input: JSON.parse(json || '{}'), stops }))).toEqual([
      { id: 'call-a', name: 'alpha', input: { a: 1 }, stops: 1 },
      { id: 'call-b', name: 'beta', input: { b: 2 }, stops: 1 },
      { id: 'call-c', name: 'empty', input: {}, stops: 1 },
    ]);
    expect(events.filter(event => event.type === 'content_block_start' && event.content_block.type === 'text')).toHaveLength(1);
    expect(events.filter(event => event.type === 'content_block_start' && event.content_block.type === 'thinking')).toHaveLength(1);
    expect(events.filter(event => event.type === 'message_stop')).toHaveLength(1);
  });

  it('uses completed terminal item metadata to finish a late Responses tool identity and input', () => {
    const t = new ResponsesStreamTranslator('fixture');
    t.feed({ type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', id: '', call_id: '', name: '', arguments: '', status: 'in_progress' } });
    const events = t.feed({ type: 'response.completed', response: {
      id: 'r', object: 'response', model: 'fixture', status: 'completed',
      output: [{ type: 'function_call', id: 'item', call_id: 'call-late', name: 'lookup', arguments: '{"q":"ok"}', status: 'completed' }],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    } });
    const blocks = toolBlocks(events);
    expect([...blocks.values()].map(({ id, name, json, stops }) => ({ id, name, input: JSON.parse(json), stops }))).toEqual([
      { id: 'call-late', name: 'lookup', input: { q: 'ok' }, stops: 1 },
    ]);
    expect(events.some(event => event.type === 'message_stop')).toBe(true);
  });

  it('rejects a terminal output index that duplicates a previously observed Responses call ID', () => {
    const t = new ResponsesStreamTranslator('fixture');
    const addAndComplete = (outputIndex: number, callId: string, name: string) => {
      t.feed({ type: 'response.output_item.added', output_index: outputIndex, item: { type: 'function_call', id: `item-${callId}`, call_id: callId, name, arguments: '', status: 'in_progress' } });
      t.feed({ type: 'response.function_call_arguments.done', output_index: outputIndex, arguments: '{}' });
    };
    addAndComplete(0, 'call-a', 'first');
    addAndComplete(3, 'call-b', 'second');
    const events = t.feed({ type: 'response.completed', response: {
      id: 'r', object: 'response', model: 'fixture', status: 'completed',
      output: [
        { type: 'function_call', id: 'item-call-a', call_id: 'call-a', name: 'first', arguments: '{}', status: 'completed' },
        { type: 'function_call', id: 'item-call-b', call_id: 'call-b', name: 'second', arguments: '{}', status: 'completed' },
      ],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    } });
    expect(events.some(event => event.type === 'content_block_start' && event.content_block.type === 'tool_use')).toBe(false);
    expect(events.some(event => event.type === 'message_stop')).toBe(false);
    expect(events.some(event => event.type === 'error')).toBe(true);
  });

  it.each([
    ['missing', []],
    ['replaced', [{ type: 'message', id: 'replacement', role: 'assistant', status: 'completed', content: [] }]],
    ['identity drift', [{ type: 'function_call', id: 'other-item', call_id: 'other-call', name: 'danger', arguments: '{}', status: 'completed' }]],
    ['argument drift', [{ type: 'function_call', id: 'item', call_id: 'call', name: 'danger', arguments: '{"x":1}', status: 'completed' }]],
    ['incomplete item', [{ type: 'function_call', id: 'item', call_id: 'call', name: 'danger', arguments: '{}', status: 'incomplete' }]],
  ])('rejects a streamed Responses call when completed output has %s', (_caseName, output) => {
    const t = new ResponsesStreamTranslator('fixture');
    t.feed({ type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', id: 'item', call_id: 'call', name: 'danger', arguments: '', status: 'in_progress' } });
    t.feed({ type: 'response.function_call_arguments.done', output_index: 0, arguments: '{}' });
    const events = t.feed({ type: 'response.completed', response: {
      id: 'r', object: 'response', model: 'fixture', status: 'completed', output,
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    } } as unknown as ResponsesStreamEvent);
    expect(events.some(event => event.type === 'content_block_start' && event.content_block.type === 'tool_use')).toBe(false);
    expect(events.some(event => event.type === 'message_stop')).toBe(false);
    expect(events.some(event => event.type === 'error')).toBe(true);
  });

  it('rejects response.failed when its body claims completed with an otherwise valid tool', () => {
    const t = new ResponsesStreamTranslator('fixture');
    const events = t.feed({ type: 'response.failed', response: {
      id: 'r', object: 'response', model: 'fixture', status: 'completed',
      output: [{ type: 'function_call', id: 'item', call_id: 'call', name: 'danger', arguments: '{}', status: 'completed' }],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    } });
    expect(events.some(event => event.type === 'content_block_start' && event.content_block.type === 'tool_use')).toBe(false);
    expect(events.some(event => event.type === 'message_stop')).toBe(false);
    expect(events.some(event => event.type === 'error')).toBe(true);
  });

  it.each(['incomplete', 'failed', 'EOF'])('does not emit buffered Responses tools on %s', mode => {
    const t = new ResponsesStreamTranslator('fixture');
    t.feed({ type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', id: 'item', call_id: 'call', name: 'danger', arguments: '', status: 'in_progress' } });
    t.feed({ type: 'response.function_call_arguments.delta', output_index: 0, delta: '{"x":' });
    const response = { id: 'r', object: 'response' as const, model: 'fixture', status: mode as 'failed' | 'incomplete', output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
    const events = mode === 'EOF' ? t.finalize() : t.feed({ type: mode === 'failed' ? 'response.failed' : 'response.incomplete', response } as ResponsesStreamEvent);
    expect(events.some(event => event.type === 'content_block_start' && event.content_block.type === 'tool_use')).toBe(false);
    expect(events.some(event => event.type === 'message_stop')).toBe(false);
    expect(events.some(event => event.type === 'error')).toBe(true);
  });
});
