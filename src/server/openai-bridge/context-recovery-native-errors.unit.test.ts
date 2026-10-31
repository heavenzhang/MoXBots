import { describe, expect, it } from 'vitest';
import { ContextRecoveryController } from './context-recovery';
import type { AnthropicRequest } from './types/anthropic';

const failure = "Exit code 1\nFAIL browserType.launch: Executable doesn't exist";
const command = { command: 'node check.js' };
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

function fixture(initialLedger?: unknown) {
  const state = { active: true, current: true, scope: 'turn-1', storageFails: false, canRecover: true };
  let ledger: { uncertain: string[]; nativeErrors: [string, { sdkSessionId: string }][] };
  const options = {
    scope: () => state.scope, isActive: () => state.active, canRecover: () => state.canRecover, protectStreaming: true,
    recoveryOwner: { sessionId: 'product-1', sdkSessionId: 'native-1' }, initialLedger,
    backup: async () => '/archive/request.json',
    persistLedger: async (value: unknown) => {
      if (state.storageFails) throw new Error('storage failed');
      ledger = structuredClone(value) as typeof ledger;
    },
  };
  const controller = new ContextRecoveryController(options);
  controller.bindNoDispatchOwner({ ...options.recoveryOwner, queryGeneration: 1, isCurrent: () => state.current });
  const body: AnthropicRequest = { model: 'fixture', max_tokens: 64, stream: true,
    messages: [{ role: 'user', content: 'Check the local page and fix test failures.' }] };
  async function emit(id: string, name = 'Bash', input: unknown = command, parallelId?: string) {
    const toolFrames = (toolId: string, index: number) => frame('content_block_start', { type: 'content_block_start', index, content_block: { type: 'tool_use', id: toolId, name, input: {} } })
      + frame('content_block_delta', { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } })
      + frame('content_block_stop', { type: 'content_block_stop', index });
    const response = await controller.run(new Request('http://127.0.0.1/fixture'), body, async () =>
      new Response(frame('message_start', { type: 'message_start', message: { id: `msg-${id}`, type: 'message', role: 'assistant', content: [] } })
        + toolFrames(id, 0) + (parallelId ? toolFrames(parallelId, 1) : '')
        + frame('message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' } })
        + frame('message_stop', { type: 'message_stop' }), { headers: { 'content-type': 'text/event-stream' } }));
    expect(response.status).toBe(200);
    await response.text();
    body.messages.push({ role: 'assistant', content: [{ type: 'tool_use', id, name, input: input as Record<string, unknown> }] });
  }
  function result(id: string, content = failure) {
    body.messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content }] });
  }
  return { controller, state, options, body, emit, result, ledger: () => ledger };
}

describe('native tool error settlement', () => {

  it('durably records the intent hook rejection before recovery admission without poisoning subsequent explicit turns', async () => {
    const h = fixture(); await h.emit('intent-denied');
    expect(await h.controller.commitPreToolDenial('Bash', command, 'intent-denied')).toBe(true);
    h.result('intent-denied', 'Synthetic intent hook denial');
    expect(h.ledger().uncertain).toEqual([]);
    expect(h.ledger().nativeErrors).toHaveLength(1);
    await h.controller.protectInference(h.body, true);
    expect(h.controller.beforeTool('Write', {})).toBeUndefined();
    const restored = fixture(h.ledger()); await restored.emit('new-explicit-id');
    expect(await restored.controller.authorizeTool('Bash', command, 'intent-denied')).toContain('cannot be reused');
    expect(await restored.controller.authorizeTool('Bash', command, 'new-explicit-id')).toBeUndefined();
  });

  it.each(['foreign-input', 'missing-emission', 'owner', 'scope', 'stop'])('does not invent native denial evidence with %s', async change => {
    const h = fixture(); if (change !== 'missing-emission') await h.emit('intent-denied');
    if (change === 'owner') h.state.current = false;
    if (change === 'scope') h.state.scope = 'next-turn';
    if (change === 'stop') h.state.active = false;
    expect(await h.controller.commitPreToolDenial('Bash', change === 'foreign-input' ? { command: 'different' } : command, 'intent-denied')).toBe(false);
    expect(h.controller.inspectActionLedger().nativeErrorReceiptCount).toBe(0);
  });

  it('commits an exact native exit while background work prevents inference recovery', async () => {
    const h = fixture();
    await h.emit('foreground-shell');
    await h.controller.authorizeTool('Bash', command, 'foreground-shell');
    h.state.canRecover = false; // a background run starts before the foreground result
    await h.controller.commitToolResult('Bash', command, failure, true, 'foreground-shell', { interrupted: false });
    h.result('foreground-shell');
    expect(h.ledger().uncertain).toEqual([]);
    expect(h.ledger().nativeErrors).toHaveLength(1);
    // Recording an outcome must not grant automatic continuation authority.
    await expect(h.controller.protectInference(h.body)).rejects.toThrow('exclusive recovery authority');
    expect(await h.controller.prepareSettledInterruption(() => true)).toBeUndefined();
    h.state.canRecover = true;
    const restored = fixture(h.ledger());
    await restored.controller.protectInference(h.body);
    expect(restored.controller.beforeTool('Bash', command)).toContain('earlier command exited');
    expect(restored.controller.beforeTool('Bash', { command: 'node corrected.js' })).toBeUndefined();
  });

  it('persists a denial with background work without poisoning the old unknown ledger', async () => {
    const h = fixture();
    await h.controller.protectInference(h.body);
    await h.controller.authorizeTool('Bash', command);
    h.controller.endTurn();
    h.state.scope = 'explicit-followup';
    await h.emit('denied-with-background');
    h.state.canRecover = false;
    const denial = await h.controller.authorizeTool('Bash', command, 'denied-with-background');
    expect(denial).toContain('uncertain outcome');
    await h.controller.commitToolResult('Bash', command, denial, true, 'denied-with-background');
    h.result('denied-with-background', `PreToolUse:Bash hook error: ${denial}`);
    expect(h.ledger().uncertain).toHaveLength(1);
    expect(h.ledger().nativeErrors).toHaveLength(1);
    h.state.canRecover = true;
    const restored = fixture(h.ledger());
    await restored.controller.protectInference(h.body, true);
    expect(restored.ledger().uncertain).toEqual(h.ledger().uncertain);
    expect(restored.controller.beforeTool('Write', {})).toBeUndefined();
    expect(restored.controller.beforeTool('Bash', command)).toContain('uncertain outcome');
  });

  it.each(['owner', 'scope', 'stop', 'missing-id', 'timeout'])('retains uncertain outcomes with background work and %s', async reason => {
    const h = fixture();
    await h.emit('unresolved-shell');
    await h.controller.authorizeTool('Bash', command, 'unresolved-shell');
    h.state.canRecover = false;
    if (reason === 'owner') h.state.current = false;
    if (reason === 'scope') h.state.scope = 'successor';
    if (reason === 'stop') h.state.active = false;
    await h.controller.commitToolResult('Bash', command, reason === 'timeout' ? 'Exit code 124' : failure,
      true, reason === 'missing-id' ? 'foreign-id' : 'unresolved-shell', { interrupted: false });
    expect(h.ledger().uncertain).toHaveLength(1);
    expect(h.ledger().nativeErrors).toEqual([]);
  });

  it.each([failure, 'Exit code 1'])('continues correction after a native Bash exit and fences its recovery replay (%s)', async error => {
    const h = fixture();
    await h.emit('failed-shell');
    expect(await h.controller.authorizeTool('Bash', command, 'failed-shell')).toBeUndefined();
    await h.controller.commitToolResult('Bash', command, error, true, 'failed-shell', { interrupted: false });
    h.result('failed-shell', error);
    expect(h.ledger().uncertain).toEqual([]);
    expect(h.ledger().nativeErrors).toHaveLength(1);
    await h.controller.protectInference(h.body, true);
    expect(h.controller.beforeTool('Bash', { command: 'node check.js --installed-browser' })).toBeUndefined();
    expect(h.controller.beforeTool('Write', { file_path: '/fixture/app.js', content: 'fixed' })).toBeUndefined();
    await h.controller.protectInference(h.body);
    expect(h.controller.beforeTool('Bash', command)).toContain('earlier command exited');
  });

  it.each([true, undefined])('retains uncertainty without an explicit non-interrupt receipt (%s)', async interrupted => {
    const h = fixture();
    await h.emit('interrupted-shell');
    await h.controller.authorizeTool('Bash', command, 'interrupted-shell');
    await h.controller.commitToolResult('Bash', command, failure, true, 'interrupted-shell', { interrupted });
    expect(h.ledger().uncertain).toHaveLength(1);
    expect(h.ledger().nativeErrors ?? []).toHaveLength(0);
  });

  it.each(['Exit code 124\nTimed out', 'Exit code 137\nKilled', 'connection closed after write'])('keeps unknown/timeout failures fenced: %s', async error => {
    const h = fixture();
    await h.emit('unknown-shell');
    await h.controller.authorizeTool('Bash', command, 'unknown-shell');
    await h.controller.commitToolResult('Bash', command, error, true, 'unknown-shell', { interrupted: false });
    expect(h.ledger().uncertain).toHaveLength(1);
  });

  it('does not trust error text without an exact live admission or for an MCP action', async () => {
    const h = fixture();
    await h.controller.protectInference(h.body, true);
    await h.controller.commitToolResult('Bash', command, failure, true, 'invented-id', { interrupted: false });
    expect(h.ledger().uncertain).toHaveLength(1);
    const m = fixture();
    await m.emit('mcp-failure', 'mcp__business__write', {});
    await m.controller.authorizeTool('mcp__business__write', {}, 'mcp-failure');
    await m.controller.commitToolResult('mcp__business__write', {}, failure, true, 'mcp-failure', { interrupted: false });
    expect(m.ledger().uncertain).toHaveLength(1);
  });

  it('does not turn a controller-authored denial into another uncertain action', async () => {
    const h = fixture();
    await h.controller.protectInference(h.body);
    await h.controller.authorizeTool('Bash', command);
    h.controller.endTurn();
    h.state.scope = 'explicit-followup';
    await h.emit('denied-shell');
    const denial = await h.controller.authorizeTool('Bash', command, 'denied-shell');
    expect(denial).toContain('uncertain outcome');
    h.result('denied-shell', `PreToolUse:Bash hook error: ${denial}`);
    const preserved = h.ledger().uncertain;
    await h.controller.protectInference(h.body, true);
    expect(h.ledger().uncertain).toEqual(preserved);
    expect(h.ledger().uncertain).toHaveLength(1);
    expect(h.ledger().nativeErrors).toHaveLength(1);
    expect(h.controller.beforeTool('Write', {})).toBeUndefined();
    expect(h.controller.beforeTool('Bash', command)).toContain('uncertain outcome');
  });

  it('restores settled failure proof for the exact native history and rejects altered or foreign proof', async () => {
    const h = fixture();
    await h.emit('failed-shell');
    await h.controller.authorizeTool('Bash', command, 'failed-shell');
    await h.controller.commitToolResult('Bash', command, failure, true, 'failed-shell', { interrupted: false });
    h.result('failed-shell');
    const restored = fixture(h.ledger());
    await restored.controller.protectInference(h.body, true);
    expect(restored.controller.beforeTool('Write', {})).toBeUndefined();
    const foreign = structuredClone(h.ledger());
    foreign.nativeErrors[0][1].sdkSessionId = 'other-history';
    expect(() => fixture(foreign)).toThrow('Native error evidence');
    const altered = structuredClone(h.body);
    const last = altered.messages.at(-1)!;
    if (Array.isArray(last.content)) last.content[0] = { type: 'tool_result', tool_use_id: 'failed-shell', is_error: true, content: 'different unknown error' };
    const untrusted = fixture(h.ledger());
    await untrusted.controller.protectInference(altered, true);
    expect(untrusted.controller.beforeTool('Write', {})).toBeUndefined();
    expect(untrusted.controller.beforeTool('Bash', command)).toContain('uncertain outcome');
  });

  it.each(['owner', 'storage'])('fails closed when %s changes before failure commit', async change => {
    const h = fixture();
    await h.emit('failed-shell');
    await h.controller.authorizeTool('Bash', command, 'failed-shell');
    if (change === 'owner') h.state.current = false;
    else h.state.storageFails = true;
    const commit = h.controller.commitToolResult('Bash', command, failure, true, 'failed-shell', { interrupted: false });
    if (change === 'storage') await expect(commit).rejects.toThrow('could not be committed');
    else { await commit; expect(h.ledger().uncertain).toHaveLength(1); }
  });

  it('does not let a settled failure clear another pending admission of the same command', async () => {
    const h = fixture();
    await h.emit('shell-a', 'Bash', command, 'shell-b');
    await h.controller.authorizeTool('Bash', command, 'shell-a');
    await h.controller.authorizeTool('Bash', command, 'shell-b');
    await h.controller.commitToolResult('Bash', command, failure, true, 'shell-a', { interrupted: false });
    expect(h.ledger().uncertain).toHaveLength(1);
    expect(h.ledger().nativeErrors).toHaveLength(1); // exact attempt A is known; B remains pending
  });

  it.each(['Stop', 'turn change'])('rejects a late settlement after %s during persistence', async change => {
    const h = fixture();
    await h.emit('late-shell');
    await h.controller.authorizeTool('Bash', command, 'late-shell');
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { entered = resolve; });
    h.options.persistLedger = async () => { entered(); await gate; };
    const commit = h.controller.commitToolResult('Bash', command, failure, true, 'late-shell', { interrupted: false });
    await ready;
    if (change === 'Stop') h.state.active = false;
    else h.state.scope = 'new-turn';
    release();
    await expect(commit).rejects.toThrow('settlement owner changed');
    expect(h.controller.beforeTool('Write', {})).toContain('automatic_replay_blocked');
    expect(h.ledger().uncertain).toHaveLength(1);
  });
});
