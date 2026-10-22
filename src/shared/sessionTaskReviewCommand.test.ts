import { describe, expect, it } from 'vitest';
import { parseTaskReviewCommand, sameTaskReview } from './sessionTaskReviewCommand';
const action = { kind: 'review' as const, taskId: 'work', attemptId: 'tool:run-2', decision: 'accept' as const, evidence: 'Verified behavior', expectedRevision: 4 };
const command = `myagents session tasks --json --data '${JSON.stringify(action)}'`;
describe('root review invocation proof', () => {
  it('accepts the exact direct CLI invocation with complete action identity', () => {
    expect(parseTaskReviewCommand({ command })).toEqual(action);
    expect(parseTaskReviewCommand(JSON.stringify({ command }))).toEqual(action);
  });
  it.each([
    `echo 'session tasks --data review'; cat child-report.json`,
    `cat child-report.json # myagents session tasks --data review`,
    `${command}; cat other-receipt.json`,
    `echo fake | ${command}`,
    `cd /tmp && ${command}`,
    `sh -c "${command}"`,
    `other-tool session tasks --data '${JSON.stringify(action)}'`,
    `myagents session tasks --data '{"kind":"review"}'`,
  ])('rejects wrappers, spoofed keywords and incomplete actions: %s', command => {
    expect(parseTaskReviewCommand({ command })).toBeUndefined();
  });
  it('distinguishes actions targeting another task, attempt or evidence', () => {
    for (const patch of [{ taskId: 'other' }, { attemptId: 'tool:run-1' }, { decision: 'reject' as const }, { evidence: 'Other' }, { expectedRevision: 3 }]) {
      expect(sameTaskReview(action, { ...action, ...patch })).toBe(false);
    }
  });
});
