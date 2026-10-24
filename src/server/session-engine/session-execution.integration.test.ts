import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseLeadingSystemReminder } from "../../shared/systemReminder";
import { isHumanUserMessage } from "../utils/session-message-preview";
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
  const prepared = await prepareUnpromoted(text, requestId, intent);
  if (prepared.request.queueId) {
    const decision = await prepared.request.beforeDispatch!();
    expect(decision.accepted).toBe(true);
    expect(decision.validateAtCommit?.().accepted).toBe(true);
    currentQueueId = prepared.request.queueId;
  }
  return prepared;
}

async function prepareUnpromoted(
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
  it("keeps the exact human input separate from runtime context and defers the card until dispatch", async () => {
    const original = "继续执行";
    const prepared = await prepareUnpromoted(original);
    expect(prepared.request.text).toBe(original);
    expect(prepared.request.desktopQuery?.visibleText).toBe(original);
    expect(prepared.request.surfaceUserBeforeDispatch).toBe(true);
    expect(prepared.request.runtimeReminder).toContain("execution_review");
    expect(currentExecution()).toBeUndefined();
    const accepted = await prepared.request.beforeDispatch!();
    expect(accepted.accepted).toBe(true);
    expect(currentExecution()?.originalInput).toBe(original);
    expect(prepared.request.text).toBe(original);
  });

  it("keeps automatic continuation context out of visible and human conversation history", async () => {
    const prepared = await prepare();
    await prepared.request.onTerminal?.({ status: "complete", text: "Analysis only", assistantMessagePresent: true });
    const continuation = continuationRequests[0]!;
    expect(continuation).toBeDefined();
    const parsed = parseLeadingSystemReminder(continuation.text);
    expect(parsed.kind).toBe("SESSION_EXECUTION");
    expect(parsed.visibleText).toBe("");
    expect(parsed.body).toContain(input);
    expect(continuation.desktopQuery?.visibleText).toBe("");
    expect(isHumanUserMessage({ content: continuation.text })).toBe(false);
  });

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
        sessionId: id,
        workspacePath: "/synthetic-workspace",
        scenario: { type: "desktop", surface: "chat" },
        text: "A third request from the user",
        clientRequestId: "human-3",
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
    expect(
      executionOwner.sessionExecutionInferenceAllowed(
        id,
        oldContinuation.queueId,
      ),
    ).toBe(true);
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

  it("continues the same execution only after its real terminal and preserves its original scope, budgets, evidence, and task history", async () => {
    const first = await prepare(input, "human-original-scope");
    const firstQueue = first.request.queueId!;
    const original = currentExecution()!;
    await tool(firstQueue, {
      id: "preserved-root-read",
      name: "Read",
      stage: "success",
      output: "Original verified progress",
    });
    await taskOwner.mutateSessionTaskLedger(id, (ledger) => {
      ledger.execution = {
        ...ledger.execution!,
        turns: 4,
        reworks: 1,
        noProgress: 1,
        lastProgressDigest: "prior-successful-tool-digest",
      };
      ledger.taskPackages = [
        {
          taskId: "preserved-package",
          executionId: original.id,
          assignee: "Explore",
          resources: [{ path: "artifact/", access: "write" }],
          reason: "Original scoped work",
        },
      ];
      ledger.delegationClaims = [
        {
          toolUseId: "preserved-launch",
          taskId: "preserved-package",
          executionId: original.id,
          state: "settled",
        },
      ];
      ledger.delegationLaunches = 4;
      return ledger;
    });
    await executionOwner.pauseSessionExecution(id, "user_stopped");
    await first.request.onTerminal?.({
      status: "stopped",
      text: "Stopped after recording the real turn result.",
      assistantMessagePresent: true,
    });
    expect(currentExecution()).toMatchObject({
      id: original.id,
      phase: "paused",
      reason: "user_stopped",
      lastSettledQueueId: firstQueue,
    });

    const sameTaskIntent: ExecutionIntent = {
      ...executeIntent,
      objective:
        "A classifier proposal that must not replace the original task",
      acceptanceCriteria: ["A weaker replacement criterion"],
      continuationOf: original.id,
    };
    const next = await prepareUnpromoted(
      "Continue the same artifact work",
      "human-same-task-continuation",
      sameTaskIntent,
    );
    const promoted = await next.request.beforeDispatch!();
    expect(promoted.accepted).toBe(true);
    expect(promoted.validateAtCommit?.().accepted).toBe(true);
    const continued = currentExecution()!;
    expect(continued).toMatchObject({
      id: original.id,
      requestId: "human-same-task-continuation",
      originalInput: original.originalInput,
      intent: original.intent,
      phase: "running",
      startedAt: original.startedAt,
      deadlineAt: original.deadlineAt,
      turns: 5,
      reworks: 1,
      noProgress: 1,
      lastProgressDigest: "prior-successful-tool-digest",
      currentQueueId: next.request.queueId,
    });
    const ledger = store.getSessionMetadata(id)!.taskOrchestration!;
    expect(ledger.executionEvidence?.map((fact) => fact.id)).toContain(
      "preserved-root-read",
    );
    expect(ledger.taskPackages).toEqual([
      expect.objectContaining({ taskId: "preserved-package" }),
    ]);
    expect(ledger.delegationClaims).toEqual([
      expect.objectContaining({
        toolUseId: "preserved-launch",
        state: "settled",
      }),
    ]);
    expect(ledger.delegationLaunches).toBe(4);

    // A second native guard for the same queue is an idempotent promotion.
    const repeated = await next.request.beforeDispatch!();
    expect(repeated.accepted).toBe(true);
    expect(repeated.validateAtCommit?.().accepted).toBe(true);
    expect(currentExecution()?.turns).toBe(5);

    // Old queue cancellation and duplicate terminal delivery cannot pause or settle the new queue.
    await first.request.beforeDispatch!.cancel?.();
    await first.request.onTerminal?.({
      status: "complete",
      text: "Late duplicate callback for the old queue",
      assistantMessagePresent: true,
    });
    expect(currentExecution()).toMatchObject({
      id: original.id,
      phase: "running",
      currentQueueId: next.request.queueId,
      turns: 5,
    });
  });

  it("keeps multiple same-task inputs ordered behind the previous queue terminal", async () => {
    const first = await prepare(input, "human-ordered-first");
    const firstQueue = first.request.queueId!;
    const executionId = currentExecution()!.id;
    await executionOwner.pauseSessionExecution(id, "user_stopped");
    await first.request.onTerminal?.({
      status: "stopped",
      text: "First queue terminal is persisted",
      assistantMessagePresent: true,
    });

    const continuationIntent: ExecutionIntent = {
      ...executeIntent,
      continuationOf: executionId,
    };
    const earlier = await prepareUnpromoted(
      "First follow-up input",
      "human-ordered-A",
      continuationIntent,
    );
    const later = await prepareUnpromoted(
      "Second follow-up input",
      "human-ordered-B",
      continuationIntent,
    );
    const earlierGuard = await earlier.request.beforeDispatch!();
    expect(earlierGuard.accepted).toBe(true);
    expect(earlierGuard.validateAtCommit?.().accepted).toBe(true);
    expect(currentExecution()).toMatchObject({
      currentQueueId: earlier.request.queueId,
      turns: 2,
      lastSettledQueueId: firstQueue,
    });
    const prematureLater = await later.request.beforeDispatch!();
    expect(prematureLater).toMatchObject({
      accepted: false,
      error: "EXECUTION_PREVIOUS_TURN_UNSETTLED",
    });
    expect(currentExecution()?.turns).toBe(2);

    await earlier.request.onTerminal?.({
      status: "complete",
      text: "The earlier follow-up reached terminal first",
      assistantMessagePresent: true,
    });
    const laterGuard = await later.request.beforeDispatch!();
    expect(laterGuard.accepted).toBe(true);
    expect(laterGuard.validateAtCommit?.().accepted).toBe(true);
    expect(currentExecution()).toMatchObject({
      currentQueueId: later.request.queueId,
      turns: 3,
      lastSettledQueueId: earlier.request.queueId,
    });
  });

  it.each([
    ["blocking background work", "BACKGROUND_WORK_ACTIVE"],
    ["waiting for the user", "WAITING_FOR_USER"],
    ["a pending interactive request", "WAITING_FOR_USER"],
  ] as const)(
    "rechecks %s synchronously after same-task continuation guard and on repeat",
    async (blocker, expectedError) => {
      const first = await prepare(input, `human-commit-gate-${blocker}`);
      const firstQueue = first.request.queueId!;
      const executionId = currentExecution()!.id;
      await executionOwner.pauseSessionExecution(id, "user_stopped");
      await first.request.onTerminal?.({
        status: "stopped",
        text: "Original queue reached a persisted terminal",
        assistantMessagePresent: true,
      });

      const next = await prepareUnpromoted(
        `Continue same task while ${blocker} may appear`,
        `human-commit-gate-followup-${blocker}`,
        { ...executeIntent, continuationOf: executionId },
      );
      const queueId = next.request.queueId!;
      const admitted = await next.request.beforeDispatch!();
      expect(admitted.accepted).toBe(true);
      expect(currentExecution()).toMatchObject({
        id: executionId,
        currentQueueId: queueId,
        turns: 2,
      });

      // A repeated native guard for this exact queue must be idempotent.
      const repeated = await next.request.beforeDispatch!();
      expect(repeated.accepted).toBe(true);
      expect(currentExecution()?.turns).toBe(2);

      const previousLiveState = engine.getLiveSessionState;
      const previousReplay = engine.getStreamReplaySnapshot;
      if (blocker === "blocking background work") {
        engine.getLiveSessionState = () => ({
          ...previousLiveState(),
          backgroundWorkActive: true,
          hasBackgroundWork: true,
          backgroundWorkBlocksContinuation: true,
        });
      } else if (blocker === "waiting for the user") {
        engine.getLiveSessionState = () => ({
          ...previousLiveState(),
          waitingForUser: true,
        });
      } else {
        engine.getStreamReplaySnapshot = () => ({
          ...previousReplay(),
          pendingInteractiveRequests: [
            {
              type: "permission:request",
              data: { requestId: "pending-approval" },
            },
          ],
        });
      }

      expect(admitted.validateAtCommit?.()).toMatchObject({
        accepted: false,
        error: expectedError,
      });
      expect(repeated.validateAtCommit?.()).toMatchObject({
        accepted: false,
        error: expectedError,
      });
      expect(await next.request.beforeDispatch!()).toMatchObject({
        accepted: false,
        error: expectedError,
      });
      expect(currentExecution()).toMatchObject({
        id: executionId,
        currentQueueId: queueId,
        turns: 2,
      });
      expect(firstQueue).not.toBe(queueId);
      expect(continuationRequests).toHaveLength(0);
    },
  );

  it.each([
    ["deadline", "deadline_exceeded"],
    ["no progress", "no_progress_limit_reached"],
    ["rework", "rework_limit_reached"],
  ])(
    "does not reset an exhausted %s budget on same-task continuation",
    async (budget, reason) => {
      const first = await prepare(input, `human-budget-${budget}`);
      const firstQueue = first.request.queueId!;
      const execution = currentExecution()!;
      await executionOwner.pauseSessionExecution(id, "user_stopped");
      await first.request.onTerminal?.({
        status: "stopped",
        text: "Persist the original queue terminal",
        assistantMessagePresent: true,
      });
      let guardedDeadline: number;
      await taskOwner.mutateSessionTaskLedger(id, (ledger) => {
        const current = ledger.execution!;
        if (budget === "deadline") current.deadlineAt = Date.now() - 1;
        if (budget === "no progress") current.noProgress = 2;
        if (budget === "rework") current.reworks = 3;
        guardedDeadline = current.deadlineAt;
        return ledger;
      });
      const next = await prepareUnpromoted(
        "Resume the same task without resetting its limits",
        `human-budget-resume-${budget}`,
        { ...executeIntent, continuationOf: execution.id },
      );
      const rejected = await next.request.beforeDispatch!();
      expect(rejected).toMatchObject({ accepted: false, error: reason });
      expect(currentExecution()).toMatchObject({
        id: execution.id,
        currentQueueId: firstQueue,
        turns: 1,
        deadlineAt: guardedDeadline!,
        phase: "incomplete",
        reason,
      });
      expect(continuationRequests).toHaveLength(0);
    },
  );

  it.each(["pending-write", "unknown-claim"] as const)(
    "does not resume same-task work with unresolved %s side effects",
    async (unknownSource) => {
      const first = await prepare(input, `human-unknown-${unknownSource}`);
      const firstQueue = first.request.queueId!;
      const executionId = currentExecution()!.id;
      if (unknownSource === "pending-write") {
        await tool(firstQueue, {
          id: "continuation-unknown-write",
          name: "Write",
          stage: "start",
        });
      } else {
        await taskOwner.mutateSessionTaskLedger(id, (ledger) => {
          ledger.delegationClaims = [
            ...(ledger.delegationClaims ?? []),
            {
              toolUseId: "unknown-continuation-claim",
              taskId: "unknown-task",
              executionId,
              state: "unknown",
            },
          ];
          return ledger;
        });
      }
      await first.request.onTerminal?.({
        status: "complete",
        text: "The side effect is not proven settled",
        assistantMessagePresent: true,
      });
      expect(currentExecution()).toMatchObject({
        phase: "paused",
        reason: "TOOL_OUTCOME_UNKNOWN",
      });
      const next = await prepareUnpromoted(
        "Retry the same work despite unknown writes",
        `human-unknown-resume-${unknownSource}`,
        { ...executeIntent, continuationOf: executionId },
      );
      expect(await next.request.beforeDispatch!()).toMatchObject({
        accepted: false,
        error: "TOOL_OUTCOME_UNKNOWN",
      });
      expect(currentExecution()).toMatchObject({
        id: executionId,
        currentQueueId: firstQueue,
        phase: "paused",
        reason: "TOOL_OUTCOME_UNKNOWN",
      });
      expect(continuationRequests).toHaveLength(0);
    },
  );

  it("allows a same-task retry after a known pre-dispatch cancel but keeps an unconfirmed dispatch blocked", async () => {
    const original = await prepare(input, "human-known-cancel-source");
    const originalQueue = original.request.queueId!;
    const originalExecution = currentExecution()!;
    await tool(originalQueue, {
      id: "known-cancel-preserved-read",
      name: "Read",
      stage: "success",
      output: "Evidence before the canceled continuation",
    });
    await taskOwner.mutateSessionTaskLedger(id, (ledger) => {
      ledger.execution = {
        ...ledger.execution!,
        reworks: 1,
        noProgress: 1,
        lastProgressDigest: "known-cancel-prior-progress",
      };
      return ledger;
    });
    await executionOwner.pauseSessionExecution(id, "user_stopped");
    await original.request.onTerminal?.({
      status: "stopped",
      text: "Original terminal persisted",
      assistantMessagePresent: true,
    });

    const intent: ExecutionIntent = {
      ...executeIntent,
      continuationOf: originalExecution.id,
    };
    const h1 = await prepareUnpromoted(
      "First continuation is canceled before dispatch",
      "human-known-cancel-H1",
      intent,
    );
    const h1Guard = await h1.request.beforeDispatch!();
    expect(h1Guard.accepted).toBe(true);
    expect(h1Guard.validateAtCommit?.().accepted).toBe(true);
    expect(currentExecution()).toMatchObject({
      id: originalExecution.id,
      currentQueueId: h1.request.queueId,
      turns: 2,
    });

    await h1.request.beforeDispatch!.cancel?.();
    await h1.request.onTerminal?.({
      status: "stopped",
      text: "Native owner confirms H1 never dispatched",
      assistantMessagePresent: true,
    });
    expect(currentExecution()).toMatchObject({
      id: originalExecution.id,
      phase: "paused",
      reason: "stopped",
      lastSettledQueueId: h1.request.queueId,
    });

    const h2 = await prepareUnpromoted(
      "Retry the same task after the known cancellation",
      "human-known-cancel-H2",
      intent,
    );
    const h2Guard = await h2.request.beforeDispatch!();
    expect(h2Guard.accepted).toBe(true);
    expect(h2Guard.validateAtCommit?.().accepted).toBe(true);
    expect(currentExecution()).toMatchObject({
      id: originalExecution.id,
      currentQueueId: h2.request.queueId,
      originalInput: originalExecution.originalInput,
      intent: originalExecution.intent,
      startedAt: originalExecution.startedAt,
      deadlineAt: originalExecution.deadlineAt,
      turns: 3,
      reworks: 1,
      noProgress: 1,
      lastProgressDigest: "known-cancel-prior-progress",
    });
    expect(
      store
        .getSessionMetadata(id)
        ?.taskOrchestration?.executionEvidence?.map((fact) => fact.id),
    ).toContain("known-cancel-preserved-read");

    // A rejected/lost dispatch receipt is uncertain, unlike the proven pre-dispatch cancellation above.
    await h2.admitted({
      success: true,
      queueId: h2.request.queueId,
      dispatchAcceptance: Promise.resolve({
        accepted: false,
        error: "dispatch_unconfirmed",
      }),
    });
    await vi.waitFor(() =>
      expect(currentExecution()).toMatchObject({
        phase: "paused",
        reason: "dispatch_unconfirmed",
      }),
    );
    const h3 = await prepareUnpromoted(
      "Do not replay the unconfirmed H2 dispatch",
      "human-known-cancel-H3",
      intent,
    );
    expect(await h3.request.beforeDispatch!()).toMatchObject({
      accepted: false,
      error: "EXECUTION_PREVIOUS_TURN_UNSETTLED",
    });
    expect(currentExecution()).toMatchObject({
      id: originalExecution.id,
      currentQueueId: h2.request.queueId,
      phase: "paused",
      reason: "dispatch_unconfirmed",
    });
  });

  it("does not treat transcript persistence failure as a resumable ordinary turn error", async () => {
    const first = await prepare(input, "human-transcript-failure");
    const firstQueue = first.request.queueId!;
    const executionId = currentExecution()!.id;
    await first.request.onTerminal?.({
      status: "error",
      code: "TRANSCRIPT_PERSISTENCE_FAILED",
      text: "The terminal transcript could not be durably stored",
      assistantMessagePresent: true,
    });
    expect(currentExecution()).toMatchObject({
      id: executionId,
      phase: "incomplete",
      currentQueueId: firstQueue,
      lastSettledQueueId: firstQueue,
      reason: "EXECUTION_TURN_OUTCOME_UNKNOWN",
    });
    const next = await prepareUnpromoted(
      "Continue after a transcript persistence failure",
      "human-transcript-retry",
      { ...executeIntent, continuationOf: executionId },
    );
    expect(await next.request.beforeDispatch!()).toMatchObject({
      accepted: false,
      error: "EXECUTION_TURN_OUTCOME_UNKNOWN",
    });
    expect(currentExecution()).toMatchObject({
      id: executionId,
      phase: "incomplete",
      currentQueueId: firstQueue,
      reason: "EXECUTION_TURN_OUTCOME_UNKNOWN",
    });
    expect(continuationRequests).toHaveLength(0);
  });

  it("rejects stale same-task continuation after a different task replaces it or the original completes", async () => {
    const first = await prepare(input, "human-stale-source");
    const firstQueue = first.request.queueId!;
    const oldExecution = currentExecution()!;
    await executionOwner.pauseSessionExecution(id, "user_stopped");
    await first.request.onTerminal?.({
      status: "stopped",
      text: "Original task is terminal",
      assistantMessagePresent: true,
    });
    const replacement = await prepare(
      "Start a genuinely different deliverable",
      "human-different-task",
      executeIntent,
    );
    const replacementExecution = currentExecution()!;
    expect(replacementExecution.id).not.toBe(oldExecution.id);
    const stale = await prepareUnpromoted(
      "Continue the old deliverable after replacement",
      "human-stale-old-task",
      { ...executeIntent, continuationOf: oldExecution.id },
    );
    expect(await stale.request.beforeDispatch!()).toMatchObject({
      accepted: false,
      error: "EXECUTION_CONTINUATION_CHANGED",
    });
    expect(currentExecution()).toMatchObject({
      id: replacementExecution.id,
      currentQueueId: replacement.request.queueId,
      requestId: "human-different-task",
    });
    expect(firstQueue).not.toBe(replacement.request.queueId);

    // A completed execution is immutable even when the classifier names its id.
    const completed = await prepare(
      "Complete a small task",
      "human-complete-source",
    );
    const completedQueue = completed.request.queueId!;
    const completedId = currentExecution()!.id;
    await tool(completedQueue, {
      id: "complete-source-read",
      name: "Read",
      stage: "success",
      output: "All acceptance criteria are true",
    });
    await submitReview(completedQueue, {
      decision: "accept",
      summary: "Completed before stale continuation request",
      checks: [
        { criterion: 0, toolUseIds: ["complete-source-read"] },
        { criterion: 1, toolUseIds: ["complete-source-read"] },
      ],
    });
    await completed.request.onTerminal?.({
      status: "complete",
      text: "Completed",
      assistantMessagePresent: true,
    });
    const afterCompletion = await prepareUnpromoted(
      "Continue already completed work",
      "human-stale-completed",
      { ...executeIntent, continuationOf: completedId },
    );
    expect(await afterCompletion.request.beforeDispatch!()).toMatchObject({
      accepted: false,
      error: "EXECUTION_ALREADY_COMPLETED",
    });
    expect(currentExecution()).toMatchObject({
      id: completedId,
      phase: "completed",
      lastSettledQueueId: completedQueue,
    });
  });
});

describe("intent classifier execution continuity contract", () => {
  it("sends the current execution identity and requires an explicit continuationOf field", async () => {
    const prepared = await prepare(input, "human-classifier-integration");
    const execution = currentExecution()!;
    let prompt = "";
    let systemPrompt = "";
    engine.runTextUtility = vi.fn(async (options) => {
      prompt = options.prompt;
      systemPrompt = options.systemPrompt;
      return JSON.stringify({
        ...executeIntent,
        steps: ["Create artifact", "Verify artifact"],
        continuationOf: execution.id,
      });
    });
    const request: DesktopMessageRequest = {
      text: "Continue this deliverable",
      clientRequestId: "classifier-probe",
      sessionId: id,
      workspacePath: "/synthetic-workspace",
      scenario: { type: "desktop", surface: "chat" },
    };
    const intent = await executionOwner.classifySessionExecutionIntent(
      engine,
      request,
      new AbortController().signal,
    );
    expect(intent?.continuationOf).toBe(execution.id);
    expect(intent?.steps).toEqual(["Create artifact", "Verify artifact"]);
    expect(systemPrompt).toContain("Always include continuationOf");
    expect(JSON.parse(prompt)).toMatchObject({
      currentExecution: {
        id: execution.id,
        intent: execution.intent,
        phase: execution.phase,
      },
      currentUserRequest: request.text,
    });

    engine.runTextUtility = vi.fn(async () => {
      const { continuationOf: _relation, ...omitted } = {
        ...executeIntent,
        continuationOf: execution.id,
      };
      return JSON.stringify(omitted);
    });
    await expect(
      executionOwner.classifySessionExecutionIntent(
        engine,
        request,
        new AbortController().signal,
      ),
    ).resolves.toBeUndefined();
    engine.runTextUtility = vi.fn(async () => JSON.stringify({ ...executeIntent, continuationOf: null }));
    await expect(executionOwner.classifySessionExecutionIntent(engine, request, new AbortController().signal)).resolves.toBeUndefined();
    expect(prepared.request.queueId).toBe(execution.currentQueueId);
  });
});

describe("To Do List before native execution", () => {
  const steps = ["Inspect the workspace", "Create the artifact", "Verify the result"];
  const intent = { ...executeIntent, steps };
  const ledger = () => store.getSessionMetadata(id)!.taskOrchestration!;
  async function tasks() {
    engine.getLiveSessionOverlay = () => ({ isActive: true, inMemoryMessages: [] });
    return (await taskOwner.readSessionTasks(engine)).tasks;
  }

  it("persists the full list at original dispatch admission, with no proposal or extra human confirmation", async () => {
    const pending = await prepareUnpromoted(input, "human-steps", intent);
    expect(ledger().tasks).toHaveLength(0);
    const guard = await pending.request.beforeDispatch!();
    expect(guard.accepted).toBe(true);
    const ids = ledger().tasks.map(task => task.id);
    expect(ledger().tasks.map(task => task.title)).toEqual(steps);
    expect(ledger().proposal).toBeUndefined();
    expect(ledger().plan?.map(todo => todo.status)).toEqual(["in_progress", "pending", "pending"]);
    expect(guard.validateAtCommit?.().accepted).toBe(true);
    currentQueueId = pending.request.queueId!;
    expect((await tasks()).map(task => task.id)).toEqual(ids);
    expect(ledger().executionEvidence ?? []).toHaveLength(0);
    await pending.request.beforeDispatch!();
    expect(ledger().tasks.map(task => task.id)).toEqual(ids);
    expect(pending.request.text).toBe(input);
    expect(pending.request.surfaceUserBeforeDispatch).toBe(true);
    expect(pending.request.runtimeReminder).toContain(`[task:${ids[0]}]`);
    expect(pending.request.desktopQuery?.visibleText).toBe(input);
  });

  it("updates exact current native step IDs while preserving absent steps and rejecting stale/history snapshots", async () => {
    const prepared = await prepare(input, "human-step-events", intent);
    const first = ledger().plan![0];
    const second = ledger().plan![1];
    await taskOwner.observeSessionTasks(id, { plan: [{ ...first, status: "completed" }, { ...second, status: "in_progress" }], planTurnId: prepared.request.queueId });
    expect((await tasks()).map(task => task.phase)).toEqual(["awaiting_review", "running", "pending"]);
    const prior = structuredClone(ledger().plan);
    for (const planTurnId of [undefined, "old-queue"]) {
      await taskOwner.observeSessionTasks(id, { plan: [{ ...first, status: "pending" }, { key: "foreign", content: "Old list", activeForm: "", status: "completed" }], planTurnId });
      expect(ledger().plan).toEqual(prior);
    }
    expect(ledger().reviews).toHaveLength(0);
  });

  it("keeps the same IDs, progress and original budget on a trusted continuation", async () => {
    const first = await prepare(input, "first-plan", intent);
    const original = structuredClone(currentExecution()!);
    const originalPlan = structuredClone(ledger().plan!);
    engine.isBusy = () => true;
    await first.request.onTerminal?.({ status: "complete", text: "Need to continue", assistantMessagePresent: true });
    await prepare("Continue this task", "continued-plan", { ...intent, steps: ["Do not replace", "The original steps"], continuationOf: original.id });
    expect(currentExecution()).toMatchObject({ id: original.id, deadlineAt: original.deadlineAt, startedAt: original.startedAt });
    expect(ledger().plan).toEqual(originalPlan);
    expect(ledger().tasks).toHaveLength(steps.length);
  });

  it("isolates a new goal from old task events without clearing unknown native resources", async () => {
    const first = await prepare(input, "old-plan", intent);
    const oldPlan = structuredClone(ledger().plan!);
    const oldId = currentExecution()!.id;
    await taskOwner.mutateSessionTaskLedger(id, value => {
      value.delegationClaims = [{ toolUseId: "old-unknown", executionId: oldId, taskId: "old-native-task", state: "unknown" }];
      return value;
    });
    const next = await prepare("Create a different artifact", "new-plan", { ...intent, steps: ["New inspection", "New verification"] });
    const freshPlan = structuredClone(ledger().plan!);
    expect((await tasks()).map(task => task.title)).toEqual(["New inspection", "New verification"]);
    await taskOwner.observeSessionTasks(id, { plan: oldPlan, planTurnId: first.request.queueId });
    expect(ledger().plan).toEqual(freshPlan);
    expect(ledger().delegationClaims?.[0].state).toBe("unknown");
    expect(next.request.queueId).not.toBe(first.request.queueId);
  });

  it.each(["dsh", "codex", "claude-code"])("precreates the list for %s without granting builtin automatic continuation", async runtime => {
    engine = { ...engine, kind: "external", getRuntimeIdentity: () => ({ sessionId: id, runtime }) } as SessionEngine;
    const prepared = await prepare(input, `external-${runtime}`, intent);
    expect(currentExecution()).toBeUndefined();
    expect(ledger().tasks.map(task => task.title)).toEqual(steps);
    expect(prepared.request.text).toBe(input);
    expect(prepared.request.surfaceUserBeforeDispatch).toBe(true);
    expect(prepared.request.runtimeReminder).toContain("TodoWrite/TaskCreate/update_plan");
    expect(ledger().proposal).toBeUndefined();
    await prepared.request.onTerminal?.({ status: "complete", text: "Native runtime returned", assistantMessagePresent: true });
    expect(continuationRequests).toHaveLength(0);
  });

  it("does not create a formal task list for discussion or an artificial list for a single action", async () => {
    await prepare("Discuss only", "discussion", planIntent);
    expect(ledger().tasks).toHaveLength(0);
    await prepare("Read this file", "single-action", { ...executeIntent, steps: ["Read the file"] });
    expect(ledger().tasks).toHaveLength(0);
  });

  it("still accepts native steps discovered after a single-action classification", async () => {
    const prepared = await prepare("Read this file", "single-discovers-steps", { ...executeIntent, steps: ["Read the file"] });
    expect(ledger().executionAdmission?.taskPlanId).toBeUndefined();
    await taskOwner.observeSessionTasks(id, { plan: [
      { key: "discovered-one", content: "Inspect references", activeForm: "Inspecting", status: "completed" },
      { key: "discovered-two", content: "Check reference contents", activeForm: "Checking", status: "in_progress" },
    ], planTurnId: prepared.request.queueId });
    expect((await tasks()).map(task => task.phase)).toEqual(["awaiting_review", "running"]);
  });

  it("settles main steps only with proven root acceptance at the durable terminal", async () => {
    const prepared = await prepare(input, "reviewed-list", intent);
    const queue = prepared.request.queueId!;
    await tool(queue, { id: "actual-write", name: "Write", stage: "success", output: "Artifact saved" });
    await tool(queue, { id: "verify-list", name: "Read", stage: "success", output: "Verified artifact contents" });
    await tool(queue, { id: "update-list", name: "TaskUpdate", stage: "success", input: { taskId: "native-id", status: "completed" }, output: { success: true } });
    expect(ledger().executionEvidence?.some(fact => fact.id === "update-list")).toBe(false);
    await taskOwner.observeSessionTasks(id, { plan: ledger().plan!.map(todo => ({ ...todo, status: "completed" })), planTurnId: queue });
    expect((await tasks()).every(task => task.phase === "awaiting_review")).toBe(true);
    await submitReview(queue, { decision: "accept", summary: "Independently verified the final artifact", checks: executeIntent.acceptanceCriteria.map((_, criterion) => ({ criterion, toolUseIds: ["verify-list"] })) });
    expect((await tasks()).some(task => task.phase === "completed")).toBe(false);
    await prepared.request.onTerminal?.({ status: "complete", text: "Delivered", assistantMessagePresent: true });
    expect(currentExecution()?.phase).toBe("completed");
    expect((await tasks()).every(task => task.phase === "completed")).toBe(true);
    expect(ledger().reviews.every(review => !!review.rootToolUseId)).toBe(true);
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
