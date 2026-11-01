import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionEngine } from './types';
import type { SessionTaskAction, SessionTaskAttempt } from '../../shared/sessionTaskOrchestration';

const state = vi.hoisted(() => ({ home: '', broadcasts: vi.fn() }));
vi.mock('os', async original => ({ ...await original<typeof import('os')>(), homedir: () => state.home }));
vi.mock('../sse', () => ({ broadcast: state.broadcasts }));
let store: typeof import('../SessionStore');
let owner: typeof import('./task-orchestration');
let id: string;
let engine: SessionEngine;
const attempt = (status: 'running' | 'completed', ordinal = 1): SessionTaskAttempt => ({
  id: `launch:activation-${ordinal}`, toolUseId: 'launch', title: 'Controlled execution', executionVerified: true,
  executionTaskId: 'native-child', runId: `run-${ordinal}`,
  lifecycle: { status, startedAt: ordinal * 1000, activation: { id: `activation-${ordinal}`, ordinal, state: status } },
});
beforeEach(async () => {
  state.home = await mkdtemp(join(process.cwd(), '.tmp-orchestration-'));
  vi.resetModules(); state.broadcasts.mockClear();
  store = await import('../SessionStore'); owner = await import('./task-orchestration');
  const metadata = await store.createSession('/synthetic-workspace'); id = metadata.id;
  store.getActiveSessionTranscript(id)!.writer.observe({ kind: 'message-create', message: { id: 'user', role: 'user', content: '按此方案做', timestamp: new Date().toISOString() } });
  await store.flushSessionTranscriptsForUpdate();
  engine = { kind: 'builtin', getCurrentSessionContext: () => ({ sessionId: id, workspacePath: '/synthetic-workspace' }), hasQueuedTurnOwnedBy: () => false, getRuntimeIdentity: () => ({ sessionId: id }), getLiveSessionOverlay: () => ({ isActive: true }), getLiveSessionState: () => ({ sessionState: 'running', backgroundWork: { active: [{ taskId: 'native-child', runId: store.getSessionMetadata(id)?.taskOrchestration?.attempts.at(-1)?.runId }] } }) } as unknown as SessionEngine;
  engine.sendDesktopMessage = vi.fn(async request => { const check = await request.beforeDispatch!(); return { success: check.accepted, dispatchAcceptance: Promise.resolve({ accepted: check.accepted }) }; });
  await owner.mutateSessionPlan(engine, id, { kind: 'propose', proposalId: 'fixture-plan', expectedRevision: 0, content: { objective: 'Controlled outcome', scope: 'Fixture only', steps: [{ id: 'work', title: 'Verified outcome' }], acceptanceCriteria: ['Behavior verified'] } });
  await owner.actOnSessionPlan(engine, { kind: 'confirm', sessionId: id, proposalId: 'fixture-plan', expectedRevision: 1, requestId: 'fixture-request' });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await store.getActiveSessionTranscript(id)?.revoke();
  await rm(state.home, { recursive: true, force: true });
});
async function mutate(action: Omit<Extract<SessionTaskAction, { kind: 'ensure' }>, 'expectedRevision'> | Omit<Extract<SessionTaskAction, { kind: 'bind' }>, 'expectedRevision'> | Omit<Extract<SessionTaskAction, { kind: 'review' }>, 'expectedRevision'>) {
  const snapshot = await owner.readSessionTasks(engine);
  return owner.mutateSessionTasks(engine, id, { ...action, expectedRevision: snapshot.ledger.revision } as SessionTaskAction);
}
async function returned() {
  await mutate({ kind: 'ensure', taskId: 'work', title: 'Verified outcome' });
  await owner.observeSessionTasks(id, { attempts: [attempt('completed')] });
  await mutate({ kind: 'bind', taskId: 'work', toolUseId: 'launch' });
}
async function prepareReview() {
  await returned();
  return mutate({ kind: 'review', taskId: 'work', attemptId: 'launch:activation-1', decision: 'accept', evidence: 'Independent behavior verified' });
}
function rootTool(receipt: string, root = true) {
  const intent = store.getSessionMetadata(id)?.taskOrchestration?.reviewIntents?.find(intent => intent.id === receipt);
  return { id: 'root-review-tool', name: 'Bash', root, input: { command: `myagents session tasks --json --data '${JSON.stringify(intent?.action)}'` }, output: JSON.stringify({ success: true, taskReviewReceipt: receipt }) };
}
describe('durable Session task owner', () => {
  it('confirms a large-ledger review from the bounded route receipt rather than a later file read', async () => {
    await returned();
    await owner.mutateSessionTaskLedger(id, ledger => ({ ...ledger, tasks: [...ledger.tasks,
      ...Array.from({ length: 70 }, (_, index) => ({ id: `historical-${index}`, title: 'Historical task '.repeat(100), blockedBy: [] })),
    ] }));
    const action = { kind: 'review' as const, taskId: 'work', attemptId: 'launch:activation-1', decision: 'accept' as const,
      evidence: 'Independent behavior verified', expectedRevision: store.getSessionMetadata(id)!.taskOrchestration!.revision };
    vi.doMock('../session-engine', () => ({ getSessionEngine: () => engine }));
    try {
      const { handleSessionTaskCommand } = await import('../routes/session-task-orchestration');
      const result = await handleSessionTaskCommand({ ...action, sessionId: id });
      const stdout = Buffer.from(JSON.stringify(result, null, 2)).subarray(0, 32768).toString();
      expect(result.success).toBe(true);
      expect((await owner.readSessionTasks(engine)).ledger.reviews).toHaveLength(0);
      await owner.confirmSessionTaskReviewFromRootTool(id, { id: 'bounded-review', name: 'Bash', root: true,
        input: { command: `myagents session tasks --json --data '${JSON.stringify(action)}'` }, output: { stdout } });
      expect((await owner.readSessionTasks(engine)).ledger.reviews).toMatchObject([{ rootToolUseId: 'bounded-review' }]);
      expect((await owner.readSessionTasks(engine)).tasks.find(task => task.id === 'work')?.phase).toBe('completed');
    } finally {
      vi.doUnmock('../session-engine');
    }
  });

  it('does not publish historical root plan progress as live execution after Stop', async () => {
    const current = store.getSessionMetadata(id)!.taskOrchestration!;
    await store.updateSessionMetadata(id, { taskOrchestration: { ...current,
      plan: [{ key: 'work', content: 'Verify change', activeForm: 'Verifying change', status: 'in_progress' }] } });
    engine.getLiveSessionState = () => ({ sessionState: 'idle', isBusy: false });
    const stopped = await owner.readSessionTasks(engine);
    expect(stopped.tasks.find(task => task.id === 'work')?.phase).toBe('interrupted');
    expect(stopped.ledger.plan?.[0].status).toBe('in_progress');
    engine.getLiveSessionState = () => ({ sessionState: 'running', isBusy: true });
    expect((await owner.readSessionTasks(engine)).tasks.find(task => task.id === 'work')?.phase).toBe('running');
  });

  it('keeps a CLI review pending until the trusted root tool completion', async () => {
    const pending = await prepareReview();
    expect(pending.pendingMainAgentReview).toBe(true);
    expect(pending.tasks.find(t => t.id === 'work')?.phase).toBe('awaiting_review');
    await owner.confirmSessionTaskReviewFromRootTool(id, rootTool(pending.taskReviewReceipt!, false));
    expect((await owner.readSessionTasks(engine)).ledger.reviews).toHaveLength(0);
    await owner.confirmSessionTaskReviewFromRootTool(id, rootTool(pending.taskReviewReceipt!));
    const accepted = await owner.readSessionTasks(engine);
    expect(accepted.tasks.find(t => t.id === 'work')?.phase).toBe('completed');
    expect(accepted.ledger.reviews[0].rootToolUseId).toBe('root-review-tool');
  });
  it('does not accept a copied child receipt from a read or failed shell tool', async () => {
    const pending = await prepareReview();
    await owner.confirmSessionTaskReviewFromRootTool(id, { ...rootTool(pending.taskReviewReceipt!), input: { command: 'cat child-report.txt' } });
    await owner.confirmSessionTaskReviewFromRootTool(id, { ...rootTool(pending.taskReviewReceipt!), isError: true });
    expect((await owner.readSessionTasks(engine)).ledger.reviews).toEqual([]);
  });
  it('rejects an unrelated root review action carrying another pending receipt', async () => {
    const pending = await prepareReview();
    const tool = rootTool(pending.taskReviewReceipt!);
    const action = store.getSessionMetadata(id)!.taskOrchestration!.reviewIntents![0].action;
    tool.input.command = `myagents session tasks --data '${JSON.stringify({ ...action, taskId: "other-task" })}'`;
    await owner.confirmSessionTaskReviewFromRootTool(id, tool);
    expect((await owner.readSessionTasks(engine)).ledger.reviews).toEqual([]);
  });
  it('rejects old Query ownership even if the root receipt and action match', async () => {
    const pending = await prepareReview();
    await owner.confirmSessionTaskReviewFromRootTool(id, { ...rootTool(pending.taskReviewReceipt!), isCurrent: () => false });
    expect((await owner.readSessionTasks(engine)).ledger.reviews).toEqual([]);
  });
  it('handles native shell JSON envelopes and duplicate root completion idempotently', async () => {
    const pending = await prepareReview();
    const tool = rootTool(pending.taskReviewReceipt!);
    tool.output = JSON.stringify({ stdout: tool.output, exitCode: 0 });
    await owner.confirmSessionTaskReviewFromRootTool(id, tool);
    await owner.confirmSessionTaskReviewFromRootTool(id, tool);
    expect((await owner.readSessionTasks(engine)).ledger.reviews).toHaveLength(1);
  });
  it('rejects a review if a new attempt started before root confirmation', async () => {
    const pending = await prepareReview();
    await owner.observeSessionTasks(id, { attempts: [attempt('running', 2)] });
    await expect(owner.confirmSessionTaskReviewFromRootTool(id, rootTool(pending.taskReviewReceipt!))).rejects.toThrow('TASK_ATTEMPT_CHANGED');
    expect((await owner.readSessionTasks(engine)).tasks.find(t => t.id === 'work')?.phase).toBe('running');
  });
  it('restores accepted tasks, precise attempts and review evidence from the actual SessionStore after restart', async () => {
    const pending = await prepareReview();
    await owner.confirmSessionTaskReviewFromRootTool(id, rootTool(pending.taskReviewReceipt!));
    await store.getActiveSessionTranscript(id)?.revoke();
    vi.resetModules(); store = await import('../SessionStore'); owner = await import('./task-orchestration');
    const restored = await owner.readSessionTasks(engine);
    expect(restored.tasks.find(t => t.id === 'work')?.phase).toBe('completed');
    expect(restored.ledger.bindings.launch).toBe('work');
    expect(restored.ledger.reviews[0].evidence).toContain('Independent');
  });
  it('restores a persisted native plan without needing another plan event', async () => {
    await owner.observeSessionTasks(id, { plan: [{ key: 'work', content: 'Do work', status: 'completed', activeForm: 'Doing work' }] });
    await store.getActiveSessionTranscript(id)?.revoke();
    vi.resetModules(); store = await import('../SessionStore'); owner = await import('./task-orchestration');
    expect((await owner.readSessionTasks(engine)).tasks.find(task => task.id === 'work')?.phase).toBe('awaiting_review');
  });
  it('does not revive persisted running records when the execution owner is inactive', async () => {
    await owner.observeSessionTasks(id, { attempts: [attempt('running')] });
    engine.getLiveSessionState = () => ({ sessionState: 'idle' }) as never;
    const restored = await owner.readSessionTasks(engine);
    expect(restored.tasks.find(task => task.id === 'agent:launch')?.phase).toBe('unknown');
  });
  it('allows a new explicit retry binding after the old running attempt lost its owner', async () => {
    await mutate({ kind: 'ensure', taskId: 'work', title: 'Retry safely' });
    await owner.observeSessionTasks(id, { attempts: [attempt('running')] });
    await mutate({ kind: 'bind', taskId: 'work', toolUseId: 'launch' });
    engine.getLiveSessionState = () => ({ sessionState: 'idle' }) as never;
    const next = { ...attempt('running', 2), id: 'retry:activation-2', toolUseId: 'retry' };
    await owner.observeSessionTasks(id, { attempts: [next] });
    const bound = await mutate({ kind: 'bind', taskId: 'work', toolUseId: 'retry' });
    expect(bound.ledger.currentTools?.work).toBe('retry');
    expect(bound.ledger.attempts.find(a => a.id === 'launch:activation-1')?.executionVerified).toBe(false);
  });
  it('recomputes an observation after a real CAS publication conflict', async () => {
    const conflict = vi.spyOn(store, 'updateSessionMetadata').mockResolvedValueOnce(null);
    await owner.observeSessionTasks(id, { attempts: [attempt('completed')] });
    expect(conflict).toHaveBeenCalledTimes(2);
    expect((await owner.readSessionTasks(engine)).tasks.find(task => task.id === 'agent:launch')?.phase).toBe('awaiting_review');
  });
  it('preserves the last durable ledger and does not publish a fake success when persistence fails', async () => {
    await returned();
    const prior = JSON.stringify(store.getSessionMetadata(id)?.taskOrchestration);
    state.broadcasts.mockClear();
    const blocked = vi.spyOn(store, 'updateSessionMetadata').mockResolvedValue(null);
    await expect(owner.observeSessionTasks(id, { attempts: [attempt('running', 2)] })).rejects.toThrow('TASK_PERSISTENCE_CONFLICT');
    expect(blocked).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(store.getSessionMetadata(id)?.taskOrchestration)).toBe(prior);
    expect(state.broadcasts).not.toHaveBeenCalled();
  });
  it('isolates session changes and retains unrelated metadata fields', async () => {
    await store.updateSessionMetadata(id, { title: 'User title' });
    await returned();
    expect(store.getSessionMetadata(id)?.title).toBe('User title');
    await expect(owner.mutateSessionTasks(engine, 'different-session', { kind: 'ensure', taskId: 'work', title: 'Wrong', expectedRevision: 0 })).rejects.toThrow('TASK_SESSION_CHANGED');
  });
});

describe('human plan confirmation in the durable Session ledger', () => {
  const content = { objective: 'Verified delivery', scope: 'Controlled task scope', steps: [{ id: 'work', title: 'Verify the outcome' }], acceptanceCriteria: ['Evidence passes'] };
  async function draft() {
    await store.updateSessionMetadata(id, { taskOrchestration: { revision: 0, tasks: [], bindings: {}, attempts: [], reviews: [] } });
    return owner.mutateSessionPlan(engine, id, { kind: 'propose', proposalId: 'plan', expectedRevision: 0, content });
  }
  async function humanMessage(messageId = 'human-confirm') {
    await owner.recordSessionPlanHumanInput(id, messageId, '按此方案做', { proposalId: 'plan', expectedRevision: 1 });
    store.getActiveSessionTranscript(id)!.writer.observe({ kind: 'message-create', message: { id: messageId, role: 'user', content: '按此方案做', timestamp: new Date().toISOString(), metadata: { source: 'desktop', clientRequestId: messageId } } });
    await store.flushSessionTranscriptsForUpdate();
    return messageId;
  }
  function action(requestId = '00000000-0000-4000-8000-000000000001') {
    return { kind: 'confirm' as const, sessionId: id, proposalId: 'plan', expectedRevision: 1, requestId };
  }
  function dispatchingEngine() {
    const send = vi.fn(async (request: Parameters<SessionEngine['sendDesktopMessage']>[0]) => {
      const checked = await request.beforeDispatch!();
      const committed = checked.validateAtCommit?.() ?? checked;
      return { success: committed.accepted, error: committed.accepted ? undefined : committed.error, dispatchAcceptance: Promise.resolve({ accepted: committed.accepted }) };
    });
    engine.sendDesktopMessage = send;
    return send;
  }
  it('tracks and explicitly binds native work without manufacturing a human proposal', async () => {
    await store.updateSessionMetadata(id, { taskOrchestration: { revision: 0, tasks: [], bindings: {}, attempts: [], reviews: [] } });
    expect(owner.canSessionDelegateSubagents(id)).toBe(true);
    await mutate({ kind: 'ensure', taskId: 'native-work', title: 'Original authorized work' });
    await owner.observeSessionTasks(id, { attempts: [attempt('completed')] });
    const bound = await mutate({ kind: 'bind', taskId: 'native-work', toolUseId: 'launch' });
    expect(bound.ledger.proposal).toBeUndefined();
    expect(bound.ledger.bindings.launch).toBe('native-work');
    expect(bound.tasks.find(task => task.id === 'native-work')?.phase).toBe('awaiting_review');
  });
  it('keeps native task tracking usable beside a pending proposal without materializing reserved steps', async () => {
    await draft();
    await mutate({ kind: 'ensure', taskId: 'native-work', title: 'Existing task' });
    await owner.observeSessionTasks(id, { attempts: [attempt('completed')] });
    const bound = await mutate({ kind: 'bind', taskId: 'native-work', toolUseId: 'launch' });
    expect(bound.ledger.bindings.launch).toBe('native-work');
    expect(bound.ledger.tasks.find(task => task.id === 'native-work')?.proposalId).toBeUndefined();
    await expect(mutate({ kind: 'ensure', taskId: 'work', title: 'Cannot steal proposal step' })).rejects.toThrow('PLAN_CONFIRMATION_REQUIRED');
    expect(owner.canSessionDelegateSubagents(id, { queueId: 'native-queue', owner: { kind: 'task', id: 'native-task' } })).toBe(true);
    expect(owner.canSessionDelegateSubagents(id)).toBe(false);
  });
  it('rejects origin stamping when the original turn changes during a proposal read', async () => {
    await store.updateSessionMetadata(id, { taskOrchestration: { revision: 0, tasks: [], bindings: {}, attempts: [], reviews: [] } });
    let queueId = 'original-turn';
    engine.getExecutionTurnId = () => queueId;
    engine.getCurrentTurnIdentity = () => ({ queueId, owner: { kind: 'task', id: 'original-task' } });
    engine.getLiveSessionOverlay = () => { queueId = 'different-turn'; return { isActive: true }; };
    await expect(owner.mutateSessionPlan(engine, id, { kind: 'propose', proposalId: 'raced-plan', expectedRevision: 0, content })).rejects.toThrow('TASK_TURN_CHANGED');
    expect(store.getSessionMetadata(id)!.taskOrchestration!.proposal).toBeUndefined();
  });
  it('stamps the original Goal owner and does not let it bypass its own new draft', async () => {
    engine.getCurrentTurnIdentity = () => ({ queueId: 'goal-input', owner: { kind: 'goal', id: 'goal' } });
    engine.getExecutionTurnId = () => 'goal-input';
    await draft();
    const scope = { queueId: 'goal-next', owner: { kind: 'goal' as const, id: 'goal' } };
    expect(owner.canSessionDelegateSubagents(id, scope)).toBe(false);
    expect(owner.canSessionDelegateSubagents(id, { queueId: 'task', owner: { kind: 'task', id: 'other' } })).toBe(true);
    await owner.mutateSessionPlan(engine, id, { kind: 'revise', proposalId: 'plan', expectedRevision: 1,
      content: { ...content, scope: 'Updated goal scope' }, changes: ['Scope changed'] });
    expect(owner.canSessionDelegateSubagents(id, scope)).toBe(false);
  });
  it('retains plan queue classification after revision and a cold metadata reload', async () => {
    await draft(); dispatchingEngine(); await owner.actOnSessionPlan(engine, action());
    const queueId = store.getSessionMetadata(id)!.taskOrchestration!.planStart!.queueId;
    expect(queueId).toMatch(/^session-plan:/);
    const turn = { queueId, owner: { kind: 'task' as const, id: queueId } };
    expect(owner.canSessionDelegateSubagents(id, turn)).toBe(true);
    await owner.mutateSessionPlan(engine, id, { kind: 'revise', proposalId: 'plan', expectedRevision: 1,
      content: { ...content, scope: 'New scope' }, changes: ['Changed scope'] });
    expect(owner.canSessionDelegateSubagents(id, turn)).toBe(false);
    await store.getActiveSessionTranscript(id)?.revoke();
    vi.resetModules(); store = await import('../SessionStore'); owner = await import('./task-orchestration');
    expect(owner.canSessionDelegateSubagents(id, turn)).toBe(false);
  });
  it('stores an editable proposal without creating formal tasks or enabling delegation', async () => {
    const proposed = await draft();
    expect(proposed.ledger.tasks).toEqual([]);
    expect(owner.canSessionDelegateSubagents(id)).toBe(false);
    await expect(owner.mutateSessionTasks(engine, id, { kind: 'ensure', taskId: 'work', title: 'Premature', expectedRevision: proposed.ledger.revision })).rejects.toThrow('PLAN_CONFIRMATION_REQUIRED');
  });
  it('binds a human button receipt to the exact revision and starts once through the original queue guard', async () => {
    await draft(); const send = dispatchingEngine();
    await Promise.all([owner.actOnSessionPlan(engine, action()), owner.actOnSessionPlan(engine, action())]);
    await owner.actOnSessionPlan(engine, action('00000000-0000-4000-8000-000000000002'));
    expect(send).toHaveBeenCalledTimes(1);
    const ledger = store.getSessionMetadata(id)!.taskOrchestration!;
    expect(ledger.proposal?.confirmation).toMatchObject({ source: 'button', evidenceId: action().requestId, revision: 1 });
    expect(ledger.tasks).toHaveLength(1);
    expect(ledger.tasks[0]).toMatchObject({ id: 'work', proposalId: 'plan', proposalRevision: 1 });
    expect(owner.canSessionDelegateSubagents(id)).toBe(true);
    expect(ledger.planStart?.state).toBe('dispatched');
  });
  it('wakes the original root once to discuss revision feedback without creating tasks or granting delegation', async () => {
    await draft(); const send = dispatchingEngine();
    const feedback = { ...action(), kind: 'request_revision' as const, feedback: 'Narrow the scope before execution' };
    await owner.actOnSessionPlan(engine, feedback);
    await owner.actOnSessionPlan(engine, feedback);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].text).toContain('Narrow the scope before execution');
    const ledger = store.getSessionMetadata(id)!.taskOrchestration!;
    expect(ledger.tasks).toEqual([]);
    expect(ledger.proposal?.state).toBe('revising');
    expect(ledger.planStart?.purpose).toBe('revision');
    expect(owner.canSessionDelegateSubagents(id)).toBe(false);
    await owner.mutateSessionPlan(engine, id, { kind: 'revise', proposalId: 'plan', expectedRevision: 1, content: { ...content, scope: 'Narrowed' }, changes: ['Scope narrowed'] });
    expect(owner.canSessionDelegateSubagents(id)).toBe(false);
    await owner.actOnSessionPlan(engine, { ...action('00000000-0000-4000-8000-000000000006'), expectedRevision: 2 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(store.getSessionMetadata(id)?.taskOrchestration?.tasks).toHaveLength(1);
  });
  it('rejects request reuse with changed content and stale revision after revision discussion', async () => {
    await draft(); dispatchingEngine();
    const revision = { ...action(), kind: 'request_revision' as const, feedback: 'Tighten scope' };
    await owner.actOnSessionPlan(engine, revision);
    await expect(owner.actOnSessionPlan(engine, action())).rejects.toThrow('PLAN_REQUEST_CONFLICT');
    const revised = await owner.mutateSessionPlan(engine, id, { kind: 'revise', proposalId: 'plan', expectedRevision: 1, content: { ...content, scope: 'Tighter' }, changes: ['Scope narrowed'] });
    expect(revised.ledger.proposal?.revision).toBe(2);
    await expect(owner.actOnSessionPlan(engine, action('00000000-0000-4000-8000-000000000003'))).rejects.toThrow('PLAN_REVISION_CHANGED');
    expect(owner.canSessionDelegateSubagents(id)).toBe(false);
    expect(revised.ledger.tasks).toEqual([]);
  });
  it('uses actual direct user-message evidence and does not treat model or quoted messages as confirmation', async () => {
    await draft();
    const writer = store.getActiveSessionTranscript(id)!.writer;
    writer.observe({ kind: 'message-create', message: { id: 'assistant-claim', role: 'assistant', content: '按此方案做', timestamp: new Date().toISOString() } });
    writer.observe({ kind: 'message-create', message: { id: 'quoted', role: 'user', content: '例如“按此方案做”', timestamp: new Date().toISOString() } });
    await store.flushSessionTranscriptsForUpdate();
    for (const messageId of ['assistant-claim', 'quoted', 'missing']) await expect(owner.mutateSessionPlan(engine, id, { kind: 'confirm_from_message', proposalId: 'plan', expectedRevision: 1, messageId })).rejects.toThrow('PLAN_HUMAN_CONFIRMATION_REQUIRED');
    const messageId = await humanMessage();
    const accepted = await owner.mutateSessionPlan(engine, id, { kind: 'confirm_from_message', proposalId: 'plan', expectedRevision: 1, messageId });
    expect(accepted.ledger.proposal?.confirmation?.source).toBe('user_message');
    expect(accepted.ledger.tasks).toHaveLength(1);
    // Continuation is addressed through the original queue, never a new executor.
    await vi.waitFor(() => expect(store.getSessionMetadata(id)?.taskOrchestration?.planStart?.state).toBe('dispatched'));
  });
  it('requires a fresh human confirmation for changed scope and invalidates only affected tasks', async () => {
    await draft();
    const messageId = await humanMessage();
    await owner.mutateSessionPlan(engine, id, { kind: 'confirm_from_message', proposalId: 'plan', expectedRevision: 1, messageId });
    const revised = await owner.mutateSessionPlan(engine, id, { kind: 'revise', proposalId: 'plan', expectedRevision: 1, content: { ...content, steps: [{ id: 'work', title: 'Changed outcome' }] }, changes: ['Different deliverable'] });
    expect(revised.tasks[0].phase).toBe('blocked');
    expect(owner.canSessionDelegateSubagents(id)).toBe(false);
    await expect(owner.mutateSessionPlan(engine, id, { kind: 'confirm_from_message', proposalId: 'plan', expectedRevision: 2, messageId })).rejects.toThrow('PLAN_CONFIRMATION_ALREADY_USED');
    dispatchingEngine();
    const accepted = await owner.actOnSessionPlan(engine, { ...action(), expectedRevision: 2 });
    expect(accepted.ledger.tasks[0].mainAttempt).toBe(1);
    expect(accepted.tasks[0].phase).toBe('pending');
  });
  it('restores the durable claim after a crash without replaying the confirmed work', async () => {
    await draft();
    const send = vi.fn(async (request: Parameters<SessionEngine['sendDesktopMessage']>[0]) => {
      await request.beforeDispatch!();
      return { success: true }; // Simulated crash before a trustworthy dispatch acknowledgement.
    });
    engine.sendDesktopMessage = send;
    await owner.actOnSessionPlan(engine, action());
    expect(store.getSessionMetadata(id)?.taskOrchestration?.planStart?.state).toBe('claimed');
    await store.getActiveSessionTranscript(id)?.revoke();
    vi.resetModules(); store = await import('../SessionStore'); owner = await import('./task-orchestration');
    await owner.actOnSessionPlan(engine, action());
    expect(send).toHaveBeenCalledTimes(1);
    expect(owner.canSessionDelegateSubagents(id)).toBe(false);
    const ledger = store.getSessionMetadata(id)!.taskOrchestration!;
    await store.updateSessionMetadata(id, { taskOrchestration: { ...ledger, planStart: { ...ledger.planStart!, claimId: undefined } } });
    engine.getLiveSessionState = () => ({ sessionState: 'idle' }) as never;
    expect(owner.canSessionDelegateSubagents(id)).toBe(false);
    expect((await owner.readSessionTasks(engine)).ledger.planStart?.error).toBe('PLAN_START_RECOVERY_REQUIRES_REVIEW');
  });
  it('does not let the planning turn delegate before original-queue admission, and releases only a proven non-dispatch', async () => {
    await draft();
    let request: Parameters<SessionEngine['sendDesktopMessage']>[0] | undefined;
    engine.sendDesktopMessage = vi.fn(async incoming => { request = incoming; return { success: true, queued: true }; });
    await owner.actOnSessionPlan(engine, action());
    expect(owner.canSessionDelegateSubagents(id)).toBe(false);
    expect((await request!.beforeDispatch!()).accepted).toBe(true);
    expect((await request!.beforeDispatch!()).accepted).toBe(true);
    expect(owner.canSessionDelegateSubagents(id)).toBe(true);
    await request!.beforeDispatch!.cancel!();
    expect(store.getSessionMetadata(id)?.taskOrchestration?.planStart?.state).toBe('pending');
    expect(owner.canSessionDelegateSubagents(id)).toBe(false);
    const send = dispatchingEngine();
    await owner.actOnSessionPlan(engine, action());
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('rejects approval with extra constraints, no reviewed target or a stale reviewed revision', async () => {
    await draft();
    for (const text of ['按这个方案做，但先等我通知再开始', '按此方案做，先只做第一步']) {
      await owner.recordSessionPlanHumanInput(id, text, text, { proposalId: 'plan', expectedRevision: 1 });
    }
    await owner.recordSessionPlanHumanInput(id, 'no-target', '按此方案做');
    await owner.recordSessionPlanHumanInput(id, 'old-target', '按此方案做', { proposalId: 'plan', expectedRevision: 0 });
    expect(store.getSessionMetadata(id)?.taskOrchestration?.humanInputs).toBeUndefined();
  });
  it('invalidates prior acceptance when global scope changes and retires removed steps', async () => {
    await draft(); dispatchingEngine(); await owner.actOnSessionPlan(engine, action());
    const pending = await mutate({ kind: 'review', taskId: 'work', attemptId: 'main', decision: 'accept', evidence: 'Actual behavior passed' });
    await owner.confirmSessionTaskReviewFromRootTool(id, rootTool(pending.taskReviewReceipt!));
    expect((await owner.readSessionTasks(engine)).tasks[0].phase).toBe('completed');
    await owner.mutateSessionPlan(engine, id, { kind: 'revise', proposalId: 'plan', expectedRevision: 1, content: { ...content, scope: 'Changed total scope' }, changes: ['Scope changed'] });
    await owner.actOnSessionPlan(engine, { ...action('00000000-0000-4000-8000-000000000003'), expectedRevision: 2 });
    const next = await owner.readSessionTasks(engine);
    expect(next.tasks[0].phase).toBe('pending');
    expect(next.ledger.reviews).toHaveLength(1);
    await owner.mutateSessionPlan(engine, id, { kind: 'revise', proposalId: 'plan', expectedRevision: 2, content: { ...content, steps: [{ id: 'replacement', title: 'Replacement' }] }, changes: ['Replaced step'] });
    await owner.actOnSessionPlan(engine, { ...action('00000000-0000-4000-8000-000000000004'), expectedRevision: 3 });
    const retired = await owner.readSessionTasks(engine);
    expect(retired.tasks.some(task => task.id === 'work')).toBe(false);
    await expect(owner.mutateSessionTasks(engine, id, { kind: 'ensure', taskId: 'work', title: 'Revive old work', expectedRevision: retired.ledger.revision })).rejects.toThrow('PLAN_TASK_RETIRED');
  });
  it('rejects old-session user actions before changing metadata or starting the queue', async () => {
    await draft(); const send = dispatchingEngine();
    await expect(owner.actOnSessionPlan(engine, { ...action(), sessionId: 'other' })).rejects.toThrow('TASK_SESSION_CHANGED');
    expect(send).not.toHaveBeenCalled();
    expect(store.getSessionMetadata(id)?.taskOrchestration?.proposal?.state).toBe('awaiting_confirmation');
  });
});

describe('Runtime plan support capability', () => {
  const content = { objective: 'Outcome', scope: 'New decision', steps: [{ id: 'new-work', title: 'New work' }], acceptanceCriteria: ['Verified'] };
  function external(runtime: string) {
    Object.defineProperty(engine, 'kind', { value: 'external', configurable: true });
    engine.getRuntimeIdentity = () => ({ sessionId: id, runtime }) as never;
  }
  it.each(['codex', 'claude-code', 'unknown'])('rejects same-turn propose on %s without changing any ledger field', async runtime => {
    await store.updateSessionMetadata(id, { taskOrchestration: { revision: 0, tasks: [], bindings: {}, attempts: [], reviews: [] } });
    external(runtime);
    const before = JSON.stringify(store.getSessionMetadata(id)!.taskOrchestration);
    await expect(owner.mutateSessionPlan(engine, id, { kind: 'propose', proposalId: 'new-plan', expectedRevision: 0, content })).rejects.toThrow('PLAN_RUNTIME_DELEGATION_UNAVAILABLE');
    expect(JSON.stringify(store.getSessionMetadata(id)!.taskOrchestration)).toBe(before);
  });
  it.each(['codex', 'claude-code'])('rejects same-turn revise and human plan actions on %s without changing receipts', async runtime => {
    external(runtime);
    const before = JSON.stringify(store.getSessionMetadata(id)!.taskOrchestration);
    await expect(owner.mutateSessionPlan(engine, id, { kind: 'revise', proposalId: 'fixture-plan', expectedRevision: 1, content, changes: ['New scope'] })).rejects.toThrow('PLAN_RUNTIME_DELEGATION_UNAVAILABLE');
    await expect(owner.mutateSessionPlan(engine, id, { kind: 'confirm_from_message', proposalId: 'fixture-plan', expectedRevision: 1, messageId: 'user' })).rejects.toThrow('PLAN_RUNTIME_DELEGATION_UNAVAILABLE');
    await expect(owner.actOnSessionPlan(engine, { kind: 'confirm', sessionId: id, proposalId: 'fixture-plan', expectedRevision: 1, requestId: 'unsupported' })).rejects.toThrow('PLAN_RUNTIME_DELEGATION_UNAVAILABLE');
    await expect(owner.actOnSessionPlan(engine, { kind: 'request_revision', sessionId: id, proposalId: 'fixture-plan', expectedRevision: 1, requestId: 'unsupported-revision', feedback: 'Change scope' })).rejects.toThrow('PLAN_RUNTIME_DELEGATION_UNAVAILABLE');
    expect(JSON.stringify(store.getSessionMetadata(id)!.taskOrchestration)).toBe(before);
  });
  it('reports ephemeral support without persisting it or discarding a cold unknown claim', async () => {
    const prior = store.getSessionMetadata(id)!.taskOrchestration!;
    await store.updateSessionMetadata(id, { taskOrchestration: { ...prior, planStart: { ...prior.planStart!, state: 'claimed', claimId: 'cold-unknown' } } });
    external('codex');
    const read = await owner.readSessionTasks(engine);
    expect(read).toMatchObject({ planSupport: { supported: false, runtime: 'codex', reason: 'PLAN_RUNTIME_DELEGATION_UNAVAILABLE' } });
    expect(read.ledger.planStart).toMatchObject({ state: 'claimed', claimId: 'cold-unknown' });
    expect(store.getSessionMetadata(id)!.taskOrchestration).not.toHaveProperty('planSupport');
  });
  it('rechecks runtime support inside the actual metadata CAS', async () => {
    await store.updateSessionMetadata(id, { taskOrchestration: { revision: 0, tasks: [], bindings: {}, attempts: [], reviews: [] } });
    const original = store.updateSessionMetadata;
    vi.spyOn(store, 'updateSessionMetadata').mockImplementationOnce((...args) => { external('codex'); return original(...args); });
    await expect(owner.mutateSessionPlan(engine, id, { kind: 'propose', proposalId: 'raced-plan', expectedRevision: 0, content })).rejects.toThrow('PLAN_RUNTIME_DELEGATION_UNAVAILABLE');
    expect(store.getSessionMetadata(id)!.taskOrchestration!.proposal).toBeUndefined();
  });
  it('rechecks human confirmation capability inside the actual metadata CAS', async () => {
    const before = JSON.stringify(store.getSessionMetadata(id)!.taskOrchestration);
    const original = store.updateSessionMetadata;
    vi.spyOn(store, 'updateSessionMetadata').mockImplementationOnce((...args) => { external('claude-code'); return original(...args); });
    await expect(owner.actOnSessionPlan(engine, { kind: 'confirm', sessionId: id, proposalId: 'fixture-plan', expectedRevision: 1, requestId: 'raced-confirm' })).rejects.toThrow('PLAN_RUNTIME_DELEGATION_UNAVAILABLE');
    expect(JSON.stringify(store.getSessionMetadata(id)!.taskOrchestration)).toBe(before);
  });
  it('reports builtin and DSH support from the live owner rather than a stored flag', async () => {
    expect((await owner.readSessionTasks(engine)).planSupport).toEqual({ supported: true, runtime: 'builtin' });
    external('dsh');
    expect((await owner.readSessionTasks(engine)).planSupport).toEqual({ supported: true, runtime: 'dsh' });
  });
  it('retains nonproposal tracking on an unsupported runtime', async () => {
    await store.updateSessionMetadata(id, { taskOrchestration: { revision: 0, tasks: [], bindings: {}, attempts: [], reviews: [] } });
    external('claude-code');
    await mutate({ kind: 'ensure', taskId: 'native-work', title: 'Already authorized' });
    await owner.observeSessionTasks(id, { attempts: [attempt('completed')] });
    const bound = await mutate({ kind: 'bind', taskId: 'native-work', toolUseId: 'launch' });
    expect(bound.ledger.bindings.launch).toBe('native-work');
  });
});


it('projects only the current builtin queue recovery without mutating the task ledger or exposing route identity', async () => {
  const { createSessionExecution } = await import('../../shared/sessionExecution');
  const execution = createSessionExecution({ id: 'continuity-execution', requestId: 'human-request',
    originalInput: 'Continue the controlled artifact', queueId: 'current-execution-queue', now: Date.now(),
    intent: { kind: 'execute', objective: 'Controlled artifact', scope: 'Synthetic workspace', acceptanceCriteria: ['Artifact verified'] } });
  await owner.mutateSessionTaskLedger(id, ledger => ({ ...ledger, execution }));
  const now = Date.now();
  const recovery = { version: 1 as const, id: 'controlled-recovery', sdkSessionId: id,
    routeIdentity: 'synthetic-private-route', turnId: execution.currentQueueId, status: 'waiting' as const,
    attempt: 4, startedAt: now, nextRetryAt: now + 15000, deadlineAt: now + 60000, lastStatus: 408 };
  await store.updateSessionMetadata(id, { modelRecovery: recovery });
  const waiting = await owner.readSessionTasks(engine);
  expect(waiting.executionRecovery).toEqual({ turnId: execution.currentQueueId, status: 'waiting',
    attempt: 4, nextRetryAt: recovery.nextRetryAt, lastStatus: 408 });
  expect(waiting.ledger).not.toHaveProperty('executionRecovery');
  expect(waiting.executionRecovery).not.toHaveProperty('routeIdentity');
  expect(waiting.executionRecovery).not.toHaveProperty('sdkSessionId');
  await store.updateSessionMetadata(id, { modelRecovery: { ...recovery, status: 'paused', attempt: 5 } });
  const paused = await owner.readSessionTasks(engine);
  expect(paused.ledger.revision).toBe(waiting.ledger.revision);
  expect(paused.executionRecovery).toMatchObject({ status: 'paused', attempt: 5 });
  await store.updateSessionMetadata(id, { modelRecovery: { ...recovery, turnId: 'old-queue' } });
  expect((await owner.readSessionTasks(engine)).executionRecovery).toBeUndefined();
  await store.updateSessionMetadata(id, { modelRecovery: recovery });
  Object.assign(engine, { kind: 'external' });
  expect((await owner.readSessionTasks(engine)).executionRecovery).toBeUndefined();
});
