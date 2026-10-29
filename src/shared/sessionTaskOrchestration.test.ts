import { describe, expect, it } from 'vitest';
import { applySessionTaskAction as apply, collectTaskAttempts, currentTaskAttempt, emptyTaskLedger, materializeExecutionTodos,
  mergeTaskObservations as observe, projectSessionTasks as project, type SessionTaskAttempt, type SessionTaskLedger } from './sessionTaskOrchestration';

function attempt(tool = 'a', ordinal = 1, status: SessionTaskAttempt['lifecycle']['status'] = 'running', start = ordinal): SessionTaskAttempt {
  return { id: `${tool}:run-${ordinal}`, toolUseId: tool, title: 'Review changes', executionVerified: true,
    lifecycle: { status, startedAt: start, activation: { id: `run-${ordinal}`, ordinal, state: status === 'running' ? 'running' : status === 'completed' ? 'completed' : 'failed' } } };
}
function task(): SessionTaskLedger { return apply(emptyTaskLedger(), { kind: 'ensure', taskId: 'work', title: 'Repair interface', expectedRevision: 0 }); }
function bind(ledger: SessionTaskLedger, tool = 'a') { return apply(ledger, { kind: 'bind', taskId: 'work', toolUseId: tool, expectedRevision: ledger.revision }); }
function review(ledger: SessionTaskLedger, decision: 'accept' | 'reject' = 'accept', id = 'a:run-1') {
  return apply(ledger, { kind: 'review', taskId: 'work', attemptId: id, decision, evidence: 'Verified actual artifact and regression', expectedRevision: ledger.revision });
}
function view(ledger: SessionTaskLedger) { return project(ledger).find(t => t.id === 'work')!; }

describe('session task execution and acceptance', () => {
  it('projects main-plan activity from the root without changing native attempts or acceptance', () => {
    const plan = observe(emptyTaskLedger(), [], [{ key: 'p', content: 'Verify change', activeForm: 'Verifying change', status: 'in_progress' }]);
    expect(project(plan, [], 'running')[0].phase).toBe('running');
    expect(project(plan, [], 'idle')[0].phase).toBe('interrupted');
    expect(project(plan, [], 'unknown')[0].phase).toBe('unknown');
    expect(plan.plan?.[0].status).toBe('in_progress');
    const accepted = apply(plan, { kind: 'review', taskId: 'p', attemptId: 'main', decision: 'accept', evidence: 'Verified', expectedRevision: plan.revision });
    expect(project(accepted, [], 'idle')[0].phase).toBe('completed');
    const child = bind(observe(task(), [attempt()]));
    expect(project(child, [], 'idle').find(item => item.id === 'work')?.phase).toBe('running');
  });

  it('advances bound execution from events without another task update; return is not acceptance', () => {
    let state = bind(observe(task(), [attempt()]));
    expect(view(state).phase).toBe('running');
    state = observe(state, [attempt('a', 1, 'completed')]);
    expect(view(state).phase).toBe('awaiting_review');
    state = review(state);
    expect(view(state).phase).toBe('completed');
    expect(view(state).review?.evidence).toContain('Verified');
  });
  it('does not equate a native plan completion with acceptance', () => {
    const state = observe(emptyTaskLedger(), [], [{ key: 'p', content: 'Work', activeForm: 'Work', status: 'completed' }]);
    expect(project(state)[0].phase).toBe('awaiting_review');
    const accepted = apply(state, { kind: 'review', taskId: 'p', attemptId: 'main', decision: 'accept', evidence: 'Main verified', expectedRevision: state.revision });
    expect(project(accepted)[0].phase).toBe('completed');
  });
  it('does not match similar task prose to an Agent assignment', () => {
    const state = observe(task(), [{ ...attempt(), title: 'Repair interface' }]);
    expect(project(state).map(t => [t.id, t.phase])).toEqual([['work', 'pending'], ['agent:a', 'running']]);
  });
  it('keeps rejection evidence and requires a new attempt for rework', () => {
    const rejected = review(bind(observe(task(), [attempt('a', 1, 'completed')])), 'reject');
    expect(view(rejected).phase).toBe('rework');
    expect(() => review(rejected)).toThrow('TASK_ALREADY_REVIEWED');
    const retried = observe(rejected, [attempt('a', 2)]);
    expect(view(retried).phase).toBe('running');
    expect(view(retried).review).toBeUndefined();
  });
  it('does not inherit acceptance on the next activation of the same handle', () => {
    const accepted = review(bind(observe(task(), [attempt('a', 1, 'completed')])));
    const retried = observe(accepted, [attempt('a', 2)]);
    expect(view(retried).phase).toBe('running');
    expect(() => review(retried, 'accept', 'a:run-1')).toThrow('TASK_ATTEMPT_CHANGED');
  });
  it('uses the same current attempt for display and review when an old activation arrives late', () => {
    let state = bind(observe(task(), [attempt('a', 2, 'completed')]));
    state = observe(state, [attempt('a', 1, 'completed')]);
    expect(currentTaskAttempt(view(state).attempts)?.id).toBe('a:run-2');
    expect(() => review(state)).toThrow('TASK_ATTEMPT_CHANGED');
    expect(view(review(state, 'accept', 'a:run-2')).phase).toBe('completed');
  });
  it('orders builtin executions by native run ID instead of arrival', () => {
    const newer = { ...attempt('a', 1), id: 'a:002', runId: '002', lifecycle: { status: 'completed' as const, startedAt: 0 } };
    const older = { ...newer, id: 'a:001', runId: '001' };
    const state = bind(observe(task(), [newer, older]));
    expect(currentTaskAttempt(view(state).attempts)?.id).toBe('a:002');
  });
  it('ignores late legacy/no-run observations when a precise run is known', () => {
    const state = observe(bind(observe(task(), [attempt('a', 2)])), [{ ...attempt('a', 1, 'completed'), id: 'a:initial' }]);
    expect(view(state).phase).toBe('running');
  });
  it('preserves terminal facts against duplicate/late running events', () => {
    const state = bind(observe(task(), [attempt('a', 1, 'completed')]));
    expect(observe(state, [attempt()])).toEqual(state);
    expect(observe(state, [attempt('a', 1, 'completed')])).toEqual(state);
  });
  it('rejects two concurrent handles on one task; parallel work needs separate subtasks', () => {
    const state = observe(bind(observe(task(), [attempt()])), [attempt('b', 1, 'running', 2)]);
    expect(() => bind(state, 'b')).toThrow('TASK_STILL_RUNNING');
  });
  it('retries on a different handle after failure and retains old failed attempts', () => {
    const state = bind(observe(task(), [attempt('a', 1, 'failed')]));
    const retried = bind(observe(state, [attempt('b', 1, 'running', 5)]), 'b');
    expect(view(retried).phase).toBe('running');
    expect(view(retried).attempts).toHaveLength(2);
  });
  it('rejects acceptance while running, failed, interrupted or unverified', () => {
    for (const status of ['running', 'failed', 'interrupted'] as const) {
      const state = bind(observe(task(), [attempt('a', 1, status)]));
      expect(() => review(state)).toThrow();
    }
    const unknown = bind(observe(task(), [{ ...attempt('a', 1, 'completed'), executionVerified: false }]));
    expect(view(unknown).phase).toBe('unknown');
    expect(() => review(unknown)).toThrow('TASK_RESULT_UNAVAILABLE');
  });
  it('keeps exact duplicate review retries idempotent after a response is lost', () => {
    const state = bind(observe(task(), [attempt('a', 1, 'completed')]));
    const action = { kind: 'review' as const, taskId: 'work', attemptId: 'a:run-1', decision: 'accept' as const, evidence: 'Passed regression', expectedRevision: state.revision };
    const accepted = apply(state, action);
    expect(apply(accepted, action)).toBe(accepted);
  });
  it('rejects stale revisions rather than losing another task update', () => {
    const state = observe(task(), [attempt()]);
    expect(() => apply(state, { kind: 'bind', taskId: 'work', toolUseId: 'a', expectedRevision: state.revision - 1 })).toThrow('TASK_REVISION_CONFLICT');
  });
  it('preserves bindings, attempts, evidence and task phase through serialized restore and replay', () => {
    let state = review(bind(observe(task(), [attempt('a', 1, 'completed')])));
    state = JSON.parse(JSON.stringify(state));
    const replayed = observe(state, [attempt('a', 1, 'completed')]);
    expect(project(replayed)).toEqual(project(state));
    expect(replayed.revision).toBe(state.revision);
  });
  it('keeps dependency waits visible and prevents premature acceptance', () => {
    const state = apply(task(), { kind: 'ensure', taskId: 'dependent', title: 'Integration', blockedBy: ['work'], expectedRevision: 1 });
    expect(project(state).find(t => t.id === 'dependent')?.phase).toBe('blocked');
    expect(() => apply(state, { kind: 'review', taskId: 'dependent', attemptId: 'main', decision: 'accept', evidence: 'Claim', expectedRevision: state.revision })).toThrow('TASK_DEPENDENCY_INCOMPLETE');
  });
  it('does not reuse a main-Agent review after the same stable task is started again', () => {
    let state = observe(task(), [], [{ key: 'work', content: 'Work', activeForm: 'Work', status: 'completed' }], 'turn-1');
    state = apply(state, { kind: 'review', taskId: 'work', attemptId: 'main', decision: 'accept', evidence: 'Main verified', expectedRevision: state.revision });
    state = observe(state, [], [{ key: 'work', content: 'Work', activeForm: 'Work', status: 'in_progress' }], 'turn-2');
    expect(view(state).phase).toBe('running');
    expect(view(state).reviewAttemptId).toBe('main:1');
    expect(view(state).review).toBeUndefined();
    expect(state.reviews).toHaveLength(1);
    expect(() => apply(state, { kind: 'review', taskId: 'work', attemptId: 'main', decision: 'accept', evidence: 'Old verification', expectedRevision: state.revision })).toThrow('TASK_ATTEMPT_CHANGED');
  });
  it('never accepts a Codex snapshot index as a stable task identity', () => {
    const state = observe(emptyTaskLedger(), [], [{ key: 'codex-snapshot-abc-0', content: 'Work', activeForm: 'Work', status: 'completed' }]);
    expect(() => apply(state, { kind: 'review', taskId: 'codex-snapshot-abc-0', attemptId: 'main', decision: 'accept', evidence: 'Claim', expectedRevision: state.revision })).toThrow('TASK_STABLE_ID_REQUIRED');
  });
  it('never revives historical loading flags as live execution', () => {
    const messages = [{ id: 'history', role: 'assistant', content: [{ type: 'tool_use', tool: { id: 'child', name: 'Agent', isLoading: true, subagentLifecycle: { status: 'running', startedAt: 2 } } }] }];
    expect(collectTaskAttempts(messages)[0].executionVerified).toBe(false);
    expect(collectTaskAttempts(messages, 'history')[0].executionVerified).toBe(true);
  });
  it('projects a legacy Plan hook rejection as failed and refuses acceptance without isError', () => {
    const messages = [{ id: 'history', role: 'assistant', content: [{ type: 'tool_use', tool: {
      id: 'a', name: 'Agent', parsedInput: { description: 'Repair interface' },
      result: 'PreToolUse:Agent hook error: 当前处于 Plan（规划）模式，不能启动子 Agent。',
    } }] }];
    const found = collectTaskAttempts(messages)[0];
    expect(found.executionVerified).toBe(true);
    expect(found.lifecycle.status).toBe('failed');
    const state = bind(observe(task(), [found]));
    expect(view(state).phase).toBe('failed');
    expect(() => review(state, 'accept', found.id)).toThrow('TASK_RESULT_UNAVAILABLE');
  });
  it.each([false, true])('repairs a persisted completed inference and preserves review history (accepted: %s)', accepted => {
    const messages = [{ id: 'history', role: 'assistant', content: [{ type: 'tool_use', tool: {
      id: 'a', name: 'Agent', result: 'PreToolUse:Agent hook error: 当前处于 Plan（规划）模式，不能启动子 Agent。',
    } }] }];
    const incoming = collectTaskAttempts(messages)[0];
    const legacy = { ...incoming, statusSource: undefined, lifecycle: { ...incoming.lifecycle, status: 'completed' as const } };
    let persisted = bind(observe(task(), [legacy]));
    if (accepted) persisted = review(persisted, 'accept', incoming.id);
    persisted = JSON.parse(JSON.stringify(persisted));
    expect(view(persisted).phase).toBe(accepted ? 'completed' : 'awaiting_review');
    const corrected = observe(persisted, [incoming]);
    expect(view(corrected).phase).toBe('failed');
    expect(corrected.reviews).toEqual(persisted.reviews);
    expect(() => apply(corrected, { kind: 'review', taskId: 'work', attemptId: incoming.id,
      decision: 'accept', evidence: 'New review must verify an actual result', expectedRevision: corrected.revision })).toThrow('TASK_RESULT_UNAVAILABLE');
    expect(observe(corrected, [incoming])).toEqual(corrected);
    expect(view(observe(corrected, [legacy])).phase).toBe('failed');
  });
  it.each(['native', 'notification'] as const)('does not rewrite a completed %s fact from a later raw rejection fallback', source => {
    const tool = { id: 'a', name: 'Agent', result: 'PreToolUse:Agent hook error: earlier launch was blocked',
      ...(source === 'native' ? { subagentLifecycle: { status: 'completed', startedAt: 2 } } : {}) };
    const messages = [
      { id: 'history', role: 'assistant', content: [{ type: 'tool_use', tool }] },
      ...(source === 'notification' ? [{ id: 'task-notification-a', role: 'user', content: '<task-notification>{"toolUseId":"a","status":"completed"}</task-notification>' }] : []),
    ];
    const authoritative = collectTaskAttempts(messages)[0];
    expect(authoritative.statusSource).toBe(source);
    const state = bind(observe(task(), [authoritative]));
    const fallback = collectTaskAttempts([{ id: 'history', role: 'assistant', content: [{ type: 'tool_use', tool: {
      id: 'a', name: 'Agent', result: tool.result,
    } }] }])[0];
    const replayed = observe(state, [fallback]);
    expect(view(replayed).phase).toBe('awaiting_review');
    expect(view(replayed).attempts[0].statusSource).toBe(source);
    // Native authority also wins when the explicit receipt is observed after
    // the legacy raw-error inference, rather than only before it.
    const inferred = bind(observe(task(), [fallback]));
    expect(view(inferred).phase).toBe('failed');
    expect(view(observe(inferred, [authoritative])).phase).toBe('awaiting_review');
  });
  it('does not apply the legacy dispatch correction to a known activation or background run', () => {
    const messages = [{ id: 'history', role: 'assistant', content: [{ type: 'tool_use', tool: {
      id: 'a', name: 'Agent', result: 'PreToolUse:Agent hook error: earlier launch was blocked',
    } }] }];
    const fallback = collectTaskAttempts(messages)[0];
    for (const current of [attempt('a', 2, 'completed'), { ...fallback, id: 'a:002', runId: '002', statusSource: undefined,
      lifecycle: { status: 'completed' as const, startedAt: 2 } }]) {
      const state = bind(observe(task(), [current]));
      const replayed = observe(state, [fallback]);
      expect(view(replayed).phase).toBe('awaiting_review');
      expect(view(replayed).attempts).toHaveLength(1);
      expect(view(replayed).reviewAttemptId).toBe(current.id);
    }
  });
  it('retains native provenance when terminal activation merging returns a new lifecycle object', () => {
    const native = { ...attempt('a', 2, 'completed'), statusSource: 'native' as const };
    const state = bind(observe(task(), [native]));
    const incoming = { ...native, statusSource: 'dispatch_failure' as const,
      lifecycle: { ...native.lifecycle, status: 'failed' as const } };
    const replayed = observe(state, [incoming]);
    expect(view(replayed).phase).toBe('awaiting_review');
    expect(view(replayed).attempts[0].statusSource).toBe('native');
    expect(view(replayed).attempts[0].lifecycle.status).toBe('completed');
  });
  it('retains a dispatch-failure source against a later untrusted completed inference', () => {
    const failed = { ...attempt('a', 1, 'failed'), id: 'a:initial', statusSource: 'dispatch_failure' as const,
      lifecycle: { status: 'failed' as const, startedAt: 0 } };
    const state = bind(observe(task(), [failed]));
    const replayed = observe(state, [{ ...failed, statusSource: undefined,
      lifecycle: { status: 'completed' as const, startedAt: 0 } }]);
    expect(view(replayed).phase).toBe('failed');
    expect(view(replayed).attempts[0].statusSource).toBe('dispatch_failure');
  });
  it('keeps an actual returned report awaiting review even when it discusses dispatch errors', () => {
    const messages = [{ id: 'history', role: 'assistant', content: [{ type: 'tool_use', tool: {
      id: 'a', name: 'Agent', result: 'Verified the fix for PreToolUse:Agent hook error: regression passed.',
    } }] }];
    const found = collectTaskAttempts(messages)[0];
    const state = bind(observe(task(), [found]));
    expect(view(state).phase).toBe('awaiting_review');
    expect(view(review(state, 'accept', found.id)).phase).toBe('completed');
  });
  it('keeps native activation status authoritative over stale raw dispatch errors and notifications', () => {
    const messages = [
      { id: 'history', role: 'assistant', content: [{ type: 'tool_use', tool: {
        id: 'a', name: 'Agent', result: 'PreToolUse:Agent hook error: earlier launch was blocked',
        subagentLifecycle: { status: 'completed', startedAt: 2, result: 'Native report verified',
          activation: { id: 'run-2', ordinal: 2, state: 'completed' } },
      } }] },
      { id: 'task-notification-old', role: 'user', content: '<task-notification>{"toolUseId":"a","status":"failed","runId":"001"}</task-notification>' },
    ];
    const found = collectTaskAttempts(messages)[0];
    expect(found.id).toBe('a:run-2');
    expect(found.lifecycle.status).toBe('completed');
    expect(found.lifecycle.result).toBe('Native report verified');
    expect(view(bind(observe(task(), [found]))).phase).toBe('awaiting_review');
  });
  it('keeps an exact execution notification authoritative over legacy raw dispatch errors', () => {
    const messages = [
      { id: 'history', role: 'assistant', content: [{ type: 'tool_use', tool: {
        id: 'a', name: 'Agent', result: 'PreToolUse:Agent hook error: earlier launch was blocked',
      } }] },
      { id: 'task-notification-a', role: 'user', content: '<task-notification>{"toolUseId":"a","status":"completed","runId":"002","summary":"Verified report"}</task-notification>' },
    ];
    const found = collectTaskAttempts(messages)[0];
    expect(found.id).toBe('a:002');
    expect(found.lifecycle.status).toBe('completed');
    expect(found.lifecycle.result).toBe('Verified report');
    expect(view(bind(observe(task(), [found]))).phase).toBe('awaiting_review');
  });
  it('does not mistake async launch/control receipts for a returned report', () => {
    for (const name of ['Agent', 'CollabAgent']) {
      const messages = [{ id: 'm', role: 'assistant', content: [{ type: 'tool_use', tool: { id: 'child', name, parsedInput: { tool: 'spawnAgent' }, result: JSON.stringify({ status: 'async_launched', agentId: 'worker' }) } }] }];
      const found = collectTaskAttempts(messages)[0];
      expect(found.executionVerified).toBe(false);
      expect(project(observe(emptyTaskLedger(), [found]))[0].phase).toBe('unknown');
    }
  });
});

describe('precreated execution To Do List', () => {
  function planned() {
    const ledger = emptyTaskLedger();
    ledger.executionAdmission = { requestId: 'human', queueId: 'queue', taskPlanId: 'current' };
    materializeExecutionTodos(ledger, 'current', ['Implement', 'Verify']);
    return ledger;
  }
  it('allows an explicitly ensured refinement to use the same native progress stream', () => {
    let ledger = planned();
    ledger = apply(ledger, { kind: 'ensure', taskId: 'refinement', title: 'Check compatibility', expectedRevision: ledger.revision });
    ledger = observe(ledger, [], [{ key: 'refinement', content: 'Check compatibility', activeForm: 'Checking', status: 'in_progress' }], 'queue');
    expect(project(ledger).map(task => task.phase)).toEqual(['running', 'pending', 'running']);
  });
  it('normalizes the exact DSH subject marker before filtering native step IDs', () => {
    const ledger = planned();
    const first = ledger.tasks[0];
    const updated = observe(ledger, [], [{ key: 'native-dsh-id', content: `[task:${first.id}] ${first.title}`, activeForm: 'Working', status: 'completed' }], 'queue');
    expect(project(updated).map(task => task.phase)).toEqual(['awaiting_review', 'pending']);
    expect(project(updated)[0].id).toBe(first.id);
  });
  it('binds an exact current root launch marker and keeps a native return awaiting root acceptance', () => {
    const ledger = planned();
    const first = ledger.tasks[0].id;
    const current = { ...attempt('current', 1, 'completed'), taskIdHint: first };
    const observed = observe(ledger, [current, attempt('old-unbound', 1, 'completed')]);
    expect(observed.bindings.current).toBe(first);
    expect(project(observed)).toHaveLength(2);
    expect(project(observed)[0].phase).toBe('awaiting_review');
    expect(project(observed)[0].attempts).toHaveLength(1);
  });
});

it('binds only an explicit confirmed root launch marker as execution starts', () => {
  const ledger = task();
  ledger.tasks[0] = { ...ledger.tasks[0], proposalId: 'p', proposalRevision: 1 };
  ledger.proposal = { id: 'p', sessionId: 's', revision: 1, policyVersion: '1', state: 'confirmed', content: { objective: 'Repair', scope: 'Scoped', steps: [{ id: 'work', title: 'Repair' }], acceptanceCriteria: ['Verified'] }, changes: [], confirmation: { source: 'button', evidenceId: 'human', revision: 1, confirmedAt: new Date(100).toISOString() } };
  const messages = [{ id: 'live', role: 'assistant', content: [{ type: 'tool_use', tool: { id: 'launch', name: 'Agent', parsedInput: { description: '[task:work] Repair' }, taskStartTime: 101, isLoading: true } }] }];
  const observed = observe(ledger, collectTaskAttempts(messages, 'live'));
  expect(observed.bindings.launch).toBe('work');
  expect(view(observed).phase).toBe('running');
  const old = observe(ledger, [{ ...attempt('old', 1, 'completed', 50), taskIdHint: 'work' }]);
  expect(old.bindings.old).toBeUndefined();
  const nested = [{ id: 'live', role: 'assistant', content: [{ type: 'tool_use', tool: { id: 'parent', name: 'Agent', subagentCalls: [{ id: 'child', name: 'Agent', parsedInput: { description: '[task:work] Repair' }, taskStartTime: 101, isLoading: true }] } }] }];
  expect(collectTaskAttempts(nested, 'live').find(item => item.toolUseId === 'child')?.taskIdHint).toBeUndefined();
});
