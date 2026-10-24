import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopMessageRequest, SessionEngine } from "./types";
import type {
  ExecutionAssessment,
  ExecutionIntent,
} from "../../shared/sessionExecution";

const state = vi.hoisted(() => ({ home: "", broadcasts: vi.fn() }));
vi.mock("os", async (original) => ({
  ...(await original<typeof import("os")>()),
  homedir: () => state.home,
}));
vi.mock("../sse", () => ({ broadcast: state.broadcasts }));

let store: typeof import("../SessionStore");
let taskOwner: typeof import("./task-orchestration");
let executionOwner: typeof import("./session-execution");
let taskDispatch: typeof import("./session-task-dispatch");
let id: string;
let engine: SessionEngine;
let currentQueueId = "root-queue";
let continuationRequests: DesktopMessageRequest[] = [];
let continuationCommitResults: boolean[] = [];
let acceptDispatch = true;
let dispatchPromise: Promise<{ accepted: boolean; error?: string }> | undefined;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const input = "Please create and verify a small artifact in this workspace.";
const executeIntent: ExecutionIntent = {
  kind: "execute",
  objective: "Create a verified artifact",
  scope: "Current workspace only",
  acceptanceCriteria: [
    "Artifact was written",
    "Artifact was verified after the write",
  ],
};
const planIntent: ExecutionIntent = {
  kind: "plan",
  objective: "Discuss the approach",
  scope: "No changes",
  acceptanceCriteria: [],
};

beforeEach(async () => {
  state.home = await mkdtemp(join(process.cwd(), ".tmp-session-execution-"));
  vi.resetModules();
  state.broadcasts.mockClear();
  store = await import("../SessionStore");
  taskOwner = await import("./task-orchestration");
  executionOwner = await import("./session-execution");
  taskDispatch = await import("./session-task-dispatch");
  id = (await store.createSession("/synthetic-workspace")).id;
  currentQueueId = "root-queue";
  continuationRequests = [];
  continuationCommitResults = [];
  acceptDispatch = true;
  dispatchPromise = undefined;
  engine = {
    kind: "builtin",
    getCurrentSessionContext: () => ({
      sessionId: id,
      workspacePath: "/synthetic-workspace",
    }),
    getRuntimeIdentity: () => ({ sessionId: id, runtime: "builtin" }),
    getCurrentTurnIdentity: () => ({
      queueId: currentQueueId,
      owner: { kind: "task", id: currentQueueId },
    }),
    getExecutionTurnId: () => currentQueueId,
    getExecutionVerificationEpoch: () => "native-query-1:0",
    getLiveSessionState: () => ({
      sessionState: "idle",
      waitingForUser: false,
      backgroundWorkActive: false,
      hasBackgroundWork: false,
      backgroundWorkBlocksContinuation: false,
    }),
    getQueueStatus: () => [],
    getStreamReplaySnapshot: () => ({ pendingInteractiveRequests: [] }),
    isBusy: () => false,
  } as unknown as SessionEngine;
  engine.sendDesktopMessage = vi.fn(async (request) => {
    continuationRequests.push(request);
    const guarded = (await request.beforeDispatch?.()) ?? { accepted: true };
    const committed = guarded.validateAtCommit?.() ?? guarded;
    continuationCommitResults.push(committed.accepted);
    if (committed.accepted) currentQueueId = request.queueId!;
    return {
      success: committed.accepted,
      error: committed.accepted ? undefined : committed.error,
      queueId: request.queueId,
      dispatchAcceptance:
        dispatchPromise ??
        Promise.resolve({ accepted: acceptDispatch && committed.accepted }),
    };
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await store.getActiveSessionTranscript(id)?.revoke();
  await rm(state.home, { recursive: true, force: true });
});

async function proveHumanInput(requestId = "human-1", text = input) {
  await taskOwner.recordSessionPlanHumanInput(id, requestId, text);
}

async function prepare(
  text = input,
  requestId = "human-1",
  intent: ExecutionIntent | undefined = executeIntent,
) {
  await proveHumanInput(requestId, text);
  const request: DesktopMessageRequest = {
    text,
    clientRequestId: requestId,
    sessionId: id,
    workspacePath: "/synthetic-workspace",
    scenario: { type: "desktop", surface: "chat" },
  };
  const classify = vi.fn(async () => intent);
  const prepared = await executionOwner.prepareSessionExecution(
    engine,
    request,
    classify,
  );
  if (prepared.request.queueId) {
    const decision = await prepared.request.beforeDispatch!();
    expect(decision.accepted).toBe(true);
    expect(decision.validateAtCommit?.().accepted).toBe(true);
    currentQueueId = prepared.request.queueId;
  }
  return { ...prepared, classify };
}

function currentExecution() {
  return store.getSessionMetadata(id)?.taskOrchestration?.execution;
}

async function tool(
  queueId: string,
  options: {
    id: string;
    name: string;
    stage: "start" | "success" | "failure";
    root?: boolean;
    input?: unknown;
    output?: unknown;
    isCurrent?: boolean;
  },
) {
  const observation = {
    id: options.id,
    queueId,
    name: options.name,
    stage: options.stage,
    verificationEpoch: engine.getExecutionVerificationEpoch?.(),
    root: options.root ?? true,
    input: options.input ?? { command: `${options.name} ${options.stage}` },
    output: options.output,
    isCurrent: () => options.isCurrent ?? true,
  };
  // Shorthand success fixtures still model the real Pre/PostToolUse pair.
  const existing = store
    .getSessionMetadata(id)
    ?.taskOrchestration?.executionEvidence?.some(
      (fact) => fact.id === options.id,
    );
  if (options.stage === "success" && !existing)
    await executionOwner.observeSessionExecutionTool(id, {
      ...observation,
      stage: "start",
    });
  await executionOwner.observeSessionExecutionTool(id, observation);
}

async function submitReview(
  queueId: string,
  assessment: ExecutionAssessment,
  options: {
    root?: boolean;
    receiptOverride?: string;
    isCurrent?: boolean;
    success?: boolean;
  } = {},
) {
  const execution = currentExecution()!;
  const proposed = await executionOwner.requestSessionExecutionReview(engine, {
    executionId: execution.id,
    queueId,
    assessment,
  });
  const body = {
    kind: "execution_review",
    executionId: execution.id,
    queueId,
    assessment,
  };
  const command = `myagents session tasks --json --data '${JSON.stringify(body)}'`;
  const receipt = options.receiptOverride ?? proposed.executionReviewReceipt;
  await tool(queueId, {
    id: `review-${receipt}`,
    name: "Bash",
    stage: "start",
    root: options.root,
    input: { command },
  });
  await tool(queueId, {
    id: `review-${receipt}`,
    name: "Bash",
    stage: options.success === false ? "failure" : "success",
    root: options.root,
    input: { command },
    output: JSON.stringify({ success: true, executionReviewReceipt: receipt }),
    isCurrent: options.isCurrent,
  });
  return proposed.executionReviewReceipt;
}

async function waitForContinuation(
  expectedState: "claimed" | "dispatched" = "dispatched",
) {
  await vi.waitFor(() =>
    expect(continuationRequests.length).toBeGreaterThan(0),
  );
  await vi.waitFor(() =>
    expect(currentExecution()?.continuation?.state).toBe(expectedState),
  );
  return continuationRequests.at(-1)!;
}

describe("durable Session execution owner", () => {
  it.each(["read-started-busy", "background-completed-after-read"])(
    "rejects stale Read evidence across native background settlement: %s",
    async (timing) => {
      const prepared = await prepare();
      const queueId = prepared.request.queueId!;
      let epoch: string | undefined =
        timing === "read-started-busy" ? undefined : "native-query-1:0";
      engine.getExecutionVerificationEpoch = () => epoch;
      await tool(queueId, {
        id: "intermediate-read",
        name: "Read",
        stage: "start",
      });
      if (timing === "read-started-busy") epoch = "native-query-1:1";
      await tool(queueId, {
        id: "intermediate-read",
        name: "Read",
        stage: "success",
        output: "Intermediate artifact contents",
      });
      epoch = "native-query-1:2";
      const acceptOld: ExecutionAssessment = {
        decision: "accept",
        summary: "Old read must not prove the settled writer's output",
        checks: [
          { criterion: 0, toolUseIds: ["intermediate-read"] },
          { criterion: 1, toolUseIds: ["intermediate-read"] },
        ],
      };
      await submitReview(queueId, acceptOld);
      await prepared.request.onTerminal?.({
        status: "complete",
        text: "Native background is now quiet.",
        assistantMessagePresent: true,
      });
      const next = await waitForContinuation();
      expect(currentExecution()?.phase).not.toBe("completed");
      const fact = store
        .getSessionMetadata(id)!
        .taskOrchestration!.executionEvidence!.find(
          (f) => f.id === "intermediate-read",
        )!;
      expect(fact.successful).toBe(true); // Keep the real tool outcome separate from verification eligibility.
      await submitReview(next.queueId!, acceptOld);
      await next.onTerminal?.({
        status: "complete",
        text: "Reusing the old read is still invalid.",
        assistantMessagePresent: true,
      });
      const fresh = await waitForContinuation();
      expect(fresh.queueId).not.toBe(next.queueId);
      await tool(fresh.queueId!, {
        id: "quiet-read",
        name: "Read",
        stage: "success",
        output: "Final artifact",
      });
      await submitReview(fresh.queueId!, {
        decision: "accept",
        summary: "Fresh root read after native background settled",
        checks: [
          { criterion: 0, toolUseIds: ["quiet-read"] },
          { criterion: 1, toolUseIds: ["quiet-read"] },
        ],
      });
      await fresh.onTerminal?.({
        status: "complete",
        text: "Verified final artifact.",
        assistantMessagePresent: true,
      });
      expect(currentExecution()?.phase).toBe("completed");
    },
  );

  it("allows verified acceptance when native background work is explicitly nonblocking", async () => {
    const prepared = await prepare();
    const queueId = prepared.request.queueId!;
    await tool(queueId, {
      id: "detached-read",
      name: "Read",
      stage: "success",
      output: "Final artifact verified",
    });
    await submitReview(queueId, {
      decision: "accept",
      summary: "Artifact complete; remaining native work is detached",
      checks: [
        { criterion: 0, toolUseIds: ["detached-read"] },
        { criterion: 1, toolUseIds: ["detached-read"] },
      ],
    });
    const idle = engine.getLiveSessionState;
    engine.getLiveSessionState = () => ({
      ...idle(),
      backgroundWorkActive: true,
      hasBackgroundWork: true,
      backgroundWorkBlocksContinuation: false,
    });
    await prepared.request.onTerminal?.({
      status: "complete",
      text: "Final artifact verified.",
      assistantMessagePresent: true,
    });
    expect(currentExecution()).toMatchObject({ phase: "completed", turns: 1 });
    expect(continuationRequests).toHaveLength(0);
  });

  it("defers an otherwise proven acceptance until blocking native background work settles", async () => {
    const prepared = await prepare();
    const queueId = prepared.request.queueId!;
    await tool(queueId, {
      id: "background-start",
      name: "Bash",
      stage: "success",
      output: "Background process launched",
    });
    await tool(queueId, {
      id: "early-read",
      name: "Read",
      stage: "success",
      output: "Current artifact contents",
    });
    await submitReview(queueId, {
      decision: "accept",
      summary:
        "Current artifact was read, but its native writer is still active",
      checks: [
        { criterion: 0, toolUseIds: ["early-read"] },
        { criterion: 1, toolUseIds: ["early-read"] },
      ],
    });
    const idle = engine.getLiveSessionState;
    engine.getLiveSessionState = () => ({
      ...idle(),
      backgroundWorkActive: true,
      hasBackgroundWork: true,
      backgroundWorkBlocksContinuation: true,
    });
    await prepared.request.onTerminal?.({
      status: "complete",
      text: "Read the intermediate artifact.",
      assistantMessagePresent: true,
    });
    expect(currentExecution()).toMatchObject({
      phase: "awaiting_review",
      reason: "BACKGROUND_WORK_ACTIVE",
      continuation: { state: "pending" },
    });
    expect(continuationRequests).toHaveLength(0);

    engine.getLiveSessionState = idle;
    await executionOwner.continueSessionExecution(engine, id);
    const next = await waitForContinuation();
    await tool(next.queueId!, {
      id: "settled-read",
      name: "Read",
      stage: "success",
      output: "Final artifact after native background completion",
    });
    await submitReview(next.queueId!, {
      decision: "accept",
      summary: "Verified the final artifact after native work settled",
      checks: [
        { criterion: 0, toolUseIds: ["settled-read"] },
        { criterion: 1, toolUseIds: ["settled-read"] },
      ],
    });
    await next.onTerminal?.({
      status: "complete",
      text: "Final artifact verified.",
      assistantMessagePresent: true,
    });
    expect(currentExecution()).toMatchObject({ phase: "completed", turns: 2 });
  });

  it("continues after two analysis-only turns and accepts a third-turn write plus fresh Read verification", async () => {
    const prepared = await prepare();
    const firstQueue = prepared.request.queueId!;
    expect(currentExecution()).toMatchObject({
      phase: "running",
      turns: 1,
      currentQueueId: firstQueue,
    });
    await prepared.request.onTerminal?.({
      status: "complete",
      text: "Analysis only; no tools called.",
      assistantMessagePresent: true,
    });
    const next = await waitForContinuation();
    expect(currentExecution()).toMatchObject({
      phase: "running",
      continuation: { state: "dispatched" },
      currentQueueId: next.queueId,
    });
    expect(continuationRequests).toHaveLength(1);
    await next.onTerminal?.({
      status: "complete",
      text: "Second analysis only; still no tool calls.",
      assistantMessagePresent: true,
    });
    const third = await waitForContinuation();
    expect(continuationRequests).toHaveLength(2);
    await tool(third.queueId!, {
      id: "write-third",
      name: "Write",
      stage: "success",
      output: "artifact written",
    });
    await tool(third.queueId!, {
      id: "verify-third",
      name: "Read",
      stage: "success",
      output: "artifact verified after write",
    });
    const thirdAssessment: ExecutionAssessment = {
      decision: "accept",
      summary: "Third turn wrote and verified the artifact",
      checks: [
        { criterion: 0, toolUseIds: ["verify-third"] },
        { criterion: 1, toolUseIds: ["verify-third"] },
      ],
    };
    await submitReview(third.queueId!, thirdAssessment);
    await third.onTerminal?.({
      status: "complete",
      text: "Artifact verified.",
      assistantMessagePresent: true,
    });
    expect(currentExecution()).toMatchObject({ phase: "completed", turns: 3 });
    await prepared.request.onTerminal?.({
      status: "complete",
      text: "duplicate callback",
      assistantMessagePresent: true,
    });
    expect(continuationRequests).toHaveLength(2);
  });

  it("wakes a pending continuation from native background completion without UI polling", async () => {
    const prepared = await prepare();
    const queueId = prepared.request.queueId!;
    const execution = currentExecution()!;
    await taskOwner.mutateSessionTaskLedger(id, (ledger) => {
      ledger.tasks.push({
        id: "native-wake-task",
        title: "Background task",
        blockedBy: [],
      });
      return ledger;
    });
    const ledger = store.getSessionMetadata(id)!.taskOrchestration!;
    await taskDispatch.registerSessionTaskPackage(engine, {
      taskId: "native-wake-task",
      executionId: execution.id,
      assignee: "Explore",
      resources: [{ path: "native-wake/", access: "write" }],
      reason: "Complete background work",
      expectedRevision: ledger.revision,
    });
    expect(
      await taskDispatch.authorizeSessionTaskTool({
        sessionId: id,
        queueId,
        toolUseId: "native-wake-launch",
        name: "Agent",
        input: {
          description: "[task:native-wake-task] Complete only assigned work",
          subagent_type: "Explore",
          run_in_background: true,
        },
        workspacePath: "/synthetic-workspace",
        isCurrent: () => true,
      }),
    ).toBeUndefined();
    await taskDispatch.settleSessionTaskDispatchTool(id, {
      toolUseId: "native-wake-launch",
      success: true,
      async: true,
      isCurrent: () => true,
    });

    await prepared.request.onTerminal?.({
      status: "complete",
      text: "The root turn ended while native work was still running.",
      assistantMessagePresent: true,
    });
    expect(currentExecution()?.continuation?.state).toBe("pending");
    expect(continuationRequests).toHaveLength(0);

    // Native task lifecycle observation wakes execution; no UI projection is read.
    await taskOwner.observeSessionTasks(id, {
      nativeLifecycle: true,
      attempts: [
        {
          id: "native-wake-attempt",
          toolUseId: "native-wake-launch",
          agentId: "native-agent-wake",
          title: "Background task",
          lifecycle: {
            status: "completed",
            startedAt: Date.now() - 100,
            finishedAt: Date.now(),
            result: "native result persisted",
          },
          executionVerified: true,
        },
      ],
    });
    const continuation = await waitForContinuation();
    expect(continuationRequests).toHaveLength(1);
    expect(continuation.queueId).not.toBe(queueId);
    expect(currentExecution()).toMatchObject({
      continuation: { state: "dispatched" },
      currentQueueId: continuation.queueId,
    });
  });

  it("accepts only a committed root review with exact successful post-write verification evidence", async () => {
    const prepared = await prepare();
    const firstQueue = prepared.request.queueId!;
    await tool(firstQueue, { id: "write-1", name: "Write", stage: "start" });
    await tool(firstQueue, {
      id: "write-1",
      name: "Write",
      stage: "success",
      output: "artifact created",
    });
    await tool(firstQueue, { id: "verify-1", name: "Read", stage: "start" });
    await tool(firstQueue, {
      id: "verify-1",
      name: "Read",
      stage: "success",
      output: "artifact contents verified",
    });
    const assessment: ExecutionAssessment = {
      decision: "accept",
      summary: "Both criteria verified",
      checks: [
        { criterion: 0, toolUseIds: ["verify-1"] },
        { criterion: 1, toolUseIds: ["verify-1"] },
      ],
    };
    await submitReview(firstQueue, assessment);
    await prepared.request.onTerminal?.({
      status: "complete",
      text: "Done",
      assistantMessagePresent: true,
    });
    expect(currentExecution()).toMatchObject({
      phase: "completed",
      lastSettledQueueId: firstQueue,
    });
    expect(continuationRequests).toHaveLength(0);
  });

  it("uses the native execution queue identity for review when there is no owned current turn", async () => {
    engine.getCurrentTurnIdentity = () => null;
    engine.getExecutionTurnId = () => currentQueueId;
    const prepared = await prepare();
    const queueId = prepared.request.queueId!;
    await tool(queueId, {
      id: "native-verify",
      name: "Read",
      stage: "success",
      output: "artifact is present and correct",
    });
    const assessment: ExecutionAssessment = {
      decision: "accept",
      summary: "Native turn verified the artifact",
      checks: [
        { criterion: 0, toolUseIds: ["native-verify"] },
        { criterion: 1, toolUseIds: ["native-verify"] },
      ],
    };
    await expect(submitReview(queueId, assessment)).resolves.toBeDefined();
    await prepared.request.onTerminal?.({
      status: "complete",
      text: "Native action complete",
      assistantMessagePresent: true,
    });
    expect(currentExecution()).toMatchObject({ phase: "completed" });
  });

  it("does not reconcile an idle native runtime while its committed turn awaits terminal persistence", async () => {
    const prepared = await prepare();
    const queueId = prepared.request.queueId!;
    const guard = await prepared.request.beforeDispatch!();
    expect(guard.accepted).toBe(true);
    expect(guard.validateAtCommit?.().accepted).toBe(true);
    expect(engine.getLiveSessionState().sessionState).toBe("idle");
    await executionOwner.reconcileSessionExecution(engine, id);
    expect(currentExecution()).toMatchObject({
      phase: "running",
      currentQueueId: queueId,
    });
    expect(continuationRequests).toHaveLength(0);

    await prepared.request.onTerminal?.({
      status: "complete",
      text: "Terminal now durably observed",
      assistantMessagePresent: true,
    });
    expect(currentExecution()).toMatchObject({ phase: "running" });
    expect(continuationRequests).toHaveLength(1);
  });

  it("does not let an old Read plus a later Write satisfy current acceptance", async () => {
    const prepared = await prepare();
    const queueId = prepared.request.queueId!;
    await tool(queueId, {
      id: "old-read",
      name: "Read",
      stage: "success",
      output: "old state inspected",
    });
    await tool(queueId, {
      id: "new-write",
      name: "Write",
      stage: "success",
      output: "state changed afterward",
    });
    const assessment: ExecutionAssessment = {
      decision: "accept",
      summary: "Claims both criteria",
      checks: [
        { criterion: 0, toolUseIds: ["old-read"] },
        { criterion: 1, toolUseIds: ["new-write"] },
      ],
    };
    await submitReview(queueId, assessment);
    await prepared.request.onTerminal?.({
      status: "complete",
      text: "Claimed done",
      assistantMessagePresent: true,
    });
    expect(currentExecution()).toMatchObject({
      phase: "running",
      reason: "acceptance_evidence_incomplete",
    });
    expect(continuationRequests).toHaveLength(1);
  });

  it("rejects Read evidence completed before an overlapping Write completes", async () => {
    const prepared = await prepare();
    const queueId = prepared.request.queueId!;
    await tool(queueId, {
      id: "write-overlap",
      name: "Write",
      stage: "start",
    });
    await tool(queueId, { id: "read-overlap", name: "Read", stage: "start" });
    await tool(queueId, {
      id: "read-overlap",
      name: "Read",
      stage: "success",
      output: "observed before the write completed",
    });
    await tool(queueId, {
      id: "write-overlap",
      name: "Write",
      stage: "success",
      output: "write completed after the read",
    });
    const assessment: ExecutionAssessment = {
      decision: "accept",
      summary: "Claims stale read proves the final artifact",
      checks: [
        { criterion: 0, toolUseIds: ["read-overlap"] },
        { criterion: 1, toolUseIds: ["read-overlap"] },
      ],
    };
    await submitReview(queueId, assessment);
    await prepared.request.onTerminal?.({
      status: "complete",
      text: "Claimed complete",
      assistantMessagePresent: true,
    });
    expect(currentExecution()).toMatchObject({
      phase: "running",
      reason: "acceptance_evidence_incomplete",
    });
    expect(continuationRequests).toHaveLength(1);
  });

  it.each(["Write", "mcp__filesystem.write_file"])(
    "pauses on %s start followed by a lost or failed receipt",
    async (name) => {
      const prepared = await prepare();
      const queueId = prepared.request.queueId!;
      await tool(queueId, { id: "uncertain-mutation", name, stage: "start" });
      await tool(queueId, {
        id: "uncertain-mutation",
        name,
        stage: "failure",
        output: "error reported after the operation may have committed",
      });
      await prepared.request.onTerminal?.({
        status: "complete",
        text: "The tool failed without a reliable write receipt",
        assistantMessagePresent: true,
      });
      expect(currentExecution()).toMatchObject({
        phase: "paused",
        reason: "TOOL_OUTCOME_UNKNOWN",
      });
      expect(continuationRequests).toHaveLength(0);
    },
  );

  it("treats default session task listing as bookkeeping and stores no execution tool evidence", async () => {
    const prepared = await prepare();
    const queueId = prepared.request.queueId!;
    const command = "myagents session tasks --json";
    await tool(queueId, {
      id: "list-task-state",
      name: "Bash",
      stage: "start",
      input: { command },
    });
    await tool(queueId, {
      id: "list-task-state",
      name: "Bash",
      stage: "success",
      input: { command },
      output: JSON.stringify({ execution: currentExecution() }),
    });
    expect(
      store.getSessionMetadata(id)?.taskOrchestration?.executionEvidence,
    ).toEqual([]);
  });

  it("does not accept child/root-false evidence even with a committed root review", async () => {
    const prepared = await prepare();
    const queueId = prepared.request.queueId!;
    await tool(queueId, {
      id: "write",
      name: "Write",
      stage: "success",
      output: "written",
    });
    await tool(queueId, {
      id: "read-child",
      name: "Read",
      stage: "success",
      output: "verified",
      root: false,
    });
    const assessment: ExecutionAssessment = {
      decision: "accept",
      summary: "Claimed verification",
      checks: [
        { criterion: 0, toolUseIds: ["write"] },
        { criterion: 1, toolUseIds: ["read-child"] },
      ],
    };
    await submitReview(queueId, assessment);
    await prepared.request.onTerminal?.({
      status: "complete",
      text: "Claimed done",
      assistantMessagePresent: true,
    });
    expect(currentExecution()).toMatchObject({
      phase: "running",
      reason: "acceptance_evidence_incomplete",
    });
    expect(continuationRequests).toHaveLength(1);
  });

  it("does not accept a fabricated execution review receipt", async () => {
    const prepared = await prepare();
    const queueId = prepared.request.queueId!;
    await tool(queueId, {
      id: "write",
      name: "Write",
      stage: "success",
      output: "written",
    });
    await tool(queueId, {
      id: "read",
      name: "Read",
      stage: "success",
      output: "verified",
    });
    const assessment: ExecutionAssessment = {
      decision: "accept",
      summary: "Claims success",
      checks: [
        { criterion: 0, toolUseIds: ["write"] },
        { criterion: 1, toolUseIds: ["read"] },
      ],
    };
    await submitReview(queueId, assessment, {
      receiptOverride: "00000000-0000-4000-8000-000000000000",
    });
    await prepared.request.onTerminal?.({
      status: "complete",
      text: "Claimed done",
      assistantMessagePresent: true,
    });
    expect(currentExecution()).toMatchObject({
      phase: "running",
      reason: "assessment_required",
    });
    expect(continuationRequests).toHaveLength(1);
  });

  it("sends a failed validation to rework and accepts after fresh verification on the new queue", async () => {
    const prepared = await prepare();
    const firstQueue = prepared.request.queueId!;
    await tool(firstQueue, {
      id: "write-first",
      name: "Write",
      stage: "success",
      output: "artifact",
    });
    await tool(firstQueue, {
      id: "verify-fail",
      name: "Read",
      stage: "failure",
      output: "missing artifact",
    });
    const rework: ExecutionAssessment = {
      decision: "rework",
      summary: "Verification failed",
      checks: [],
    };
    await submitReview(firstQueue, rework);
    await prepared.request.onTerminal?.({
      status: "complete",
      text: "Verification failed",
      assistantMessagePresent: true,
    });
    const retry = await waitForContinuation();
    const retryQueue = retry.queueId!;
    await tool(retryQueue, {
      id: "write-retry",
      name: "Write",
      stage: "success",
      output: "repaired artifact",
    });
    await tool(retryQueue, {
      id: "verify-retry",
      name: "Read",
      stage: "success",
      output: "artifact verified",
    });
    const accepted: ExecutionAssessment = {
      decision: "accept",
      summary: "Repaired and verified",
      checks: [
        { criterion: 0, toolUseIds: ["verify-retry"] },
        { criterion: 1, toolUseIds: ["verify-retry"] },
      ],
    };
    await submitReview(retryQueue, accepted);
    await retry.onTerminal?.({
      status: "complete",
      text: "Verified",
      assistantMessagePresent: true,
    });
    expect(currentExecution()).toMatchObject({
      phase: "completed",
      reworks: 1,
      currentQueueId: retryQueue,
    });
    expect(continuationRequests).toHaveLength(1);
  });

  it("revokes dispatch after Stop while preserving earlier queued input admission", async () => {
    const stopped = await prepare();
    const stopCheck = await stopped.request.beforeDispatch!();
    expect(stopCheck.validateAtCommit?.().accepted).toBe(true);
    await executionOwner.pauseSessionExecution(id, "user_stop");
    expect(stopCheck.validateAtCommit?.().accepted).toBe(false);

    const steered = await prepare("A second authorized request", "human-2");
    const oldQueue = steered.request.queueId!;
    const oldGuard = await steered.request.beforeDispatch!();
    expect(oldGuard.accepted).toBe(true);
    await proveHumanInput("human-3", "A third request from the user");
    const third = await executionOwner.prepareSessionExecution(
      engine,
      {
        sessionId: id, workspacePath: "/synthetic-workspace",
        scenario: { type: "desktop", surface: "chat" },
        text: "A third request from the user", clientRequestId: "human-3",
      },
      vi.fn(async () => executeIntent),
    );
    expect(oldGuard.validateAtCommit?.().accepted).toBe(true);
    expect(currentExecution()?.requestId).toBe("human-2");
    expect(currentExecution()?.currentQueueId).toBe(oldQueue);
    const thirdGuard = await third.request.beforeDispatch!();
    expect(thirdGuard.validateAtCommit?.().accepted).toBe(true);
    expect(currentExecution()?.requestId).toBe("human-3");
    expect(oldQueue).not.toBe(currentExecution()?.currentQueueId);
  });

  it("does not let a stale A cancel or negative ACK pause a newer B execution", async () => {
    const a = await prepare(input, "human-A");
    const aGuard = a.request.beforeDispatch!;
    const admittedGuard = await aGuard();
    expect(admittedGuard.validateAtCommit?.().accepted).toBe(true);
    const aQueue = a.request.queueId!;

    const b = await prepare("Replacement request B", "human-B");
    const bQueue = b.request.queueId!;
    expect(currentExecution()).toMatchObject({
      requestId: "human-B",
      currentQueueId: bQueue,
      phase: "running",
    });

    await aGuard.cancel?.();
    await a.admitted({
      success: true,
      queueId: aQueue,
      dispatchAcceptance: Promise.resolve({
        accepted: false,
        error: "late negative ack for A",
      }),
    });
    await vi.waitFor(() =>
      expect(currentExecution()).toMatchObject({
        requestId: "human-B",
        currentQueueId: bQueue,
        phase: "running",
      }),
    );
  });

  it("resets per-execution launch budget for new input while preserving old unknown claims", async () => {
    const first = await prepare(input, "human-A-budget");
    const firstExecution = currentExecution()!;
    await taskOwner.mutateSessionTaskLedger(id, (ledger) => {
      for (let index = 1; index <= 6; index++) {
        ledger.tasks.push({
          id: `budget-task-${index}`,
          title: `Task ${index}`,
          blockedBy: [],
        });
      }
      return ledger;
    });

    for (let index = 1; index <= 6; index++) {
      const taskId = `budget-task-${index}`;
      const toolUseId = `budget-launch-${index}`;
      const ledger = store.getSessionMetadata(id)!.taskOrchestration!;
      await taskDispatch.registerSessionTaskPackage(engine, {
        taskId,
        executionId: firstExecution.id,
        assignee: "Explore",
        resources: [{ path: `budget-${index}/`, access: "write" }],
        reason: `Task ${index}`,
        expectedRevision: ledger.revision,
      });
      expect(
        await taskDispatch.authorizeSessionTaskTool({
          sessionId: id,
          queueId: first.request.queueId,
          toolUseId,
          name: "Agent",
          input: {
            description: `[task:${taskId}] Work in assigned package`,
            subagent_type: "Explore",
            run_in_background: true,
          },
          workspacePath: "/synthetic-workspace",
          isCurrent: () => true,
        }),
      ).toBeUndefined();
      await taskDispatch.settleSessionTaskDispatchTool(id, {
        toolUseId,
        success: true,
        async: true,
        isCurrent: () => true,
      });
      await taskOwner.observeSessionTasks(id, {
        nativeLifecycle: true,
        attempts: [
          {
            id: `budget-attempt-${index}`,
            toolUseId,
            agentId: `native-agent-${index}`,
            title: `Task ${index}`,
            lifecycle: {
              status: "completed",
              startedAt: Date.now() - 20,
              finishedAt: Date.now(),
              result: "done",
            },
            executionVerified: true,
          },
        ],
      });
    }

    let ledger = store.getSessionMetadata(id)!.taskOrchestration!;
    expect(ledger.delegationLaunches).toBe(6);
    expect(
      ledger.delegationClaims?.filter((claim) => claim.state === "settled"),
    ).toHaveLength(6);
    await taskOwner.mutateSessionTaskLedger(id, (next) => {
      next.taskPackages?.push({
        taskId: "budget-task-1",
        executionId: firstExecution.id,
        assignee: "Explore",
        resources: [{ path: "uncertain-old/", access: "write" }],
        reason: "Unknown prior write",
      });
      next.delegationClaims?.push({
        toolUseId: "old-unknown-claim",
        taskId: "budget-task-1",
        executionId: firstExecution.id,
        state: "unknown",
      });
      return next;
    });

    await prepare("New authorized request B", "human-B-budget");
    ledger = store.getSessionMetadata(id)!.taskOrchestration!;
    expect(ledger.execution?.requestId).toBe("human-B-budget");
    expect(ledger.delegationLaunches).toBe(0);
    expect(
      ledger.delegationClaims?.find(
        (claim) => claim.toolUseId === "old-unknown-claim",
      ),
    ).toMatchObject({
      executionId: firstExecution.id,
      state: "unknown",
    });
  });

  it("does not replay a claimed continuation after owner restart/reconciliation", async () => {
    const prepared = await prepare();
    dispatchPromise = new Promise(() => {});
    await prepared.request.onTerminal?.({
      status: "complete",
      text: "No tool receipts",
      assistantMessagePresent: true,
    });
    const continuation = await waitForContinuation("claimed");
    expect(currentExecution()?.continuation?.state).toBe("claimed");
    vi.resetModules();
    store = await import("../SessionStore");
    executionOwner = await import("./session-execution");
    currentQueueId = continuation.queueId!;
    await executionOwner.reconcileSessionExecution(engine, id);
    expect(continuationRequests).toHaveLength(1);
    expect(currentExecution()).toMatchObject({
      phase: "paused",
      reason: "EXECUTION_DISPATCH_OUTCOME_UNKNOWN",
    });
  });

  it("rejects commit when Stop lands after continuation claim persistence but before validateAtCommit", async () => {
    const prepared = await prepare();
    const persistedClaim = deferred<void>();
    const releaseClaim = deferred<void>();
    const originalUpdate = store.updateSessionMetadata.bind(store);
    vi.spyOn(store, "updateSessionMetadata").mockImplementation(
      async (sessionId, updates, precondition) => {
        const result = await originalUpdate(sessionId, updates, precondition);
        if (
          updates.taskOrchestration?.execution?.continuation?.state ===
          "claimed"
        ) {
          persistedClaim.resolve();
          await releaseClaim.promise;
        }
        return result;
      },
    );
    const terminal = prepared.request.onTerminal?.({
      status: "complete",
      text: "No tool receipts",
      assistantMessagePresent: true,
    });
    await persistedClaim.promise;
    const stop = executionOwner.pauseSessionExecution(
      id,
      "user_stop_during_claim",
    );
    releaseClaim.resolve();
    await Promise.all([terminal, stop]);
    expect(continuationRequests).toHaveLength(1);
    expect(continuationCommitResults.at(-1)).toBe(false);
    expect(currentExecution()?.phase).toBe("paused");
  });

  it("does not dispatch an old continuation while a newer trusted request is being classified", async () => {
    const first = await prepare();
    await first.request.onTerminal?.({
      status: "complete",
      text: "First analysis only",
      assistantMessagePresent: true,
    });
    const oldContinuation = await waitForContinuation();
    const newText = "A new request that supersedes the old work";
    await proveHumanInput("human-during-classification", newText);
    const started = deferred<void>();
    const classifyResult = deferred<ExecutionIntent | undefined>();
    const classify = vi.fn(async () => {
      started.resolve();
      return classifyResult.promise;
    });
    const newPreparation = executionOwner.prepareSessionExecution(
      engine,
      {
        text: newText,
        clientRequestId: "human-during-classification",
        sessionId: id,
        workspacePath: "/synthetic-workspace",
        scenario: { type: "desktop", surface: "chat" },
      },
      classify,
    );
    await started.promise;
    expect(currentExecution()?.phase).toBe("running");
    expect(executionOwner.sessionExecutionInferenceAllowed(id, oldContinuation.queueId)).toBe(true);
    await oldContinuation.onTerminal?.({
      status: "complete",
      text: "Old continuation finished during classification",
      assistantMessagePresent: true,
    });
    expect(continuationRequests).toHaveLength(1);
    classifyResult.resolve(executeIntent);
    const prepared = await newPreparation;
    expect(continuationRequests).toHaveLength(1);
    expect(currentExecution()?.requestId).toBe("human-1");
    const guard = await prepared.request.beforeDispatch!();
    expect(guard.validateAtCommit?.().accepted).toBe(true);
    expect(currentExecution()?.requestId).toBe("human-during-classification");
  });

  it("pauses on an unresolved mutating tool outcome instead of continuing", async () => {
    const prepared = await prepare();
    const queueId = prepared.request.queueId!;
    await tool(queueId, { id: "write-pending", name: "Write", stage: "start" });
    await prepared.request.onTerminal?.({
      status: "complete",
      text: "Tool did not report its result",
      assistantMessagePresent: true,
    });
    expect(currentExecution()).toMatchObject({
      phase: "paused",
      reason: "TOOL_OUTCOME_UNKNOWN",
    });
    expect(continuationRequests).toHaveLength(0);
  });

  it("does not execute a plan classification or classify/continue without signed input proof", async () => {
    const plan = await prepare(input, "plan-request", planIntent);
    expect(currentExecution()).toBeUndefined();
    expect(
      store.getSessionMetadata(id)?.taskOrchestration?.executionAdmission
        ?.intent?.kind,
    ).toBe("plan");
    await plan.request.onTerminal?.({
      status: "complete",
      text: "Plan only",
      assistantMessagePresent: true,
    });
    expect(continuationRequests).toHaveLength(0);

    const classify = vi.fn(async () => executeIntent);
    const untrusted = await executionOwner.prepareSessionExecution(
      engine,
      {
        text: "Unproved input",
        clientRequestId: "untrusted",
        sessionId: id,
        workspacePath: "/synthetic-workspace",
        scenario: { type: "desktop", surface: "chat" },
      },
      classify,
    );
    expect(classify).not.toHaveBeenCalled();
    await untrusted.request.onTerminal?.({
      status: "complete",
      text: "No authorization",
      assistantMessagePresent: true,
    });
    expect(currentExecution()).toBeUndefined();
    expect(continuationRequests).toHaveLength(0);
  });

  it("does not classify or dispatch a duplicate request after another user request supersedes it", async () => {
    const original = await prepare(input, "human-original");
    const originalQueue = original.request.queueId!;
    const replacement = await prepare(
      "A replacement authorized request",
      "human-replacement",
    );
    const replacementQueue = replacement.request.queueId!;
    const retryClassify = vi.fn(async () => executeIntent);
    const retry = await executionOwner.prepareSessionExecution(
      engine,
      {
        text: input,
        clientRequestId: "human-original",
        sessionId: id,
        workspacePath: "/synthetic-workspace",
        scenario: { type: "desktop", surface: "chat" },
      },
      retryClassify,
    );
    expect(retryClassify).not.toHaveBeenCalled();
    expect(retry.duplicate).toMatchObject({
      success: false,
      status: 409,
      queueId: originalQueue,
    });
    expect(currentExecution()).toMatchObject({
      requestId: "human-replacement",
      currentQueueId: replacementQueue,
    });
  });
});

describe("native background inference execution budget", () => {
  async function boundChild() {
    await prepare();
    const execution = currentExecution()!;
    await taskOwner.mutateSessionTaskLedger(id, (ledger) => {
      ledger.delegationClaims = [
        {
          toolUseId: "native-launch-exact",
          taskId: "task-child",
          executionId: execution.id,
          state: "running",
        },
      ];
      return ledger;
    });
    const native = await import("../builtin-session/lifecycle");
    const query = {} as NonNullable<
      Parameters<typeof native.setQuerySession>[0]
    >;
    native.setQuerySession(query);
    expect(
      native.recordQueryBackgroundTask(query, "native-child", {
        toolUseId: "native-launch-exact",
        runId: "native-run-1",
      }),
    ).toBe(true);
    const rows = () => native.readQueryBackgroundTasks(query);
    return { execution, native, query, rows };
  }

  it("keeps the exact original deadline after the root ends and blocks background retry at expiry", async () => {
    const h = await boundChild();
    const clock = vi
      .spyOn(Date, "now")
      .mockReturnValue(h.execution.deadlineAt - 1);
    try {
      expect(
        executionOwner.sessionExecutionDeadlineAt(id, null, h.rows()),
      ).toBe(h.execution.deadlineAt);
      expect(
        executionOwner.sessionExecutionInferenceAllowed(id, null, h.rows()),
      ).toBe(true);
      const { ModelFailoverController } = await import(
        "../openai-bridge/model-failover"
      );
      const execute = vi.fn(async () => {
        clock.mockReturnValue(h.execution.deadlineAt);
        return Response.json(
          { error: { message: "overloaded" } },
          { status: 503 },
        );
      });
      const controller = new ModelFailoverController({
        scope: () => undefined,
        retryDelaysMs: [0, 0, 0],
        deadlineAt: () =>
          executionOwner.sessionExecutionDeadlineAt(id, null, h.rows()),
        isActive: () =>
          executionOwner.sessionExecutionInferenceAllowed(id, null, h.rows()),
        resolveBackup: () => undefined,
        onSwitch: vi.fn(),
      });
      const request = () => new Request("http://fixture.invalid/messages");
      expect(
        (
          await controller.run(
            request(),
            { providerId: "fixture", baseUrl: "http://fixture.invalid" },
            execute,
            "child-first",
          )
        ).status,
      ).toBe(499);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(
        executionOwner.sessionExecutionInferenceAllowed(id, null, h.rows()),
      ).toBe(false);
      await controller.run(
        request(),
        { providerId: "fixture", baseUrl: "http://fixture.invalid" },
        execute,
        "child-next",
      );
      expect(execute).toHaveBeenCalledTimes(1);
    } finally {
      h.native.clearQuerySession();
      clock.mockRestore();
    }
  });

  it("revokes a precisely bound native child when its parent is stopped without a current root", async () => {
    const h = await boundChild();
    try {
      await executionOwner.pauseSessionExecution(id, "user_stop");
      expect(
        executionOwner.sessionExecutionDeadlineAt(id, null, h.rows()),
      ).toBe(h.execution.deadlineAt);
      expect(
        executionOwner.sessionExecutionInferenceAllowed(id, null, h.rows()),
      ).toBe(false);
    } finally {
      h.native.clearQuerySession();
    }
  });

  it("does not attach an old native child to a new human execution or its newer root queue", async () => {
    const h = await boundChild();
    try {
      await prepare("Create a different artifact now", "human-new-execution");
      expect(currentExecution()!.id).not.toBe(h.execution.id);
      for (const queue of [null, currentExecution()!.currentQueueId]) {
        expect(
          executionOwner.sessionExecutionInferenceAllowed(id, queue, h.rows()),
        ).toBe(false);
        expect(
          executionOwner.sessionExecutionDeadlineAt(id, queue, h.rows()),
        ).toBe(0);
      }
    } finally {
      h.native.clearQuerySession();
    }
  });

  it("does not authorize mixed or no-longer-live delegated claims under a proven sibling", async () => {
    const h = await boundChild();
    try {
      h.native.recordQueryBackgroundTask(h.query, "unattributed-child", {
        toolUseId: "unknown-launch",
        runId: "native-run-2",
      });
      expect(
        executionOwner.sessionExecutionInferenceAllowed(id, null, h.rows()),
      ).toBe(false);
      h.native.completeQueryBackgroundTask(h.query, "unattributed-child", {
        runId: "native-run-2",
        authoritative: true,
        status: "completed",
      });
      expect(
        executionOwner.sessionExecutionInferenceAllowed(id, null, h.rows()),
      ).toBe(true);
      await taskOwner.mutateSessionTaskLedger(id, (ledger) => {
        ledger.delegationClaims![0].state = "unknown";
        return ledger;
      });
      expect(
        executionOwner.sessionExecutionInferenceAllowed(id, null, h.rows()),
      ).toBe(false);
      h.native.completeQueryBackgroundTask(h.query, "native-child", {
        runId: "native-run-1",
        authoritative: true,
        status: "completed",
      });
      expect(h.rows()).toEqual([]);
      // Historical unknown claims alone do not revoke a genuine current root.
      expect(
        executionOwner.sessionExecutionInferenceAllowed(
          id,
          currentExecution()!.currentQueueId,
          h.rows(),
        ),
      ).toBe(true);
      expect(
        executionOwner.sessionExecutionDeadlineAt(
          id,
          currentExecution()!.currentQueueId,
          h.rows(),
        ),
      ).toBe(h.execution.deadlineAt);
    } finally {
      h.native.clearQuerySession();
    }
  });

  it.each(["reserved", "running", "unknown"] as const)(
    "does not treat missing or unmatched native task_started identity as legacy with a %s managed claim",
    async (claimState) => {
      const h = await boundChild();
      try {
        h.native.completeQueryBackgroundTask(h.query, "native-child", {
          runId: "native-run-1",
          authoritative: true,
          status: "completed",
        });
        await taskOwner.mutateSessionTaskLedger(id, (ledger) => {
          ledger.delegationClaims![0].state = claimState;
          return ledger;
        });
        for (const toolUseId of [undefined, "unmatched-launch"]) {
          const runId = toolUseId ? "missing-run-2" : "missing-run-1";
          const taskId = toolUseId
            ? "unmatched-native-child"
            : "missing-identity-native-child";
          expect(
            h.native.recordQueryBackgroundTask(h.query, taskId, {
              runId,
              ...(toolUseId ? { toolUseId } : {}),
            }),
          ).toBe(true);
          for (const queue of [null, h.execution.currentQueueId]) {
            expect(
              executionOwner.sessionExecutionInferenceAllowed(
                id,
                queue,
                h.rows(),
              ),
            ).toBe(false);
            expect(
              executionOwner.sessionExecutionDeadlineAt(id, queue, h.rows()),
            ).toBe(0);
          }
          h.native.completeQueryBackgroundTask(h.query, taskId, {
            runId,
            authoritative: true,
            status: "completed",
          });
        }
        expect(h.rows()).toEqual([]);
        expect(
          executionOwner.sessionExecutionInferenceAllowed(
            id,
            h.execution.currentQueueId,
            h.rows(),
          ),
        ).toBe(true);
        // A legacy native background run is allowed only after managed claims
        // have genuinely settled; unknown/reserved claims cannot be downgraded.
        await taskOwner.mutateSessionTaskLedger(id, (ledger) => {
          ledger.delegationClaims![0].state = "settled";
          return ledger;
        });
        h.native.recordQueryBackgroundTask(h.query, "legacy-child", {
          runId: "legacy-run",
        });
        expect(
          executionOwner.sessionExecutionInferenceAllowed(id, null, h.rows()),
        ).toBe(true);
        expect(
          executionOwner.sessionExecutionDeadlineAt(id, null, h.rows()),
        ).toBeUndefined();
      } finally {
        h.native.clearQuerySession();
      }
    },
  );
});
