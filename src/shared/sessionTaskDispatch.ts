import { z } from "zod";
import { EXECUTION_LIMITS } from "./sessionExecution";
import type { SessionTaskLedger } from "./sessionTaskOrchestration";

export interface TaskResource {
  path: string;
  access: "read" | "write";
}

export interface SessionTaskPackage {
  taskId: string;
  executionId: string;
  assignee: string;
  resources: TaskResource[];
  reason: string;
}

const id = z.string().trim().min(1).max(256);
const workspacePath = z
  .string()
  .min(1)
  .max(1024)
  .refine((path) => {
    if (path === ".") return true;
    if (
      path.startsWith("/") ||
      /^[a-zA-Z]:/.test(path) ||
      path.includes("\\") ||
      Array.from(path).some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      )
    )
      return false;
    const withoutTrailingSlash = path.endsWith("/") ? path.slice(0, -1) : path;
    if (!withoutTrailingSlash) return false;
    return withoutTrailingSlash
      .split("/")
      .every(
        (segment) => segment !== "" && segment !== "." && segment !== "..",
      );
  }, "Expected a relative POSIX workspace path");

export const taskPackageSchema = z
  .object({
    taskId: id,
    executionId: id,
    assignee: z.string().trim().min(1).max(128),
    resources: z
      .array(
        z
          .object({ path: workspacePath, access: z.enum(["read", "write"]) })
          .strict(),
      )
      .min(1)
      .max(12),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export const TASK_DISPATCH_LIMITS = {
  maxConcurrent: 2,
  maxLaunches: 6,
  maxAttemptsPerTask: 2,
} as const;

export const TASK_DISPATCH_ERRORS = {
  executionUnavailable: "TASK_DISPATCH_EXECUTION_UNAVAILABLE",
  executionStopped: "TASK_DISPATCH_EXECUTION_NOT_ACTIVE",
  executionExpired: "TASK_DISPATCH_DEADLINE_EXCEEDED",
  turnBudget: "TASK_DISPATCH_TURN_BUDGET_EXHAUSTED",
  taskNotFound: "TASK_DISPATCH_TASK_NOT_FOUND",
  dependenciesIncomplete: "TASK_DISPATCH_DEPENDENCIES_INCOMPLETE",
  packageUnavailable: "TASK_DISPATCH_PACKAGE_UNAVAILABLE",
  assigneeMismatch: "TASK_DISPATCH_ASSIGNEE_MISMATCH",
  claimConflict: "TASK_DISPATCH_CLAIM_CONFLICT",
  taskAlreadyActive: "TASK_DISPATCH_TASK_ALREADY_ACTIVE",
  concurrentLimit: "TASK_DISPATCH_CONCURRENCY_LIMIT",
  launchLimit: "TASK_DISPATCH_LAUNCH_LIMIT",
  attemptLimit: "TASK_DISPATCH_ATTEMPT_LIMIT",
  resourceConflict: "TASK_DISPATCH_RESOURCE_CONFLICT",
} as const;

type DispatchClaim = {
  toolUseId: string;
  taskId: string;
  executionId: string;
  state: "reserved" | "running" | "settled" | "unknown";
};
type DispatchLedger = SessionTaskLedger & {
  taskPackages?: SessionTaskPackage[];
  delegationClaims?: DispatchClaim[];
  delegationLaunches?: number;
  execution?: NonNullable<SessionTaskLedger["execution"]> & {
    phase: string;
    turns: number;
    deadlineAt: number;
  };
};

function normalizedPath(path: string): {
  path: string;
  directory: boolean;
  workspace: boolean;
} {
  if (path === ".") return { path: ".", directory: true, workspace: true };
  const directory = path.endsWith("/");
  return {
    path: directory ? path.slice(0, -1) : path,
    directory,
    workspace: false,
  };
}

function covers(
  parent: ReturnType<typeof normalizedPath>,
  child: ReturnType<typeof normalizedPath>,
): boolean {
  if (parent.workspace) return true;
  return parent.directory && child.path.startsWith(`${parent.path}/`);
}

export function taskResourcesConflict(
  a: TaskResource,
  b: TaskResource,
): boolean {
  if (a.access === "read" && b.access === "read") return false;
  const left = normalizedPath(a.path);
  const right = normalizedPath(b.path);
  if (left.path === right.path) return true;
  return covers(left, right) || covers(right, left);
}

function reject(code: string): never {
  throw new Error(code);
}

function taskIsAccepted(ledger: SessionTaskLedger, taskId: string): boolean {
  const task = ledger.tasks.find((item) => item.id === taskId && !item.retired);
  if (!task) return false;
  const currentTool = ledger.currentTools?.[taskId];
  const boundAttempt =
    currentTool && currentTool !== "@main"
      ? ledger.attempts.find(
          (attempt) =>
            attempt.toolUseId === currentTool &&
            ledger.bindings[currentTool] === taskId,
        )
      : undefined;
  if (currentTool && currentTool !== "@main" && !boundAttempt) return false;
  const currentAttempt =
    boundAttempt ??
    (currentTool
      ? undefined
      : ledger.attempts
          .filter((attempt) => ledger.bindings[attempt.toolUseId] === taskId)
          .sort(
            (a, b) =>
              a.lifecycle.startedAt - b.lifecycle.startedAt ||
              a.id.localeCompare(b.id),
          )
          .at(-1));
  const attemptId =
    currentAttempt?.id ??
    (task.mainAttempt ? `main:${task.mainAttempt}` : "main");
  if (
    currentAttempt &&
    (currentAttempt.lifecycle.status !== "completed" ||
      currentAttempt.executionVerified === false)
  )
    return false;
  return ledger.reviews.some(
    (review) =>
      review.taskId === taskId &&
      review.attemptId === attemptId &&
      review.decision === "accept",
  );
}

export function admitTaskDispatch(
  ledger: SessionTaskLedger,
  input: {
    taskId: string;
    toolUseId: string;
    assignee: string;
    executionId: string;
    now: number;
  },
): SessionTaskLedger {
  const current = ledger as DispatchLedger;
  const claims = current.delegationClaims ?? [];
  const prior = claims.find((claim) => claim.toolUseId === input.toolUseId);
  if (prior) {
    if (
      prior.taskId === input.taskId &&
      prior.executionId === input.executionId
    )
      return ledger;
    return reject(TASK_DISPATCH_ERRORS.claimConflict);
  }

  const execution = current.execution;
  if (!execution || execution.id !== input.executionId)
    return reject(TASK_DISPATCH_ERRORS.executionUnavailable);
  if (execution.phase !== "running" && execution.phase !== "rework")
    return reject(TASK_DISPATCH_ERRORS.executionStopped);
  if (!Number.isFinite(input.now) || input.now > execution.deadlineAt)
    return reject(TASK_DISPATCH_ERRORS.executionExpired);
  if (execution.turns >= EXECUTION_LIMITS.maxTurns)
    return reject(TASK_DISPATCH_ERRORS.turnBudget);

  const task = ledger.tasks.find(
    (item) => item.id === input.taskId && !item.retired,
  );
  if (!task) return reject(TASK_DISPATCH_ERRORS.taskNotFound);
  if (
    task.blockedBy.some((dependencyId) => !taskIsAccepted(ledger, dependencyId))
  )
    return reject(TASK_DISPATCH_ERRORS.dependenciesIncomplete);

  const taskPackage = current.taskPackages?.find(
    (item) =>
      item.taskId === input.taskId && item.executionId === input.executionId,
  );
  const parsedPackage = taskPackageSchema.safeParse(taskPackage);
  if (!parsedPackage.success)
    return reject(TASK_DISPATCH_ERRORS.packageUnavailable);
  if (
    parsedPackage.data.assignee !== input.assignee &&
    parsedPackage.data.assignee !== "native"
  )
    return reject(TASK_DISPATCH_ERRORS.assigneeMismatch);

  const activeClaims = claims.filter(
    (claim) =>
      claim.state === "reserved" ||
      claim.state === "running" ||
      claim.state === "unknown",
  );
  if (
    claims.some(
      (claim) => claim.taskId === input.taskId && claim.state !== "settled",
    )
  )
    return reject(TASK_DISPATCH_ERRORS.taskAlreadyActive);
  if (activeClaims.length >= TASK_DISPATCH_LIMITS.maxConcurrent)
    return reject(TASK_DISPATCH_ERRORS.concurrentLimit);
  if ((current.delegationLaunches ?? 0) >= TASK_DISPATCH_LIMITS.maxLaunches)
    return reject(TASK_DISPATCH_ERRORS.launchLimit);
  if (
    claims.filter(
      (claim) =>
        claim.taskId === input.taskId &&
        claim.executionId === input.executionId,
    ).length >= TASK_DISPATCH_LIMITS.maxAttemptsPerTask
  )
    return reject(TASK_DISPATCH_ERRORS.attemptLimit);

  for (const claim of activeClaims) {
    const otherPackage = current.taskPackages?.find(
      (item) =>
        item.taskId === claim.taskId && item.executionId === claim.executionId,
    );
    const parsedOtherPackage = taskPackageSchema.safeParse(otherPackage);
    // An active claim without a valid package has an unknown scope. Reserve the
    // whole workspace until its owning lifecycle resolves that uncertainty.
    if (!parsedOtherPackage.success)
      return reject(TASK_DISPATCH_ERRORS.resourceConflict);
    if (
      parsedPackage.data.resources.some((resource) =>
        parsedOtherPackage.data.resources.some((other) =>
          taskResourcesConflict(resource, other),
        ),
      )
    ) {
      return reject(TASK_DISPATCH_ERRORS.resourceConflict);
    }
  }

  const next = structuredClone(current) as DispatchLedger;
  next.delegationClaims = [
    ...claims,
    {
      toolUseId: input.toolUseId,
      taskId: input.taskId,
      executionId: input.executionId,
      state: "reserved",
    },
  ];
  next.delegationLaunches = (current.delegationLaunches ?? 0) + 1;
  next.bindings = { ...ledger.bindings, [input.toolUseId]: input.taskId };
  next.currentTools = {
    ...ledger.currentTools,
    [input.taskId]: input.toolUseId,
  };
  return next;
}
