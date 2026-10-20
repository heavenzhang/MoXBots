import { describe, expect, it, vi } from 'vitest';
import { handleResponsesStreamResponse, handleStreamResponse } from './handler';

const encoder = new TextEncoder();

describe('bridge model progress cancellation fence', () => {
  it.each(['chat', 'responses'] as const)('does not notify after %s downstream cancellation', async protocol => {
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const input = new ReadableStream<Uint8Array>({ start(controller) { source = controller; } });
    const upstreamController = new AbortController();
    const downstreamController = new AbortController();
    const progress = vi.fn();
    const upstream = new Response(input, { headers: { 'content-type': 'text/event-stream' } });
    const response = protocol === 'chat'
      ? handleStreamResponse(upstream, 'fixture', true, () => {}, undefined, upstreamController,
        downstreamController.signal, () => {}, progress)
      : handleResponsesStreamResponse(upstream, 'fixture', () => {}, upstreamController,
        downstreamController.signal, () => {}, progress);
    const reader = response.body!.getReader();
    const event = (argumentsDelta: string) => protocol === 'chat'
      ? { id: 'fixture', object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0,
          delta: { tool_calls: [{ index: 0, id: 'call', function: { name: 'lookup', arguments: argumentsDelta } }] }, finish_reason: null }] }
      : { type: 'response.function_call_arguments.delta', output_index: 0, delta: argumentsDelta };
    const send = (argumentsDelta: string) => source.enqueue(encoder.encode(`data: ${JSON.stringify(event(argumentsDelta))}\n\n`));

    send('{"path":"');
    await reader.read(); // message_start
    const pending = reader.read();
    await new Promise(resolve => setTimeout(resolve, 5));
    await reader.cancel('Stop');
    downstreamController.abort();
    const before = progress.mock.calls.length;
    try { send('late-fragment'); } catch { /* transport cancellation may retire its source immediately */ }
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(upstreamController.signal.aborted).toBe(true);
    expect(progress).toHaveBeenCalledTimes(before);
    await pending.catch(() => undefined);
  });
});
