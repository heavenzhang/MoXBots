import { describe, expect, it } from 'vitest';
import { resolveTaskActionTargets, type TaskReviewTarget } from './SessionTaskActionsContext';
import type { SessionTaskView } from '../../../shared/sessionTaskOrchestration';

const target: TaskReviewTarget = { sessionId: 'session', taskId: 'task', attemptId: 'current' };
const task = (phase: SessionTaskView['phase']): SessionTaskView => ({ id: 'task', title: '核对后台', phase,
  source: 'agent', blockedBy: [], attempts: [], reviewAttemptId: 'current' });

describe('original-chat task action target fences', () => {
  it('allows review only for a returned result, while permitting feedback on failure', () => {
    expect(resolveTaskActionTargets([task('failed')], [target], 'session')).toBeNull();
    expect(resolveTaskActionTargets([task('failed')], [target], 'session', 'feedback')).toEqual([task('failed')]);
    expect(resolveTaskActionTargets([task('awaiting_review')], [target], 'session')).toEqual([task('awaiting_review')]);
  });
  it.each(['interrupted', 'unknown', 'rework'] as const)('permits feedback, but not acceptance, for %s', phase => {
    expect(resolveTaskActionTargets([task(phase)], [target], 'session', 'feedback')).toHaveLength(1);
    expect(resolveTaskActionTargets([task(phase)], [target], 'session')).toBeNull();
  });
  it('rejects another session, an old attempt and an empty target set', () => {
    expect(resolveTaskActionTargets([task('failed')], [target], 'other', 'feedback')).toBeNull();
    expect(resolveTaskActionTargets([task('failed')], [{ ...target, attemptId: 'old' }], 'session', 'feedback')).toBeNull();
    expect(resolveTaskActionTargets([task('failed')], [], 'session', 'feedback')).toBeNull();
  });
  it('rejects the entire action if any target has gone stale or resumed running', () => {
    expect(resolveTaskActionTargets([task('awaiting_review')], [target, { ...target, taskId: 'missing' }], 'session')).toBeNull();
    expect(resolveTaskActionTargets([task('running')], [target], 'session', 'feedback')).toBeNull();
    expect(resolveTaskActionTargets([task('completed')], [target], 'session', 'feedback')).toBeNull();
  });
});
