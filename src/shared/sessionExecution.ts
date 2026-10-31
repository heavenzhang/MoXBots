import { z } from "zod";

/** Bounded utility diagnostics only; never execution or continuation authority. */
export type ExecutionIntentFailure = 'timeout' | 'cancelled' | 'unavailable' | 'transport'
  | 'empty_response' | 'invalid_json' | 'invalid_schema' | 'missing_continuation' | 'missing_steps';

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const idSchema = boundedText(256);

export const executionIntentSchema = z
  .object({
    kind: z.enum(["answer", "plan", "execute", "control"]),
    objective: boundedText(4000),
    scope: boundedText(4000),
    acceptanceCriteria: z.array(boundedText(2000)).max(20),
    /** Optional when reading legacy executions; fresh execute classifications require steps. */
    steps: z.array(boundedText(2000)).max(20).optional(),
    /** Exact current task, only for a trusted human request to continue its scope. */
    continuationOf: idSchema.nullish(),
  })
  .strict()
  .superRefine((intent, ctx) => {
    if (intent.continuationOf && intent.kind !== "execute")
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["continuationOf"],
        message: "Only execute intent can continue a task",
      });
    if (intent.kind === "execute" && intent.acceptanceCriteria.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["acceptanceCriteria"],
        message: "Execute intent requires at least one acceptance criterion",
      });
    }
  });

export const executionAssessmentSchema = z
  .object({
    decision: z.enum(["accept", "rework", "blocked", "needs_user"]),
    summary: boundedText(4000),
    checks: z
      .array(
        z
          .object({
            criterion: z.number().int().min(0).max(19),
            toolUseIds: z.array(idSchema).max(20),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

const continuationSchema = z
  .object({
    queueId: idSchema,
    afterQueueId: idSchema,
    state: z.enum(["pending", "claimed", "dispatched"]),
    claimId: idSchema.optional(),
    error: z.string().max(2000).optional(),
  })
  .strict();

export const sessionExecutionSchema = z
  .object({
    id: idSchema,
    requestId: idSchema,
    originalInput: boundedText(20000),
    intent: executionIntentSchema,
    phase: z.enum([
      "running",
      "awaiting_review",
      "rework",
      "paused",
      "incomplete",
      "completed",
    ]),
    startedAt: z.number().finite().nonnegative(),
    /** Legacy audit field; task lifetime is no longer limited by wall-clock time. */
    deadlineAt: z.number().finite().nonnegative(),
    turns: z.number().int().nonnegative(),
    reworks: z.number().int().nonnegative(),
    noProgress: z.number().int().nonnegative(),
    lastProgressDigest: z.string().max(256).optional(),
    currentQueueId: idSchema,
    lastSettledQueueId: idSchema.optional(),
    continuation: continuationSchema.optional(),
    reason: z.string().max(2000).optional(),
    assessment: executionAssessmentSchema.optional(),
  })
  .strict()
  .superRefine((state, ctx) => {
    if (state.deadlineAt < state.startedAt)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deadlineAt"],
        message: "deadlineAt must not precede startedAt",
      });
  });

export type ExecutionIntent = z.infer<typeof executionIntentSchema>;
export type ExecutionAssessment = z.infer<typeof executionAssessmentSchema>;
export type SessionExecution = z.infer<typeof sessionExecutionSchema>;

export const EXECUTION_LIMITS = {
  maxReworks: 3,
  maxNoProgress: 2,
} as const;

export function createSessionExecution(input: {
  id: string;
  requestId: string;
  originalInput: string;
  intent: ExecutionIntent;
  queueId: string;
  now: number;
}): SessionExecution {
  if (input.intent.kind !== "execute")
    throw new Error("SESSION_EXECUTION_REQUIRES_EXECUTE_INTENT");
  return sessionExecutionSchema.parse({
    id: input.id,
    requestId: input.requestId,
    originalInput: input.originalInput,
    intent: input.intent,
    phase: "running",
    startedAt: input.now,
    // Retain the old serialized shape for rollback readers. Current admission,
    // tools, delegation and settlement never use this historical timestamp.
    deadlineAt: input.now + 30 * 60_000,
    turns: 1,
    reworks: 0,
    noProgress: 0,
    currentQueueId: input.queueId,
  });
}

export type ExecutionEvidence = {
  id: string;
  successful: boolean;
  observationOrder: number;
};
export type ExecutionTerminal = {
  queueId: string;
  status: "complete" | "stopped" | "error";
  now: number;
  assessment?: ExecutionAssessment;
  evidence: ExecutionEvidence[];
  lastMutationOrder?: number;
  progressDigest: string;
  blocked?: string;
};

function acceptedAssessmentIsProven(
  state: SessionExecution,
  terminal: ExecutionTerminal,
): boolean {
  const assessment = terminal.assessment;
  if (!assessment || assessment.decision !== "accept") return false;
  const criteriaCount = state.intent.acceptanceCriteria.length;
  if (assessment.checks.length !== criteriaCount) return false;
  const byCriterion = new Map<number, (typeof assessment.checks)[number]>();
  for (const check of assessment.checks) {
    if (
      !Number.isSafeInteger(check.criterion) ||
      check.criterion < 0 ||
      byCriterion.has(check.criterion) ||
      check.criterion >= criteriaCount ||
      check.toolUseIds.length === 0 ||
      new Set(check.toolUseIds).size !== check.toolUseIds.length
    )
      return false;
    byCriterion.set(check.criterion, check);
  }
  if (byCriterion.size !== criteriaCount) return false;
  const evidenceById = new Map(
    terminal.evidence.map((item) => [item.id, item]),
  );
  const lastMutationOrder = terminal.lastMutationOrder ?? 0;
  for (const check of byCriterion.values())
    for (const id of check.toolUseIds) {
      const fact = evidenceById.get(id);
      if (
        !fact?.successful ||
        !Number.isFinite(fact.observationOrder) ||
        fact.observationOrder <= lastMutationOrder
      )
        return false;
    }
  return byCriterion.size > 0;
}

export function settleSessionExecution(
  state: SessionExecution,
  terminal: ExecutionTerminal,
): SessionExecution {
  if (
    ["paused", "completed", "incomplete"].includes(state.phase) ||
    state.lastSettledQueueId === terminal.queueId ||
    state.currentQueueId !== terminal.queueId
  )
    return state;

  const next: SessionExecution = {
    ...state,
    lastSettledQueueId: terminal.queueId,
    ...(state.continuation?.queueId === terminal.queueId
      ? { continuation: undefined }
      : {}),
  };
  const digest = terminal.progressDigest.slice(0, 256);
  next.noProgress =
    digest && digest === state.lastProgressDigest ? state.noProgress + 1 : 0;
  if (digest) next.lastProgressDigest = digest;

  if (terminal.status === "stopped")
    return { ...next, phase: "paused", reason: "stopped" };
  if (terminal.status === "error")
    return {
      ...next,
      phase: "incomplete",
      reason: terminal.blocked ?? "turn_error",
    };
  if (
    terminal.blocked ||
    terminal.assessment?.decision === "blocked" ||
    terminal.assessment?.decision === "needs_user"
  ) {
    return {
      ...next,
      phase: "paused",
      reason: terminal.blocked ?? terminal.assessment?.summary,
      assessment: terminal.assessment,
    };
  }
  // A verified acceptance from the already-admitted final turn settles the
  // objective; rework limits only prevent starting another turn.
  if (
    acceptedAssessmentIsProven(state, terminal)
  ) {
    return {
      ...next,
      phase: "completed",
      reason: undefined,
      assessment: terminal.assessment,
    };
  }
  if (next.noProgress >= EXECUTION_LIMITS.maxNoProgress)
    return {
      ...next,
      phase: "incomplete",
      reason: "no_progress_limit_reached",
    };
  // An explicitly resumed human turn may still complete with verified evidence.
  // Without acceptance, an exhausted rework budget must not restart an automatic loop.
  if (state.reworks >= EXECUTION_LIMITS.maxReworks)
    return { ...next, phase: "incomplete", reason: "rework_limit_reached" };
  if (terminal.assessment?.decision === "rework") {
    const reworks = state.reworks + 1;
    return reworks >= EXECUTION_LIMITS.maxReworks
      ? {
          ...next,
          reworks,
          phase: "incomplete",
          reason: "rework_limit_reached",
          assessment: terminal.assessment,
        }
      : { ...next, reworks, phase: "rework", assessment: terminal.assessment };
  }
  if (!terminal.assessment)
    return { ...next, phase: "awaiting_review", reason: "assessment_required" };
  return {
    ...next,
    phase: "awaiting_review",
    reason: "acceptance_evidence_incomplete",
    assessment: terminal.assessment,
  };
}

export function canContinueSessionExecution(
  state: SessionExecution,
  _now: number,
): boolean {
  return (
    state.intent.kind === "execute" &&
    ["awaiting_review", "rework", "running"].includes(state.phase) &&
    state.reworks < EXECUTION_LIMITS.maxReworks &&
    state.noProgress < EXECUTION_LIMITS.maxNoProgress &&
    state.lastSettledQueueId === state.currentQueueId &&
    (!state.continuation || state.continuation.state === "pending")
  );
}
