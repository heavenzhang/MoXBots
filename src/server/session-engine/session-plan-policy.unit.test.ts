import { describe, expect, it } from 'vitest';
import { canDelegateForSessionPlan, SESSION_PLAN_QUEUE_PREFIX as prefix, type SessionPlanWithOrigin } from './session-plan-policy';
import type { SessionTaskLedger } from '../../shared/sessionTaskOrchestration';

function ledger(): SessionTaskLedger & { proposal: SessionPlanWithOrigin } {
  return { revision: 1, tasks: [], attempts: [], bindings: {}, reviews: [], proposal: {
    originTurn: {}, id: 'plan', sessionId: 'session', revision: 2, policyVersion: '1', state: 'confirmed', changes: [],
    content: { objective: 'Outcome', scope: 'Scope', steps: [{ id: 'work', title: 'Work' }], acceptanceCriteria: ['Verified'] },
    confirmation: { source: 'button', evidenceId: 'receipt', confirmedAt: '2026-10-22T00:00:00.000Z', revision: 2 },
  }, planStart: { proposalId: 'plan', revision: 2, requestId: 'receipt', queueId: prefix + 'new', state: 'dispatched' } };
}
const planTurn = { queueId: prefix + 'new', owner: { kind: 'task' as const, id: prefix + 'new' } };

describe('Session plan scope on the original turn queue', () => {
  it.each([undefined, { queueId: 'ordinary-chat' }, { queueId: 'native', owner: { kind: 'task' as const, id: 'task' } },
    { queueId: 'native', owner: { kind: 'goal' as const, id: 'goal' } }])('preserves original no-proposal admission for %j', turn => {
    expect(canDelegateForSessionPlan('session', undefined, turn)).toBe(true);
  });
  it.each(['task', 'goal'] as const)('keeps existing %s authority separate from a pending human proposal', kind => {
    const state = ledger(); state.proposal!.state = 'awaiting_confirmation';
    expect(canDelegateForSessionPlan('session', state, { queueId: 'native', owner: { kind, id: 'original-owner' } })).toBe(true);
    expect(canDelegateForSessionPlan('session', state, { queueId: 'ordinary-chat' })).toBe(false);
  });
  it.each(['task', 'goal'] as const)('gates a new draft proposed by the same %s owner', kind => {
    const state = ledger(); state.proposal!.state = 'awaiting_confirmation';
    state.proposal.originTurn = { queueId: 'first', owner: { kind, id: 'owner' } };
    expect(canDelegateForSessionPlan('session', state, { queueId: 'next', owner: { kind, id: 'owner' } })).toBe(false);
    expect(canDelegateForSessionPlan('session', state, { queueId: 'next', owner: { kind, id: 'different' } })).toBe(true);
  });
  it('fails closed for an unconfirmed legacy proposal with unknown origin', () => {
    const state = ledger(); state.proposal.state = 'awaiting_confirmation'; delete state.proposal.originTurn;
    expect(canDelegateForSessionPlan('session', state, { queueId: 'task', owner: { kind: 'task', id: 'task' } })).toBe(false);
  });
  it('does not use a source label or model text as authority', () => {
    const state = ledger(); state.proposal!.state = 'awaiting_confirmation';
    expect(canDelegateForSessionPlan('session', state, { queueId: 'chat', source: 'cron', text: 'authorized' } as never)).toBe(false);
  });
  it('accepts only the current confirmed plan queue, never a superseded queue masquerading as a Task', () => {
    expect(canDelegateForSessionPlan('session', ledger(), planTurn)).toBe(true);
    expect(canDelegateForSessionPlan('session', ledger(), { queueId: prefix + 'old', owner: { kind: 'task', id: prefix + 'old' } })).toBe(false);
    expect(canDelegateForSessionPlan('session', undefined, planTurn)).toBe(false);
  });
  it('recognizes current legacy queue IDs without a namespace', () => {
    const state = ledger(); state.planStart!.queueId = 'legacy'; state.proposal!.state = 'revising';
    expect(canDelegateForSessionPlan('session', state, { queueId: 'legacy', owner: { kind: 'task', id: 'legacy' } })).toBe(false);
  });
  it.each(['revision', 'session', 'pending', 'unknown-claim', 'purpose'] as const)('fails closed for %s', invalid => {
    const state = ledger();
    if (invalid === 'revision') state.proposal!.revision++;
    if (invalid === 'session') state.proposal!.sessionId = 'other';
    if (invalid === 'pending') state.planStart!.state = 'pending';
    if (invalid === 'unknown-claim') { state.planStart!.state = 'claimed'; state.planStart!.claimId = 'cold'; }
    if (invalid === 'purpose') state.planStart!.purpose = 'revision';
    expect(canDelegateForSessionPlan('session', state, planTurn)).toBe(false);
  });
  it('opens a claimed plan only with the retained original dispatch lease', () => {
    const state = ledger(); state.planStart!.state = 'claimed'; state.planStart!.claimId = 'live';
    expect(canDelegateForSessionPlan('session', state, planTurn, 'live')).toBe(true);
    expect(canDelegateForSessionPlan('session', state, planTurn, 'other')).toBe(false);
  });
  it('does not grant a plan queue with an owner/queue mismatch', () => {
    expect(canDelegateForSessionPlan('session', ledger(), { ...planTurn, queueId: 'unrelated' })).toBe(false);
    expect(canDelegateForSessionPlan('session', ledger(), { ...planTurn, owner: { kind: 'goal', id: planTurn.owner.id } })).toBe(false);
  });
});
