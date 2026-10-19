import { describe, expect, it } from 'vitest';
import {
  backgroundTaskRunKey,
  evaluateBackgroundContinuation,
  type BackgroundTaskObservation,
} from './background-continuation-policy';

const shell: BackgroundTaskObservation = {
  taskId: 'shell-1',
  runId: 'run-1',
  taskType: 'local_bash',
  description: 'Start closeout frontend on test port8093',
};

describe('background continuation policy', () => {
  it('blocks every unacknowledged task, including a top-level shell', () => {
    expect(evaluateBackgroundContinuation([shell])).toMatchObject({
      blocking: [shell],
      acknowledgeableShells: [shell],
      acknowledged: [],
      blocksContinuation: true,
    });
  });

  it.each([
    'Run pending database migration',
    'Write payroll export file',
    'npm run build',
    'Start closeout frontend on test port8093',
  ])('does not guess from the description: %s still blocks', description => {
    expect(evaluateBackgroundContinuation([{ ...shell, description }])).toMatchObject({
      blocksContinuation: true,
    });
  });

  it('stops blocking only for the exact acknowledged shell run', () => {
    const acknowledged = {
      taskId: shell.taskId,
      runId: shell.runId,
    };
    expect(evaluateBackgroundContinuation([shell], [acknowledged])).toMatchObject({
      blocking: [],
      acknowledged: [shell],
      blocksContinuation: false,
    });
    // A resumed task keeps task_id but gets a new run_id.
    expect(evaluateBackgroundContinuation(
      [{ ...shell, runId: 'run-2' }],
      [acknowledged],
    )).toMatchObject({ blocksContinuation: true, acknowledged: [] });
  });

  it('rejects acknowledgements for non-shell, child, ambient or unknown tasks', () => {
    const tasks: BackgroundTaskObservation[] = [
      { taskId: 'agent', runId: 'r', taskType: 'local_agent' },
      { taskId: 'workflow', runId: 'r', taskType: 'workflow' },
      { taskId: 'unknown', runId: 'r', taskType: 'unknown_task' },
      { taskId: 'child', runId: 'r', taskType: 'local_bash', parentTaskId: 'agent' },
      { taskId: 'watcher', runId: 'r', taskType: 'local_bash', ambient: true },
    ];
    const acknowledgements = tasks.map(task => ({ taskId: task.taskId, runId: task.runId }));
    expect(evaluateBackgroundContinuation(tasks, acknowledgements)).toMatchObject({
      blocking: tasks.slice(0, 4),
      acknowledgeableShells: [],
      acknowledged: [],
      blocksContinuation: true,
    });
  });

  it('still blocks a mixed set when one task was acknowledged', () => {
    expect(evaluateBackgroundContinuation([
      shell,
      { taskId: 'agent', runId: 'r', taskType: 'local_agent' },
    ], [{ taskId: shell.taskId, runId: shell.runId }])).toMatchObject({
      blocking: [{ taskId: 'agent' }],
      acknowledged: [shell],
      blocksContinuation: true,
    });
  });

  it('normalizes shell task type casing and whitespace', () => {
    expect(evaluateBackgroundContinuation([{ ...shell, taskType: ' Local_Bash ' }]))
      .toMatchObject({ blocksContinuation: true, acknowledgeableShells: [expect.objectContaining({ taskId: 'shell-1' })] });
  });

  it('keys runs without conflating a missing run id', () => {
    expect(backgroundTaskRunKey({ taskId: 'a' })).not.toBe(backgroundTaskRunKey({ taskId: 'a', runId: 'r' }));
    expect(evaluateBackgroundContinuation(
      [{ taskId: 'a', taskType: 'local_bash' }],
      [{ taskId: 'a' }],
    )).toMatchObject({ blocksContinuation: true, acknowledgeableShells: [], acknowledged: [] });
  });
});
