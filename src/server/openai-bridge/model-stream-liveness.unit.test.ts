import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelFailoverController } from './model-failover';
import { ModelBodyReader } from './model-body-reader';

const encoder = new TextEncoder();
const frame = (type: string, fields: Record<string, unknown> = {}) => encoder.encode(`event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`);
const textFrame = () => frame('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'actual model text' } });

afterEach(() => vi.useRealTimers());

function fixture(extra: Partial<ConstructorParameters<typeof ModelFailoverController>[0]> = {}) {
  let source!: ReadableStreamDefaultController<Uint8Array>;
  const cancel = vi.fn();
  const native = new ReadableStream<Uint8Array>({ start(c) { source = c; }, cancel });
  const recovery = { wait: vi.fn(async () => undefined), interrupted: vi.fn(async () => true),
    complete: vi.fn(async () => {}), blocked: vi.fn(async () => {}) };
  const execute = vi.fn(async () => new Response(native, { headers: { 'content-type': 'text/event-stream' } }));
  const owner = new ModelFailoverController({ scope: () => 'original-turn', resolveBackup: () => undefined,
    onSwitch: vi.fn(), bodyIdleTimeoutMs: 100, recovery, ...extra });
  const request = new Request('http://fixture.invalid/messages');
  const run = () => owner.run(request, { baseUrl: 'http://provider.invalid', providerId: 'fixture' }, execute, 'original');
  return { source, cancel, recovery, execute, run };
}

describe('owned inference body liveness', () => {
  it('ends a headers-success body with only heartbeats through the original recovery owner, without replay', async () => {
    vi.useFakeTimers();
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    const native = new ReadableStream<Uint8Array>({ start(c) { source = c; }, cancel });
    const interrupted = vi.fn(async () => true);
    const complete = vi.fn(async () => {});
    const blocked = vi.fn(async () => {});
    const execute = vi.fn(async () => new Response(native, { headers: { 'content-type': 'text/event-stream' } }));
    const owner = new ModelFailoverController({ scope: () => 'original-turn', resolveBackup: () => undefined,
      onSwitch: vi.fn(), bodyIdleTimeoutMs: 100,
      recovery: { wait: async () => undefined, interrupted, complete, blocked } });
    const request = new Request('http://fixture.invalid/messages');
    const response = await owner.run(request, { baseUrl: 'http://provider.invalid', providerId: 'fixture' }, execute, 'original');
    const consuming = response.text();
    try {
      for (let i = 0; i < 4; i++) {
        source.enqueue(frame('ping'));
        await vi.advanceTimersByTimeAsync(25);
      }
      await vi.advanceTimersByTimeAsync(30);
      expect(cancel).toHaveBeenCalledOnce();
      expect(interrupted).toHaveBeenCalledOnce();
      expect(await consuming).toContain('automatic_replay_blocked');
      expect(complete).not.toHaveBeenCalled();
      expect(blocked).not.toHaveBeenCalled();
      expect((await owner.run(request, { baseUrl: 'http://provider.invalid', providerId: 'fixture' }, execute, 'duplicate')).status).toBe(409);
      expect(execute).toHaveBeenCalledOnce();
    } finally {
      await native.cancel().catch(() => undefined);
      // Make the baseline failure leave no locked/pending stream behind.
      try { source.close(); } catch { /* already cancelled by the fix */ }
      await consuming.catch(() => undefined);
    }
  });

  it('releases a completely silent body before waiting on durable safety IO', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const blocked = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const f = fixture({ scope: () => 'original-turn', resolveBackup: () => undefined, onSwitch: vi.fn(),
      canRetry: () => false, recovery: { wait: async () => undefined, complete: vi.fn(), blocked } });
    const text = (await f.run()).text();
    await vi.advanceTimersByTimeAsync(130);
    expect(f.cancel).toHaveBeenCalledOnce();
    expect(blocked).toHaveBeenCalledOnce();
    finish();
    expect(await text).toContain('automatic_replay_blocked');
    expect(f.execute).toHaveBeenCalledOnce();
  });

  it('keeps an unknown-action fence after partial tool output and never retries its inference', async () => {
    vi.useFakeTimers();
    const f = fixture({ scope: () => 'original-turn', resolveBackup: () => undefined, onSwitch: vi.fn(), canRetry: () => false });
    const response = await f.run();
    f.source.enqueue(frame('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'tool-fixture', name: 'Write', input: {} } }));
    const text = response.text();
    await vi.advanceTimersByTimeAsync(130);
    expect(await text).toContain('automatic_replay_blocked');
    expect(f.recovery.interrupted).not.toHaveBeenCalled();
    expect(f.recovery.blocked).toHaveBeenCalledOnce();
    expect(f.recovery.complete).not.toHaveBeenCalled();
    expect(f.cancel).toHaveBeenCalledOnce();
    expect((await f.run()).status).toBe(409);
    expect(f.execute).toHaveBeenCalledOnce();
  });

  it('allows a stream longer than the idle limit while model deltas make progress', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const text = (await f.run()).text();
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(80);
      f.source.enqueue(textFrame());
      await vi.advanceTimersByTimeAsync(0);
    }
    f.source.enqueue(frame('message_stop'));
    expect(await text).toContain('message_stop');
    expect(f.recovery.complete).toHaveBeenCalledOnce();
    expect(f.recovery.interrupted).not.toHaveBeenCalled();
    expect(f.recovery.blocked).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not count downstream backpressure as a stalled upstream', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const response = await f.run();
    f.source.enqueue(textFrame());
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(300);
    expect(f.cancel).not.toHaveBeenCalled();
    const text = response.text();
    f.source.enqueue(frame('message_stop'));
    expect(await text).toContain('message_stop');
    expect(f.recovery.complete).toHaveBeenCalledOnce();
  });

  it('credits process suspension while a read is pending', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const text = (await f.run()).text();
    vi.setSystemTime(Date.now() + 10_000);
    await vi.advanceTimersByTimeAsync(25);
    expect(f.cancel).not.toHaveBeenCalled();
    f.source.enqueue(frame('message_stop'));
    expect(await text).toContain('message_stop');
    expect(f.recovery.complete).toHaveBeenCalledOnce();
  });

  it('releases a held read when its exact Query or route is revoked without opening recovery', async () => {
    vi.useFakeTimers();
    let active = true;
    const f = fixture({ scope: () => 'original-turn', resolveBackup: () => undefined, onSwitch: vi.fn(), isActive: () => active });
    const reading = (await f.run()).text();
    const rejected = expect(reading).rejects.toThrow();
    active = false;
    await vi.advanceTimersByTimeAsync(25);
    await rejected;
    expect(f.cancel).toHaveBeenCalledOnce();
    expect(f.recovery.interrupted).not.toHaveBeenCalled();
    expect(f.recovery.blocked).not.toHaveBeenCalled();
    expect(f.recovery.complete).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('credits suspension when a heartbeat read resolves before the first resumed timer', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const text = (await f.run()).text();
    vi.setSystemTime(Date.now() + 10_000);
    f.source.enqueue(frame('ping'));
    await vi.advanceTimersByTimeAsync(50);
    expect(f.cancel).not.toHaveBeenCalled();
    f.source.enqueue(frame('message_stop'));
    expect(await text).toContain('message_stop');
    expect(f.recovery.complete).toHaveBeenCalledOnce();
  });

  it('fails closed if an authority check throws during a pending read', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const native = new ReadableStream<Uint8Array>({ cancel });
    let valid = true;
    const body = new ModelBodyReader(native.getReader(), new AbortController().signal, () => {
      if (!valid) throw new Error('authority unavailable');
      return true;
    }, 100);
    const rejected = expect(body.read()).rejects.toThrow('superseded or cancelled');
    valid = false;
    await vi.advanceTimersByTimeAsync(25);
    await rejected;
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['empty text', 'content_block_delta', { index: 0, delta: { type: 'text_delta', text: '' } }],
    ['empty thinking', 'content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking: '' } }],
    ['empty tool arguments', 'content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: '' } }],
    ['usage metadata', 'message_delta', { delta: { stop_reason: null }, usage: { output_tokens: 0 } }],
    ['empty block boundary', 'content_block_start', { index: 0, content_block: { type: 'text', text: '' } }],
  ] as const)('does not renew the idle deadline for repeated %s', async (_label, type, fields) => {
    vi.useFakeTimers();
    const f = fixture();
    const consuming = (await f.run()).text();
    try {
      for (let i = 0; i < 4; i++) {
        f.source.enqueue(frame(type, fields));
        await vi.advanceTimersByTimeAsync(25);
      }
      await vi.advanceTimersByTimeAsync(30);
      expect(f.cancel).toHaveBeenCalledOnce();
      expect(f.recovery.interrupted).toHaveBeenCalledOnce();
      expect(await consuming).toContain('automatic_replay_blocked');
      expect(f.execute).toHaveBeenCalledOnce();
    } finally {
      try { f.source.close(); } catch { /* timer already cancelled it */ }
      await consuming.catch(() => undefined);
    }
  });

  it.each([
    ['thinking_delta', { thinking: 'meaningful reasoning' }],
    ['input_json_delta', { partial_json: '{"path":' }],
  ] as const)('preserves progress from nonempty %s across the idle limit', async (type, delta) => {
    vi.useFakeTimers();
    const f = fixture();
    const text = (await f.run()).text();
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(80);
      f.source.enqueue(frame('content_block_delta', { index: 0, delta: { type, ...delta } }));
      await vi.advanceTimersByTimeAsync(0);
    }
    f.source.enqueue(frame('message_stop'));
    expect(await text).toContain('message_stop');
    expect(f.recovery.complete).toHaveBeenCalledOnce();
    expect(f.recovery.interrupted).not.toHaveBeenCalled();
  });
});
