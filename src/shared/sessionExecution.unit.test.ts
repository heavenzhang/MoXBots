import { describe, expect, it } from "vitest";
import {
  EXECUTION_LIMITS,
  canContinueSessionExecution,
  createSessionExecution,
  executionAssessmentSchema,
  executionIntentSchema,
  settleSessionExecution,
  type ExecutionAssessment,
  type ExecutionTerminal,
  type SessionExecution,
} from "./sessionExecution";

const intent = executionIntentSchema.parse({
  kind: "execute",
  objective: "Build the requested artifact",
  scope: "Current workspace",
  acceptanceCriteria: ["Build passes", "Artifact is present"],
});
const initial = () =>
  createSessionExecution({
    id: "exec-1",
    requestId: "req-1",
    originalInput: "Please build it",
    intent,
    queueId: "queue-1",
    now: 1000,
  });
const accepted: ExecutionAssessment = {
  decision: "accept",
  summary: "Both checks have current successful evidence",
  checks: [
    { criterion: 0, toolUseIds: ["tool-1"] },
    { criterion: 1, toolUseIds: ["tool-2"] },
  ],
};
const terminal = (
  patch: Partial<ExecutionTerminal> = {},
): ExecutionTerminal => ({
  queueId: "queue-1",
  status: "complete",
  now: 2000,
  assessment: accepted,
  evidence: [
    { id: "tool-1", successful: true, observationOrder: 12 },
    { id: "tool-2", successful: true, observationOrder: 13 },
  ],
  lastMutationOrder: 10,
  progressDigest: "changed",
  ...patch,
});

describe("session execution schema and policy", () => {
  it("requires criteria only for execute and bounds strings and arrays", () => {
    expect(
      executionIntentSchema.safeParse({
        kind: "execute",
        objective: "x",
        scope: "x",
        acceptanceCriteria: [],
      }).success,
    ).toBe(false);
    expect(
      executionIntentSchema.safeParse({
        kind: "answer",
        objective: "Answer",
        scope: "Chat",
        acceptanceCriteria: [],
      }).success,
    ).toBe(true);
    expect(
      executionIntentSchema.safeParse({
        ...intent,
        acceptanceCriteria: Array(21).fill("x"),
      }).success,
    ).toBe(false);
    expect(
      executionAssessmentSchema.safeParse({
        decision: "accept",
        summary: "ok",
        checks: Array(21).fill({ criterion: 0, toolUseIds: ["t"] }),
      }).success,
    ).toBe(false);
  });

  it("creates only execute sessions with bounded deadlines and first turn running", () => {
    expect(initial()).toMatchObject({
      phase: "running",
      turns: 1,
      startedAt: 1000,
      deadlineAt: 1000 + EXECUTION_LIMITS.maxDurationMs,
      currentQueueId: "queue-1",
    });
    expect(() =>
      createSessionExecution({
        id: "x",
        requestId: "r",
        originalInput: "x",
        intent: { ...intent, kind: "plan" },
        queueId: "q",
        now: 0,
      }),
    ).toThrow("SESSION_EXECUTION_REQUIRES_EXECUTE_INTENT");
  });

  it("does not mark a bare successful terminal complete without assessment", () => {
    expect(
      settleSessionExecution(initial(), terminal({ assessment: undefined })),
    ).toMatchObject({
      phase: "awaiting_review",
      reason: "assessment_required",
    });
  });

  it("routes failed assessment to bounded rework and accepts later verified evidence", () => {
    const failed: ExecutionAssessment = {
      decision: "rework",
      summary: "Artifact missing",
      checks: [],
    };
    const rework = settleSessionExecution(
      initial(),
      terminal({ assessment: failed }),
    );
    expect(rework).toMatchObject({ phase: "rework", reworks: 1 });
    const next: SessionExecution = {
      ...rework,
      currentQueueId: "queue-2",
      turns: 2,
    };
    expect(
      settleSessionExecution(
        next,
        terminal({ queueId: "queue-2", progressDigest: "fixed" }),
      ),
    ).toMatchObject({ phase: "completed", lastSettledQueueId: "queue-2" });
  });

  it("allows one successful tool to support multiple criteria and read-only evidence without mutation order", () => {
    const sharedEvidence: ExecutionAssessment = {
      decision: "accept",
      summary: "Read-only inspection verified both criteria",
      checks: [
        { criterion: 0, toolUseIds: ["inspect"] },
        { criterion: 1, toolUseIds: ["inspect"] },
      ],
    };
    expect(
      settleSessionExecution(
        initial(),
        terminal({
          assessment: sharedEvidence,
          evidence: [{ id: "inspect", successful: true, observationOrder: 1 }],
          lastMutationOrder: undefined,
        }),
      ),
    ).toMatchObject({ phase: "completed" });
  });

  it("ignores stale and duplicate terminal callbacks", () => {
    const state = initial();
    expect(
      settleSessionExecution(state, terminal({ queueId: "old-queue" })),
    ).toBe(state);
    const settled = settleSessionExecution(state, terminal());
    expect(settleSessionExecution(settled, terminal())).toBe(settled);
  });

  it("rejects missing, failed, stale, duplicated, and post-mutation-invalid tool evidence", () => {
    for (const evidence of [
      [],
      [{ id: "tool-1", successful: true, observationOrder: 12 }],
      [
        { id: "tool-1", successful: true, observationOrder: 12 },
        { id: "tool-2", successful: false, observationOrder: 13 },
      ],
      [
        { id: "tool-1", successful: true, observationOrder: 9 },
        { id: "tool-2", successful: true, observationOrder: 13 },
      ],
    ]) {
      expect(
        settleSessionExecution(initial(), terminal({ evidence })).phase,
      ).toBe("awaiting_review");
    }
    expect(
      settleSessionExecution(
        initial(),
        terminal({
          assessment: { ...accepted, checks: [accepted.checks[0]!] },
        }),
      ).phase,
    ).toBe("awaiting_review");
    expect(
      settleSessionExecution(
        initial(),
        terminal({
          assessment: {
            ...accepted,
            checks: [
              accepted.checks[0]!,
              { criterion: 1, toolUseIds: ["missing"] },
            ],
          },
        }),
      ).phase,
    ).toBe("awaiting_review");
    expect(
      settleSessionExecution(
        initial(),
        terminal({
          evidence: [
            { id: "tool-1", successful: true, observationOrder: 12 },
            { id: "tool-2", successful: true, observationOrder: 13 },
          ],
          lastMutationOrder: 13,
        }),
      ).phase,
    ).toBe("awaiting_review");
    const malformed = {
      ...accepted,
      checks: [
        { criterion: -1, toolUseIds: ["tool-1"] },
        { criterion: 1, toolUseIds: ["tool-2"] },
      ],
    } as unknown as ExecutionAssessment;
    expect(
      settleSessionExecution(initial(), terminal({ assessment: malformed }))
        .phase,
    ).toBe("awaiting_review");
    const unsafe = {
      ...accepted,
      checks: [
        { criterion: Number.MAX_SAFE_INTEGER + 1, toolUseIds: ["tool-1"] },
        { criterion: 1, toolUseIds: ["tool-2"] },
      ],
    } as unknown as ExecutionAssessment;
    expect(
      settleSessionExecution(initial(), terminal({ assessment: unsafe })).phase,
    ).toBe("awaiting_review");
  });

  it("pauses on Stop and enters incomplete at turn, no-progress, rework, and deadline limits", () => {
    expect(
      settleSessionExecution(initial(), terminal({ status: "stopped" })).phase,
    ).toBe("paused");
    expect(
      settleSessionExecution(initial(), terminal({ status: "error" })).phase,
    ).toBe("incomplete");
    expect(
      settleSessionExecution(
        { ...initial(), turns: EXECUTION_LIMITS.maxTurns },
        terminal({ assessment: undefined }),
      ).reason,
    ).toBe("turn_limit_reached");
    expect(
      settleSessionExecution(
        { ...initial(), turns: EXECUTION_LIMITS.maxTurns },
        terminal({ assessment: accepted }),
      ).phase,
    ).toBe("completed");
    expect(
      settleSessionExecution(
        { ...initial(), reworks: EXECUTION_LIMITS.maxReworks },
        terminal({ assessment: accepted }),
      ).phase,
    ).toBe("completed");
    const sameDigest: SessionExecution = {
      ...initial(),
      lastProgressDigest: "same",
      noProgress: EXECUTION_LIMITS.maxNoProgress - 1,
    };
    expect(
      settleSessionExecution(
        sameDigest,
        terminal({ progressDigest: "same", assessment: undefined }),
      ).reason,
    ).toBe("no_progress_limit_reached");
    expect(
      settleSessionExecution(initial(), terminal({ now: initial().deadlineAt }))
        .reason,
    ).toBe("deadline_exceeded");
    const maxed = settleSessionExecution(
      { ...initial(), reworks: EXECUTION_LIMITS.maxReworks - 1 },
      terminal({
        assessment: { decision: "rework", summary: "retry", checks: [] },
      }),
    );
    expect(maxed).toMatchObject({
      phase: "incomplete",
      reason: "rework_limit_reached",
    });
  });

  it("does not reopen terminal states and gates continuations by phase, deadline, budgets, and lease", () => {
    const complete = settleSessionExecution(initial(), terminal());
    expect(
      settleSessionExecution(complete, terminal({ progressDigest: "later" })),
    ).toBe(complete);
    expect(
      canContinueSessionExecution(
        { ...initial(), phase: "rework", lastSettledQueueId: "queue-1" },
        1001,
      ),
    ).toBe(true);
    expect(
      canContinueSessionExecution({ ...initial(), phase: "paused" }, 1001),
    ).toBe(false);
    expect(
      canContinueSessionExecution({ ...initial(), phase: "running" }, 1001),
    ).toBe(false);
    expect(
      canContinueSessionExecution(
        {
          ...initial(),
          phase: "rework",
          lastSettledQueueId: "queue-1",
          continuation: {
            queueId: "q2",
            afterQueueId: "queue-1",
            state: "pending",
          },
        },
        1001,
      ),
    ).toBe(true);
    expect(
      canContinueSessionExecution(
        {
          ...initial(),
          continuation: {
            queueId: "q2",
            afterQueueId: "queue-1",
            state: "claimed",
          },
        },
        1001,
      ),
    ).toBe(false);
    expect(canContinueSessionExecution(initial(), initial().deadlineAt)).toBe(
      false,
    );
  });
});
