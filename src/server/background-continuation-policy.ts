import type { BackgroundTaskContinuationIdentity } from '../shared/types/background-task';

/**
 * Continuation policy for runtime background work that outlives its root turn.
 *
 * The SDK's `background_tasks_changed` level signal is authoritative for what
 * is still running inside the current Query. It does NOT say whether a task is
 * a long-lived service or a compute/write job: a top-level `local_bash` can be
 * a dev server, a migration, or a payroll export, and the payload carries no
 * command or readiness evidence. Guessing from the description would be unsafe.
 *
 * Therefore every non-ambient task blocks automatic and explicit continuation
 * by default, including top-level shells. A user may explicitly acknowledge a
 * specific top-level shell run (the desktop exposes this from the background
 * task view); only that exact `task_id` + `run_id` stops blocking. The
 * acknowledgement is not a claim that the task is safe — it is a recorded user
 * decision to let the next turn run beside that known task. Agents, workflows,
 * MCP tasks and shells owned by another background task cannot be acknowledged.
 *
 * Callers must only evaluate this policy once the root turn is terminal
 * (`isBusy === false`, no waiting interaction, no queued work).
 */

export type BackgroundTaskObservation = {
  taskId: string;
  runId?: string;
  taskType: string;
  description?: string;
  parentTaskId?: string;
  ambient?: boolean;
};

export type BackgroundWorkAcknowledgement = {
  taskId: string;
  runId?: string;
};

/**
 * Exact identity the user observed before confirming. `runId` is mandatory:
 * a bare task id is never resolved to whatever run happens to be current.
 * `queryId` is an opaque incarnation that cannot repeat after Sidecar restart.
 */
export type BackgroundWorkAcknowledgementRequest = BackgroundTaskContinuationIdentity;

export type BackgroundWorkAcknowledgementRejectionReason =
  | 'stale_query'
  | 'missing'
  | 'unknown_identity'
  | 'changed'
  | 'not_acknowledgeable';

export type BackgroundWorkAcknowledgementRejection = {
  taskId: string;
  reason: BackgroundWorkAcknowledgementRejectionReason;
};

export type BackgroundWorkAcknowledgementResult = {
  acknowledged: BackgroundWorkAcknowledgementRequest[];
  rejected: BackgroundWorkAcknowledgementRejection[];
};

export type BackgroundContinuationSnapshot = {
  /** Every non-ambient task currently reported by the runtime. */
  active: BackgroundTaskObservation[];
  /** Active tasks that keep continuation deferred. */
  blocking: BackgroundTaskObservation[];
  /** Top-level shells that a user is allowed to acknowledge explicitly. */
  acknowledgeableShells: BackgroundTaskObservation[];
  /** Currently active tasks whose exact run was acknowledged by the user. */
  acknowledged: BackgroundTaskObservation[];
  /** True when at least one active task still blocks continuation. */
  blocksContinuation: boolean;
};

const SHELL_TASK_TYPES = new Set(['local_bash', 'shell']);

export function isAcknowledgeableBackgroundTask(task: BackgroundTaskObservation): boolean {
  return task.ambient !== true
    && typeof task.runId === 'string' && task.runId.length > 0
    && !task.parentTaskId
    && SHELL_TASK_TYPES.has(task.taskType.trim().toLowerCase());
}

export function backgroundTaskRunKey(task: Pick<BackgroundTaskObservation, 'taskId' | 'runId'>): string {
  return `${task.taskId}\u0000${task.runId ?? ''}`;
}

function acknowledgedTaskKeys(
  acknowledgements: readonly BackgroundWorkAcknowledgement[],
): Set<string> {
  return new Set(acknowledgements.map(acknowledgement => backgroundTaskRunKey(acknowledgement)));
}

export function evaluateBackgroundContinuation(
  tasks: readonly BackgroundTaskObservation[],
  acknowledgements: readonly BackgroundWorkAcknowledgement[] = [],
): BackgroundContinuationSnapshot {
  const active = tasks.filter(task => task.ambient !== true);
  const acknowledgedKeys = acknowledgedTaskKeys(acknowledgements);
  const acknowledgeableShells = active.filter(isAcknowledgeableBackgroundTask);
  const acknowledged = acknowledgeableShells.filter(
    task => acknowledgedKeys.has(backgroundTaskRunKey(task)),
  );
  const acknowledgedSet = new Set(acknowledged);
  const blocking = active.filter(task => !acknowledgedSet.has(task));
  return {
    active,
    blocking,
    acknowledgeableShells,
    acknowledged,
    blocksContinuation: blocking.length > 0,
  };
}
