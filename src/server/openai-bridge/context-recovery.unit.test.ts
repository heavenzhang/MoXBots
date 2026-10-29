import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ContextRecoveryController, LiveQueryToolUseTracker } from './context-recovery';
import type { AnthropicRequest } from './types/anthropic';

function history(): AnthropicRequest {
  return { model: 'fixture-model', max_tokens: 128,
    system: [{ type: 'text', text: 'Keep the same Session and Goal; never repeat a completed action.' }],
    tools: [{ name: 'increment_counter', input_schema: { type: 'object', properties: {} } }],
    messages: [
      { role: 'user', content: 'Increment exactly once. Preserve this user constraint in full.' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'call-1', name: 'increment_counter', input: { delta: 1, account: 'test' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1', content: `counter=1\n${'old evidence '.repeat(2400)}` }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Older analysis. '.repeat(1000) }] },
      { role: 'user', content: 'Continue the existing Goal. Do not increment again.' },
      { role: 'user', content: '/compact Preserve the checkpoint and successful tool results.' },
    ] };
}

function req(signal?: AbortSignal): Request {
  return new Request('http://127.0.0.1/bridge/fixture/v1/messages', { method: 'POST', signal });
}

function overflow(message = 'Context window is full'): Response {
  return Response.json({ error: { type: 'invalid_request_error', message } }, { status: 400 });
}

function ok(): Response { return Response.json({ type: 'message', content: [{ type: 'text', text: 'continued' }] }); }

function fixture() {
  const owner = { scope: 'session:goal:turn-1' as string | undefined, active: true, canRecover: true };
  const backup = vi.fn(async (_body: AnthropicRequest, metadata: { digest: string; scope: string }) => `/private/archive/${metadata.digest}.json`);
  const onRecovery = vi.fn();
  const controller = new ContextRecoveryController({ scope: () => owner.scope, isActive: () => owner.active,
    canRecover: () => owner.canRecover, backup, onRecovery });
  return { owner, backup, onRecovery, controller };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('bounded inference context recovery', () => {
  it('binds SDK no-dispatch evidence through live stream materialization and paired tool_result only', async () => {
    const controller = new ContextRecoveryController({ scope: () => 'session-1:turn-4', isActive: () => true,
      recoveryOwner: { sessionId: 'session-1', sdkSessionId: 'sdk-1' },
      backup: async () => '/archive/request.json', persistLedger: async () => {} });
    controller.bindNoDispatchOwner({ sessionId: 'session-1', sdkSessionId: 'sdk-1', queryGeneration: 7, isCurrent: () => true });
    const tracker = new LiveQueryToolUseTracker();
    const scope = controller.snapshotNoDispatchScope();
    const preMaterialization = new LiveQueryToolUseTracker();
    preMaterialization.observeStreamEvent({ type: 'content_block_start', content_block: {
      type: 'tool_use', id: 'not-final-yet', name: 'TaskGet', input: {},
    } }, scope);
    expect(preMaterialization.takeErrorResult({ type: 'tool_result', tool_use_id: 'not-final-yet', is_error: true })).toBeUndefined();
    const missingFinalInput = new LiveQueryToolUseTracker();
    missingFinalInput.observeStreamEvent({ type: 'content_block_start', content_block: {
      type: 'tool_use', id: 'final-without-input', name: 'TaskGet', input: {},
    } }, scope);
    missingFinalInput.materializeAssistantMessage({ content: [{ type: 'tool_use', id: 'final-without-input', name: 'TaskGet' }] });
    expect(missingFinalInput.takeErrorResult({ type: 'tool_result', tool_use_id: 'final-without-input', is_error: true })).toBeUndefined();
    tracker.observeStreamEvent({ type: 'content_block_start', content_block: {
      type: 'tool_use', id: 'live-invalid', name: 'TaskGet', input: {},
    } }, scope);
    tracker.materializeAssistantMessage({ content: [{ type: 'tool_use', id: 'live-invalid', name: 'TaskGet', input: {} }] });
    const paired = tracker.takeErrorResult({ type: 'tool_result', tool_use_id: 'live-invalid', is_error: true });
    expect(paired).toMatchObject({ toolUseId: 'live-invalid', name: 'TaskGet', input: {}, scope });
    expect(await controller.commitNoDispatchValidationFailure(paired!.name, paired!.input,
      paired!.toolUseId, paired!.scope ?? '')).toBe(true);

    // A PreToolUse observation for the same ID proves the call was admitted;
    // the SDK error cannot relabel an execution failure as schema no-dispatch.
    const admitted = new LiveQueryToolUseTracker();
    admitted.observeStreamEvent({ type: 'content_block_start', content_block: {
      type: 'tool_use', id: 'admitted-invalid', name: 'TaskGet', input: {},
    } }, scope);
    admitted.materializeAssistantMessage({ content: [{ type: 'tool_use', id: 'admitted-invalid', name: 'TaskGet', input: {} }] });
    await controller.authorizeTool('TaskGet', {}, 'admitted-invalid');
    const admittedPair = admitted.takeErrorResult({ type: 'tool_result', tool_use_id: 'admitted-invalid', is_error: true });
    expect(admittedPair).toBeDefined();
    expect(await controller.commitNoDispatchValidationFailure(admittedPair!.name, admittedPair!.input,
      admittedPair!.toolUseId, admittedPair!.scope ?? '')).toBe(false);

    // A restored/historical assistant block without a live stream observation
    // cannot create a current-Query proof, even when an error result follows.
    const historical = new LiveQueryToolUseTracker();
    historical.materializeAssistantMessage({ content: [{ type: 'tool_use', id: 'old-id', name: 'Bash', input: {} }] });
    expect(historical.takeErrorResult({ type: 'tool_result', tool_use_id: 'old-id', is_error: true })).toBeUndefined();
    expect(historical.takeErrorResult({ type: 'tool_result', tool_use_id: 'live-invalid', is_error: true })).toBeUndefined();
  });

  it('does not let a new no-dispatch proof erase a prior uncertain result with the same action hash', async () => {
    const controller = new ContextRecoveryController({ scope: () => 'session-1:turn-4', isActive: () => true,
      recoveryOwner: { sessionId: 'session-1', sdkSessionId: 'sdk-1' },
      backup: async () => '/archive/request.json', persistLedger: async () => {} });
    controller.bindNoDispatchOwner({ sessionId: 'session-1', sdkSessionId: 'sdk-1', queryGeneration: 7, isCurrent: () => true });
    await controller.commitToolResult('TaskGet', {}, 'prior admitted failure with unknown outcome', true);
    expect(await controller.commitNoDispatchValidationFailure('TaskGet', {}, 'new-invalid-id', 'session-1:turn-4')).toBe(true);
    expect(controller.canRetryInference()).toBe(false);
  });

  it('counts persisted no-dispatch proofs against the same 2048-entry ledger cap', async () => {
    const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value, (_key, item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
      return item;
    })).digest('hex');
    const actionHash = sha({ name: 'TaskGet', input: {} });
    const noDispatch = Array.from({ length: 2048 }, (_, index) => {
      const toolUseId = `invalid-${index}`;
      const key = sha({ kind: 'no-dispatch', actionHash, toolUseId });
      return [key, { sessionId: 'session-1', sdkSessionId: 'sdk-1', queryGeneration: 7,
        scope: 'session-1:turn-4', toolUseId, toolName: 'TaskGet', actionHash, reason: 'missing-taskId' }];
    });
    const ledger = { version: 1, completed: [], uncertain: [], denied: [], blocked: false, noDispatch };
    let persisted: unknown;
    const controller = new ContextRecoveryController({ scope: () => 'session-1:turn-4', isActive: () => true,
      recoveryOwner: { sessionId: 'session-1', sdkSessionId: 'sdk-1' }, initialLedger: ledger,
      backup: async () => '/archive/request.json', persistLedger: async value => { persisted = value; } });
    controller.bindNoDispatchOwner({ sessionId: 'session-1', sdkSessionId: 'sdk-1', queryGeneration: 7, isCurrent: () => true });
    expect(await controller.authorizeTool('mutating_tool', { id: 'new' }, 'new-operation')).toContain('capacity');
    expect((persisted as { completed: unknown[] }).completed).toEqual([]);
  });

  it('persists exact SDK-bound no-dispatch proof only for schema-invalid calls never admitted by PreToolUse', async () => {
    const persisted: unknown[] = [];
    const owner = { sessionId: 'session-1', sdkSessionId: 'sdk-1', queryGeneration: 7, isCurrent: () => true };
    const controller = new ContextRecoveryController({ scope: () => 'session-1:turn-4', isActive: () => true,
      recoveryOwner: { sessionId: 'session-1', sdkSessionId: 'sdk-1' },
      backup: async () => '/archive/request.json', persistLedger: async value => { persisted.push(value); } });
    controller.bindNoDispatchOwner(owner);

    expect(await controller.commitNoDispatchValidationFailure('TaskGet', {}, 'tool-taskget-invalid', 'session-1:turn-4')).toBe(true);
    expect(controller.canRetryInference()).toBe(true);
    const ledger = persisted.at(-1) as { noDispatch: Array<[string, Record<string, unknown>]> };
    expect(ledger.noDispatch[0][1]).toMatchObject({ sessionId: 'session-1', sdkSessionId: 'sdk-1',
      queryGeneration: 7, scope: 'session-1:turn-4', toolUseId: 'tool-taskget-invalid', reason: 'missing-taskId' });
    expect(ledger.noDispatch[0][1]).not.toHaveProperty('isCurrent');
    for (const id of ['tool-bash-invalid-1', 'tool-bash-invalid-2', 'tool-bash-invalid-3', 'tool-bash-invalid-4']) {
      expect(await controller.commitNoDispatchValidationFailure('Bash', {}, id, 'session-1:turn-4')).toBe(true);
    }
    expect((persisted.at(-1) as { noDispatch: unknown[] }).noDispatch).toHaveLength(5);

    controller.bindNoDispatchOwner(owner);
    await controller.authorizeTool('Bash', { command: 'fixture' }, 'tool-bash-admitted');
    expect(await controller.commitNoDispatchValidationFailure('Bash', {}, 'tool-bash-admitted', 'session-1:turn-4')).toBe(false);
    await controller.commitToolResult('Bash', { command: 'fixture' }, 'transport failed after dispatch', true);
    expect(controller.canRetryInference()).toBe(false);
    expect(await controller.commitNoDispatchValidationFailure('Bash', { command: 'fixture' }, 'tool-bash-other', 'session-1:turn-4')).toBe(false);
  });

  it('keeps no-dispatch proofs scoped to the paired native tool id when analyzing restored history', async () => {
    const persisted: unknown[] = [];
    const controller = new ContextRecoveryController({ scope: () => 'session-1:turn-4', isActive: () => true,
      recoveryOwner: { sessionId: 'session-1', sdkSessionId: 'sdk-1' },
      backup: async () => '/archive/request.json', persistLedger: async value => { persisted.push(value); } });
    controller.bindNoDispatchOwner({ sessionId: 'session-1', sdkSessionId: 'sdk-1', queryGeneration: 7, isCurrent: () => true });
    await controller.commitNoDispatchValidationFailure('TaskGet', {}, 'tool-taskget-invalid', 'session-1:turn-4');
    const body = history();
    body.messages = [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'tool-taskget-invalid', name: 'TaskGet', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool-taskget-invalid', is_error: true, content: 'ignored diagnostic' }] },
    ];
    for (const id of ['tool-bash-invalid-1', 'tool-bash-invalid-2', 'tool-bash-invalid-3', 'tool-bash-invalid-4']) {
      await controller.commitNoDispatchValidationFailure('Bash', {}, id, 'session-1:turn-4');
      body.messages.push(
        { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: {} }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content: 'untrusted display text' }] },
      );
    }
    const raw = persisted.at(-1) as unknown;
    const digest = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const restored = new ContextRecoveryController({ scope: () => 'session-1:turn-4', isActive: () => true,
      backup: async () => '/archive/request.json', recoveryOwner: { sessionId: 'session-1', sdkSessionId: 'sdk-1' }, initialLedger: raw });
    expect(() => restored.restoreCheckpoint(body, '/archive/request.json', digest)).not.toThrow();
    expect(restored.canRetryInference()).toBe(true);
    expect(() => new ContextRecoveryController({ scope: () => 'session-1:turn-4', isActive: () => true,
      backup: async () => '/archive/request.json', recoveryOwner: { sessionId: 'other-session', sdkSessionId: 'sdk-1' },
      initialLedger: raw })).toThrow('No-dispatch evidence owner mismatch');

    const wrongId = structuredClone(body);
    (wrongId.messages[0] as { role: 'assistant'; content: Array<{ type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }> }).content[0].id = 'different-id';
    (wrongId.messages[1] as { role: 'user'; content: Array<{ type: 'tool_result'; tool_use_id: string; is_error: boolean; content: string }> }).content[0].tool_use_id = 'different-id';
    const mismatched = new ContextRecoveryController({ scope: () => 'session-1:turn-4', isActive: () => true,
      backup: async () => '/archive/request.json', recoveryOwner: { sessionId: 'session-1', sdkSessionId: 'sdk-1' }, initialLedger: raw });
    mismatched.restoreCheckpoint(wrongId, '/archive/request.json', createHash('sha256').update(JSON.stringify(wrongId)).digest('hex'));
    expect(mismatched.canRetryInference()).toBe(false);
  });

  it('rejects no-dispatch persistence after the Query owner is revoked', async () => {
    let current = true;
    const controller = new ContextRecoveryController({ scope: () => 'session-1:turn-4', isActive: () => true,
      recoveryOwner: { sessionId: 'session-1', sdkSessionId: 'sdk-1' },
      backup: async () => '/archive/request.json', persistLedger: async (_value, stillCurrent) => {
        current = false;
        if (!stillCurrent?.()) throw new Error('owner changed');
      } });
    controller.bindNoDispatchOwner({ sessionId: 'session-1', sdkSessionId: 'sdk-1', queryGeneration: 7,
      isCurrent: () => current });
    expect(await controller.commitNoDispatchValidationFailure('TaskGet', {}, 'tool-invalid', 'session-1:turn-4')).toBe(false);
    expect(controller.canRetryInference()).toBe(false);
  });

  function protectedStreamFixture() {
    const owner = { scope: 'root:0', active: true, safe: true };
    const backup = vi.fn(async () => '/private/stream-request.json');
    const persistLedger = vi.fn(async (_value: unknown) => {});
    const controller = new ContextRecoveryController({ scope: () => owner.scope, isActive: () => owner.active,
      canRecover: () => owner.safe, protectStreaming: true, backup, persistLedger });
    const body = { ...history(), stream: true };
    const failed = () => new Response('', { headers: { 'content-type': 'text/event-stream' } });
    return { owner, backup, persistLedger, controller, body, failed };
  }

  it.each(['failed tool', 'unpaired tool'])('keeps an ordinary fresh inference available with a prior %s when streaming prearm is enabled', async prior => {
    const h = protectedStreamFixture();
    if (prior === 'failed tool') h.body.messages[2] = { role: 'user', content: [{
      type: 'tool_result', tool_use_id: 'call-1', is_error: true, content: 'previous action failed; outcome unknown',
    }] };
    else h.body.messages.splice(2, 1);
    h.body.messages.push({ role: 'user', content: 'New explicit instruction: inspect the current status read-only.' });
    const terminal = () => new Response('event: message_stop\ndata: {"type":"message_stop"}\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    });
    // Prove this is an existing ordinary inference path, independent of prearm.
    const existing = fixture();
    const existingExecute = vi.fn(async () => terminal());
    expect((await existing.controller.run(req(), h.body, existingExecute)).status).toBe(200);
    expect(existingExecute).toHaveBeenCalledTimes(1);
    const execute = vi.fn(async (actual: AnthropicRequest) => {
      expect(actual).toEqual(h.body);
      expect(h.controller.canRetryInference()).toBe(false);
      return terminal();
    });
    const response = await h.controller.run(req(), h.body, execute);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await response.text();
  });

  it('still refuses post-fault continuation when a newly reserved action has an uncertain result', async () => {
    const h = protectedStreamFixture();
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const execute = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { source = controller; },
    }), { headers: { 'content-type': 'text/event-stream' } }));
    const response = await h.controller.run(req(), h.body, execute);
    const consuming = response.text();
    expect(await h.controller.authorizeTool('write_new', { id: 1 })).toBeUndefined();
    // A closed transport supplies no outcome for the write-ahead reservation.
    source.error(new Error('stream disconnected while action outcome was unknown'));
    expect(await consuming).toContain('automatic_replay_blocked');
    const continuation = structuredClone(h.body);
    continuation.messages.push({ role: 'assistant', content: [{ type: 'tool_use', id: 'new-native-id', name: 'write_new', input: { id: 1 } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'new-native-id', is_error: true, content: 'unknown outcome' }] });
    expect(() => h.controller.prepareStreamContinuation(continuation)).toThrow('automatic_replay_blocked');
    expect(h.controller.beforeTool('write_new', { id: 1 })).toContain('automatic_replay_blocked');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('protects before streaming and retires only the failed namespace while preserving completed-action evidence', async () => {
    const h = protectedStreamFixture();
    const execute = vi.fn(async () => {
      expect(h.backup).toHaveBeenCalledTimes(1);
      expect(h.persistLedger).toHaveBeenCalledTimes(1);
      return h.failed();
    });
    expect(await (await h.controller.run(req(), h.body, execute)).text()).toContain('automatic_replay_blocked');
    const continuation = structuredClone(h.body);
    continuation.messages.push({ role: 'user', content: 'Verified native continuation marker' });
    expect(h.controller.prepareStreamContinuation(continuation)).toBe(1);
    expect((await h.controller.run(req(), h.body, execute)).status).toBe(409);
    h.owner.scope = 'root:1';
    // A scope change cannot turn an interrupted native input into new work.
    expect((await h.controller.run(req(), h.body, execute)).status).toBe(409);
    expect(execute).toHaveBeenCalledTimes(1);
    const success = await h.controller.run(req(), continuation, async () => ok());
    expect(success.status).toBe(200);
    await success.text();
    expect(await h.controller.authorizeTool('increment_counter', { account: 'test', delta: 1 }))
      .toContain('already completed successfully');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('allows normal explicit duplicate actions before a stream fault while durably reserving every invocation', async () => {
    const h = protectedStreamFixture();
    let output!: ReadableStreamDefaultController<Uint8Array>;
    const execute = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { output = controller; },
    }), { headers: { 'content-type': 'text/event-stream' } }));
    const response = await h.controller.run(req(), h.body, execute);
    const consuming = response.text();
    let counter = 1; // The native history already contains the first success.
    for (let invocation = 0; invocation < 2; invocation++) {
      expect(await h.controller.authorizeTool('increment_counter', { account: 'test', delta: 1 })).toBeUndefined();
      expect(h.persistLedger.mock.calls.at(-1)?.[0]).toMatchObject({ streamArmedOnly: true,
        uncertain: [expect.any(String)] });
      counter++;
      await h.controller.commitToolResult('increment_counter', { account: 'test', delta: 1 }, `counter=${counter}`);
    }
    output.enqueue(new TextEncoder().encode('event: message_stop\ndata: {"type":"message_stop"}\n\n'));
    output.close();
    expect(await consuming).not.toContain('automatic_replay_blocked');
    expect(counter).toBe(3);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each(['uncertain', 'unpaired', 'owner lost', 'background', 'consumer cancel', 'successful stream', 'storage error'])
    ('refuses continuation for %s', async reason => {
      const h = protectedStreamFixture();
      if (reason === 'storage error') h.persistLedger.mockRejectedValueOnce(new Error('disk failed'));
      const response = await h.controller.run(req(), h.body, async () => reason === 'successful stream'
        ? new Response('event: message_stop\ndata: {"type":"message_stop"}\n\n', { headers: { 'content-type': 'text/event-stream' } })
        : reason === 'consumer cancel'
          ? new Response(new ReadableStream({ pull() {} }), { headers: { 'content-type': 'text/event-stream' } })
          : h.failed());
      if (reason === 'consumer cancel') await response.body!.cancel();
      else await response.text();
      const continuation = structuredClone(h.body);
      if (reason === 'uncertain') h.controller.recordToolResult('write_new', { id: 1 }, 'unknown failure', true);
      if (reason === 'unpaired') continuation.messages.push({ role: 'assistant', content: [{ type: 'tool_use', id: 'unknown', name: 'write_new', input: {} }] });
      if (reason === 'owner lost') h.owner.active = false;
      if (reason === 'background') h.owner.safe = false;
      expect(() => h.controller.prepareStreamContinuation(continuation)).toThrow('automatic_replay_blocked');
    });

  it('arms durable action protection for availability recovery without reducing history', async () => {
    let ledger: unknown;
    const h = fixture();
    const body = history();
    const controller = new ContextRecoveryController({ scope: () => 'same-turn', isActive: () => true,
      backup: h.backup, persistLedger: async value => { ledger = structuredClone(value); } });
    await controller.protectInference(body);
    expect(h.backup).toHaveBeenCalledTimes(1);
    expect(ledger).toMatchObject({ projectionActive: false });
    expect(await controller.authorizeTool('increment_counter', { delta: 1, account: 'test' }))
      .toContain('already completed successfully');
    const input = vi.fn(async (actual: AnthropicRequest) => { expect(actual).toEqual(body); return ok(); });
    await (await controller.run(req(), body, input)).text();
    expect(input).toHaveBeenCalledTimes(1);
    const restored = new ContextRecoveryController({ scope: () => 'new-query', isActive: () => true,
      backup: h.backup, initialLedger: ledger });
    expect(await restored.authorizeTool('increment_counter', { account: 'test', delta: 1 }))
      .toContain('already completed successfully');
  });

  it('does not authorize availability recovery for an uncertain earlier write', async () => {
    const h = fixture();
    const body = history();
    body.messages[2] = { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1', is_error: true, content: 'connection closed after write' }] };
    await expect(h.controller.protectInference(body)).rejects.toThrow('read-only reconciliation');
    expect(h.backup).not.toHaveBeenCalled();
  });

  it.each(['next turn', 'restored Query'])('permits read-only reconciliation after a stopped reserved action in a %s', async mode => {
    let scope = 'original-turn';
    let ledger: unknown;
    const options = { scope: () => scope, isActive: () => true, protectStreaming: true,
      backup: async () => '/archive/original.json',
      persistLedger: async (value: unknown) => { ledger = structuredClone(value); } };
    let controller = new ContextRecoveryController(options);
    await controller.protectInference(history());
    await controller.authorizeTool('write_record', { id: 'uncertain' });
    const preserved = structuredClone(ledger);
    controller.endTurn();
    scope = 'explicit-followup';
    if (mode === 'restored Query') controller = new ContextRecoveryController({ ...options, initialLedger: ledger });
    const body: AnthropicRequest = { ...history(), stream: true };
    body.messages.push(
      { role: 'assistant', content: [{ type: 'tool_use', id: 'stopped-tool', name: 'write_record', input: { id: 'uncertain' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'stopped-tool', is_error: true, content: 'Tool interrupted.' }] },
      { role: 'user', content: 'Continue from the preserved evidence. Verify uncertain outcomes read-only.' });
    const execute = vi.fn(async (actual: AnthropicRequest) => {
      expect(actual).toEqual(body);
      expect(controller.canRetryInference()).toBe(false);
      expect(controller.beforeTool('Read', { file_path: '/fixture/status.json' })).toBeUndefined();
      expect(controller.beforeTool('write_record', { id: 'uncertain' })).toContain('read-only');
      expect(controller.beforeTool('write_record', { id: 'different' })).toContain('read-only');
      expect(controller.beforeTool('Bash', { command: 'echo fixture' })).toContain('read-only');
      return ok();
    });
    const response = await controller.run(req(), body, execute);
    expect(response.status).toBe(200);
    await response.text();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(ledger).toEqual(preserved);
    expect((await controller.run(req(), body, execute)).status).toBe(409);
    expect(execute).toHaveBeenCalledTimes(1);
    await expect(controller.protectInference(body)).rejects.toThrow('read-only reconciliation');
    expect(() => controller.prepareStreamContinuation(body)).toThrow('automatic_replay_blocked');
  });

  it('reports local ledger persistence failure without calling it a model transport failure', async () => {
    const controller = new ContextRecoveryController({ scope: () => 'explicit-turn', isActive: () => true,
      protectStreaming: true, backup: async () => '/archive/original.json',
      persistLedger: async () => { throw new Error('private disk path must not be exposed'); } });
    const execute = vi.fn(async () => ok());
    const response = await controller.run(req(), { ...history(), stream: true }, execute);
    expect(response.status).toBe(409);
    const error = await response.text();
    expect(error).toContain('Recovery ledger could not be committed');
    expect(error).not.toContain('model transport failed');
    expect(error).not.toContain('private disk path');
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(['Stop', 'scope change', 'background work'])('does not dispatch a read-only inference after %s during ledger persistence', async change => {
    const gate = deferred<void>();
    const entered = deferred<void>();
    let active = true;
    let scope = 'explicit-turn';
    let safe = true;
    const controller = new ContextRecoveryController({ scope: () => scope, isActive: () => active,
      canRecover: () => safe, protectStreaming: true, backup: async () => '/archive/original.json',
      initialLedger: { version: 1, completed: [], uncertain: ['a'.repeat(64)], denied: [], blocked: false,
        projectionActive: false, streamArmedOnly: false },
      persistLedger: async () => { entered.resolve(); await gate.promise; } });
    const execute = vi.fn(async () => ok());
    const pending = controller.run(req(), { ...history(), stream: true }, execute);
    await entered.promise;
    if (change === 'Stop') active = false;
    if (change === 'scope change') scope = 'new-owner';
    if (change === 'background work') safe = false;
    gate.resolve();
    expect((await pending).status).toBe(change === 'Stop' ? 499 : 409);
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not turn a restored projected recovery into read-only prearm authority', async () => {
    const controller = new ContextRecoveryController({ scope: () => 'explicit-turn', isActive: () => true,
      protectStreaming: true, backup: async () => '/archive/original.json', persistLedger: async () => {},
      initialLedger: { version: 1, completed: [], uncertain: ['a'.repeat(64)], denied: [], blocked: false,
        projectionActive: true, streamArmedOnly: false } });
    const execute = vi.fn(async () => ok());
    const response = await controller.run(req(), { ...history(), stream: true }, execute);
    expect(response.status).toBe(409);
    expect(await response.text()).toContain('read-only reconciliation');
    expect(execute).not.toHaveBeenCalled();
  });

  it('stops availability recovery if its durable action ledger cannot be committed', async () => {
    const h = fixture();
    const controller = new ContextRecoveryController({ scope: () => 'same-turn', isActive: () => true,
      backup: h.backup, persistLedger: async () => { throw new Error('disk denied'); } });
    await expect(controller.protectInference(history())).rejects.toThrow('could not be committed');
    expect(await controller.authorizeTool('another_write', { id: 2 })).toContain('blocked');
  });

  it('archives before retry, preserves constraints and complete tool pairs, and guards a new-ID repeated action', async () => {
    const h = fixture();
    const body = history();
    const saved = structuredClone(body);
    const inputs: AnthropicRequest[] = [];
    const execute = vi.fn(async (input: AnthropicRequest) => {
      inputs.push(input);
      if (inputs.length === 1) return overflow();
      expect(h.backup).toHaveBeenCalledTimes(1);
      return ok();
    });
    const response = await h.controller.run(req(), body, execute);
    expect(response.status).toBe(200);
    await response.text();
    expect(body).toEqual(saved);
    expect(inputs).toHaveLength(2);
    const projected = inputs[1];
    expect(projected.system).toEqual(body.system);
    expect(projected.tools).toEqual(body.tools);
    expect(projected.messages[0]).toEqual(body.messages[0]);
    expect(projected.messages[1]).toEqual(body.messages[1]);
    expect(projected.messages.slice(-2)).toEqual(body.messages.slice(-2));
    expect(projected.messages[2]).toMatchObject({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1' }] });
    const projection = JSON.stringify(projected);
    expect(projection).toContain('counter=1');
    expect(projection).toContain('Original SHA-256');
    expect(projection).toContain('/private/archive/');
    expect(projection.length).toBeLessThan(JSON.stringify(body).length * 0.85);
    expect(h.backup.mock.calls[0][0]).toEqual(saved);
    expect(h.onRecovery).toHaveBeenCalledTimes(1);
    // A model can emit the same operation under a NEW native tool id. The existing
    // tool owner consults this guard; recovery itself never executes a tool.
    let counter = 1;
    const newToolUse = { id: 'new-call-id', name: 'increment_counter', input: { account: 'test', delta: 1 } };
    const denial = h.controller.beforeTool(newToolUse.name, newToolUse.input);
    if (!denial) counter++;
    expect(counter).toBe(1);
    expect(denial).toContain('already completed');
    expect(denial).toContain('/private/archive/');
    expect(h.controller.beforeTool('Read', { file_path: 'test' })).toBeUndefined();
    expect(h.controller.beforeTool('increment_counter', { account: 'different', delta: 1 })).toBeUndefined();
  });

  it.each([
    { type: 'context_length_exceeded', message: 'request rejected' },
    { code: 'context_length_exceeded', message: 'request rejected' },
    { message: 'This model has a maximum context length of 65536 tokens' },
    { message: 'Prompt is too long' },
  ])('recovers only an explicit overflow diagnosis: %j', async error => {
    const h = fixture();
    let calls = 0;
    const response = await h.controller.run(req(), history(), async () => ++calls === 1
      ? Response.json({ error }, { status: 400 }) : ok());
    expect(response.status).toBe(200);
    await response.text();
    expect(calls).toBe(2);
  });

  it.each(['invalid schema', 'context_length_exceeded is mentioned in an unrelated schema field', 'too many requests'])('does not recover generic 400: %s', async message => {
    const h = fixture();
    const execute = vi.fn(async () => overflow(message));
    const response = await h.controller.run(req(), history(), execute);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { type: 'invalid_request_error', message } });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(h.backup).not.toHaveBeenCalled();
  });

  it('does not retry when durable backup fails', async () => {
    const h = fixture();
    h.backup.mockRejectedValue(new Error('disk failure'));
    const execute = vi.fn(async () => overflow());
    const response = await h.controller.run(req(), history(), execute);
    expect(response.status).toBe(409);
    expect(response.headers.get('x-should-retry')).toBe('false');
    expect(await response.json()).toMatchObject({ error: { code: 'context_recovery_required' } });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(h.onRecovery).not.toHaveBeenCalled();
  });

  it.each(['unknown', 'unpaired', 'failed'] as const)('fails closed for %s history', async mode => {
    const h = fixture();
    const body = history();
    if (mode === 'unknown') body.messages[3].content = [{ type: 'document' }] as unknown as AnthropicRequest['messages'][number]['content'];
    if (mode === 'unpaired') body.messages.splice(2, 1);
    if (mode === 'failed') {
      const content = body.messages[2].content;
      if (Array.isArray(content) && content[0].type === 'tool_result') content[0].is_error = true;
    }
    const execute = vi.fn(async () => overflow());
    const response = await h.controller.run(req(), body, execute);
    expect(response.status).toBe(409);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(h.backup).not.toHaveBeenCalled();
    expect(h.controller.beforeTool('increment_counter', { account: 'test', delta: 1 })).toContain('blocked');
  });

  it('refuses insufficient reduction instead of truncating user constraints or latest evidence', async () => {
    const h = fixture();
    const body: AnthropicRequest = { model: 'fixture', max_tokens: 128,
      messages: [{ role: 'user', content: 'Protected constraint. '.repeat(4000) }] };
    const original = structuredClone(body);
    const execute = vi.fn(async () => overflow());
    expect((await h.controller.run(req(), body, execute)).status).toBe(409);
    expect(body).toEqual(original);
    expect(h.backup).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('omits archived old tool images while preserving the pair and newest images', async () => {
    const h = fixture();
    const body = history();
    body.messages[2].content = [{ type: 'tool_result', tool_use_id: 'call-1', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'X'.repeat(15000) } },
      { type: 'text', text: 'counter=1' },
    ] }];
    body.messages[5].content = [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'Y'.repeat(200) } }];
    const inputs: AnthropicRequest[] = [];
    const response = await h.controller.run(req(), body, async input => { inputs.push(input); return inputs.length === 1 ? overflow() : ok(); });
    await response.text();
    expect(inputs[1].messages[2]).toMatchObject({ content: [{ type: 'tool_result', tool_use_id: 'call-1' }] });
    expect(JSON.stringify(inputs[1].messages[2])).not.toContain('X'.repeat(100));
    expect(inputs[1].messages[5]).toEqual(body.messages[5]);
  });

  it('cancels during backup without retrying inference or activating recovery', async () => {
    const h = fixture();
    const archive = deferred<string>();
    const entered = deferred<void>();
    h.backup.mockImplementation(async () => { entered.resolve(); return archive.promise; });
    const abort = new AbortController();
    const execute = vi.fn(async () => overflow());
    const result = h.controller.run(req(abort.signal), history(), execute);
    await entered.promise;
    abort.abort();
    archive.resolve('/private/archive/original.json');
    expect((await result).status).toBe(499);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(h.onRecovery).not.toHaveBeenCalled();
  });

  it('a superseded backup cannot activate or block the next scope', async () => {
    const h = fixture();
    const archive = deferred<string>();
    const entered = deferred<void>();
    h.backup.mockImplementation(async () => { entered.resolve(); return archive.promise; });
    const old = h.controller.run(req(), history(), async () => overflow());
    await entered.promise;
    h.controller.endTurn();
    h.owner.scope = 'session:goal:turn-2';
    const next = await h.controller.run(req(), history(), async () => ok());
    expect(next.status).toBe(200);
    await next.text();
    archive.resolve('/private/archive/old.json');
    expect((await old).status).toBe(499);
    expect(h.onRecovery).not.toHaveBeenCalled();
    expect(h.controller.beforeTool('increment_counter', { account: 'test', delta: 1 })).toBeUndefined();
  });

  it('rejects duplicate and delivered requests while preserving distinct concurrent child inferences', async () => {
    const h = fixture();
    const pending = deferred<void>();
    const execute = vi.fn(async () => { await pending.promise; return ok(); });
    const body = history();
    const first = h.controller.run(req(), body, execute);
    expect((await h.controller.run(req(), body, execute)).status).toBe(409);
    const child = history(); child.messages[0].content = 'Independent child inference';
    const concurrentChild = h.controller.run(req(), child, execute);
    pending.resolve();
    const response = await first;
    await response.text();
    expect((await concurrentChild).status).toBe(200);
    await (await concurrentChild).text();
    body.metadata = { retry_nonce: 'changed' };
    expect((await h.controller.run(req(), body, execute)).status).toBe(409);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('refuses recovery while another inference is active, leaving that inference and future root turns live', async () => {
    const h = fixture();
    const pending = deferred<void>();
    const normal = h.controller.run(req(), history(), async () => { await pending.promise; return ok(); });
    const child = history(); child.messages.push({ role: 'user', content: 'Independent child inference' });
    const execute = vi.fn(async () => overflow());
    const blocked = await h.controller.run(req(), child, execute);
    expect(blocked.status).toBe(409);
    expect(await blocked.text()).toContain('context_recovery_required');
    expect(h.backup).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
    pending.resolve();
    const response = await normal;
    expect(response.status).toBe(200);
    await response.text();
    h.controller.endTurn(); h.owner.scope = 'session:goal:turn-2';
    const next = await h.controller.run(req(), history(), async () => ok());
    expect(next.status).toBe(200);
    await next.text();
  });

  it('allows normal requests with background work but refuses context recovery', async () => {
    const h = fixture(); h.owner.canRecover = false;
    const normal = await h.controller.run(req(), history(), async () => ok());
    expect(normal.status).toBe(200); await normal.text();
    const child = history(); child.messages.push({ role: 'user', content: 'Distinct request' });
    const execute = vi.fn(async () => overflow());
    const blocked = await h.controller.run(req(), child, execute);
    expect(blocked.status).toBe(409);
    expect(h.backup).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('locks out competing requests during archive/recovery without replaying them', async () => {
    const h = fixture();
    const pending = deferred<string>(); const entered = deferred<void>();
    h.backup.mockImplementation(async () => { entered.resolve(); return pending.promise; });
    let calls = 0;
    const execute = vi.fn(async () => ++calls === 1 ? overflow() : ok());
    const recovering = h.controller.run(req(), history(), execute);
    await entered.promise;
    const competing = history(); competing.messages.push({ role: 'user', content: 'Competing inference' });
    expect((await h.controller.run(req(), competing, execute)).status).toBe(409);
    pending.resolve('/private/archive/first.json');
    const result = await recovering; expect(result.status).toBe(200); await result.text();
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('retains the active Query projection across endTurn while releasing root replay sets', async () => {
    const h = fixture();
    let calls = 0;
    const first = await h.controller.run(req(), history(), async () => ++calls === 1 ? overflow() : ok());
    await first.text();
    h.controller.endTurn(); h.owner.scope = 'session:goal:turn-2';
    const execute = vi.fn(async (input: AnthropicRequest) => {
      expect(JSON.stringify(input).length).toBeLessThan(JSON.stringify(history()).length * 0.85);
      return ok();
    });
    const next = await h.controller.run(req(), history(), execute);
    expect(next.status).toBe(200); await next.text();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(h.backup).toHaveBeenCalledTimes(2);
    expect(h.onRecovery).toHaveBeenCalledTimes(1);
    expect(h.controller.beforeTool('increment_counter', { account: 'test', delta: 1 })).toContain('automatic_replay_blocked');
  });

  it('retains the archived success ledger across native compact, endTurn and a new-ID action in the next root', async () => {
    const h = fixture();
    let calls = 0;
    const first = await h.controller.run(req(), history(), async () => ++calls === 1 ? overflow() : ok());
    await first.text();
    h.controller.endTurn(); h.owner.scope = 'session:goal:turn-2';
    const input = { delta: 1, account: 'test' };
    // There may be no current product turn yet. An armed Query must fail closed.
    h.owner.scope = undefined;
    expect(h.controller.beforeTool('increment_counter', input)).toContain('automatic_replay_blocked');
    h.owner.scope = 'session:goal:turn-2';
    expect(h.controller.beforeTool('increment_counter', input)).toContain('already completed');
    const nativeCompacted: AnthropicRequest = { model: 'fixture-model', max_tokens: 128,
      messages: [{ role: 'user', content: 'Native compact summary: counter=1. Continue the same Goal.' }] };
    const next = await h.controller.run(req(), nativeCompacted, async () => ok());
    await next.text();
    let counter = 1;
    if (!h.controller.beforeTool('increment_counter', input)) counter++;
    expect(counter).toBe(1);
    h.owner.active = false;
    expect(h.controller.beforeTool('increment_counter', { delta: 7 })).toContain('automatic_replay_blocked');
  });

  it('restores an explicitly selected same-Goal checkpoint into a replacement Query', async () => {
    const source = history();
    const checkpoint = { body: source, archive: '/private/archive/restored.json',
      digest: createHash('sha256').update(JSON.stringify(source)).digest('hex') };
    const replacement = new ContextRecoveryController({ scope: () => 'replacement-query:same-session:same-goal',
      isActive: () => true, backup: async () => '/private/archive/next.json', initialCheckpoint: checkpoint });
    expect(replacement.beforeTool('increment_counter', { account: 'test', delta: 1 })).toContain('/private/archive/restored.json');
    replacement.endTurn();
    expect(replacement.beforeTool('increment_counter', { account: 'test', delta: 1 })).toContain('automatic_replay_blocked');
    const fresh = fixture();
    fresh.controller.recordToolResult('increment_counter', { account: 'test', delta: 1 }, 'counter=1');
    expect(fresh.controller.beforeTool('increment_counter', { account: 'test', delta: 1 })).toBeUndefined();
  });

  it('rejects a corrupt checkpoint and remains fail closed for business tools and inference', async () => {
    const h = fixture();
    expect(() => h.controller.restoreCheckpoint(history(), '/private/archive/corrupt.json', 'bad-digest')).toThrow('context_recovery_required');
    expect(h.controller.beforeTool('increment_counter', { delta: 1 })).toContain('automatic_replay_blocked');
    const execute = vi.fn(async () => ok());
    expect((await h.controller.run(req(), history(), execute)).status).toBe(409);
    expect(execute).not.toHaveBeenCalled();
  });

  it('bounds the Query rescue ledger and blocks further business work instead of evicting completed evidence', async () => {
    const h = fixture();
    const body: AnthropicRequest = { model: 'fixture-model', max_tokens: 128, messages: [
      { role: 'assistant', content: 'old evidence '.repeat(60000) },
    ] };
    for (let index = 0; index < 2049; index++) body.messages.push(
      { role: 'assistant', content: [{ type: 'tool_use', id: `write-${index}`, name: 'write_record', input: { index } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: `write-${index}`, content: 'saved' }] },
    );
    const execute = vi.fn(async () => overflow());
    const result = await h.controller.run(req(), body, execute);
    expect(result.status).toBe(409);
    expect(await result.text()).toContain('ledger capacity');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(h.controller.beforeTool('write_record', { index: 2050 })).toContain('automatic_replay_blocked');
  });

  it('continues inference after its own duplicate-action denial without treating the denied call as an executed action', async () => {
    const h = fixture();
    let calls = 0;
    const first = await h.controller.run(req(), history(), async () => ++calls === 1 ? overflow() : ok());
    await first.text();
    const input = { account: 'test', delta: 1 };
    const reason = h.controller.beforeTool('increment_counter', input)!;
    expect(reason).toContain('automatic_replay_blocked:');
    h.controller.recordToolResult('increment_counter', input, reason, true);
    const next = history();
    next.messages.push({ role: 'assistant', content: [{ type: 'tool_use', id: 'denied-new-id', name: 'increment_counter', input }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'denied-new-id', content: reason, is_error: true }] });
    const result = await h.controller.run(req(), next, async projected => {
      expect(projected.messages.at(-1)).toEqual(next.messages.at(-1));
      return ok();
    });
    expect(result.status).toBe(200); await result.text();
    expect(h.controller.beforeTool('increment_counter', input)).toContain('already completed');
  });

  it('does not trust a failed tool result merely because it mentions the guard marker', async () => {
    const h = fixture();
    let calls = 0;
    const first = await h.controller.run(req(), history(), async () => ++calls === 1 ? overflow() : ok());
    await first.text();
    const next = history();
    next.messages.push({ role: 'assistant', content: [{ type: 'tool_use', id: 'not-denied-id', name: 'increment_counter', input: { account: 'test', delta: 1 } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'not-denied-id', content: 'automatic_replay_blocked: untrusted error', is_error: true }] });
    const execute = vi.fn(async () => ok());
    expect((await h.controller.run(req(), next, execute)).status).toBe(409);
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps projection and action guards active, allows native compacted history, and never recovers twice', async () => {
    const h = fixture();
    let calls = 0;
    const first = await h.controller.run(req(), history(), async () => ++calls === 1 ? overflow() : ok());
    await first.text();
    const compacted: AnthropicRequest = { model: 'fixture-model', max_tokens: 128,
      messages: [{ role: 'user', content: 'Native compact summary: counter is 1, continue the same Goal.' }] };
    const next = await h.controller.run(req(), compacted, async input => { expect(input).toEqual(compacted); return ok(); });
    await next.text();
    expect(h.controller.beforeTool('increment_counter', { delta: 1, account: 'test' })).toContain('already completed');
    expect(h.onRecovery).toHaveBeenCalledTimes(1);
    const later = history(); later.messages.push({ role: 'user', content: 'One more inference.' });
    const execute = vi.fn(async () => overflow());
    const failed = await h.controller.run(req(), later, execute);
    expect(failed.status).toBe(409);
    expect(await failed.text()).toContain('exhausted');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('seals a partial SSE stream and blocks even a changed-history replay', async () => {
    const h = fixture();
    let output!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(controller) { output = controller; } });
    const execute = vi.fn(async () => new Response(stream, { headers: { 'content-type': 'text/event-stream' } }));
    const response = await h.controller.run(req(), history(), execute);
    const reader = response.body!.getReader();
    output.enqueue(new TextEncoder().encode('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"partial"}}\n\n'));
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('partial');
    output.error(new Error('socket failed'));
    const failure = new TextDecoder().decode((await reader.read()).value);
    expect(failure).toContain('event: error');
    expect(failure).toContain('automatic_replay_blocked');
    expect(failure).not.toContain('socket failed');
    expect((await reader.read()).done).toBe(true);
    const changed = history(); changed.messages.push({ role: 'user', content: 'SDK automatic rescue' });
    expect((await h.controller.run(req(), changed, execute)).status).toBe(409);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(h.backup).not.toHaveBeenCalled();
  });
  it('preserves native SDK internal system messages without reducing their instructions', async () => {
    const h = fixture();
    const body = history();
    const internal = { role: 'system', content: 'Protected native SDK instructions' };
    body.messages.splice(1, 0, internal as unknown as typeof body.messages[number]);
    let calls = 0;
    const response = await h.controller.run(req(), body, async projected => {
      if (++calls === 1) return overflow();
      expect(projected.messages[1]).toEqual(internal);
      return ok();
    });
    expect(response.status).toBe(200); await response.text();
  });

  it('durably reserves new actions, restores completed results, and blocks uncertain crash outcomes', async () => {
    let saved: unknown;
    const persistLedger = vi.fn(async value => { saved = structuredClone(value); });
    const owner = { sessionId: 'product', sdkSessionId: 'native', queryGeneration: 1, isCurrent: () => true };
    const create = (initialLedger?: unknown) => {
      const result = new ContextRecoveryController({
        scope: () => 'new-turn-same-goal', isActive: () => true, recoveryOwner: owner,
        backup: async () => '/private/immutable-request.json', persistLedger, initialLedger,
      });
      result.bindNoDispatchOwner(owner); return result;
    };
    const controller = create();
    let calls = 0;
    await (await controller.run(req(), history(), async () => ++calls === 1 ? overflow() : ok())).text();
    expect(persistLedger).toHaveBeenCalledTimes(1);
    expect(await controller.authorizeTool('write_record', { id: 'new' }, 'new-operation')).toBeUndefined();
    // Crash before a result: the next Query must refuse to repeat the action.
    const crashed = create(saved);
    expect(await crashed.authorizeTool('write_record', { id: 'new' })).toContain('uncertain');
    await controller.commitToolResult('write_record', { id: 'new' }, 'saved exactly once', false, 'new-operation');
    const restarted = create(saved);
    expect(await restarted.authorizeTool('write_record', { id: 'new' })).toContain('already completed');
    expect(await restarted.authorizeTool('increment_counter', { delta: 1, account: 'test' })).toContain('already completed');
    expect(await restarted.authorizeTool('Read', { file_path: 'receipt' })).toBeUndefined();
  });

  it('continues after denying a duplicate of a newly committed post-recovery action', async () => {
    const owner = { sessionId: 'product', sdkSessionId: 'native', queryGeneration: 1, isCurrent: () => true };
    const controller = new ContextRecoveryController({ scope: () => 'same-goal', isActive: () => true, recoveryOwner: owner,
      backup: async () => '/private/request.json', persistLedger: async () => {} });
    controller.bindNoDispatchOwner(owner);
    let calls = 0;
    await (await controller.run(req(), history(), async () => ++calls === 1 ? overflow() : ok())).text();
    const input = { id: 'new-record' };
    expect(await controller.authorizeTool('write_record', input, 'new-write')).toBeUndefined();
    await controller.commitToolResult('write_record', input, 'committed', false, 'new-write');
    const denial = await controller.authorizeTool('write_record', input);
    expect(denial).toContain('already completed');
    const compacted: AnthropicRequest = { model: 'fixture-model', max_tokens: 128, messages: [
      { role: 'user', content: 'Continue original Goal' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'new-write', name: 'write_record', input }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'new-write', content: 'committed' }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'duplicate-new-id', name: 'write_record', input }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'duplicate-new-id', is_error: true, content: denial }] },
    ] };
    const response = await controller.run(req(), compacted, async () => ok());
    expect(response.status).toBe(200); await response.text();
  });

  it('never authorizes a business action when its reservation cannot be committed', async () => {
    let fail = false;
    const controller = new ContextRecoveryController({ scope: () => 'same-goal', isActive: () => true,
      backup: async () => '/private/request.json', persistLedger: async () => { if (fail) throw new Error('disk full'); } });
    let calls = 0;
    await (await controller.run(req(), history(), async () => ++calls === 1 ? overflow() : ok())).text();
    fail = true;
    expect(await controller.authorizeTool('write_record', { id: 2 })).toContain('execution stopped');
    expect(await controller.authorizeTool('write_record', { id: 3 })).toContain('automatic_replay_blocked');
  });

  it('rejects corrupt or oversized persisted ledgers before inference starts', () => {
    expect(() => new ContextRecoveryController({ scope: () => 'turn', isActive: () => true,
      backup: async () => 'unused', initialLedger: { version: 2 } })).toThrow('context_recovery_required');
  });


  it('does not accumulate unarmed background successes into the Query recovery ledger', async () => {
    const h = fixture();
    h.owner.scope = undefined;
    for (let index = 0; index < 3000; index++) {
      h.controller.recordToolResult('background_write', { index }, { saved: true });
    }
    h.owner.scope = 'fresh-foreground';
    let calls = 0;
    const response = await h.controller.run(req(), history(), async () => ++calls === 1 ? overflow() : ok());
    expect(response.status).toBe(200);
    await response.text();
    expect(calls).toBe(2);
    expect(h.controller.beforeTool('increment_counter', { account: 'test', delta: 1 })).toContain('already completed');
  });

  it('bounds armed background settlement and blocks further actions without losing prior evidence', async () => {
    const h = fixture();
    let calls = 0;
    const first = await h.controller.run(req(), history(), async () => ++calls === 1 ? overflow() : ok());
    await first.text();
    h.controller.endTurn(); h.owner.scope = undefined;
    for (let index = 0; index < 2200; index++) {
      h.controller.recordToolResult('background_write', { index }, { saved: true });
    }
    expect(h.controller.beforeTool('background_write', { index: 3000 })).toContain('blocked');
    expect(h.controller.canRetryInference()).toBe(false);
    const execute = vi.fn(async () => ok());
    const response = await h.controller.run(req(), history(), execute);
    expect(response.status).toBe(409);
    expect(execute).not.toHaveBeenCalled();
  });


  it('does not grant recovery to an admitted background request when the background registry clears', async () => {
    const h = fixture(); h.owner.canRecover = false;
    const pending = deferred<void>();
    const execute = vi.fn(async () => { await pending.promise; return overflow(); });
    const result = h.controller.run(req(), history(), execute);
    h.owner.canRecover = true;
    pending.resolve();
    expect((await result).status).toBe(409);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(h.backup).not.toHaveBeenCalled();
    expect(h.onRecovery).not.toHaveBeenCalled();
    const foreground = history();
    foreground.messages.push({ role: 'user', content: 'A later, unambiguous foreground inference.' });
    let calls = 0;
    const next = await h.controller.run(req(), foreground, async () => ++calls === 1 ? overflow() : ok());
    expect(next.status).toBe(200); await next.text();
    expect(calls).toBe(2);
    expect(h.backup).toHaveBeenCalledTimes(1);
  });

});
