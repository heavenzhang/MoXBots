import { describe, expect, it, vi } from 'vitest';
import { ModelFailoverController } from './model-failover';
import { ContextRecoveryController } from './context-recovery';
import type { AnthropicRequest } from './types/anthropic';
import { modelStreamEventType } from './utils/model-stream-event';

const terminal = 'event: message_stop\ndata: {"type":"message_stop"}\n\n';
const partial = 'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"partial"}}\n\n';
const body: AnthropicRequest = { model: 'fixture', max_tokens: 128, stream: true, messages: [{ role: 'user', content: 'fixture' }] };
const primary = { providerId: 'fixture', baseUrl: 'http://fixture.invalid', model: 'fixture' };
const enc = new TextEncoder();
function harness(mode: 'failover' | 'context' | 'both', signal?: AbortSignal) {
  const failover = new ModelFailoverController({ scope: () => 'root', resolveBackup: () => primary, onSwitch: vi.fn() });
  const context = new ContextRecoveryController({ scope: () => 'root', isActive: () => true, backup: async () => 'fixture-archive' });
  const request = () => new Request('http://fixture.invalid', { method: 'POST', signal, body: '{}' });
  return { run: (source: Response, fingerprint: string) => {
    const execute = vi.fn(async () => source);
    const req = request();
    const run = mode === 'context' ? context.run(req, { ...body, messages: [{ role: 'user', content: fingerprint }] }, execute)
      : mode === 'failover' ? failover.run(req, primary, execute, fingerprint)
      : context.run(req, { ...body, messages: [{ role: 'user', content: fingerprint }] }, () => failover.run(req, primary, execute, fingerprint));
    return { response: run, execute };
  } };
}
function response(chunks: string[], stayOpen = false) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let index = 0;
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({ start(c) { controller = c; }, pull(c) {
    if (index < chunks.length) c.enqueue(enc.encode(chunks[index++]));
    else if (!stayOpen) c.close();
  }, cancel });
  return { source: new Response(stream, { headers: { 'content-type': 'text/event-stream' } }), cancel, controller };
}

describe.each(['failover', 'context', 'both'] as const)('%s terminal delivery', mode => {
  it.each([
    ['same-chunk DONE', [terminal + 'data: [DONE]\n\n']],
    ['later DONE', [terminal, 'data: [DONE]\n\n']],
    ['split terminal delimiter', [terminal.slice(0, -1), terminal.slice(-1), 'data: [DONE]\n\n']],
    ['CRLF split', [terminal.replaceAll('\n', '\r\n').slice(0, -1), '\n', 'data: [DONE]\n\n']],
    ['later malformed frame', [terminal, 'data: not-json\n\n']],
    ['empty heartbeat', ['data:\n\n', terminal, 'data:\n\n']],
    ['coalesced error trailer', [terminal + 'event: error\ndata: {"type":"error"}\n\n']],
  ])('completes at message_stop and ignores %s', async (_label, chunks) => {
    const h = harness(mode); const upstream = response(chunks as string[], true);
    const first = h.run(upstream.source, 'first');
    expect(await (await first.response).text()).toBe(terminal);
    expect(upstream.cancel).toHaveBeenCalledTimes(1);
    const duplicate = h.run(response([terminal]).source, 'first');
    expect((await duplicate.response).status).toBe(409);
    expect(duplicate.execute).not.toHaveBeenCalled();
    // A distinct next inference remains available; a harmless trailer did not seal the root.
    expect(await (await h.run(response([terminal]).source, 'next-distinct').response).text()).toBe(terminal);
  });

  it('finishes without waiting for transport EOF', async () => {
    const upstream = response([terminal], true);
    expect(await (await harness(mode).run(upstream.source, 'first').response).text()).toBe(terminal);
    expect(upstream.cancel).toHaveBeenCalledTimes(1);
  });

  it.each([partial, partial + 'data: [DONE]\n\n', 'event: message_stop\ndata: {}\n\n', 'data: {"type":"error"}\n\n'])('seals incomplete or invalid output (%#) without replay', async input => {
    const h = harness(mode);
    const first = h.run(response([input]).source, 'first');
    const text = await (await first.response).text();
    expect(text).toContain('automatic_replay_blocked');
    expect(text).not.toContain(terminal);
    const changed = h.run(response([terminal]).source, 'next-distinct');
    expect((await changed.response).status).toBe(409);
    expect(changed.execute).not.toHaveBeenCalled();
    expect(first.execute).toHaveBeenCalledTimes(1);
  });

  it('Stop while awaiting a terminal prevents delivery and any next inference', async () => {
    const abort = new AbortController(); const h = harness(mode, abort.signal);
    const upstream = response([], true);
    const first = await h.run(upstream.source, 'first').response;
    const text = first.text();
    const rejected = expect(text).rejects.toThrow();
    abort.abort();
    // Both wrappers now release a pending upstream read on Stop. A late
    // provider terminal cannot enter the closed transport or settle the turn.
    expect(upstream.cancel).toHaveBeenCalledTimes(1);
    expect(() => upstream.controller.enqueue(enc.encode(terminal))).toThrow();
    await rejected;
    const next = h.run(response([terminal]).source, 'next-distinct');
    expect((await next.response).status).toBe(499);
    expect(next.execute).not.toHaveBeenCalled();
  });
});

describe('typed terminal validation', () => {
  it.each(['null', '[]', 'true', '{}', '{"type":123}', '[DONE]'])('rejects %s as completion evidence', data => {
    expect(() => modelStreamEventType({ event: 'message_stop', data })).toThrow('Malformed model stream event');
  });
  it('rejects a mismatched event name', () => {
    expect(() => modelStreamEventType({ event: 'message_stop', data: '{"type":"ping"}' })).toThrow();
  });
});
