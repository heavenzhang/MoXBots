import { mkdtemp, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ContextRecoveryController, recoveryActionHash } from '../openai-bridge/context-recovery';
import { NativeOperationJournal, type NativeOperationJournalData } from '../openai-bridge/native-operation-journal';
import type { AnthropicRequest } from '../openai-bridge/types/anthropic';

const state = vi.hoisted(() => ({ home: '' }));
vi.mock('os', async original => ({ ...await original<typeof import('os')>(), homedir: () => state.home }));
let store: typeof import('../SessionStore');
let id: string;
beforeEach(async () => {
  state.home = await mkdtemp(join(tmpdir(), 'moxbots-checkpoint-'));
  vi.resetModules();
  store = await import('../SessionStore');
  id = (await store.createSession('/workspace')).id;
});
afterEach(async () => {
  await store.getActiveSessionTranscript(id)?.revoke();
  await rm(state.home, { recursive: true, force: true });
});

it('backs up the exact request privately and commits a restart-safe identity-scoped ledger', async () => {
  const request = { messages: [{ role: 'user', content: 'synthetic evidence' }] };
  const digest = createHash('sha256').update(JSON.stringify(request)).digest('hex');
  const archive = await store.archiveBuiltinContextRequest(id, request, { digest, scope: 'goal-turn' }, () => true);
  expect(JSON.parse(await readFile(archive, 'utf8')).request).toEqual(request);
  if (process.platform !== 'win32') expect((await stat(archive)).mode & 0o777).toBe(0o600);
  const original = await readFile(archive, 'utf8');
  await store.archiveBuiltinContextRequest(id, request, { digest, scope: 'same-request-new-turn' }, () => true);
  expect(await readFile(archive, 'utf8')).toBe(original);
  const ledger = { version: 1, completed: [], uncertain: ['a'.repeat(64)], denied: [], blocked: false };
  await store.saveBuiltinContextLedger(id, id, ledger, () => true);
  expect(store.loadBuiltinContextLedger(id, id)).toEqual(ledger);
  expect(store.loadBuiltinContextLedger(id, 'different-sdk-history')).toBeUndefined();
  await expect(store.saveBuiltinContextLedger(id, 'different-sdk-history', ledger, () => true)).rejects.toThrow('owner changed');
  await store.getActiveSessionTranscript(id)?.revoke();
  vi.resetModules(); store = await import('../SessionStore');
  expect(store.loadBuiltinContextLedger(id, id)).toEqual(ledger);
  const ledgerPath = join(archive, '..', `ledger-${id}.json`);
  await unlink(ledgerPath);
  expect(() => store.loadBuiltinContextLedger(id, id)).toThrow('context_recovery_required');
  await writeFile(ledgerPath, '{invalid');
  expect(() => store.loadBuiltinContextLedger(id, id)).toThrow('context_recovery_required');
});

it('refuses cancelled archives and stale-owner ledger writes', async () => {
  await expect(store.archiveBuiltinContextRequest(id, {}, { digest: 'a'.repeat(64), scope: 'turn' }, () => false)).rejects.toThrow('changed');
  await expect(store.saveBuiltinContextLedger(id, id, {}, () => false)).rejects.toThrow('changed');
  await expect(store.saveBuiltinContextLedger(id, id, {}, () => true, () => false)).rejects.toThrow('changed');
  expect(store.loadBuiltinContextLedger(id, id)).toBeUndefined();
});

it('retains the real SessionStore ledger when a restored Session only reconciles read-only', async () => {
  const snapshot = await store.loadSessionTranscript(id);
  expect((await store.appendSessionMessages(id, snapshot.cursor, [{ id: 'fixture-user', role: 'user',
    content: 'Inspect the unfinished fixture task.', timestamp: new Date().toISOString() }])).ok).toBe(true);
  const body: AnthropicRequest = { model: 'fixture', max_tokens: 64, stream: true,
    messages: [{ role: 'user', content: 'Inspect the unfinished fixture task.' }] };
  const options = { scope: () => 'original-turn', isActive: () => true, protectStreaming: true,
    backup: (request: AnthropicRequest, metadata: { digest: string; scope: string }) =>
      store.archiveBuiltinContextRequest(id, request, metadata, () => true),
    persistLedger: (ledger: unknown) => store.saveBuiltinContextLedger(id, id, ledger, () => true) };
  const original = new ContextRecoveryController(options);
  await original.protectInference(body);
  await original.authorizeTool('write_record', { id: 'fixture-unknown' });
  const ledger = store.loadBuiltinContextLedger(id, id);
  await store.getActiveSessionTranscript(id)?.revoke();
  vi.resetModules(); store = await import('../SessionStore');
  const restored = new ContextRecoveryController({ ...options, scope: () => 'explicit-followup',
    initialLedger: store.loadBuiltinContextLedger(id, id) });
  const execute = vi.fn(async (request: AnthropicRequest) => {
    expect(request).toEqual(body);
    expect(restored.beforeTool('Read', { file_path: '/fixture/status.json' })).toBeUndefined();
    expect(restored.beforeTool('write_record', { id: 'fixture-other' })).toContain('read-only');
    return Response.json({ type: 'message', content: [{ type: 'text', text: 'Read-only evidence retained.' }] });
  });
  const response = await restored.run(new Request('http://127.0.0.1/fixture'), body, execute);
  expect(response.status, await response.clone().text()).toBe(200); await response.text();
  expect(execute).toHaveBeenCalledTimes(1);
  expect(store.loadBuiltinContextLedger(id, id)).toEqual(ledger);
  expect(restored.canRetryInference()).toBe(false);
});

it.each([true, false])('persists native error proofs without clearing existing unknowns when recovery allowed=%s', async recoveryAllowed => {
  const snapshot = await store.loadSessionTranscript(id);
  await store.appendSessionMessages(id, snapshot.cursor, [{ id: 'fixture-user', role: 'user',
    content: 'Inspect the fixture.', timestamp: new Date().toISOString() }]);
  const body: AnthropicRequest = { model: 'fixture', max_tokens: 64, stream: true,
    messages: [{ role: 'user', content: 'Inspect the fixture.' }] };
  const owner = { sessionId: id, sdkSessionId: id };
  let canRecover = true;
  const options = { scope: () => 'fixture-turn', isActive: () => true, protectStreaming: true, canRecover: () => canRecover, recoveryOwner: owner,
    backup: (request: AnthropicRequest, metadata: { digest: string; scope: string }) =>
      store.archiveBuiltinContextRequest(id, request, metadata, () => true),
    persistLedger: (ledger: unknown, guard?: () => boolean) => store.saveBuiltinContextLedger(id, id, ledger, () => true, guard) };
  const context = new ContextRecoveryController(options);
  context.bindNoDispatchOwner({ ...owner, queryGeneration: 1, isCurrent: () => true });
  await context.protectInference(body);
  await context.authorizeTool('unknown_write', {});
  const input = { command: 'inspect-fixture' };
  const frame = (type: string, extra: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...extra })}\n\n`;
  const response = await context.run(new Request('http://127.0.0.1/fixture'), body, async () => new Response(
    frame('message_start', { message: { id: 'fixture', type: 'message', role: 'assistant', content: [] } })
    + frame('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'denied-tool', name: 'Bash', input: {} } })
    + frame('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } })
    + frame('content_block_stop', { index: 0 })
    + frame('message_delta', { delta: { stop_reason: 'tool_use' } })
    + frame('message_stop', {}), { headers: { 'content-type': 'text/event-stream' } }));
  expect(response.status).toBe(200); await response.text();
  canRecover = recoveryAllowed;
  const reason = await context.authorizeTool('Bash', input, 'denied-tool');
  expect(reason).toContain('read-only');
  const proofLedger = store.loadBuiltinContextLedger(id, id) as { uncertain: string[]; nativeErrors: unknown[] };
  expect(proofLedger.nativeErrors).toHaveLength(1);
  expect(proofLedger.uncertain).toHaveLength(1);
  body.messages.push({ role: 'assistant', content: [{ type: 'tool_use', id: 'denied-tool', name: 'Bash', input }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'denied-tool', is_error: true, content: `PreToolUse:Bash hook error: ${reason}` }] });
  await store.getActiveSessionTranscript(id)?.revoke();
  vi.resetModules(); store = await import('../SessionStore');
  const persisted = store.loadBuiltinContextLedger(id, id);
  expect(persisted).toEqual(proofLedger);
  canRecover = true;
  const restored = new ContextRecoveryController({ ...options, initialLedger: persisted });
  await restored.protectInference(body, true);
  expect(restored.beforeTool('Write', {})).toContain('read-only');
  expect(store.loadBuiltinContextLedger(id, id)).toEqual(proofLedger);
});

it('persists a query-only review through Store reload, preserves raw unknowns and rejects stale CAS', async () => {
  const transcript = await store.loadSessionTranscript(id);
  expect((await store.appendSessionMessages(id, transcript.cursor, [{ id: 'review-fixture', role: 'user',
    content: 'Review synthetic task query', timestamp: new Date().toISOString() }])).ok).toBe(true);
  const { inspectRecoveryActions, reconcileRecoveryAction, recoveryLedgerDigest } = await import('./recovery-reconciliation');
  const { recoveryActionHash } = await import('../openai-bridge/context-recovery');
  const taskHash = recoveryActionHash('TaskGet', {});
  const mutationHash = recoveryActionHash('Bash', { command: 'fixture-write' });
  const ledger = { version: 1, completed: [], uncertain: [taskHash, mutationHash], denied: [], blocked: false, projectionActive: false };
  await store.saveBuiltinContextLedger(id, id, ledger, () => true);
  const deps = { owner: { sessionId: id, sdkSessionId: id, epoch: 1, reviewAuthority: 'fixture-review' },
    isCurrent: () => true, load: () => store.loadBuiltinContextLedger(id, id),
    readNative: async () => [{ type: 'assistant', uuid: 'native-use', session_id: id,
      message: { content: [{ type: 'tool_use', id: 'task-read', name: 'TaskGet', input: {} }] } }],
    save: (next: unknown, expected: string, live: () => boolean) => store.saveBuiltinContextLedger(id, id, next, live, undefined, expected),
    adopt: () => {},
  };
  const first = await inspectRecoveryActions(deps);
  const reviewed = await reconcileRecoveryAction({ ...deps.owner, ledgerDigest: first.ledgerDigest, actionHash: taskHash }, deps);
  expect(reviewed.resolvedCount).toBe(1);
  const persisted = store.loadBuiltinContextLedger(id, id) as { uncertain: string[]; readonlyTasks?: unknown[] };
  expect(persisted.uncertain).toEqual(ledger.uncertain);
  expect(persisted.readonlyTasks).toHaveLength(1);
  await expect(store.saveBuiltinContextLedger(id, id, ledger, () => true, undefined, first.ledgerDigest)).rejects.toThrow('ledger changed');
  expect(store.loadBuiltinContextLedger(id, id)).toEqual(persisted);
  await expect(store.saveBuiltinContextLedger(id, id, ledger, () => true, () => false, recoveryLedgerDigest(persisted))).rejects.toThrow('owner changed');
  await store.getActiveSessionTranscript(id)?.revoke();
  vi.resetModules(); store = await import('../SessionStore');
  const options = { initialLedger: store.loadBuiltinContextLedger(id, id), recoveryOwner: deps.owner,
    scope: () => 'new-turn', isActive: () => true, protectStreaming: true, backup: async () => 'fixture',
    persistLedger: (value: unknown) => store.saveBuiltinContextLedger(id, id, value, () => true) };
  const restored = new ContextRecoveryController(options);
  expect(restored.inspectActionLedger().uncertainCount).toBe(1);
  const request: AnthropicRequest = { model: 'fixture', max_tokens: 64, stream: true,
    messages: [{ role: 'assistant', content: [{ type: 'tool_use', id: 'task-read', name: 'TaskGet', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'task-read', is_error: true, content: 'invalid input' }] },
      { role: 'user', content: 'Explicit read-only follow-up' }] };
  await restored.protectInference(request, true);
  expect(restored.beforeTool('TaskGet', {})).toBeUndefined();
  expect(restored.beforeTool('Write', { file_path: '/fixture' })).toContain('read-only');
  expect(restored.canRetryInference()).toBe(false);
  expect((store.loadBuiltinContextLedger(id, id) as { readonlyTasks?: unknown[] }).readonlyTasks).toEqual(persisted.readonlyTasks);
  // A legacy reader ignores the new receipt field; original uncertainty survives rollback.
  const { readonlyTasks: _audit, operationAttempts: _attempts, ...legacy } = store.loadBuiltinContextLedger(id, id) as Record<string, unknown>;
  const rollback = new ContextRecoveryController({ ...options, initialLedger: legacy });
  expect(rollback.inspectActionLedger().uncertainCount).toBe(2);
});

it('persists per-attempt outcomes for identical actions and preserves an unfinished peer across Store restart', async () => {
  const transcript = await store.loadSessionTranscript(id);
  expect((await store.appendSessionMessages(id, transcript.cursor, [{ id: 'attempt-fixture', role: 'user',
    content: 'Controlled journal test', timestamp: new Date().toISOString() }])).ok).toBe(true);
  const owner = { sessionId: id, sdkSessionId: id };
  const options = { scope: () => 'fixture-attempt-turn', isActive: () => true, recoveryOwner: owner,
    backup: (request: AnthropicRequest, metadata: { digest: string; scope: string }) =>
      store.archiveBuiltinContextRequest(id, request, metadata, () => true),
    persistLedger: (ledger: unknown, guard?: () => boolean) => store.saveBuiltinContextLedger(id, id, ledger, () => true, guard) };
  // Streaming write-ahead protection, without enabling recovery/replay of a normal explicit call.
  const controller = new ContextRecoveryController({ ...options, protectStreaming: true });
  controller.bindNoDispatchOwner({ ...owner, queryGeneration: 1, isCurrent: () => true });
  const body: AnthropicRequest = { model: 'fixture', max_tokens: 64, stream: true, messages: [{ role: 'user', content: 'fixture' }] };
  await (await controller.run(new Request('http://127.0.0.1/fixture'), body, async () => new Response(
    'event: message_stop\ndata: {"type":"message_stop"}\n\n', { headers: { 'content-type': 'text/event-stream' } }))).text();
  const input = { record: 'same' };
  expect(await controller.authorizeTool('fixture_write', input, 'attempt-a')).toBeUndefined();
  expect(await controller.authorizeTool('fixture_write', input, 'attempt-b')).toBeUndefined();
  await controller.commitToolResult('fixture_write', input, { receipt: 'a' }, false, 'attempt-a');
  const disk = store.loadBuiltinContextLedger(id, id);
  expect(controller.inspectActionLedger().operationAttempts.map(a => a.status)).toEqual(['returned', 'reserved']);
  await store.getActiveSessionTranscript(id)?.revoke();
  vi.resetModules(); store = await import('../SessionStore');
  expect(store.loadBuiltinContextLedger(id, id)).toEqual(disk);
  const restored = new ContextRecoveryController({ ...options, initialLedger: store.loadBuiltinContextLedger(id, id) });
  restored.bindNoDispatchOwner({ ...owner, queryGeneration: 1, isCurrent: () => true });
  await restored.commitToolResult('fixture_write', input, { receipt: 'old late b' }, false, 'attempt-b');
  expect(restored.inspectActionLedger().uncertainCount).toBe(1);
  expect(store.loadBuiltinContextLedger(id, id)).toEqual(disk);
  await restored.protectInference(body, true);
  expect(restored.beforeTool('fixture_write', input)).toContain('read-only');
});

it('persists compacted settled identities and a new pending reservation through the real Store cold path', async () => {
  const transcript = await store.loadSessionTranscript(id);
  expect((await store.appendSessionMessages(id, transcript.cursor, [{ id: 'retention-fixture', role: 'user',
    content: 'Controlled settled-query rollover', timestamp: new Date().toISOString() }])).ok).toBe(true);
  const owner = { sessionId: id, sdkSessionId: id };
  const input = { fixture: 'settled-query-rollover' };
  const actionHash = recoveryActionHash('fixture_write', input);
  const journal = new NativeOperationJournal();
  const queryEpoch = randomUUID();
  for (let i = 0; i < 2048; i++) {
    const attempt = journal.reserve({ ...owner, queryEpoch, queryGeneration: 1, scope: 'old-turn',
      toolUseId: `old-${i}`, toolName: 'fixture_write', actionHash });
    journal.complete(attempt, 'success', 'a'.repeat(64));
  }
  await store.saveBuiltinContextLedger(id, id, { version: 1, completed: [], uncertain: [], denied: [], blocked: false,
    projectionActive: false, streamArmedOnly: true, operationAttempts: journal.serialize() }, () => true);
  await store.getActiveSessionTranscript(id)?.revoke();
  vi.resetModules(); store = await import('../SessionStore');
  const options = { recoveryOwner: owner, scope: () => 'new-turn', isActive: () => true,
    backup: async () => 'fixture', initialLedger: store.loadBuiltinContextLedger(id, id),
    persistLedger: (ledger: unknown, guard?: () => boolean) => store.saveBuiltinContextLedger(id, id, ledger, () => true, guard) };
  const controller = new ContextRecoveryController(options);
  controller.bindNoDispatchOwner({ ...owner, queryGeneration: 2, isCurrent: () => true });
  expect(await controller.authorizeTool('fixture_write', input, 'new-work')).toBeUndefined();
  const saved = store.loadBuiltinContextLedger(id, id) as { uncertain: string[]; operationAttempts: NativeOperationJournalData };
  expect(saved.uncertain).toEqual([actionHash]);
  expect(saved.operationAttempts.version).toBe(2);
  expect(saved.operationAttempts.retired?.hashes).toEqual([createHash('sha256').update('old-0').digest('hex')]);
  expect(saved.operationAttempts.entries).toHaveLength(2048);
  expect(saved.operationAttempts.entries.at(-1)?.status).toBe('reserved');
  await store.getActiveSessionTranscript(id)?.revoke();
  vi.resetModules(); store = await import('../SessionStore');
  const disk = store.loadBuiltinContextLedger(id, id);
  expect(disk).toEqual(saved);
  const cold = new ContextRecoveryController({ ...options, initialLedger: disk });
  cold.bindNoDispatchOwner({ ...owner, queryGeneration: 3, isCurrent: () => true });
  expect(await cold.authorizeTool('fixture_write', input, 'old-0')).toContain('already reserved');
  await cold.commitToolResult('fixture_write', input, 'late success', false, 'new-work');
  expect(cold.inspectActionLedger().uncertainCount).toBe(1);
  expect(store.loadBuiltinContextLedger(id, id)).toEqual(saved);
});
