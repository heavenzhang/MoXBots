import { describe, expect, it, vi } from 'vitest';
import { ContextRecoveryController, recoveryActionHash } from './context-recovery';
import type { AnthropicRequest } from './types/anthropic';

const owner = { sessionId: 'product', sdkSessionId: 'native' };
const launch = { command: "ssh fixture-host 'start-build'", run_in_background: true };
const inspect = { command: "ssh fixture-host 'tail -n 80 /var/log/build.log'" };
const next = { command: "ssh fixture-host 'package-verified-build'" };
const hash = recoveryActionHash('Bash', launch);
const frame = (type: string, extra: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...extra })}\n\n`;
const request = () => new Request('http://localhost/fixture');
function result(id: string, input: object) {
  return new Response(frame('message_start', { message: { id: `msg-${id}`, content: [] } })
    + frame('content_block_start', { index: 0, content_block: { type: 'tool_use', id, name: 'Bash', input: {} } })
    + frame('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } })
    + frame('content_block_stop', { index: 0 })
    + frame('message_delta', { delta: { stop_reason: 'tool_use' } }) + frame('message_stop', {}),
  { headers: { 'content-type': 'text/event-stream' } });
}
function fixture(projectionActive = false, includeOldResult = true) {
  let ledger: unknown;
  const state = { active: true, current: true, scope: 'verify-turn', failStorage: false };
  const initialLedger = { version: 1, completed: [], uncertain: [hash], denied: [], blocked: false,
    projectionActive, streamArmedOnly: true };
  const options = { recoveryOwner: owner, initialLedger, scope: () => state.scope, isActive: () => state.active,
    protectStreaming: true, backup: vi.fn(async () => '/archive/fixture'),
    persistLedger: async (value: unknown) => { if (state.failStorage) throw new Error('disk unavailable'); ledger = structuredClone(value); } };
  const controller = new ContextRecoveryController(options);
  controller.bindNoDispatchOwner({ ...owner, queryGeneration: 1, isCurrent: () => state.current });
  const body: AnthropicRequest = { model: 'fixture', stream: true, max_tokens: 64, messages: [
    { role: 'user', content: 'Build once, verify its outcome, then package it.' },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'old-launch', name: 'Bash', input: launch }] },
    ...(includeOldResult ? [{ role: 'user' as const, content: [{ type: 'tool_result' as const, tool_use_id: 'old-launch', is_error: true, content: 'connection lost' }] }] : []),
    { role: 'user', content: 'Verify the existing build without launching it again.' },
  ] };
  async function emit(id: string, input: object) {
    const execute = vi.fn(async (actual: AnthropicRequest) => { expect(actual).toEqual(body); return result(id, input); });
    const response = await controller.run(request(), body, execute);
    expect(response.status).toBe(200); await response.text();
    expect(execute).toHaveBeenCalledOnce();
  }
  function append(id: string, input: Record<string, unknown>, content: string) {
    body.messages.push({ role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content }] });
  }
  return { controller, state, body, options, emit, append, ledger: () => ledger };
}

describe('operation-scoped recovery admission', () => {
  it.each([false, true])('allows SSH log verification and a verified next action with projection=%s; never settles or repeats the unknown launch', async projection => {
    const h = fixture(projection);
    await h.emit('inspect-log', inspect);
    expect(await h.controller.authorizeTool('Bash', launch, 'new-id-old-launch')).toContain('uncertain outcome');
    expect(await h.controller.authorizeTool('Bash', inspect, 'inspect-log')).toBeUndefined();
    await h.controller.commitToolResult('Bash', inspect, 'BUILD SUCCESS', false, 'inspect-log');
    h.append('inspect-log', inspect, 'BUILD SUCCESS');
    expect(h.controller.inspectActionLedger().uncertainActions.map(a => a.actionId)).toEqual([hash]);
    await h.emit('package', next);
    expect(await h.controller.authorizeTool('Bash', next, 'package')).toBeUndefined();
    await h.controller.commitToolResult('Bash', next, 'package artifact verified', false, 'package');
    h.append('package', next, 'package artifact verified');
    expect(h.controller.beforeTool('Bash', next)).toContain('already completed');
    expect(h.controller.beforeTool('Bash', launch)).toContain('uncertain outcome');
    expect(h.controller.canRetryInference()).toBe(false);
    expect(() => h.controller.prepareStreamContinuation(h.body)).toThrow('automatic_replay_blocked');
    const cold = new ContextRecoveryController({ ...h.options, initialLedger: h.ledger() });
    expect(cold.beforeTool('Bash', launch)).toContain('uncertain outcome');
    expect(cold.beforeTool('Bash', next)).toContain('already completed');
    expect(cold.beforeTool('Bash', { command: 'unrelated authorized work' })).toBeUndefined();
  });

  it.each([true, false])('permits existing-operation verification with model recovery disabled and stream=%s', async stream => {
    const h = fixture(true);
    const controller = new ContextRecoveryController({ ...h.options, protectStreaming: false });
    const body = { ...h.body, stream };
    const execute = vi.fn(async (actual: AnthropicRequest) => { expect(actual).toEqual(body); return Response.json({ content: 'inspect' }); });
    const response = await controller.run(request(), body, execute);
    expect(response.status).toBe(200); await response.text();
    expect(execute).toHaveBeenCalledOnce();
    expect(controller.beforeTool('Bash', launch)).toContain('uncertain outcome');
    expect(controller.beforeTool('Bash', inspect)).toBeUndefined();
    expect(controller.canRetryInference()).toBe(false);
  });

  it('scopes a missing historical result to its original action without rewriting or reducing history', async () => {
    const h = fixture(false, false);
    const original = structuredClone(h.body);
    await h.emit('inspect-log', inspect);
    expect(h.body).toEqual(original);
    expect(h.options.backup).not.toHaveBeenCalled();
    expect(h.controller.beforeTool('Bash', launch)).toContain('uncertain outcome');
    expect(h.controller.beforeTool('Bash', inspect)).toBeUndefined();
    await expect(h.controller.protectInference(h.body)).rejects.toThrow('read-only reconciliation');
  });

  it('retains both unknown operations after a failed SSH check while allowing a distinct verification', async () => {
    const h = fixture(); await h.emit('inspect-log', inspect);
    await h.controller.authorizeTool('Bash', inspect, 'inspect-log');
    await h.controller.commitToolResult('Bash', inspect, 'connection interrupted', true, 'inspect-log', { interrupted: true });
    expect(h.controller.beforeTool('Bash', inspect)).toContain('uncertain outcome');
    expect(h.controller.beforeTool('Bash', launch)).toContain('uncertain outcome');
    expect(h.controller.beforeTool('Bash', { command: "ssh fixture-host 'stat /var/log/build.log'" })).toBeUndefined();
    expect(h.controller.inspectActionLedger().uncertainCount).toBe(2);
  });

  it('allows the exact live result to settle a pending check after another inference observes it unpaired', async () => {
    const h = fixture(); await h.emit('inspect-log', inspect);
    await h.controller.authorizeTool('Bash', inspect, 'inspect-log');
    h.body.messages.push({ role: 'assistant', content: [{ type: 'tool_use', id: 'inspect-log', name: 'Bash', input: inspect }] });
    await h.emit('independent', next);
    await h.controller.commitToolResult('Bash', inspect, 'BUILD SUCCESS', false, 'inspect-log');
    expect(h.controller.inspectActionLedger().uncertainActions.map(a => a.actionId)).toEqual([hash]);
    expect(h.controller.beforeTool('Bash', inspect)).toContain('already completed');
  });

  it('never lets a pending new check settle an older unknown with the same input', async () => {
    const h = fixture(); await h.emit('inspect-log', inspect);
    await h.controller.authorizeTool('Bash', inspect, 'inspect-log');
    h.body.messages.push(
      { role: 'assistant', content: [{ type: 'tool_use', id: 'older-check', name: 'Bash', input: inspect }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'older-check', is_error: true, content: 'unknown older failure' }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'inspect-log', name: 'Bash', input: inspect }] });
    await h.emit('independent', next);
    await h.controller.commitToolResult('Bash', inspect, 'BUILD SUCCESS', false, 'inspect-log');
    expect(h.controller.beforeTool('Bash', inspect)).toContain('uncertain outcome');
    expect(h.controller.inspectActionLedger().uncertainCount).toBe(2);
  });

  it('does not reinterpret launcher success as downstream completion or allow a second launch', async () => {
    const h = fixture(); await h.emit('second-build', next);
    await h.controller.authorizeTool('Bash', next, 'second-build');
    await h.controller.commitToolResult('Bash', next, { exitCode: 0, task_id: 'background-1', status: 'running' }, false, 'second-build');
    const attempts = h.controller.inspectActionLedger().operationAttempts;
    expect(attempts.at(-1)?.status).toBe('returned'); // Native tool return only.
    expect(h.controller.inspectActionLedger().uncertainActions.map(a => a.actionId)).toEqual([hash]);
    expect(h.controller.beforeTool('Bash', next)).toContain('already completed');
    expect(h.controller.beforeTool('Read', { file_path: '/fixture/background-1.output' })).toBeUndefined();
    expect(h.controller.beforeTool('Bash', inspect)).toBeUndefined();
  });

  it('reserves verification durably and blocks on storage failure without clearing the original unknown', async () => {
    const h = fixture(); await h.emit('inspect-log', inspect);
    const before = structuredClone(h.ledger());
    h.state.failStorage = true;
    expect(await h.controller.authorizeTool('Bash', inspect, 'inspect-log')).toContain('Could not durably reserve');
    expect(h.ledger()).toEqual(before);
    expect(h.controller.beforeTool('Bash', next)).toContain('blocked');
    expect(h.controller.inspectActionLedger().uncertainActions.map(a => a.actionId)).toContain(hash);
  });

  it('does not revive a stopped or retired inference when new operations are otherwise independent', async () => {
    const h = fixture(); await h.emit('inspect-log', inspect);
    h.state.active = false;
    expect(await h.controller.authorizeTool('Bash', inspect, 'inspect-log')).toContain('blocked');
    const execute = vi.fn(async () => result('late', next));
    expect((await h.controller.run(request(), h.body, execute)).status).toBe(499);
    expect(execute).not.toHaveBeenCalled();
  });

  it('permits a fresh inference after an unpaired native read while retaining its original history', async () => {
    const h = fixture();
    const body: AnthropicRequest = { ...h.body, messages: [
      { role: 'user', content: 'Inspect the output file.' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'old-read', name: 'Read', input: { file_path: '/fixture/output.log' } }] },
      { role: 'user', content: 'Continue inspecting.' },
    ] };
    const clean = new ContextRecoveryController({ ...h.options, initialLedger: undefined });
    const execute = vi.fn(async (actual: AnthropicRequest) => { expect(actual).toEqual(body); return result('inspect-log', inspect); });
    const response = await clean.run(request(), body, execute);
    expect(response.status).toBe(200); await response.text();
    expect(execute).toHaveBeenCalledOnce();
    expect(clean.beforeTool('Bash', inspect)).toBeUndefined();
  });

  it('rejects unidentifiable corrupt history instead of treating it as independent work', async () => {
    const h = fixture();
    h.body.messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'unknown-id', content: 'unbound result' }] });
    const execute = vi.fn(async () => result('inspect-log', inspect));
    expect((await h.controller.run(request(), h.body, execute)).status).toBe(409);
    expect(execute).not.toHaveBeenCalled();
  });
});
