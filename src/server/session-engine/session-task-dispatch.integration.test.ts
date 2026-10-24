import { mkdtemp, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEngine } from "./types";
import { createSessionExecution } from "../../shared/sessionExecution";
import type { SessionTaskLedger } from "../../shared/sessionTaskOrchestration";

const state = vi.hoisted(() => ({ home: "", broadcasts: vi.fn() }));
vi.mock("os", async (original) => ({
  ...(await original<typeof import("os")>()),
  homedir: () => state.home,
}));
vi.mock("../sse", () => ({ broadcast: state.broadcasts }));

let store: typeof import("../SessionStore");
let taskOwner: typeof import("./task-orchestration");
let dispatch: typeof import("./session-task-dispatch");
let sessionId: string;
let workspace: string;
let outside: string;
let queueId = "queue-main";
let engine: SessionEngine;

const executionId = "execution-main";
const intent = {
  kind: "execute" as const,
  objective: "implement",
  scope: "src",
  acceptanceCriteria: ["tests pass"],
};

beforeEach(async () => {
  state.home = await mkdtemp(join(process.cwd(), ".tmp-task-dispatch-home-"));
  workspace = await mkdtemp(
    join(process.cwd(), ".tmp-task-dispatch-workspace-"),
  );
  outside = await mkdtemp(join(process.cwd(), ".tmp-task-dispatch-outside-"));
  vi.resetModules();
  store = await import("../SessionStore");
  taskOwner = await import("./task-orchestration");
  dispatch = await import("./session-task-dispatch");
  sessionId = (await store.createSession(workspace)).id;
  queueId = "queue-main";
  state.broadcasts.mockClear();
  engine = {
    kind: "builtin",
    getRuntimeIdentity: () => ({
      sessionId,
      runtime: "builtin",
      boundSessionId: sessionId,
    }),
    getExecutionTurnId: () => queueId,
    getCurrentTurnIdentity: () => ({
      queueId,
      owner: { kind: "desktop", id: queueId },
    }),
  } as unknown as SessionEngine;
  await seedLedger([
    { id: "a", title: "Write A", blockedBy: [] },
    { id: "b", title: "Write B", blockedBy: [] },
    { id: "child-task", title: "Child", blockedBy: [] },
    { id: "dependent", title: "Dependent", blockedBy: ["a"] },
  ]);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await store.getActiveSessionTranscript(sessionId)?.revoke();
  await Promise.all([
    rm(state.home, { recursive: true, force: true }),
    rm(workspace, { recursive: true, force: true }),
    rm(outside, { recursive: true, force: true }),
  ]);
});

async function seedLedger(tasks: SessionTaskLedger["tasks"]) {
  await taskOwner.mutateSessionTaskLedger(sessionId, (ledger) => {
    ledger.tasks = structuredClone(tasks);
    ledger.execution = createSessionExecution({
      id: executionId,
      requestId: "req-1",
      originalInput: "Make and verify changes",
      intent,
      queueId,
      now: Date.now(),
    });
    ledger.taskPackages = [];
    ledger.delegationClaims = [];
    ledger.delegationLaunches = 0;
    return ledger;
  });
}

async function register(
  taskId: string,
  path: string,
  access: "read" | "write" = "write",
  assignee = "Explore",
) {
  const ledger = store.getSessionMetadata(sessionId)!.taskOrchestration!;
  return dispatch.registerSessionTaskPackage(engine, {
    taskId,
    executionId: executionId,
    assignee,
    resources: [{ path, access }],
    reason: `Own ${taskId}`,
    expectedRevision: ledger.revision,
  });
}

function tool(
  name: string,
  value: unknown,
  options: {
    id?: string;
    agentId?: string;
    launchId?: string;
    q?: string;
  } = {},
) {
  return dispatch.authorizeSessionTaskTool({
    sessionId,
    queueId: options.q ?? queueId,
    toolUseId: options.id ?? `tool-${name}`,
    name,
    input: value,
    agentId: options.agentId,
    nativeLaunchToolUseId: options.launchId,
    workspacePath: workspace,
    isCurrent: () => true,
  });
}

async function launch(taskId: string, launchId = `launch-${taskId}`) {
  await register(
    taskId,
    taskId === "a" ? "src/a/" : "src/b/",
    "write",
    "Explore",
  );
  return tool(
    "Agent",
    {
      description: `[task:${taskId}] Work only in assigned files`,
      subagent_type: "Explore",
      run_in_background: true,
    },
    { id: launchId },
  );
}

describe("session task dispatch server boundary", () => {
  it("admits root package bookkeeping during background work without admitting opaque shell or child control writes", async () => {
    expect(await launch("a")).toBeUndefined();
    const ledger = store.getSessionMetadata(sessionId)!.taskOrchestration!;
    const data = {
      kind: "package",
      expectedRevision: ledger.revision,
      package: {
        taskId: "b",
        executionId,
        assignee: "Explore",
        resources: [{ path: "src/b/", access: "write" }],
        reason: "Prepare independent work while the first task runs",
      },
    };
    const command = `myagents session tasks --json --data '${JSON.stringify(data)}'`;
    expect(await tool("Bash", { command })).toBeUndefined();
    await register("b", "src/b/", "write", "Explore");
    expect(
      store.getSessionMetadata(sessionId)?.taskOrchestration?.taskPackages,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ taskId: "b" })]),
    );
    expect(
      await tool("Bash", { command: `${command}; touch unexpected` }),
    ).toContain("SESSION_TASK_OPAQUE_TOOL_DURING_DELEGATION");
    expect(
      await tool(
        "Bash",
        { command },
        { agentId: "child-a", launchId: "launch-a" },
      ),
    ).toContain("SESSION_TASK_CHILD_TOOL_DENIED");
  });

  it("persists exact packages and uses the shared dependency, concurrency, and resource policy", async () => {
    await expect(register("missing", "src/missing/")).rejects.toThrow(
      "SESSION_TASK_PACKAGE_TASK_NOT_ENSURED",
    );
    await register("a", "src/a/", "write", "Explore");
    await register("b", "src/b/", "write", "Explore");
    expect(
      await tool(
        "Agent",
        {
          description: "[task:a] do A",
          subagent_type: "Explore",
          run_in_background: true,
        },
        { id: "launch-a" },
      ),
    ).toBeUndefined();
    expect(
      await tool(
        "Agent",
        {
          prompt: "[task:b] do B",
          subagent_type: "Explore",
          run_in_background: true,
        },
        { id: "launch-b" },
      ),
    ).toBeUndefined();
    const packages =
      store.getSessionMetadata(sessionId)?.taskOrchestration?.taskPackages;
    expect(packages).toHaveLength(2);
    expect(
      store.getSessionMetadata(sessionId)?.taskOrchestration?.delegationClaims,
    ).toHaveLength(2);

    const current = store.getSessionMetadata(sessionId)!.taskOrchestration!;
    expect(
      await dispatch.registerSessionTaskPackage(engine, {
        taskId: "a",
        executionId,
        assignee: "Explore",
        resources: [{ path: "src/a/", access: "write" }],
        reason: "Own a",
        expectedRevision: current.revision,
      }),
    ).toBeTruthy();
  });

  it("rejects overlapping delegated writes before they can run concurrently", async () => {
    await register("a", "src/shared/", "write", "Explore");
    await register("b", "src/shared/file.ts", "write", "Explore");
    expect(
      await tool(
        "Agent",
        {
          description: "[task:a] own shared directory",
          subagent_type: "Explore",
          run_in_background: true,
        },
        { id: "launch-a" },
      ),
    ).toBeUndefined();
    expect(
      await tool(
        "Agent",
        {
          description: "[task:b] own overlapping file",
          subagent_type: "Explore",
          run_in_background: true,
        },
        { id: "launch-b" },
      ),
    ).toContain("TASK_DISPATCH_RESOURCE_CONFLICT");
  });

  it("rejects dependency launch until the exact dependency review is accepted", async () => {
    await register("dependent", "docs/", "write", "Explore");
    const denied = await tool(
      "Agent",
      {
        description: "[task:dependent] do dependent",
        subagent_type: "Explore",
        run_in_background: true,
      },
      { id: "launch-dependent" },
    );
    expect(denied).toContain("TASK_DISPATCH_DEPENDENCIES_INCOMPLETE");
    await taskOwner.mutateSessionTaskLedger(sessionId, (ledger) => {
      ledger.reviews.push({
        taskId: "a",
        attemptId: "main",
        decision: "accept",
        evidence: "verified",
      });
      return ledger;
    });
    expect(
      await tool(
        "Agent",
        {
          description: "[task:dependent] do dependent",
          subagent_type: "Explore",
          run_in_background: true,
        },
        { id: "launch-dependent" },
      ),
    ).toBeUndefined();
  });

  it("refuses synchronous subagent returns without native background lifecycle identity", async () => {
    await register("a", "src/a/", "write", "Explore");
    expect(
      await tool(
        "Agent",
        {
          description: "[task:a] synchronous attempt",
          subagent_type: "Explore",
          run_in_background: false,
        },
        { id: "sync-launch" },
      ),
    ).toContain("SESSION_TASK_BACKGROUND_LIFECYCLE_REQUIRED");
    expect(
      store.getSessionMetadata(sessionId)?.taskOrchestration?.delegationClaims,
    ).toEqual([]);
  });

  it("releases claims only from actual native completed lifecycle, never terminal projection", async () => {
    const { applySessionTaskAction, projectSessionTasks } = await import(
      "../../shared/sessionTaskOrchestration"
    );
    await launch("a");
    await dispatch.settleSessionTaskDispatchTool(sessionId, {
      toolUseId: "launch-a",
      success: true,
      async: true,
      isCurrent: () => true,
    });
    const attempt = {
      id: "attempt-launch-a",
      toolUseId: "launch-a",
      agentId: "native-agent-a",
      title: "Write and verify A",
      lifecycle: {
        status: "completed" as const,
        startedAt: Date.now() - 50,
        finishedAt: Date.now(),
        result: "completed",
      },
      executionVerified: true,
    };
    await taskOwner.observeSessionTasks(sessionId, { attempts: [attempt] });
    let ledger = store.getSessionMetadata(sessionId)!.taskOrchestration!;
    expect(ledger.delegationClaims?.[0]?.state).toBe("running");
    expect(
      projectSessionTasks(ledger).find((task) => task.id === "a")?.phase,
    ).toBe("running");
    expect(() =>
      applySessionTaskAction(ledger, {
        kind: "review",
        taskId: "a",
        attemptId: attempt.id,
        decision: "accept",
        evidence: "Verified output",
        expectedRevision: ledger.revision,
      }),
    ).toThrow("TASK_NATIVE_EXECUTION_UNCONFIRMED");

    await taskOwner.observeSessionTasks(sessionId, {
      attempts: [attempt],
      nativeLifecycle: true,
    });
    ledger = store.getSessionMetadata(sessionId)!.taskOrchestration!;
    expect(ledger.delegationClaims?.[0]?.state).toBe("settled");
    const accepted = applySessionTaskAction(ledger, {
      kind: "review",
      taskId: "a",
      attemptId: attempt.id,
      decision: "accept",
      evidence: "Verified output",
      expectedRevision: ledger.revision,
    });
    expect(
      projectSessionTasks(accepted).find((task) => task.id === "a")?.phase,
    ).toBe("completed");
  });

  it("keeps a native failed lifecycle unknown and does not release its write scope", async () => {
    await launch("a");
    await dispatch.settleSessionTaskDispatchTool(sessionId, {
      toolUseId: "launch-a",
      success: true,
      async: true,
      isCurrent: () => true,
    });
    await taskOwner.observeSessionTasks(sessionId, {
      nativeLifecycle: true,
      attempts: [
        {
          id: "attempt-launch-a",
          toolUseId: "launch-a",
          agentId: "native-agent-a",
          title: "Write A",
          lifecycle: {
            status: "failed",
            startedAt: Date.now() - 50,
            finishedAt: Date.now(),
            result: "failure after possible write",
          },
          executionVerified: true,
        },
      ],
    });
    expect(
      store.getSessionMetadata(sessionId)?.taskOrchestration
        ?.delegationClaims?.[0]?.state,
    ).toBe("unknown");
    expect(
      await tool(
        "Write",
        { file_path: "src/a/result.ts", content: "root retry" },
        { id: "root-retry" },
      ),
    ).toContain("SESSION_TASK_RESOURCE_CONFLICT");
  });

  it("does not let a late successful ACK or completed event clear an unknown write claim", async () => {
    await launch("a");
    await dispatch.settleSessionTaskDispatchTool(sessionId, {
      toolUseId: "launch-a",
      success: false,
      async: false,
      isCurrent: () => true,
    });
    await dispatch.settleSessionTaskDispatchTool(sessionId, {
      toolUseId: "launch-a",
      success: true,
      async: true,
      isCurrent: () => true,
    });
    await taskOwner.observeSessionTasks(sessionId, {
      nativeLifecycle: true,
      attempts: [
        {
          id: "attempt-launch-a",
          toolUseId: "launch-a",
          agentId: "native-agent-a",
          title: "Write A",
          lifecycle: {
            status: "completed",
            startedAt: Date.now() - 50,
            finishedAt: Date.now(),
            result: "late completion",
          },
          executionVerified: true,
        },
      ],
    });
    expect(
      store.getSessionMetadata(sessionId)?.taskOrchestration
        ?.delegationClaims?.[0]?.state,
    ).toBe("unknown");
    expect(
      await tool(
        "Read",
        { file_path: "src/a/result.ts" },
        { id: "root-inspect" },
      ),
    ).toBeUndefined();
    expect(
      await tool(
        "Write",
        { file_path: "src/a/result.ts", content: "retry" },
        { id: "root-retry" },
      ),
    ).toContain("SESSION_TASK_RESOURCE_CONFLICT");
  });

  it("bounds mapped child writes to its package and permits identity-pending reads only", async () => {
    await register("child-task", "src/child/", "write", "Explore");
    expect(
      await tool(
        "Write",
        { file_path: "src/child/file.ts", content: "x" },
        { agentId: "child-1" },
      ),
    ).toContain("SESSION_TASK_CHILD_IDENTITY_UNVERIFIED");
    expect(
      await tool(
        "Read",
        { file_path: "src/child/file.ts" },
        { agentId: "child-1" },
      ),
    ).toBeUndefined();
    expect(
      await tool(
        "Agent",
        {
          description: "[task:child-task] do it",
          subagent_type: "Explore",
          run_in_background: true,
        },
        { id: "launch-child" },
      ),
    ).toBeUndefined();
    expect(
      await tool(
        "Write",
        { file_path: "src/other/file.ts", content: "x" },
        { agentId: "child-1", launchId: "launch-child" },
      ),
    ).toContain("SESSION_TASK_RESOURCE_OUT_OF_PACKAGE");
    expect(
      await tool(
        "Write",
        { path: "src/child/file.ts", content: "x" },
        { agentId: "child-1", launchId: "launch-child" },
      ),
    ).toBeUndefined();
    expect(
      await tool(
        "Bash",
        { command: "true" },
        { agentId: "child-1", launchId: "launch-child" },
      ),
    ).toContain("SESSION_TASK_CHILD_TOOL_DENIED");
  });

  it("rejects a child write through a workspace symlink that escapes the workspace", async () => {
    await symlink(outside, join(workspace, "escape"));
    await register("child-task", "escape/", "write", "Explore");
    await tool(
      "Agent",
      {
        description: "[task:child-task] do it",
        subagent_type: "Explore",
        run_in_background: true,
      },
      { id: "launch-child" },
    );
    expect(
      await tool(
        "Write",
        { file_path: "escape/new.txt", content: "x" },
        { agentId: "child-1", launchId: "launch-child" },
      ),
    ).toContain("SESSION_TASK_WORKSPACE_PATH_INVALID");
  });

  it("blocks root overlapping resources and opaque actions while delegated claims are active", async () => {
    await launch("a");
    expect(
      await tool("Read", { file_path: "src/a/file.ts" }, { id: "root-read" }),
    ).toContain("SESSION_TASK_RESOURCE_CONFLICT");
    expect(
      await tool("Bash", { command: "npm test" }, { id: "root-bash" }),
    ).toContain("SESSION_TASK_OPAQUE_TOOL_DURING_DELEGATION");
    expect(
      await tool(
        "Bash",
        { command: "myagents session tasks --json" },
        { id: "ledger-list" },
      ),
    ).toBeUndefined();
  });

  it("preserves legacy behavior outside execution-managed turns", async () => {
    await taskOwner.mutateSessionTaskLedger(sessionId, (ledger) => {
      ledger.execution = undefined;
      return ledger;
    });
    expect(await tool("Bash", { command: "npm test" })).toBeUndefined();
    expect(
      await tool(
        "Write",
        { file_path: "outside-workspace.txt", content: "x" },
        { agentId: "legacy-child" },
      ),
    ).toBeUndefined();
  });

  it("keeps failed launch claims unknown and continues to reserve their resources", async () => {
    await launch("a");
    await dispatch.settleSessionTaskDispatchTool(sessionId, {
      toolUseId: "launch-a",
      success: false,
      async: false,
      isCurrent: () => true,
    });
    expect(
      store.getSessionMetadata(sessionId)?.taskOrchestration
        ?.delegationClaims?.[0]?.state,
    ).toBe("unknown");
    expect(
      await tool(
        "Write",
        { file_path: "src/a/file.ts", content: "root change" },
        { id: "root-write" },
      ),
    ).toContain("SESSION_TASK_RESOURCE_CONFLICT");
  });

  it("does not apply execution policy to a different queue", async () => {
    await register("a", "src/a/", "write", "Explore");
    expect(
      await tool(
        "Agent",
        {
          description: "[task:a] stale launch",
          subagent_type: "Explore",
          run_in_background: true,
        },
        { id: "stale", q: "old-queue" },
      ),
    ).toContain("SESSION_TASK_TOOL_STALE");
    expect(
      store.getSessionMetadata(sessionId)?.taskOrchestration?.delegationClaims,
    ).toHaveLength(0);
  });
});
