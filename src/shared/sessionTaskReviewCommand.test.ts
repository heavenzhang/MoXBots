import { describe, expect, it } from 'vitest';
import { isDirectSessionTaskListCommand, parseTaskReviewCommand, sameTaskReview } from './sessionTaskReviewCommand';
import { APP_CLI_NAME } from './appProfile';
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

describe('repeatable product task-list query', () => {
  const query = `${APP_CLI_NAME} session tasks --json`;
  it.each([
    query,
    `${APP_CLI_NAME} session tasks`,
    `${APP_CLI_NAME}.cmd session tasks --json`,
    `${query} --data '{"kind":"list"}'`,
    `${query} --data '{"kind":"list","view":"execution"}'`,
    `${query} --data '{"kind":"list","view":"execution","beforeOrder":50}'`,
  ])('recognizes only a direct list operation: %s', command => {
    expect(isDirectSessionTaskListCommand({ command, description: 'Read tasks', timeout: 10_000, run_in_background: false })).toBe(true);
  });
  it.each([
    `${query}; echo changed`, `${query} && echo changed`, `${query} | cat`,
    `${query} > /tmp/result`, `${query}\necho changed`, `${query} # comment`,
    `sh -c '${query}'`, `env ${query}`, `/tmp/${query}`, `./${query}`,
    `${query} --data '{"kind":"review"}'`, `${query} --data '{"kind":"list","extra":true}'`,
    `${query} --data '{"kind":"list"}' --data '{"kind":"review"}'`,
    `${query} --unknown`, `${query} $(echo changed)`, `${query} \`echo changed\``,
    `${query} --data '{"kind":"list","view":"execution","beforeOrder":-1}'`,
    `${query} --data '{"kind":"list","view":"execution","beforeOrder":1.5}'`,
    `${query} --data '{"kind":"list","view":"execution","verificationEpoch":"forged"}'`,
    `${query} --data '{"kind":"list","view":"other"}'`,
    `${query} --data '{"kind":"list","beforeOrder":50}'`,
  ])('does not exempt shell programs, alternate binaries or other actions: %s', command => {
    expect(isDirectSessionTaskListCommand({ command })).toBe(false);
  });
  it.each([
    { command: query, run_in_background: true },
    { command: query, dangerouslyDisableSandbox: true },
    { command: query, cmd: 'other command' },
    { command: query, timeout: Infinity },
    { command: query, description: {} },
  ])('rejects unsupported native options: %j', input => {
    expect(isDirectSessionTaskListCommand(input)).toBe(false);
  });
});
