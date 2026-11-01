import { describe, expect, it, vi } from 'vitest';
import { ContextRecoveryController, recoveryActionHash } from './context-recovery';
import type { AnthropicRequest } from './types/anthropic';
import { APP_CLI_NAME } from '../../shared/appProfile';

const owner = { sessionId: 'product', sdkSessionId: 'native' };
const launch = { command: "ssh fixture-host 'start-build'", run_in_background: true };
const inspect = { command: "ssh fixture-host 'tail -n 80 /var/log/build.log'" };
const next = { command: "ssh fixture-host 'package-verified-build'" };
const hash = recoveryActionHash('Bash', launch);
const frame = (type: string, extra: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...extra })}\n\n`;
const request = () => new Request('http://localhost/fixture');
function result(id: string, input: object, name = 'Bash') {
  return new Response(frame('message_start', { message: { id: `msg-${id}`, content: [] } })
    + frame('content_block_start', { index: 0, content_block: { type: 'tool_use', id, name, input: {} } })
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
  async function emit(id: string, input: object, name = 'Bash') {
    const execute = vi.fn(async (actual: AnthropicRequest) => { expect(actual).toEqual(body); return result(id, input, name); });
    const response = await controller.run(request(), body, execute);
    expect(response.status).toBe(200); await response.text();
    expect(execute).toHaveBeenCalledOnce();
  }
  function append(id: string, input: Record<string, unknown>, content: string, name = 'Bash') {
    body.messages.push({ role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content }] });
  }
  return { controller, state, body, options, emit, append, ledger: () => ledger };
}

describe('operation-scoped recovery admission', () => {
  it.each([
    { name: 'TaskList', input: {} },
    { name: 'TaskGet', input: { taskId: '1' } },
  ])('refreshes a successful native $name query without discharging unknown actions', async ({ name, input }) => {
    const h = fixture();
    await h.emit('first-query', input, name);
    expect(await h.controller.authorizeTool(name, input, 'first-query')).toBeUndefined();
    await h.controller.commitToolResult(name, input, 'old state', false, 'first-query');
    h.append('first-query', input, 'old state', name);
    const cold = new ContextRecoveryController({ ...h.options, initialLedger: h.ledger() });
    cold.bindNoDispatchOwner({ ...owner, queryGeneration: 2, isCurrent: () => h.state.current });
    const response = await cold.run(request(), h.body, async () => result('fresh-query', input, name));
    expect(response.status).toBe(200); await response.text();
    expect(await cold.authorizeTool(name, input, 'fresh-query')).toBeUndefined();
    await cold.commitToolResult(name, input, 'current state', false, 'fresh-query');
    expect(await cold.authorizeTool(name, input, 'fresh-query')).toContain('already reserved');
    expect(cold.inspectActionLedger().uncertainActions.map(a => a.actionId)).toEqual([hash]);
    expect(cold.inspectActionLedger().operationAttempts.filter(a => a.actionId === recoveryActionHash(name, input))).toHaveLength(2);
  });

  it.each([
    { name: 'TaskList', input: { extra: 'unproven' } },
    { name: 'TaskGet', input: { taskId: '1', status: 'completed' } },
    { name: 'mcp__custom__TaskList', input: {} },
    { name: 'TaskUpdate', input: { taskId: '1', status: 'completed' } },
  ])('does not grant native query semantics to $name with extra input or a different owner', async ({ name, input }) => {
    const h = fixture(); await h.emit('original', input, name);
    await h.controller.authorizeTool(name, input, 'original');
    await h.controller.commitToolResult(name, input, 'success', false, 'original');
    expect(h.controller.beforeTool(name, input)).toContain('already completed');
  });

  it('keeps a failed native task query protected instead of treating it as a successful refresh', async () => {
    const h = fixture(); await h.emit('unknown-query', {}, 'TaskList');
    await h.controller.authorizeTool('TaskList', {}, 'unknown-query');
    await h.controller.commitToolResult('TaskList', {}, 'outcome unavailable', true, 'unknown-query');
    expect(h.controller.beforeTool('TaskList', {})).toContain('uncertain outcome');
    expect(h.controller.inspectActionLedger().uncertainCount).toBe(2);
  });

  it('refreshes a completed product task-list query with a new native identity, including after cold restoration', async () => {
    const h = fixture();
    const query = { command: `${APP_CLI_NAME} session tasks --json`, description: 'Read session task ledger' };
    await h.emit('tasks-first', query);
    expect(await h.controller.authorizeTool('Bash', query, 'tasks-first')).toBeUndefined();
    await h.controller.commitToolResult('Bash', query, '{"revision":1}', false, 'tasks-first');
    h.append('tasks-first', query, '{"revision":1}');
    await h.emit('tasks-refresh', query);
    expect(await h.controller.authorizeTool('Bash', query, 'tasks-refresh')).toBeUndefined();
    await h.controller.commitToolResult('Bash', query, '{"revision":2}', false, 'tasks-refresh');
    h.append('tasks-refresh', query, '{"revision":2}');
    expect(await h.controller.authorizeTool('Bash', query, 'tasks-refresh')).toContain('already reserved');
    expect(h.controller.inspectActionLedger().uncertainActions.map(a => a.actionId)).toEqual([hash]);
    expect(h.controller.beforeTool('Bash', launch)).toContain('uncertain outcome');
    const cold = new ContextRecoveryController({ ...h.options, initialLedger: h.ledger() });
    expect(cold.beforeTool('Bash', query)).toBeUndefined();
    expect(cold.beforeTool('Bash', launch)).toContain('uncertain outcome');
    cold.bindNoDispatchOwner({ ...owner, queryGeneration: 2, isCurrent: () => h.state.current });
    const response = await cold.run(request(), h.body, async () => result('tasks-cold', query));
    expect(response.status).toBe(200); await response.text();
    expect(await cold.authorizeTool('Bash', query, 'tasks-cold')).toBeUndefined();
    await cold.commitToolResult('Bash', query, '{"revision":3}', false, 'tasks-cold');
    expect(cold.inspectActionLedger().uncertainActions.map(a => a.actionId)).toEqual([hash]);
    expect(cold.inspectActionLedger().operationAttempts.filter(a => a.actionId === recoveryActionHash('Bash', query)))
      .toHaveLength(3);
  });

  it.each(['unknown', 'stopped', 'storage-failure'] as const)('retains %s protection for a repeated task-list query', async condition => {
    const h = fixture();
    const query = { command: `${APP_CLI_NAME} session tasks --json` };
    await h.emit('tasks-first', query);
    await h.controller.authorizeTool('Bash', query, 'tasks-first');
    if (condition === 'unknown') {
      await h.controller.commitToolResult('Bash', query, 'connection interrupted', true, 'tasks-first', { interrupted: true });
      expect(h.controller.beforeTool('Bash', query)).toContain('uncertain outcome');
    } else {
      await h.controller.commitToolResult('Bash', query, '{"revision":1}', false, 'tasks-first');
      h.append('tasks-first', query, '{"revision":1}');
      await h.emit('tasks-refresh', query);
      if (condition === 'stopped') h.state.active = false;
      else h.state.failStorage = true;
      expect(await h.controller.authorizeTool('Bash', query, 'tasks-refresh')).toContain(
        condition === 'stopped' ? 'retired or unbound' : 'Could not durably reserve');
    }
    expect(h.controller.inspectActionLedger().uncertainActions.map(a => a.actionId)).toContain(hash);
  });

  it.each([
    `${APP_CLI_NAME} session tasks --json --data '{"kind":"review"}'`,
    `${APP_CLI_NAME} session tasks --json; echo changed`,
    `/tmp/${APP_CLI_NAME} session tasks --json`,
  ])('still denies replay of a completed non-query command: %s', async command => {
    const h = fixture(); const input = { command };
    await h.emit('original', input);
    await h.controller.authorizeTool('Bash', input, 'original');
    await h.controller.commitToolResult('Bash', input, 'success', false, 'original');
    expect(h.controller.beforeTool('Bash', input)).toContain('already completed');
  });

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
