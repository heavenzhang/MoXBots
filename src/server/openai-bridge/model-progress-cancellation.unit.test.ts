import { describe, expect, it, vi } from 'vitest';
import { handleResponsesStreamResponse, handleStreamResponse } from './handler';
import { ModelFailoverController } from './model-failover';
import { createBridgeProgressContext } from './bridge-registry';
import { composeAcceptedAttemptModelProgress } from './model-progress';

const encoder = new TextEncoder();

describe('bridge model progress cancellation fence', () => {
  it('does not forward a retired attempt callback to token-owned Query liveness', async () => {
    const context = createBridgeProgressContext();
    let notifications = 0;
    context.subscribe(() => notifications++);
    const request = new Request('http://fixture.invalid/messages');
    const callbacks: Array<() => void> = [];
    let attempts = 0;
    const owner = new ModelFailoverController({ scope: () => 'same-query-turn', resolveBackup: () => undefined,
      onSwitch: () => {}, retryDelaysMs: [0, 0, 0], bodyIdleTimeoutMs: 1000 });
    const response = await owner.run(request, { providerId: 'fixture', baseUrl: 'http://fixture.invalid' }, async (_target, onAttempt) => {
      callbacks.push(composeAcceptedAttemptModelProgress(onAttempt, () => context.notify(request.signal)));
      return ++attempts === 1 ? Response.json({ error: { message: 'overloaded' } }, { status: 503 })
        : new Response(new ReadableStream<Uint8Array>({}), { headers: { 'content-type': 'text/event-stream' } });
    }, 'stale-progress');
    expect(attempts).toBe(2);
    callbacks[0]?.();
    expect(notifications).toBe(0);
    callbacks[1]?.();
    expect(notifications).toBe(1);
    await response.body?.cancel();
    context.retire();
  });

  it.each(['chat', 'responses'] as const)('does not notify after %s downstream cancellation', async protocol => {
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const cancelled = vi.fn();
    const input = new ReadableStream<Uint8Array>({ start(controller) { source = controller; }, cancel: cancelled });
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
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenCalledTimes(before);
    await pending.catch(() => undefined);
  });
});
