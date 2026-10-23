import { describe, expect, it } from 'vitest';
import { confirmSessionPlan, createSessionPlan } from './sessionPlanConfirmation';
import { projectSessionPlanExecution as project } from './sessionPlanExecution';
import { applySessionTaskAction, projectSessionTasks, type SessionTaskLedger } from './sessionTaskOrchestration';

const draft = () => createSessionPlan({ id: 'plan', sessionId: 'session' }, {
  objective: 'Verify sample', scope: 'Read only', steps: [{ id: 'read', title: 'Read' }, { id: 'verify', title: 'Verify', blockedBy: ['read'] }], acceptanceCriteria: ['Sample unchanged'],
});
const confirmed = () => confirmSessionPlan(draft(), { sessionId: 'session', proposalId: 'plan', expectedRevision: 1 }, { source: 'button', evidenceId: 'human', confirmedAt: '2026-10-23T00:00:00Z' });
function ledger(): SessionTaskLedger {
  return { revision: 1, proposal: confirmed(), tasks: confirmed().content.steps.map(step => ({ ...step, blockedBy: step.blockedBy ?? [], proposalId: 'plan', proposalRevision: 1 })), attempts: [], bindings: {}, reviews: [] };
}
function accept(state: SessionTaskLedger, taskId: string) {
  return applySessionTaskAction(state, { kind: 'review', taskId, attemptId: 'main', decision: 'accept', evidence: `Checked ${taskId}`, expectedRevision: state.revision });
}
const start = { proposalId: 'plan', revision: 1, requestId: 'human', queueId: 'queue', state: 'dispatched' as const };

describe('current confirmed plan execution projection', () => {
  it('does not project execution before verified human confirmation', () => {
    expect(project(draft(), projectSessionTasks(ledger()), start)).toBeUndefined();
    expect(project({ ...draft(), state: 'confirmed' }, [], start)).toBeUndefined();
  });
  it('closes the screenshot case: two main reviews produce completed, not dispatched', () => {
    const state = accept(accept(ledger(), 'read'), 'verify');
    const restored = JSON.parse(JSON.stringify(state)) as SessionTaskLedger;
    const result = project(restored.proposal!, projectSessionTasks(restored), start)!;
    expect(result).toMatchObject({ phase: 'completed', total: 2, completed: 2 });
    expect(result.steps.map(step => step.task?.review?.evidence)).toEqual(['Checked read', 'Checked verify']);
  });
  it.each(['pending', 'claimed', 'dispatched'] as const)('keeps %s receipt separate from actual execution', state => {
    const result = project(confirmed(), [], { ...start, state })!;
    expect(result.phase).toBe(state === 'pending' ? 'queued' : state === 'claimed' ? 'starting' : 'unknown');
    expect(result.completed).toBe(0);
  });
  it('does not borrow similarly named, retired or old version task acceptance', () => {
    const accepted = projectSessionTasks(accept(accept(ledger(), 'read'), 'verify'));
    for (const changes of [{ proposalRevision: 0 }, { proposalId: 'other' }, { retired: true }]) {
      expect(project(confirmed(), accepted.map(task => ({ ...task, ...changes })), start)).toMatchObject({ phase: 'unknown', completed: 0 });
    }
    expect(project(confirmed(), accepted.slice(0, 1), start)).toMatchObject({ phase: 'unknown', total: 2, completed: 1 });
  });
  it('ignores a start receipt from another proposal, revision or revision request', () => {
    for (const receipt of [{ ...start, revision: 0 }, { ...start, proposalId: 'other' }, { ...start, purpose: 'revision' as const }]) {
      expect(project(confirmed(), [], receipt)?.phase).toBe('confirmed');
    }
  });
  it('distinguishes native return from acceptance and a new activation from the old review', () => {
    const state = ledger();
    state.bindings.tool = 'read';
    state.attempts = [{ id: 'tool:1', toolUseId: 'tool', title: 'Read', executionVerified: true, lifecycle: { status: 'completed', startedAt: 1 } }];
    expect(project(confirmed(), projectSessionTasks(state), start)).toMatchObject({ phase: 'awaiting_review', completed: 0 });
    const accepted = applySessionTaskAction(state, { kind: 'review', taskId: 'read', attemptId: 'tool:1', decision: 'accept', evidence: 'Reviewed old run', expectedRevision: 1 });
    accepted.attempts.push({ ...state.attempts[0], id: 'tool:2', lifecycle: { status: 'running', startedAt: 2 } });
    expect(project(confirmed(), projectSessionTasks(accepted), start)).toMatchObject({ phase: 'running', completed: 0 });
  });
  it.each(['failed', 'interrupted', 'running'] as const)('surfaces a current %s attempt instead of a dependent wait', status => {
    const state = ledger();
    state.bindings.tool = 'read';
    state.attempts = [{ id: 'tool:1', toolUseId: 'tool', title: 'Read', executionVerified: true, lifecycle: { status, startedAt: 1 } }];
    expect(project(confirmed(), projectSessionTasks(state), start)?.phase).toBe(status);
  });
  it('shows rejected evidence and incomplete dependencies without marking completion', () => {
    const state = applySessionTaskAction(ledger(), { kind: 'review', taskId: 'read', attemptId: 'main', decision: 'reject', evidence: 'Wrong sample', expectedRevision: 1 });
    expect(project(confirmed(), projectSessionTasks(state), start)).toMatchObject({ phase: 'rework', completed: 0 });
    expect(project(confirmed(), projectSessionTasks(ledger()), start)?.phase).toBe('pending');
    const blocked = { ...ledger(), pendingTaskIds: ['read', 'verify'] };
    expect(project(confirmed(), projectSessionTasks(blocked), start)?.phase).toBe('blocked');
  });
  it('preserves uncertainty on an unknown start while retaining actual reviewed steps', () => {
    const state = accept(ledger(), 'read');
    expect(project(confirmed(), projectSessionTasks(state), { ...start, error: 'PRIVATE_ERROR' })).toMatchObject({ phase: 'unknown', completed: 1 });
    const completed = accept(state, 'verify');
    expect(project(confirmed(), projectSessionTasks(completed), { ...start, error: 'OLD_ERROR' })?.phase).toBe('completed');
  });
});
