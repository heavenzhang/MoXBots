import { describe, expect, it } from "vitest";
import { createSessionExecution } from "./sessionExecution";
import type { SessionTaskLedger } from "./sessionTaskOrchestration";
import {
  admitTaskDispatch,
  taskPackageSchema,
  taskResourcesConflict,
  TASK_DISPATCH_ERRORS,
} from "./sessionTaskDispatch";

const executionId = "execution-1";
const now = 1_000;

function makeLedger(): SessionTaskLedger {
  return {
    revision: 1,
    tasks: [
      { id: "a", title: "A", blockedBy: [] },
      { id: "b", title: "B", blockedBy: [] },
      { id: "c", title: "C", blockedBy: [] },
      { id: "dependent", title: "Dependent", blockedBy: ["a"] },
    ],
    bindings: {},
    attempts: [],
    reviews: [],
    execution: createSessionExecution({
      id: executionId,
      requestId: "request-1",
      originalInput: "Implement the feature",
      intent: {
        kind: "execute",
        objective: "Implement",
        scope: "src",
        acceptanceCriteria: ["Tests pass"],
      },
      queueId: "queue-1",
      now,
    }),
    taskPackages: [
      {
        taskId: "a",
        executionId,
        assignee: "agent-a",
        resources: [{ path: "src/a/", access: "write" }],
        reason: "Own A",
      },
      {
        taskId: "b",
        executionId,
        assignee: "agent-b",
        resources: [{ path: "src/b", access: "write" }],
        reason: "Own B",
      },
      {
        taskId: "c",
        executionId,
        assignee: "agent-c",
        resources: [{ path: "src/a/file.ts", access: "write" }],
        reason: "Own C",
      },
      {
        taskId: "dependent",
        executionId,
        assignee: "native",
        resources: [{ path: "docs/", access: "read" }],
        reason: "Follow A",
      },
    ],
  } as SessionTaskLedger;
}

function admit(
  ledger: SessionTaskLedger,
  taskId: string,
  toolUseId: string,
  assignee = `agent-${taskId}`,
  at = now + 1,
): SessionTaskLedger {
  return admitTaskDispatch(ledger, {
    taskId,
    toolUseId,
    assignee,
    executionId,
    now: at,
  });
}

function dispatchClaims(ledger: SessionTaskLedger) {
  return (
    (
      ledger as SessionTaskLedger & {
        delegationClaims?: {
          taskId: string;
          toolUseId: string;
          state: string;
        }[];
      }
    ).delegationClaims ?? []
  );
}

describe("session task dispatch policy", () => {
  it("validates strict task packages and relative POSIX workspace paths", () => {
    const valid = {
      taskId: "a",
      executionId,
      assignee: "agent-a",
      resources: [{ path: "src/a", access: "write" }],
      reason: "Bounded edit",
    };
    expect(taskPackageSchema.safeParse(valid).success).toBe(true);
    for (const path of [
      "/tmp/a",
      "C:/tmp/a",
      "../a",
      "src/../a",
      "src\\a",
      "src//a",
      "src/./a",
      "",
    ]) {
      expect(
        taskPackageSchema.safeParse({
          ...valid,
          resources: [{ path, access: "read" }],
        }).success,
      ).toBe(false);
    }
    expect(
      taskPackageSchema.safeParse({ ...valid, unexpected: true }).success,
    ).toBe(false);
    expect(
      taskPackageSchema.safeParse({
        ...valid,
        resources: [{ path: ".", access: "read" }],
      }).success,
    ).toBe(true);
    expect(
      taskPackageSchema.safeParse({
        ...valid,
        resources: [{ path: "src/", access: "read" }],
      }).success,
    ).toBe(true);
  });

  it("conflicts only on exact or directory/workspace overlap when at least one side writes", () => {
    expect(
      taskResourcesConflict(
        { path: "src/a", access: "write" },
        { path: "src/ab", access: "write" },
      ),
    ).toBe(false);
    expect(
      taskResourcesConflict(
        { path: "src/", access: "read" },
        { path: "src/a", access: "write" },
      ),
    ).toBe(true);
    expect(
      taskResourcesConflict(
        { path: "src/", access: "read" },
        { path: "src/a", access: "read" },
      ),
    ).toBe(false);
    expect(
      taskResourcesConflict(
        { path: ".", access: "read" },
        { path: "src/a", access: "write" },
      ),
    ).toBe(true);
    expect(
      taskResourcesConflict(
        { path: "src/a", access: "write" },
        { path: "src/a/", access: "read" },
      ),
    ).toBe(true);
  });

  it("requires actual accepted dependency review before dispatch", () => {
    const initial = makeLedger();
    expect(() =>
      admit(initial, "dependent", "launch-dependent", "native"),
    ).toThrow(TASK_DISPATCH_ERRORS.dependenciesIncomplete);
    const accepted = {
      ...initial,
      reviews: [
        {
          taskId: "a",
          attemptId: "main",
          decision: "accept" as const,
          evidence: "Verified",
        },
      ],
    };
    const admitted = admit(accepted, "dependent", "launch-dependent", "native");
    expect(dispatchClaims(admitted)).toEqual([
      {
        taskId: "dependent",
        toolUseId: "launch-dependent",
        executionId,
        state: "reserved",
      },
    ]);
    const acceptedMainTask = {
      ...initial,
      tasks: initial.tasks.map((task) =>
        task.id === "a" ? { ...task, mainAttempt: 1 } : task,
      ),
      currentTools: { a: "@main" },
      reviews: [
        {
          taskId: "a",
          attemptId: "main:1",
          decision: "accept" as const,
          evidence: "Verified",
        },
      ],
    };
    expect(() =>
      admit(acceptedMainTask, "dependent", "launch-dependent-main", "native"),
    ).not.toThrow();
  });

  it("allows disjoint writes concurrently and rejects overlapping write scopes", () => {
    const first = admit(makeLedger(), "a", "launch-a");
    const second = admit(first, "b", "launch-b");
    expect(dispatchClaims(second)).toHaveLength(2);
    expect(() => admit(first, "c", "launch-c")).toThrow(
      TASK_DISPATCH_ERRORS.resourceConflict,
    );
  });

  it("allows overlapping read-only tasks concurrently", () => {
    const ledger = makeLedger() as SessionTaskLedger & {
      taskPackages: {
        taskId: string;
        executionId: string;
        assignee: string;
        resources: { path: string; access: "read" | "write" }[];
        reason: string;
      }[];
    };
    ledger.taskPackages = ledger.taskPackages.map((item) => ({
      ...item,
      resources: [{ path: "src/shared/", access: "read" }],
    }));
    const first = admit(ledger, "a", "read-a");
    const second = admit(first, "c", "read-c");
    expect(dispatchClaims(second)).toHaveLength(2);
  });

  it("is idempotent for an identical claim and rejects same-task parallel claims", () => {
    const first = admit(makeLedger(), "a", "launch-a");
    expect(admit(first, "a", "launch-a")).toBe(first);
    expect(() => admit(first, "a", "launch-a-again")).toThrow(
      TASK_DISPATCH_ERRORS.taskAlreadyActive,
    );
  });

  it("enforces execution state, launch and attempt limits without a root turn cap", () => {
    const stopped = makeLedger() as SessionTaskLedger & {
      execution: NonNullable<SessionTaskLedger["execution"]>;
    };
    stopped.execution = {
      ...stopped.execution,
      phase: "paused",
    } as NonNullable<SessionTaskLedger["execution"]>;
    expect(() => admit(stopped, "a", "stopped")).toThrow(
      TASK_DISPATCH_ERRORS.executionStopped,
    );

    const expired = makeLedger() as SessionTaskLedger & {
      execution: NonNullable<SessionTaskLedger["execution"]>;
    };
    expired.execution = {
      ...expired.execution,
      deadlineAt: now,
    } as NonNullable<SessionTaskLedger["execution"]>;
    expect(() => admit(expired, "a", "legacy-deadline", 'agent-a', now + 86_400_000)).not.toThrow();

    const turns = makeLedger() as SessionTaskLedger & {
      execution: NonNullable<SessionTaskLedger["execution"]>;
    };
    turns.execution = { ...turns.execution, turns: 24 } as NonNullable<
      SessionTaskLedger["execution"]
    >;
    expect(() => admit(turns, "a", "past-eight-turns")).not.toThrow();

    const launches = makeLedger() as SessionTaskLedger & {
      delegationLaunches: number;
    };
    launches.delegationLaunches = 6;
    expect(() => admit(launches, "a", "launch-limit")).toThrow(
      TASK_DISPATCH_ERRORS.launchLimit,
    );

    const attempts = makeLedger() as SessionTaskLedger & {
      delegationClaims: {
        toolUseId: string;
        taskId: string;
        executionId: string;
        state: "settled";
      }[];
    };
    attempts.delegationClaims = [
      { toolUseId: "prior-1", taskId: "a", executionId, state: "settled" },
      { toolUseId: "prior-2", taskId: "a", executionId, state: "settled" },
    ];
    expect(() => admit(attempts, "a", "attempt-limit")).toThrow(
      TASK_DISPATCH_ERRORS.attemptLimit,
    );
  });

  it("keeps unknown work occupying concurrency and its resource scope", () => {
    const ledger = makeLedger() as SessionTaskLedger & {
      delegationClaims: {
        toolUseId: string;
        taskId: string;
        executionId: string;
        state: "unknown";
      }[];
    };
    ledger.delegationClaims = [
      { toolUseId: "uncertain-a", taskId: "a", executionId, state: "unknown" },
    ];
    expect(() => admit(ledger, "c", "overlap-unknown")).toThrow(
      TASK_DISPATCH_ERRORS.resourceConflict,
    );
    expect(() => admit(ledger, "b", "second")).not.toThrow();
    ledger.delegationClaims.push({
      toolUseId: "uncertain-b",
      taskId: "b",
      executionId,
      state: "unknown",
    });
    expect(() => admit(ledger, "c", "at-capacity")).toThrow(
      TASK_DISPATCH_ERRORS.concurrentLimit,
    );
  });
});
