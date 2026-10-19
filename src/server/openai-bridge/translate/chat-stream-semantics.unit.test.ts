import { describe, expect, it } from 'vitest';
import { StreamTranslator } from './stream';
import { handleResponsesStreamResponse, handleStreamResponse } from '../handler';
import type { OpenAIStreamChunk } from '../types/openai';

const chunk = (delta: Record<string, unknown>, finish_reason: string | null = null) => ({
  id: 'fixture', object: 'chat.completion.chunk', created: 0, model: 'fixture',
  choices: [{ index: 0, delta, finish_reason }],
});
const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const translated = (body: string | null) => handleStreamResponse(
  new Response(body), 'fixture', true, () => {}, undefined, new AbortController(), undefined, () => {},
);

describe('Chat stream completion authority', () => {
  it.each([
    ['empty', ''],
    ['DONE only', 'data: [DONE]\n\n'],
    ['partial text', frame(chunk({ content: 'partial result' }))],
    ['partial tool arguments', frame(chunk({ tool_calls: [{ index: 0, id: 'call', type: 'function',
      function: { name: 'write_file', arguments: '{"path":' } }] }))],
    ['partial plus DONE', frame(chunk({ content: 'partial result' })) + 'data: [DONE]\n\n'],
  ])('does not turn %s into a successful message', async (_name, body) => {
    const text = await translated(body).text();
    expect(text).toContain('event: error');
    expect(text).not.toContain('event: message_stop');
    expect(text).not.toContain('"stop_reason":"end_turn"');
  });

  it.each(['stop', 'length', 'tool_calls', 'content_filter'])('accepts explicit %s without requiring DONE', async reason => {
    const body = frame(chunk({ content: 'finished' })) + frame(chunk({}, reason));
    const text = await translated(body).text();
    expect(text.match(/event: message_stop/g)).toHaveLength(1);
    expect(text).not.toContain('event: error');
  });

  it('rejects an unknown finish reason instead of converting it to end_turn', async () => {
    const text = await translated(frame(chunk({ content: 'partial' }, 'error')) + 'data: [DONE]\n\n').text();
    expect(text).toContain('event: error');
    expect(text).not.toContain('event: message_stop');
  });

  it.each(['event: error\n', ''])('rejects an explicit upstream error with SSE prefix %j, even after finish_reason', async prefix => {
    const body = frame(chunk({ content: 'partial' }, 'stop'))
      + prefix + frame({ error: { message: 'private upstream diagnostic' } })
      + 'data: [DONE]\n\n';
    const response = translated(body);
    // Either a protocol error or a failed body read is a failure, never success.
    const text = await response.text().catch((error: Error) => error.message);
    expect(text).not.toContain('event: message_stop');
    expect(text).not.toContain('private upstream diagnostic');
    expect(text).toMatch(/error|invalid/i);
  });

  it('does not discard corrupt middle content then accept a later terminal', async () => {
    const body = frame(chunk({ content: 'before corruption' })) + 'data: {broken\n\n'
      + frame(chunk({}, 'stop')) + 'data: [DONE]\n\n';
    await expect(translated(body).text()).rejects.toThrow(/invalid|malformed/i);
  });

  it('also rejects corrupt Responses data before a later completed event', async () => {
    const body = frame({ type: 'response.output_text.delta', delta: 'partial' })
      + 'data: {broken\n\n' + frame({ type: 'response.completed', response: { status: 'completed' } });
    const out = handleResponsesStreamResponse(new Response(body), 'fixture', () => {}, new AbortController(), undefined, () => {});
    await expect(out.text()).rejects.toThrow(/malformed/i);
  });

  it('allows SSE comments and explicit ping keepalives without losing the real terminal', async () => {
    const body = ': keepalive\n\n' + frame(chunk({ content: 'complete' }))
      + 'event: ping\ndata: keepalive\n\n' + frame(chunk({}, 'stop'));
    const text = await translated(body).text();
    expect(text.match(/event: message_stop/g)).toHaveLength(1);
  });

  it('makes missing body an explicit pre-delivery upstream failure', async () => {
    const response = translated(null);
    expect(response.status).toBe(502);
    expect(await response.text()).toMatch(/empty upstream/i);
  });

  it('seals a translator after failure or successful finalization', () => {
    for (const complete of [false, true]) {
      const t = new StreamTranslator('fixture');
      t.feed(chunk({ content: 'first' }, complete ? 'stop' : null) as OpenAIStreamChunk);
      t.finalize();
      expect(t.finalize()).toEqual([]);
      expect(t.feed(chunk({ content: 'late' }, 'stop') as OpenAIStreamChunk)).toEqual([]);
    }
  });
});
