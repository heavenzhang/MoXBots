import { describe, expect, it, vi } from 'vitest';
import { QueryRequestGuard } from './request-lifetime';
import { ContextRecoveryController } from './context-recovery';
import type { AnthropicRequest } from './types/anthropic';

const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const start = { type: 'message_start', message: { id: 'message', role: 'assistant', type: 'message', content: [] } };
const terminal = [{ type: 'message_delta', delta: { stop_reason: 'end_turn' } }, { type: 'message_stop' }];
const response = (events: unknown[]) => new Response(events.map(frame).join(''), { headers: { 'content-type': 'text/event-stream' } });
const body = (text: string): AnthropicRequest => ({ model: 'fixture', max_tokens: 16, stream: true, messages: [{ role: 'user', content: text }] });
const request = () => new Request('http://localhost/messages', { method: 'POST' });
function harness() {
  let recover = true; let scope = 'root'; let active = true; let native = true;
  const archives: unknown[] = [];
  const persist = vi.fn(async () => {});
  const context = new ContextRecoveryController({ scope: () => scope, isActive: () => active, canRecover: () => recover,
    protectStreaming: () => recover, recoveryOwner: { sessionId: 'session', sdkSessionId: 'native' },
    persistLedger: persist, backup: async () => 'history-archive', archiveSettledInterruption: async evidence => { archives.push(evidence); return 'proof-archive'; } });
  context.bindNoDispatchOwner({ sessionId: 'session', sdkSessionId: 'native', queryGeneration: 1, isCurrent: () => active });
  const run = async (text: string, events: unknown[]) => (await context.run(request(), body(text), async () => response(events))).text();
  return { context, run, archives, persist, native: () => native, changeNative: () => { native = false; },
    background: () => { recover = false; }, settle: () => { recover = true; }, advance: () => { scope = 'root:stream:1'; }, stop: () => { active = false; } };
}

describe('settled interruption proof on production context streaming', () => {
  it('retains every old fingerprint, then admits a distinct verified namespace after clean armed history', async () => {
    const h = harness();
    await h.run('foreground', [start, ...terminal]);
    expect(h.persist).toHaveBeenCalled();
    h.background(); expect(await h.run('background', [start])).toContain('automatic_replay_blocked'); h.settle();
    expect((await h.context.run(request(), body('next'), async () => response([start, ...terminal]))).status).toBe(409);
    const receipt = await h.context.prepareSettledInterruption(h.native);
    expect(receipt?.isCurrent()).toBe(true); expect(h.archives).toHaveLength(1);
    expect(h.context.prepareStreamContinuation(body('verified native marker'))).toBe(0); h.advance();
    expect(await h.run('next', [start, ...terminal])).toContain('message_stop');
    expect((await h.context.run(request(), body('background'), async () => response([start, ...terminal]))).status).toBe(409);
  });
  it.each([
    ['prefilled tools', [{ ...start, message: { ...start.message, content: [{ type: 'tool_use', id: 'hidden', name: 'Bash', input: {} }] } }]],
    ['orphan arguments', [start, { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{}' } }]],
    ['unknown index', [start, { type: 'content_block_start', index: 3, content_block: { type: 'text', text: '' } }]],
    ['unknown event', [start, { type: 'provider_unknown' }]],
    ['invalid text payload', [start, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 3 } }]],
    ['unfinished arguments', [start, { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tool', name: 'Read', input: {} } }, { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{' } }]],
    ['spilled tool', [start, { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tool', name: 'Bash', input: {} } }]],
  ])('never mints zero-spill proof after %s', async (_label, events) => {
    const h = harness(); await h.run('foreground', [start, ...terminal]); h.background(); await h.run('background', events); h.settle();
    expect(await h.context.prepareSettledInterruption(h.native)).toBeUndefined(); expect(h.archives).toHaveLength(0);
  });
  it('requires actual paired native tool identity/action hash and terminal before allowing continuation', async () => {
    const h = harness(); const input = { file_path: '/qa/sentinel' };
    await h.run('foreground', [start, { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'read-id', name: 'Read', input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } }, { type: 'content_block_stop', index: 0 }, ...terminal]);
    await h.context.authorizeTool('Read', input, 'read-id');
    h.background(); await h.run('background', [start]); h.settle();
    expect(await h.context.prepareSettledInterruption(h.native)).toBeUndefined();
    await h.context.commitToolResult('Read', input, 'sentinel', false, 'read-id');
    expect(await h.context.prepareSettledInterruption(h.native)).toBeDefined();
  });
  it('rejects stale native revision across archive await', async () => {
    const h = harness(); await h.run('foreground', [start, ...terminal]); h.background(); await h.run('background', [start]); h.settle();
    h.persist.mockImplementationOnce(async () => { h.changeNative(); });
    expect(await h.context.prepareSettledInterruption(h.native)).toBeUndefined();
  });
});


it('caps tool evidence independently of request count without reopening or evicting the old lease', () => {
  const guard = new QueryRequestGuard(); const lease = guard.begin('root', 'first', false)!;
  for (let i = 0; i < 4097; i++) lease.toolMayBeDelivered(`tool-${i}`);
  lease.delivered(); lease.finish();
  const interrupted = guard.begin('root', 'background', true)!;
  interrupted.interrupted(); interrupted.block(); interrupted.finish();
  expect(guard.settledScope('root')).toBeUndefined();
  expect(guard.begin('root', 'first', false)).toBeUndefined();
});


it('cannot use a matching native tool ID with a different action hash as settled evidence', async () => {
  const h = harness();
  await h.run('foreground', [start, { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'read-id', name: 'Read', input: { file_path: '/qa/a' } } },
    { type: 'content_block_stop', index: 0 }, ...terminal]);
  await h.context.authorizeTool('Read', { file_path: '/qa/b' }, 'read-id');
  await h.context.commitToolResult('Read', { file_path: '/qa/b' }, 'result', false, 'read-id');
  h.background(); await h.run('background', [start]); h.settle();
  expect(await h.context.prepareSettledInterruption(h.native)).toBeUndefined();
});


it('does not promote a terminal HTTP/auth rejection into stream continuation because another stream failed', async () => {
  const guard = new QueryRequestGuard();
  const rejected = guard.begin('root', 'rejected', false)!;
  await rejected.reject(Response.json({ error: 'fixture authentication denial' }, { status: 401 })); rejected.finish();
  const partial = guard.begin('root', 'partial', true)!; partial.interrupted(); partial.block(); partial.finish();
  expect(guard.settledScope('root')).toBeUndefined();
});


it('does not turn downstream consumer cancellation into a settled transport receipt while Query stays live', async () => {
  const h = harness(); await h.run('foreground', [start, ...terminal]); h.background();
  let emitted = false;
  const pending = await h.context.run(request(), body('cancelled background'), async () => new Response(new ReadableStream<Uint8Array>({
    pull(output) { if (!emitted) { emitted = true; output.enqueue(new TextEncoder().encode(frame(start))); } },
  }), { headers: { 'content-type': 'text/event-stream' } }));
  const reader = pending.body!.getReader(); await reader.read(); await reader.cancel(); h.settle();
  expect(await h.context.prepareSettledInterruption(h.native)).toBeUndefined();
});


it('uses the first trusted interruption time before durable recovery IO can delay outer delivery', async () => {
  const h = harness(); await h.run('foreground', [start, ...terminal]); h.background();
  let now = 100_000; const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
  try {
    const response = await h.context.run(request(), body('delayed background'), async (_body, observe) => {
      observe?.('transport'); now = 200_000; return responseForPrefix();
    });
    await response.text(); h.settle();
    expect((await h.context.prepareSettledInterruption(h.native))?.interruptedAt).toBe(100_000);
  } finally { clock.mockRestore(); }
  function responseForPrefix() { return new Response(frame(start), { headers: { 'content-type': 'text/event-stream' } }); }
});
