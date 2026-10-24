import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { SessionEngine, DesktopMessageRequest } from "./types";
import type { ExecutionIntent } from "../../shared/sessionExecution";

// Behavioral regressions using real SessionStore/CAS and native admission guards.
// Synthetic inputs and streams only; no production IO or model calls.
const state = vi.hoisted(() => ({ home: "" }));
vi.mock("os", async (original) => ({
  ...(await original<typeof import("os")>()),
  homedir: () => state.home,
}));
vi.mock("../sse", () => ({ broadcast: vi.fn() }));
let store: typeof import("../SessionStore");
let tasks: typeof import("./task-orchestration");
let execution: typeof import("./session-execution");
let id: string;
let queue: string;
let engine: SessionEngine;
const executeIntent: ExecutionIntent = {
  kind: "execute",
  objective: "Create a local artifact",
  scope: "Synthetic workspace",
  acceptanceCriteria: ["Artifact verified"],
};

beforeEach(async () => {
  state.home = await mkdtemp(join(process.cwd(), ".tmp-stability-review-"));
  vi.resetModules();
  store = await import("../SessionStore");
  tasks = await import("./task-orchestration");
  execution = await import("./session-execution");
  id = (await store.createSession("/synthetic-stability-review")).id;
  queue = "";
  engine = {
    kind: "builtin",
    getRuntimeIdentity: () => ({ sessionId: id, runtime: "builtin" }),
    getCurrentSessionContext: () => ({
      sessionId: id,
      workspacePath: "/synthetic-stability-review",
    }),
    getCurrentTurnIdentity: () => ({ queueId: queue }),
    getExecutionTurnId: () => queue,
    getExecutionVerificationEpoch: () => "synthetic-query:0",
    isBusy: () => false,
    getLiveSessionState: () => ({
      sessionState: "idle",
      waitingForUser: false,
      backgroundWorkActive: false,
      hasBackgroundWork: false,
      backgroundWorkBlocksContinuation: false,
    }),
    getQueueStatus: () => [],
    getStreamReplaySnapshot: () => ({ pendingInteractiveRequests: [] }),
    sendDesktopMessage: vi.fn(async () => ({ success: true })),
  } as unknown as SessionEngine;
});
afterEach(async () => {
  await store.getActiveSessionTranscript(id)?.revoke();
  await rm(state.home, { recursive: true, force: true });
});
async function prepare(
  requestId: string,
  intent: ExecutionIntent | undefined,
  text = requestId,
) {
  await tasks.recordSessionPlanHumanInput(id, requestId, text);
  const request: DesktopMessageRequest = {
    sessionId: id,
    workspacePath: "/synthetic-stability-review",
    clientRequestId: requestId,
    text,
    scenario: { type: "desktop", surface: "chat" },
  };
  return execution.prepareSessionExecution(engine, request, async () => intent);
}

async function promote(prepared: Awaited<ReturnType<typeof prepare>>) {
  const guard = await prepared.request.beforeDispatch!();
  expect(guard.accepted).toBe(true);
  expect(guard.validateAtCommit?.().accepted).toBe(true);
  queue = prepared.request.queueId!;
}

it("keeps multiple queued inputs admissible in order instead of replacing the pending capability", async () => {
  const a = await prepare("A", executeIntent);
  await promote(a);
  const original =
    store.getSessionMetadata(id)?.taskOrchestration?.execution?.id;
  const b = await prepare("B", executeIntent);
  const c = await prepare("C", executeIntent);
  expect(store.getSessionMetadata(id)?.taskOrchestration?.execution?.id).toBe(
    original,
  );
  await promote(b);
  expect(
    store.getSessionMetadata(id)?.taskOrchestration?.execution?.requestId,
  ).toBe("B");
  await b.request.onTerminal?.({
    status: "complete",
    text: "B finished",
    assistantMessagePresent: true,
  });
  expect(engine.sendDesktopMessage).not.toHaveBeenCalled(); // C takes precedence over auto-continuation.
  await promote(c);
  expect(
    store.getSessionMetadata(id)?.taskOrchestration?.execution?.requestId,
  ).toBe("C");
});

it.each(["cancel", "reject", "lost-ack"] as const)(
  "does not poison the live root when an unpromoted input has %s",
  async (reason) => {
    const a = await prepare("A", executeIntent);
    await promote(a);
    const b = await prepare("B", undefined);
    if (reason === "cancel") await b.request.beforeDispatch?.cancel?.();
    else if (reason === "reject")
      await b.admitted({
        success: false,
        error: "Synthetic enqueue rejection",
      });
    else {
      await b.admitted({
        success: true,
        dispatchAcceptance: Promise.reject(new Error("Synthetic lost ACK")),
      });
      await vi.waitFor(() =>
        expect(b.request.beforeDispatch!()).resolves.toMatchObject({
          accepted: false,
        }),
      );
    }
    expect(
      store.getSessionMetadata(id)?.taskOrchestration?.execution,
    ).toMatchObject({ currentQueueId: a.request.queueId, phase: "running" });
    expect(
      execution.sessionExecutionInferenceAllowed(id, a.request.queueId),
    ).toBe(true);
    expect(
      execution.sessionExecutionToolDenial(id, a.request.queueId, "Write", {}),
    ).toBeUndefined();
  },
);

it("reconsiders a safely settled root after its last unpromoted follow-up is cancelled", async () => {
  const a = await prepare("A", executeIntent);
  await promote(a);
  const b = await prepare("B", executeIntent);
  await a.request.onTerminal?.({
    status: "complete",
    text: "Analysis only",
    assistantMessagePresent: true,
  });
  expect(engine.sendDesktopMessage).not.toHaveBeenCalled();
  await b.request.beforeDispatch?.cancel?.();
  expect(engine.sendDesktopMessage).toHaveBeenCalledTimes(1);
  expect(
    store.getSessionMetadata(id)?.taskOrchestration?.execution?.requestId,
  ).toBe("A");
});

it("Stop synchronously revokes the root and every queued preparation; a later human input may start", async () => {
  const a = await prepare("A", executeIntent);
  await promote(a);
  const b = await prepare("B", executeIntent);
  const c = await prepare("C", executeIntent);
  const stopped = execution.pauseSessionExecution(id, "user_stop");
  expect(
    execution.sessionExecutionInferenceAllowed(id, a.request.queueId),
  ).toBe(false);
  expect(await b.request.beforeDispatch!()).toMatchObject({ accepted: false });
  expect(await c.request.beforeDispatch!()).toMatchObject({ accepted: false });
  await stopped;
  const d = await prepare("D", executeIntent);
  await promote(d);
  expect(
    execution.sessionExecutionInferenceAllowed(id, d.request.queueId),
  ).toBe(true);
  expect(await a.request.beforeDispatch!()).toMatchObject({ accepted: false });
});

it("does not revive a new execution through an old committed guard or late cancellation", async () => {
  const a = await prepare("A", executeIntent);
  await promote(a);
  const old = await a.request.beforeDispatch!();
  const b = await prepare("B", executeIntent);
  await promote(b);
  expect(old.validateAtCommit?.()).toMatchObject({ accepted: false });
  await a.request.beforeDispatch?.cancel?.();
  expect(
    store.getSessionMetadata(id)?.taskOrchestration?.execution,
  ).toMatchObject({ requestId: "B", phase: "running" });
});

it("starts the execution budget at native promotion rather than while queued", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
  try {
    const b = await prepare("queued-B", executeIntent);
    expect(
      store.getSessionMetadata(id)?.taskOrchestration?.execution,
    ).toBeUndefined();
    clock.mockReturnValue(1000 + 45 * 60_000);
    await promote(b);
    const running = store.getSessionMetadata(id)?.taskOrchestration?.execution;
    expect(running?.deadlineAt).toBeGreaterThan(Date.now());
    expect(
      execution.sessionExecutionInferenceAllowed(id, b.request.queueId),
    ).toBe(true);
  } finally {
    clock.mockRestore();
  }
});

it.each(["answer", "plan", "control"] as const)(
  "allows %s host clarification and plan controls without granting writes",
  async (kind) => {
    const prepared = await prepare("human-input", {
      kind,
      objective: "Read or discuss",
      scope: "No business writes",
      acceptanceCriteria: [],
    });
    await promote(prepared);
    for (const name of [
      "AskUserQuestion",
      "EnterPlanMode",
      "ExitPlanMode",
      "LS",
    ]) {
      expect(
        execution.sessionExecutionToolDenial(
          id,
          prepared.request.queueId,
          name,
          {},
        ),
      ).toBeUndefined();
    }
    for (const name of [
      "Write",
      "Edit",
      "Agent",
      "Task",
      "Bash",
      "mcp__write",
    ]) {
      expect(
        execution.sessionExecutionToolDenial(
          id,
          prepared.request.queueId,
          name,
          {},
        ),
      ).toContain("只授权回答");
    }
    expect(
      execution.sessionExecutionToolDenial(
        id,
        prepared.request.queueId,
        "Read",
        {},
      ),
    ).toBeUndefined();
  },
);

it("preserves a running root while a follow-up is prepared and queued", async () => {
  const first = await prepare("action-A", executeIntent);
  queue = first.request.queueId!;
  const admitted = await first.request.beforeDispatch!();
  expect(admitted.validateAtCommit?.().accepted).toBe(true);
  engine.isBusy = () => true;
  const oldQueue = queue;
  await prepare(
    "status-B",
    {
      kind: "answer",
      objective: "Status",
      scope: "Read current progress",
      acceptanceCriteria: [],
    },
    "How is the current task progressing?",
  );
  expect(queue).toBe(oldQueue); // B has NOT entered the native queue/turn.
  expect(
    store.getSessionMetadata(id)?.taskOrchestration?.execution,
  ).toMatchObject({ currentQueueId: oldQueue, phase: "running" });
  expect(execution.sessionExecutionInferenceAllowed(id, oldQueue)).toBe(true);
  expect(
    execution.sessionExecutionToolDenial(id, oldQueue, "Read", {}),
  ).toBeUndefined();
});

it("switches execution identity only when the next native turn is promoted", async () => {
  const first = await prepare("action-A", executeIntent);
  queue = first.request.queueId!;
  const accepted = await first.request.beforeDispatch!();
  accepted.validateAtCommit?.();
  engine.isBusy = () => true;
  const second = await prepare("action-B", executeIntent);
  expect(queue).toBe(first.request.queueId);
  expect(
    store.getSessionMetadata(id)?.taskOrchestration?.execution?.currentQueueId,
  ).toBe(first.request.queueId);
  expect(second.request.turnBoundaryOnly).toBe(true);
  const dispatch = await import("./session-task-dispatch");
  expect(
    await dispatch.authorizeSessionTaskTool({
      sessionId: id,
      queueId: queue,
      toolUseId: "root-A-read",
      name: "Read",
      input: { file_path: "/synthetic-stability-review/a.txt" },
      workspacePath: "/synthetic-stability-review",
      isCurrent: () => true,
    }),
  ).toBeUndefined();
  await promote(second);
  expect(
    store.getSessionMetadata(id)?.taskOrchestration?.execution?.currentQueueId,
  ).toBe(second.request.queueId);
  expect(
    execution.sessionExecutionInferenceAllowed(id, second.request.queueId),
  ).toBe(true);
  expect(
    await dispatch.authorizeSessionTaskTool({
      sessionId: id,
      queueId: first.request.queueId,
      toolUseId: "late-A",
      name: "Read",
      input: {},
      workspacePath: "/synthetic-stability-review",
      isCurrent: () => false,
    }),
  ).toContain("SESSION_TASK_TOOL_STALE");
});

it.each(["task", "goal"] as const)(
  "preserves an independently admitted %s owner alongside an ordinary execution",
  async (kind) => {
    const first = await prepare("ordinary-action", executeIntent);
    await promote(first);
    const ordinaryQueue = first.request.queueId!;
    queue = `independent-${kind}-queue`;
    engine.getCurrentTurnIdentity = () => ({
      queueId: queue,
      owner: { kind, id: `independent-${kind}` },
    });
    expect(
      execution.sessionExecutionToolDenial(id, queue, "Read", {}),
    ).toBeUndefined();
    const dispatch = await import("./session-task-dispatch");
    expect(
      await dispatch.authorizeSessionTaskTool({
        sessionId: id,
        queueId: queue,
        turnIdentity: engine.getCurrentTurnIdentity(),
        toolUseId: "independent-root-read",
        name: "Read",
        input: { file_path: "/synthetic-stability-review/report.txt" },
        workspacePath: "/synthetic-stability-review",
        isCurrent: () => true,
      }),
    ).toBeUndefined();
    expect(
      await dispatch.authorizeSessionTaskTool({
        sessionId: id,
        queueId: queue,
        turnIdentity: engine.getCurrentTurnIdentity(),
        toolUseId: "independent-root-write",
        name: "Write",
        input: { file_path: "/synthetic-stability-review/report.txt" },
        workspacePath: "/synthetic-stability-review",
        isCurrent: () => true,
      }),
    ).toBeUndefined();
    expect(
      await dispatch.authorizeSessionTaskTool({
        sessionId: id,
        queueId: queue,
        turnIdentity: engine.getCurrentTurnIdentity(),
        toolUseId: "independent-root-agent",
        name: "Agent",
        input: { prompt: "Original independent owner delegation" },
        workspacePath: "/synthetic-stability-review",
        isCurrent: () => true,
      }),
    ).toBeUndefined();
    const childScope = {
      sessionId: id,
      queueId: queue,
      turnIdentity: engine.getCurrentTurnIdentity(),
      toolUseId: "independent-child-write",
      agentId: "native-independent-child",
      name: "Write",
      input: { file_path: "/synthetic-stability-review/child.txt" },
      workspacePath: "/synthetic-stability-review",
      isCurrent: () => true,
    };
    expect(await dispatch.authorizeSessionTaskTool(childScope)).toContain(
      "SESSION_TASK_TOOL_STALE",
    );
    // Native launch proof retains this independent owner's original tool policy;
    // it does not borrow the ordinary execution's package or verification facts.
    expect(
      await dispatch.authorizeSessionTaskTool({
        ...childScope,
        nativeLaunchToolUseId: "native-independent-launch",
      }),
    ).toBeUndefined();
    expect(
      await dispatch.authorizeSessionTaskTool({
        sessionId: id,
        queueId: queue,
        toolUseId: "unproven-root",
        name: "Read",
        input: {},
        workspacePath: "/synthetic-stability-review",
        isCurrent: () => true,
      }),
    ).toContain("SESSION_TASK_TOOL_STALE");
    expect(
      await dispatch.authorizeSessionTaskTool({
        sessionId: id,
        queueId: queue,
        turnIdentity: engine.getCurrentTurnIdentity(),
        toolUseId: "old-query",
        name: "Read",
        input: {},
        workspacePath: "/synthetic-stability-review",
        isCurrent: () => false,
      }),
    ).toContain("SESSION_TASK_TOOL_STALE");
    expect(
      store.getSessionMetadata(id)?.taskOrchestration?.execution
        ?.currentQueueId,
    ).toBe(ordinaryQueue);
    // Even a real independent owner cannot discard an uncertain managed writer.
    await tasks.mutateSessionTaskLedger(id, (ledger) => {
      ledger.delegationClaims = [
        {
          executionId: ledger.execution!.id,
          taskId: "unknown-child",
          toolUseId: "original-launch",
          state: "unknown",
        },
      ];
      return ledger;
    });
    expect(
      await dispatch.authorizeSessionTaskTool({
        sessionId: id,
        queueId: queue,
        turnIdentity: engine.getCurrentTurnIdentity(),
        toolUseId: "conflicting-independent-write",
        name: "Write",
        input: { file_path: "/synthetic-stability-review/report.txt" },
        workspacePath: "/synthetic-stability-review",
        isCurrent: () => true,
      }),
    ).toContain("SESSION_TASK_RESOURCE_CONFLICT");
    expect(
      await dispatch.authorizeSessionTaskTool({
        sessionId: id,
        queueId: queue,
        turnIdentity: engine.getCurrentTurnIdentity(),
        agentId: "managed-child",
        nativeLaunchToolUseId: "original-launch",
        toolUseId: "disguised-child",
        name: "Read",
        input: {},
        workspacePath: "/synthetic-stability-review",
        isCurrent: () => true,
      }),
    ).toContain("SESSION_TASK_TOOL_STALE");
  },
);

it.each([false, true])(
  "consumes normal SSE with fragmented=%s",
  async (fragmented) => {
    const { ModelFailoverController } = await import(
      "../openai-bridge/model-failover"
    );
    const encoder = new TextEncoder();
    const wire =
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"normal text"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n';
    const chunks = fragmented
      ? [
          ": heartbeat\n\n",
          "event: content_",
          "block_delta\nda",
          wire.slice("event: content_block_delta\nda".length),
        ]
      : [wire];
    let offset = 0;
    const upstream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset < chunks.length)
          controller.enqueue(encoder.encode(chunks[offset++]));
        else controller.close();
      },
    });
    const owner = new ModelFailoverController({
      scope: () => "synthetic-root",
      resolveBackup: () => undefined,
      onSwitch: () => {},
      bodyIdleTimeoutMs: 80,
    });
    const response = await owner.run(
      new Request("http://review.invalid/messages"),
      { baseUrl: "http://review.invalid", providerId: "synthetic" },
      async () =>
        new Response(upstream, {
          headers: { "content-type": "text/event-stream" },
        }),
      "synthetic",
    );
    const reader = response.body!.getReader();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        reader.read().then((item) => ({
          stalled: false,
          text: new TextDecoder().decode(item.value),
        })),
        new Promise<{ stalled: boolean; text: string }>((resolve) => {
          timer = setTimeout(() => resolve({ stalled: true, text: "" }), 200);
        }),
      ]);
      expect(outcome.stalled).toBe(false);
      if (!outcome.stalled) expect(outcome.text).toContain("normal text");
    } finally {
      clearTimeout(timer);
      await reader.cancel();
    }
  },
);
