/**
 * Credential-free, bounded native-session execution acceptance.
 *
 * This launches the installed Claude Agent SDK child, the original builtin
 * SessionEngine/facade, SessionStore and the production session-task command
 * handler. Model replies come only from an in-process synthetic loopback
 * Anthropic endpoint. A private `myagents` executable forwards the SDK Bash
 * invocation to that exact handler over loopback; it is not a model/tool-hook
 * mock. No real provider, account, desktop App, or business Session is used.
 *
 * Run: node --import tsx scripts/verify-session-execution-loopback.ts [--parallel|--rework]
 */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { randomUUID } from "node:crypto";

const deadlineMs = 45_000;
const parallelMode = process.argv.includes("--parallel");
const reworkMode = process.argv.includes("--rework");
const twoWorkersMode = process.argv.includes("--two-workers");
const todoPlanMode = process.argv.includes("--todo-plan");
let planPrecedesNative = false;
let nativePlanUpdatesVerified = false;
if ([parallelMode, reworkMode, twoWorkersMode].filter(Boolean).length > 1)
  throw new Error(
    "--parallel, --rework, and --two-workers are mutually exclusive",
  );
const started = Date.now();
let deadlineExpired = false;
let resolveDeadline!: () => void;
const deadlineSignal = new Promise<void>((resolve) => {
  resolveDeadline = resolve;
});
const hardDeadlineTimer = setTimeout(() => {
  deadlineExpired = true;
  resolveDeadline();
}, deadlineMs);
function withHardDeadline<T>(operation: Promise<T>, label: string): Promise<T> {
  if (deadlineExpired)
    return Promise.reject(new Error(`hard deadline exceeded during ${label}`));
  return Promise.race([
    operation,
    deadlineSignal.then(() => {
      throw new Error(
        `hard deadline exceeded during ${label} (${deadlineMs}ms)`,
      );
    }),
  ]);
}
async function boundedCleanup<T>(
  operation: Promise<T>,
  milliseconds: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`cleanup timeout after ${milliseconds}ms`)),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
const home = await mkdtemp(join(tmpdir(), "moxbots-execution-loopback-"));
const evidenceDir = await mkdtemp(
  join(tmpdir(), "moxbots-execution-evidence-"),
);
const evidencePath = join(evidenceDir, "receipt.json");
const workspace = join(home, "workspace");
const bin = join(home, "bin");
await Promise.all([mkdir(workspace), mkdir(bin)]);

// The child and all app config discovery see only this private home. Whitelist
// PATH for the SDK runtime; never forward inherited provider/proxy credentials.
const safePath = process.env.PATH ?? "/usr/bin:/bin";
for (const name of Object.keys(process.env)) delete process.env[name];
Object.assign(process.env, {
  HOME: home,
  USERPROFILE: home,
  PATH: `${bin}${delimiter}${safePath}`,
  TMPDIR: home,
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  ENABLE_CLAUDEAI_MCP_SERVERS: "false",
  HTTP_PROXY: "",
  HTTPS_PROXY: "",
  ALL_PROXY: "",
  http_proxy: "",
  https_proxy: "",
  all_proxy: "",
});

const servers: Server[] = [];
let routePort = 0;
let cliToken = randomUUID();
let routeSnapshot: Record<string, unknown> | undefined;
const calls: { kind: string; tool?: string }[] = [];
const routeResults: {
  kind: unknown;
  taskId?: unknown;
  success: unknown;
  decision?: unknown;
  error?: unknown;
  revision?: unknown;
}[] = [];
const childToolResults: string[] = [];
const errors: string[] = [];
let storeApi: typeof import("../src/server/SessionStore") | undefined;
let engineForCleanup:
  | { stopTurn: (options?: { wholeSession?: boolean }) => Promise<unknown>; getLiveSessionState?: () => unknown }
  | undefined;
let runSucceeded = false;
let fixtureFatalError: string | undefined;
const backgroundDiagnostics: unknown[] = [];

async function saveFailureReceipt(error: unknown): Promise<void> {
  const raw = storeApi?.getSessionMetadata(sessionId)?.taskOrchestration as
    | {
        execution?: {
          id?: string;
          requestId?: string;
          phase?: string;
          currentQueueId?: string;
          lastSettledQueueId?: string;
          turns?: number;
          reworks?: number;
          noProgress?: number;
          reason?: string;
          continuation?: {
            queueId?: string;
            afterQueueId?: string;
            state?: string;
            error?: string;
          };
        };
        executionEvidence?: {
          id: string;
          queueId: string;
          name: string;
          successful: boolean;
          observationOrder: number;
          mutating: boolean;
          pending?: boolean;
        }[];
        delegationClaims?: {
          toolUseId: string;
          taskId: string;
          state: string;
        }[];
        delegationLaunches?: number;
        taskPackages?: {
          taskId: string;
          assignee: string;
          resources: { path: string; access: string }[];
        }[];
        attempts?: {
          toolUseId: string;
          executionTaskId?: string;
          executionVerified?: boolean;
          lifecycle?: { status?: string };
        }[];
      }
    | undefined;
  const execution = raw?.execution;
  const safeError = String(error)
    .replaceAll(home, "<isolated-home>")
    .slice(0, 4000);
  const receipt = {
    passed: false,
    evidenceClass: "synthetic-upstream-native-sdk-product-session-loopback",
    mode: twoWorkersMode
      ? "native-two-background-workers"
      : parallelMode
        ? "native-background-task-package"
        : reworkMode
          ? "native-rework"
          : "single-agent",
    upstream: "127.0.0.1 synthetic fixture only",
    paidCalls: 0,
    publicNetwork: false,
    nativeSdk: true,
    sessionId: sessionId || undefined,
    elapsedMs: Date.now() - started,
    failure: safeError,
    calls,
    routeResults,
    errors: errors.map((item) =>
      item.replaceAll(home, "<isolated-home>").slice(0, 2000),
    ),
    execution: execution
      ? {
          id: execution.id,
          requestId: execution.requestId,
          phase: execution.phase,
          currentQueueId: execution.currentQueueId,
          lastSettledQueueId: execution.lastSettledQueueId,
          turns: execution.turns,
          reworks: execution.reworks,
          noProgress: execution.noProgress,
          reason: execution.reason,
          continuation: execution.continuation,
        }
      : undefined,
    executionEvidence: raw?.executionEvidence,
    delegationClaims: raw?.delegationClaims,
    delegationLaunches: raw?.delegationLaunches,
    taskPackages: raw?.taskPackages,
    attempts: raw?.attempts,
    liveSessionState: engineForCleanup?.getLiveSessionState?.(),
    backgroundDiagnostics,
  };
  await writeFile(
    join(evidenceDir, "failure-receipt.json"),
    JSON.stringify(receipt, null, 2),
    {
      mode: 0o600,
    },
  );
}
const humanText = twoWorkersMode
  ? `Create ${join(workspace, "alpha-proof.txt")} containing exactly "native-alpha-complete" and ${join(workspace, "beta-proof.txt")} containing exactly "native-beta-complete", then read both back and verify them.`
  : parallelMode
    ? `Create ${join(workspace, "agent-proof.txt")} containing exactly "native-background-task-complete", then read it back and verify it.`
    : reworkMode
      ? `Create ${join(workspace, "loopback-proof.txt")} containing exactly "native-loopback-correct", then read it back and verify it.`
      : `Create ${join(workspace, "loopback-proof.txt")} containing exactly "native-loopback-complete", then read it back and verify it.`;
const requestId = randomUUID();
let sessionId = "";
let reviewUsed = false;
let reviewDecision: "accept" | "rework" | undefined;
let reviewRouteFailure: string | undefined;
let reworkReviewSubmitted = false;
let reworkQueueId: string | undefined;
let reworkTerminalTextSent = false;
let reworkQueueRefreshSubmitted = false;
let acceptReviewSubmitted = false;
let nativeTurnCount = 0;
let childToolIssued = false;
let conflictLaunchAttempted = false;
let taskReviewUsed = false;
const workerArrivals = new Set<string>();
const workerWritesSent = new Set<string>();
let maxWorkersInFlight = 0;
let workerTerminalSent = false;
let parentQueueIdForWorkers: string | undefined;
let alphaRunningObserved = false;

async function listen(server: Server): Promise<number> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("loopback bind failed");
  return address.port;
}

function anthropicReply(
  res: import("node:http").ServerResponse,
  content:
    | { type: "text"; text: string }
    | {
        type: "tool_use";
        id: string;
        name: string;
        input: Record<string, unknown>;
      },
): void {
  const tool = content.type === "tool_use";
  const frame = (type: string, data: unknown) =>
    `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  const block = tool
    ? { type: "tool_use", id: content.id, name: content.name, input: {} }
    : { type: "text", text: "" };
  const delta = tool
    ? { type: "input_json_delta", partial_json: JSON.stringify(content.input) }
    : { type: "text_delta", text: content.text };
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
  });
  res.end(
    frame("message_start", {
      type: "message_start",
      message: {
        id: `loopback-${calls.length}`,
        type: "message",
        role: "assistant",
        model: "synthetic-loopback",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 8, output_tokens: 1 },
      },
    }) +
      frame("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: block,
      }) +
      frame("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta,
      }) +
      frame("content_block_stop", { type: "content_block_stop", index: 0 }) +
      frame("message_delta", {
        type: "message_delta",
        delta: {
          stop_reason: tool ? "tool_use" : "end_turn",
          stop_sequence: null,
        },
        usage: { output_tokens: 1 },
      }) +
      frame("message_stop", { type: "message_stop" }),
  );
}

async function readJson(
  req: import("node:http").IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
    if (chunks.reduce((total, chunk) => total + chunk.length, 0) > 1_000_000)
      throw new Error("request too large");
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
    string,
    unknown
  >;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

let taskHandler: typeof import("../src/server/routes/session-task-orchestration").handleSessionTaskCommand;
const routeServer = createServer((req, res) => {
  void (async () => {
    if (
      req.method !== "POST" ||
      req.url !== "/task" ||
      req.headers["x-loopback-token"] !== cliToken
    ) {
      res.writeHead(404).end();
      return;
    }
    const payload = await readJson(req);
    const result = await taskHandler({ ...payload, sessionId });
    routeResults.push({
      kind: payload.kind,
      taskId: payload.taskId,
      success: result.success,
      decision: (payload.assessment as { decision?: unknown } | undefined)
        ?.decision,
      error: result.error,
      revision: (result.ledger as { revision?: unknown } | undefined)?.revision,
    });
    if (payload.kind === "execution_review" && !result.success)
      reviewRouteFailure = String(result.error ?? "unknown review failure");
    if (result.success) {
      routeSnapshot = result;
    }
    if (payload.kind === "execution_review" && result.success) {
      reviewUsed = true;
      const assessment = payload.assessment as
        | { decision?: "accept" | "rework" }
        | undefined;
      reviewDecision = assessment?.decision;
      if (reviewDecision === "rework") {
        reworkReviewSubmitted = true;
        reworkQueueId = String(payload.queueId);
      } else if (reviewDecision === "accept") {
        acceptReviewSubmitted = true;
      }
    }
    if (payload.kind === "review" && result.success) taskReviewUsed = true;
    res.writeHead(result.success ? 200 : 409, {
      "content-type": "application/json",
    });
    res.end(JSON.stringify(result));
  })().catch((error) => {
    errors.push(String(error));
    res.writeHead(500).end("fixture route error");
  });
});
routePort = await listen(routeServer);

const cliPath = join(bin, "myagents");
await writeFile(
  cliPath,
  `#!/usr/bin/env node\n` +
    `const args=process.argv.slice(2);let payload={kind:'list'};` +
    `if(args[0]!=='session'||args[1]!=='tasks'||!args.includes('--json'))process.exit(2);` +
    `const i=args.indexOf('--data');if(i>=0){try{payload=JSON.parse(args[i+1])}catch{process.exit(2)}}` +
    `fetch('http://127.0.0.1:${routePort}/task',{method:'POST',headers:{'content-type':'application/json','x-loopback-token':'${cliToken}'},body:JSON.stringify(payload)})` +
    `.then(async r=>{const t=await r.text();process.stdout.write(t+'\\n');if(!r.ok)process.exitCode=1}).catch(e=>{process.stderr.write(String(e));process.exitCode=1});\n`,
  { mode: 0o700 },
);

const upstream = createServer((req, res) => {
  void (async () => {
    const body = await readJson(req);
    const systemText =
      typeof body.system === "string"
        ? body.system
        : JSON.stringify(body.system ?? "");
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const serialized = JSON.stringify(messages);
    const workerId = systemText.includes("SESSION_TASK_CHILD_ALPHA")
      ? "alpha"
      : systemText.includes("SESSION_TASK_CHILD_BETA")
        ? "beta"
        : undefined;
    if (workerId || systemText.includes("SESSION_TASK_CHILD_SENTINEL")) {
      if (workerId) {
        workerArrivals.add(workerId);
        maxWorkersInFlight = Math.max(maxWorkersInFlight, workerArrivals.size);
        if (!calls.some((call) => call.kind === `child-${workerId}-arrived`))
          calls.push({ kind: `child-${workerId}-arrived` });
        while (
          Date.now() - started < deadlineMs &&
          (workerArrivals.size < 2 || !workerTerminalSent)
        )
          await new Promise((resolve) => setTimeout(resolve, 20));
        if (workerArrivals.size < 2)
          throw new Error(
            "both native worker requests did not arrive concurrently",
          );
        if (!workerTerminalSent)
          throw new Error(
            "parent terminal was not persisted before worker writes",
          );
        while (Date.now() - started < deadlineMs) {
          const current = (
            await import("../src/server/SessionStore")
          ).getSessionMetadata(sessionId)?.taskOrchestration?.execution;
          if (current?.lastSettledQueueId === parentQueueIdForWorkers) break;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        const settledExecution = (
          await import("../src/server/SessionStore")
        ).getSessionMetadata(sessionId)?.taskOrchestration?.execution;
        if (
          !settledExecution ||
          settledExecution.lastSettledQueueId !== parentQueueIdForWorkers
        )
          throw new Error(
            "worker writes were not released by a persisted parent terminal",
          );
        if (!workerWritesSent.has(workerId)) {
          workerWritesSent.add(workerId);
          calls.push({ kind: `child-${workerId}-write`, tool: "Write" });
          anthropicReply(res, {
            type: "tool_use",
            id: `native-${workerId}-write-tool`,
            name: "Write",
            input: {
              file_path: `${workerId}-proof.txt`,
              content: `native-${workerId}-complete`,
            },
          });
          return;
        }
        anthropicReply(res, {
          type: "text",
          text: `Background worker ${workerId} wrote its scoped artifact.`,
        });
        return;
      }
      // Wait for the persisted terminal receipt of the parent's queue. This
      // proves the background child resumes after its root turn has ended.
      while (Date.now() - started < deadlineMs) {
        const current = (
          await import("../src/server/SessionStore")
        ).getSessionMetadata(sessionId)?.taskOrchestration?.execution;
        if (current?.lastSettledQueueId === current.currentQueueId) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      if (!childToolIssued) {
        childToolIssued = true;
        calls.push({ kind: "child-write", tool: "Write" });
        anthropicReply(res, {
          type: "tool_use",
          id: "native-child-write-artifact",
          name: "Write",
          input: {
            file_path: "agent-proof.txt",
            content: "native-background-task-complete",
          },
        });
      } else {
        for (const message of messages) {
          const msg = message as { content?: unknown };
          const blocks = Array.isArray(msg.content) ? msg.content : [];
          for (const block of blocks) {
            const value = block as {
              type?: unknown;
              content?: unknown;
              is_error?: unknown;
            };
            if (value.type === "tool_result")
              childToolResults.push(JSON.stringify(value));
          }
        }
        anthropicReply(res, {
          type: "text",
          text: "Background task wrote the scoped artifact.",
        });
      }
      return;
    }
    // Intent classification still uses the configured (synthetic) provider and
    // the production utility path; it receives no tools and returns schema JSON.
    if (systemText.includes("Classify the user's current request")) {
      calls.push({ kind: "classify" });
      const text = JSON.stringify({
        kind: "execute",
        continuationOf: null,
        objective: "Create and verify the requested artifact",
        scope: "Only the isolated workspace file named in the request",
        acceptanceCriteria: [
          "The requested file contains the exact requested text and a root Read verifies it.",
        ],
        steps: ["Create the requested artifact", "Verify its contents"],
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ content: [{ type: "text", text }] }));
      return;
    }
    // Provider/title utilities use the same loopback endpoint but are not the
    // desktop turn. Only SDK requests with the native tool catalog count as
    // actual Session turns; keep utility output harmless and tool-free.
    if (!Array.isArray(body.tools) || body.tools.length === 0) {
      calls.push({ kind: "title-utility" });
      anthropicReply(res, {
        type: "text",
        text: "Synthetic loopback execution",
      });
      return;
    }
    nativeTurnCount++;
    if (twoWorkersMode) backgroundDiagnostics.push({ nativeTurnCount, live: engineForCleanup?.getLiveSessionState?.() });
    if ((reworkMode || twoWorkersMode) && reviewRouteFailure) {
      calls.push({ kind: "review-route-failed" });
      anthropicReply(res, {
        type: "text",
        text: `The execution review route rejected the assessment: ${reviewRouteFailure}`,
      });
      return;
    }
    if (nativeTurnCount === 1) {
      const ledger = storeApi?.getSessionMetadata(sessionId)?.taskOrchestration;
      assert.equal(ledger?.tasks.filter(task => task.workPlanId === ledger.execution?.id).length, 2);
      assert.equal(ledger?.proposal, undefined);
      planPrecedesNative = true;
      calls.push({ kind: "analysis-only-native-turn" });
      anthropicReply(res, {
        type: "text",
        text: "I will carry out the requested file change and verify it.",
      });
      return;
    }
    if (twoWorkersMode) {
      if (!routeSnapshot) {
        calls.push({ kind: "list-before-workers", tool: "Bash" });
        anthropicReply(res, {
          type: "tool_use",
          id: "root-list-before-workers",
          name: "Bash",
          input: { command: "myagents session tasks --json" },
        });
        return;
      }
      const ledger = routeSnapshot.ledger as
        | { revision?: number; execution?: { id?: string } }
        | undefined;
      if (!ledger?.execution?.id)
        throw new Error("execution id missing for native worker package");
      if (!calls.some((call) => call.kind === "ensure-task-alpha")) {
        const data = JSON.stringify({
          kind: "ensure",
          taskId: "task-alpha",
          title: "[task:task-alpha] Write alpha proof",
          expectedRevision: ledger.revision ?? 0,
        });
        calls.push({ kind: "ensure-task-alpha", tool: "Bash" });
        anthropicReply(res, {
          type: "tool_use",
          id: "root-ensure-alpha",
          name: "Bash",
          input: {
            command: `myagents session tasks --json --data ${shellQuote(data)}`,
          },
        });
        return;
      }
      if (!calls.some((call) => call.kind === "package-task-alpha")) {
        const data = JSON.stringify({
          kind: "package",
          expectedRevision: ledger.revision ?? 0,
          package: {
            taskId: "task-alpha",
            executionId: ledger.execution.id,
            assignee: "background-alpha",
            resources: [{ path: "alpha-proof.txt", access: "write" }],
            reason: "Write the isolated alpha proof file.",
          },
        });
        calls.push({ kind: "package-task-alpha", tool: "Bash" });
        anthropicReply(res, {
          type: "tool_use",
          id: "root-package-alpha",
          name: "Bash",
          input: {
            command: `myagents session tasks --json --data ${shellQuote(data)}`,
          },
        });
        return;
      }
      if (!calls.some((call) => call.kind === "launch-alpha")) {
        calls.push({ kind: "launch-alpha", tool: "Agent" });
        anthropicReply(res, {
          type: "tool_use",
          id: "root-launch-background-alpha",
          name: "Agent",
          input: {
            subagent_type: "background-alpha",
            description: "[task:task-alpha] Write alpha proof",
            prompt:
              "[task:task-alpha] SESSION_TASK_CHILD_ALPHA Write alpha-proof.txt with native-alpha-complete.",
            run_in_background: true,
          },
        });
        return;
      }
      if (!calls.some((call) => call.kind === "list-alpha-running")) {
        calls.push({ kind: "list-alpha-running", tool: "Bash" });
        anthropicReply(res, {
          type: "tool_use",
          id: "root-list-alpha-running",
          name: "Bash",
          input: { command: "myagents session tasks --json" },
        });
        return;
      }
      if (!alphaRunningObserved) {
        const alphaPersistedLedger = (
          await import("../src/server/SessionStore")
        ).getSessionMetadata(sessionId)?.taskOrchestration as
          | {
              attempts?: {
                toolUseId: string;
                lifecycle?: { status?: string };
              }[];
              delegationClaims?: { toolUseId: string; state: string }[];
            }
          | undefined;
        const alphaAttempt = alphaPersistedLedger?.attempts?.find(
          (attempt) => attempt.toolUseId === "root-launch-background-alpha",
        );
        const alphaClaim = alphaPersistedLedger?.delegationClaims?.find(
          (claim) => claim.toolUseId === "root-launch-background-alpha",
        );
        if (
          alphaAttempt?.lifecycle?.status !== "running" ||
          alphaClaim?.state !== "running"
        )
          throw new Error(
            `alpha must be persistently running before beta package admission (attempt=${alphaAttempt?.lifecycle?.status ?? "missing"}, claim=${alphaClaim?.state ?? "missing"})`,
          );
        alphaRunningObserved = true;
      }
      if (!calls.some((call) => call.kind === "ensure-task-beta")) {
        const data = JSON.stringify({
          kind: "ensure",
          taskId: "task-beta",
          title: "[task:task-beta] Write beta proof",
          expectedRevision: ledger.revision ?? 0,
        });
        calls.push({ kind: "ensure-task-beta", tool: "Bash" });
        anthropicReply(res, {
          type: "tool_use",
          id: "root-ensure-beta",
          name: "Bash",
          input: {
            command: `myagents session tasks --json --data ${shellQuote(data)}`,
          },
        });
        return;
      }
      if (!calls.some((call) => call.kind === "package-task-beta")) {
        const data = JSON.stringify({
          kind: "package",
          expectedRevision: ledger.revision ?? 0,
          package: {
            taskId: "task-beta",
            executionId: ledger.execution.id,
            assignee: "background-beta",
            resources: [{ path: "beta-proof.txt", access: "write" }],
            reason: "Write the isolated beta proof file.",
          },
        });
        calls.push({ kind: "package-task-beta", tool: "Bash" });
        anthropicReply(res, {
          type: "tool_use",
          id: "root-package-beta",
          name: "Bash",
          input: {
            command: `myagents session tasks --json --data ${shellQuote(data)}`,
          },
        });
        return;
      }
      if (!calls.some((call) => call.kind === "launch-beta")) {
        calls.push({ kind: "launch-beta", tool: "Agent" });
        anthropicReply(res, {
          type: "tool_use",
          id: "root-launch-background-beta",
          name: "Agent",
          input: {
            subagent_type: "background-beta",
            description: "[task:task-beta] Write beta proof",
            prompt:
              "[task:task-beta] SESSION_TASK_CHILD_BETA Write beta-proof.txt with native-beta-complete.",
            run_in_background: true,
          },
        });
        return;
      }
      if (!workerTerminalSent) {
        while (Date.now() - started < deadlineMs && workerArrivals.size < 2)
          await new Promise((resolve) => setTimeout(resolve, 20));
        if (workerArrivals.size < 2)
          throw new Error(
            "two native worker requests were not concurrently in flight before parent terminal",
          );
        parentQueueIdForWorkers = (
          routeSnapshot.ledger as {
            execution?: { currentQueueId?: string };
          }
        ).execution?.currentQueueId;
        if (!parentQueueIdForWorkers)
          throw new Error(
            "current execution queue missing before worker terminal",
          );
        workerTerminalSent = true;
        calls.push({ kind: "root-ends-with-two-workers-running" });
        anthropicReply(res, {
          type: "text",
          text: "Both independent background workers are running. I will verify both outputs after their native completion.",
        });
        return;
      }
      if (!calls.some((call) => call.kind === "list-after-workers")) {
        calls.push({ kind: "list-after-workers", tool: "Bash" });
        anthropicReply(res, {
          type: "tool_use",
          id: "root-list-after-workers",
          name: "Bash",
          input: { command: "myagents session tasks --json" },
        });
        return;
      }
      for (const worker of ["alpha", "beta"] as const) {
        const kind = `root-read-${worker}`;
        if (calls.some((call) => call.kind === kind)) continue;
        calls.push({ kind, tool: "Read" });
        anthropicReply(res, {
          type: "tool_use",
          id: `root-read-${worker}-artifact`,
          name: "Read",
          input: { file_path: join(workspace, `${worker}-proof.txt`) },
        });
        return;
      }
      if (!calls.some((call) => call.kind === "list-before-worker-reviews")) {
        calls.push({ kind: "list-before-worker-reviews", tool: "Bash" });
        anthropicReply(res, {
          type: "tool_use",
          id: "root-list-before-worker-reviews",
          name: "Bash",
          input: { command: "myagents session tasks --json" },
        });
        return;
      }
      if (
        routeResults.some(
          (result) =>
            result.kind === "review" &&
            result.taskId === "task-alpha" &&
            result.success === true,
        ) &&
        !calls.some((call) => call.kind === "list-after-review-alpha")
      ) {
        calls.push({ kind: "list-after-review-alpha", tool: "Bash" });
        anthropicReply(res, {
          type: "tool_use",
          id: "root-list-after-review-alpha",
          name: "Bash",
          input: { command: "myagents session tasks --json" },
        });
        return;
      }
      const reviewLedger = routeSnapshot.ledger as
        | {
            revision?: number;
            attempts?: {
              id: string;
              toolUseId: string;
              lifecycle?: { status?: string };
            }[];
          }
        | undefined;
      for (const worker of ["alpha", "beta"] as const) {
        const kind = `review-${worker}`;
        if (calls.some((call) => call.kind === kind)) continue;
        const taskId = `task-${worker}`;
        const attemptId = reviewLedger?.attempts?.findLast(
          (attempt) =>
            attempt.toolUseId === `root-launch-background-${worker}` &&
            attempt.lifecycle?.status === "completed",
        )?.id;
        if (!attemptId)
          throw new Error(`completed native attempt missing for ${taskId}`);
        const data = JSON.stringify({
          kind: "review",
          taskId,
          attemptId,
          decision: "accept",
          evidence: `Root Read verified ${worker}-proof.txt after native completion.`,
          expectedRevision: reviewLedger?.revision ?? 0,
        });
        calls.push({ kind, tool: "Bash" });
        anthropicReply(res, {
          type: "tool_use",
          id: `root-review-${worker}`,
          name: "Bash",
          input: {
            command: `myagents session tasks --json --data ${shellQuote(data)}`,
          },
        });
        return;
      }
      if (!acceptReviewSubmitted) {
        const execution = (
          routeSnapshot.ledger as {
            execution?: { id?: string; currentQueueId?: string };
          }
        ).execution;
        if (!execution?.id || !execution.currentQueueId)
          throw new Error("execution identity missing for final worker review");
        const data = JSON.stringify({
          kind: "execution_review",
          executionId: execution.id,
          queueId: execution.currentQueueId,
          assessment: {
            decision: "accept",
            summary:
              "Both native workers completed; root Read verified both separate files.",
            checks: [
              {
                criterion: 0,
                toolUseIds: [
                  "root-read-alpha-artifact",
                  "root-read-beta-artifact",
                ],
              },
            ],
          },
        });
        calls.push({ kind: "review-two-workers-execution", tool: "Bash" });
        anthropicReply(res, {
          type: "tool_use",
          id: "root-review-two-workers-execution",
          name: "Bash",
          input: {
            command: `myagents session tasks --json --data ${shellQuote(data)}`,
          },
        });
        return;
      }
      calls.push({ kind: "final-two-workers" });
      anthropicReply(res, {
        type: "text",
        text: "Both independent native background tasks completed; I read and verified each output.",
      });
      return;
    }
    if (parallelMode && !routeSnapshot) {
      calls.push({ kind: "list-before-package", tool: "Bash" });
      anthropicReply(res, {
        type: "tool_use",
        id: "root-list-before-package",
        name: "Bash",
        input: { command: "myagents session tasks --json" },
      });
      return;
    }
    if (parallelMode && !calls.some((call) => call.kind === "task-ensure")) {
      const ledger = routeSnapshot?.ledger as { revision?: number } | undefined;
      const data = JSON.stringify({
        kind: "ensure",
        taskId: "native-write-task",
        title: "[task:native-write-task] Write the isolated artifact",
        expectedRevision: ledger?.revision ?? 0,
      });
      calls.push({ kind: "task-ensure", tool: "Bash" });
      anthropicReply(res, {
        type: "tool_use",
        id: "root-ensure-task",
        name: "Bash",
        input: {
          command: `myagents session tasks --json --data ${shellQuote(data)}`,
        },
      });
      return;
    }
    if (parallelMode && !calls.some((call) => call.kind === "task-package")) {
      const ledger = routeSnapshot?.ledger as
        | {
            revision?: number;
            execution?: { id?: string };
          }
        | undefined;
      if (!ledger?.execution?.id)
        throw new Error("execution id missing for package");
      const data = JSON.stringify({
        kind: "package",
        expectedRevision: ledger.revision ?? 0,
        package: {
          taskId: "native-write-task",
          executionId: ledger.execution.id,
          assignee: "background-fixture",
          resources: [{ path: "agent-proof.txt", access: "write" }],
          reason:
            "Write one isolated proof artifact in the temporary workspace.",
        },
      });
      calls.push({ kind: "task-package", tool: "Bash" });
      anthropicReply(res, {
        type: "tool_use",
        id: "root-register-package",
        name: "Bash",
        input: {
          command: `myagents session tasks --json --data ${shellQuote(data)}`,
        },
      });
      return;
    }
    if (parallelMode && !calls.some((call) => call.kind === "agent-launch")) {
      calls.push({ kind: "agent-launch", tool: "Agent" });
      anthropicReply(res, {
        type: "tool_use",
        id: "root-launch-background-task",
        name: "Agent",
        input: {
          subagent_type: "background-fixture",
          description:
            "[task:native-write-task] Write the scoped proof artifact",
          prompt:
            "[task:native-write-task] SESSION_TASK_CHILD_SENTINEL Write the scoped proof artifact exactly as instructed.",
          run_in_background: true,
        },
      });
      return;
    }
    if (parallelMode && !conflictLaunchAttempted) {
      conflictLaunchAttempted = true;
      calls.push({ kind: "conflicting-launch", tool: "Agent" });
      anthropicReply(res, {
        type: "tool_use",
        id: "root-launch-conflicting-task",
        name: "Agent",
        input: {
          subagent_type: "background-fixture",
          description: "[task:native-write-task] Try a conflicting write",
          prompt: "[task:native-write-task] Try a conflicting write.",
          run_in_background: true,
        },
      });
      return;
    }
    if (parallelMode && !childToolIssued) {
      calls.push({ kind: "root-ends-with-child-running" });
      anthropicReply(res, {
        type: "text",
        text: "The background task is running; I will verify it after completion.",
      });
      return;
    }
    if (
      parallelMode &&
      !calls.some((call) => call.kind === "list-after-child")
    ) {
      calls.push({ kind: "list-after-child", tool: "Bash" });
      anthropicReply(res, {
        type: "tool_use",
        id: "root-list-after-child",
        name: "Bash",
        input: { command: "myagents session tasks --json" },
      });
      return;
    }
    if (
      parallelMode &&
      !calls.some((call) => call.kind === "root-read-child")
    ) {
      calls.push({ kind: "root-read-child", tool: "Read" });
      anthropicReply(res, {
        type: "tool_use",
        id: "root-read-native-child-artifact",
        name: "Read",
        input: { file_path: join(workspace, "agent-proof.txt") },
      });
      return;
    }
    if (
      parallelMode &&
      !calls.some((call) => call.kind === "list-before-task-review")
    ) {
      calls.push({ kind: "list-before-task-review", tool: "Bash" });
      anthropicReply(res, {
        type: "tool_use",
        id: "root-list-before-task-review",
        name: "Bash",
        input: { command: "myagents session tasks --json" },
      });
      return;
    }
    if (parallelMode && !taskReviewUsed) {
      const ledger = routeSnapshot?.ledger as
        | {
            revision?: number;
            attempts?: {
              id: string;
              toolUseId: string;
              lifecycle?: { status: string };
            }[];
          }
        | undefined;
      const attemptId = ledger?.attempts?.findLast(
        (attempt) =>
          attempt.toolUseId === "root-launch-background-task" &&
          attempt.lifecycle?.status === "completed",
      )?.id;
      if (!attemptId) throw new Error("completed native task attempt missing");
      const data = JSON.stringify({
        kind: "review",
        taskId: "native-write-task",
        attemptId,
        decision: "accept",
        evidence:
          "Root Read verified the exact artifact after native completion.",
        expectedRevision: ledger?.revision ?? 0,
      });
      calls.push({ kind: "task-review", tool: "Bash" });
      anthropicReply(res, {
        type: "tool_use",
        id: "root-review-native-task",
        name: "Bash",
        input: {
          command: `myagents session tasks --json --data ${shellQuote(data)}`,
        },
      });
      return;
    }
    if (!routeSnapshot) {
      calls.push({ kind: "list", tool: "Bash" });
      anthropicReply(res, {
        type: "tool_use",
        id: "root-list-tasks",
        name: "Bash",
        input: { command: "myagents session tasks --json" },
      });
      return;
    }
    if (reworkMode) {
      if (!calls.some((call) => call.kind === "rework-first-write")) {
        calls.push({ kind: "rework-first-write", tool: "Write" });
        anthropicReply(res, {
          type: "tool_use",
          id: "root-write-artifact-wrong",
          name: "Write",
          input: {
            file_path: join(workspace, "loopback-proof.txt"),
            content: "native-loopback-wrong",
          },
        });
        return;
      }
      if (!calls.some((call) => call.kind === "rework-first-read")) {
        calls.push({ kind: "rework-first-read", tool: "Read" });
        anthropicReply(res, {
          type: "tool_use",
          id: "root-read-artifact-wrong",
          name: "Read",
          input: { file_path: join(workspace, "loopback-proof.txt") },
        });
        return;
      }
      if (!reworkReviewSubmitted) {
        if (calls.some((call) => call.kind === "rework-review"))
          throw new Error(
            `rework review did not succeed: ${reviewRouteFailure ?? "no route receipt"}`,
          );
        const ledger = routeSnapshot?.ledger as
          | { execution?: { id?: string; currentQueueId?: string } }
          | undefined;
        const execution = ledger?.execution;
        if (!execution?.id || !execution.currentQueueId)
          throw new Error("task listing did not expose execution identity");
        const reviewData = JSON.stringify({
          kind: "execution_review",
          executionId: execution.id,
          queueId: execution.currentQueueId,
          assessment: {
            decision: "rework",
            summary:
              "The root Read found the deliberately incorrect value; rewrite it and verify again.",
            checks: [
              { criterion: 0, toolUseIds: ["root-read-artifact-wrong"] },
            ],
          },
        });
        calls.push({ kind: "rework-review", tool: "Bash" });
        anthropicReply(res, {
          type: "tool_use",
          id: "root-review-execution-rework",
          name: "Bash",
          input: {
            command: `myagents session tasks --json --data ${shellQuote(reviewData)}`,
          },
        });
        return;
      }
      if (!reworkTerminalTextSent) {
        reworkTerminalTextSent = true;
        calls.push({ kind: "rework-terminal" });
        anthropicReply(res, {
          type: "text",
          text: "The first review requested rework. I am ending this turn and will continue in the next execution queue.",
        });
        return;
      }
      if (!reworkQueueRefreshSubmitted) {
        reworkQueueRefreshSubmitted = true;
        calls.push({ kind: "rework-next-queue-list", tool: "Bash" });
        anthropicReply(res, {
          type: "tool_use",
          id: "root-list-after-rework",
          name: "Bash",
          input: { command: "myagents session tasks --json" },
        });
        return;
      }
      const refreshedLedger = routeSnapshot?.ledger as
        | { execution?: { currentQueueId?: string } }
        | undefined;
      if (
        !reworkQueueId ||
        !refreshedLedger?.execution?.currentQueueId ||
        refreshedLedger.execution.currentQueueId === reworkQueueId
      )
        throw new Error(
          "the rework review did not advance to a distinct execution queue",
        );
      if (!calls.some((call) => call.kind === "rework-second-write")) {
        calls.push({ kind: "rework-second-write", tool: "Write" });
        anthropicReply(res, {
          type: "tool_use",
          id: "root-write-artifact-correct",
          name: "Write",
          input: {
            file_path: join(workspace, "loopback-proof.txt"),
            content: "native-loopback-correct",
          },
        });
        return;
      }
      if (!calls.some((call) => call.kind === "rework-second-read")) {
        calls.push({ kind: "rework-second-read", tool: "Read" });
        anthropicReply(res, {
          type: "tool_use",
          id: "root-read-artifact-correct",
          name: "Read",
          input: { file_path: join(workspace, "loopback-proof.txt") },
        });
        return;
      }
      if (!acceptReviewSubmitted) {
        if (calls.some((call) => call.kind === "rework-accept-review"))
          throw new Error(
            `accept review did not succeed: ${reviewRouteFailure ?? "no route receipt"}`,
          );
        const ledger = routeSnapshot?.ledger as
          | { execution?: { id?: string; currentQueueId?: string } }
          | undefined;
        const execution = ledger?.execution;
        if (!execution?.id || !execution.currentQueueId)
          throw new Error("task listing did not expose execution identity");
        const reviewData = JSON.stringify({
          kind: "execution_review",
          executionId: execution.id,
          queueId: execution.currentQueueId,
          assessment: {
            decision: "accept",
            summary:
              "A new root Read verified the corrected value after rework.",
            checks: [
              { criterion: 0, toolUseIds: ["root-read-artifact-correct"] },
            ],
          },
        });
        calls.push({ kind: "rework-accept-review", tool: "Bash" });
        anthropicReply(res, {
          type: "tool_use",
          id: "root-review-execution-accept",
          name: "Bash",
          input: {
            command: `myagents session tasks --json --data ${shellQuote(reviewData)}`,
          },
        });
        return;
      }
      calls.push({ kind: "final" });
      anthropicReply(res, {
        type: "text",
        text: "The incorrect value was reworked, then the corrected file was verified by reading it back.",
      });
      return;
    }
    if (todoPlanMode) {
      const ledger = storeApi!.getSessionMetadata(sessionId)!.taskOrchestration!;
      const todos = ledger.tasks.filter(task => task.workPlanId === ledger.execution!.id);
      const actions = [
        { kind: "todo-create-1", name: "TaskCreate", input: { subject: `[task:${todos[0].id}] ${todos[0].title}` } },
        { kind: "todo-create-2", name: "TaskCreate", input: { subject: `[task:${todos[1].id}] ${todos[1].title}` } },
        { kind: "todo-start-1", name: "TaskUpdate", input: { taskId: "1", status: "in_progress" } },
        ...(calls.some(call => call.kind === "write") ? [
          { kind: "todo-finish-1", name: "TaskUpdate", input: { taskId: "1", status: "completed" } },
          { kind: "todo-start-2", name: "TaskUpdate", input: { taskId: "2", status: "in_progress" } },
        ] : []),
        ...(calls.some(call => call.kind === "read") ? [
          { kind: "todo-finish-2", name: "TaskUpdate", input: { taskId: "2", status: "completed" } },
        ] : []),
      ];
      const action = actions.find(action => !calls.some(call => call.kind === action.kind));
      if (action) {
        assert((body.tools as { name: string }[]).some(tool => tool.name === action.name), `${action.name} must be a real native SDK tool`);
        calls.push({ kind: action.kind, tool: action.name });
        anthropicReply(res, { type: "tool_use", id: `root-${action.kind}`, name: action.name, input: action.input });
        return;
      }
      if (calls.some(call => call.kind === "todo-start-2") && !calls.some(call => call.kind === "read")) {
        const snapshot = await taskHandler({ sessionId, kind: "list" });
        const tasks = snapshot.tasks as { id: string; phase: string }[];
        assert.deepEqual(todos.map(todo => tasks.find(task => task.id === todo.id)?.phase), ["awaiting_review", "running"]);
        nativePlanUpdatesVerified = true;
      }
    }
    const hasReviewReceipt = reviewUsed;
    if (!calls.some((call) => call.tool === "Write")) {
      calls.push({ kind: "write", tool: "Write" });
      anthropicReply(res, {
        type: "tool_use",
        id: "root-write-artifact",
        name: "Write",
        input: {
          file_path: join(workspace, "loopback-proof.txt"),
          content: "native-loopback-complete",
        },
      });
      return;
    }
    if (!calls.some((call) => call.tool === "Read")) {
      calls.push({ kind: "read", tool: "Read" });
      anthropicReply(res, {
        type: "tool_use",
        id: "root-read-artifact",
        name: "Read",
        input: { file_path: join(workspace, "loopback-proof.txt") },
      });
      return;
    }
    if (!hasReviewReceipt) {
      const ledger = routeSnapshot?.ledger as
        | { execution?: { id?: string; currentQueueId?: string } }
        | undefined;
      const execution = ledger?.execution;
      if (!execution?.id || !execution.currentQueueId)
        throw new Error("task listing did not expose execution identity");
      const assessment = {
        decision: "accept",
        summary: "Root Read verified the exact artifact contents.",
        checks: [
          {
            criterion: 0,
            toolUseIds: [
              parallelMode
                ? "root-read-native-child-artifact"
                : "root-read-artifact",
            ],
          },
        ],
      };
      const reviewData = JSON.stringify({
        kind: "execution_review",
        executionId: execution.id,
        queueId: execution.currentQueueId,
        assessment,
      });
      calls.push({ kind: "review", tool: "Bash" });
      anthropicReply(res, {
        type: "tool_use",
        id: "root-review-execution",
        name: "Bash",
        input: {
          command: `myagents session tasks --json --data ${shellQuote(reviewData)}`,
        },
      });
      return;
    }
    calls.push({ kind: "final" });
    anthropicReply(res, {
      type: "text",
      text: "The file was written and verified by reading it back.",
    });
    void serialized;
  })().catch((error) => {
    errors.push(String(error));
    console.error("[synthetic-upstream-fixture-error]", String(error));
    if (twoWorkersMode) {
      fixtureFatalError = String(error);
      anthropicReply(res, {
        type: "text",
        text: `Bounded native worker verifier stopped: ${String(error)}`,
      });
      return;
    }
    res.writeHead(500).end("synthetic provider error");
  });
});
const upstreamPort = await listen(upstream);

try {
  const { initializeAgent, setSessionProviderEnv, setSessionModel } =
    await import("../src/server/agent-session");
  const store = (storeApi = await import("../src/server/SessionStore"));
  const taskOrchestration = await import(
    "../src/server/session-engine/task-orchestration"
  );
  const { getSessionEngine } = await import(
    "../src/server/session-engine/selector"
  );
  ({ handleSessionTaskCommand: taskHandler } = await import(
    "../src/server/routes/session-task-orchestration"
  ));

  // The production semantic classifier resolves provider candidates from the
  // regular per-user catalog. Seed only this synthetic provider in the private
  // HOME so its normal utility transport also stays on loopback.
  const providers = join(home, ".myagents", "providers");
  await mkdir(providers, { recursive: true });
  await writeFile(
    join(providers, "synthetic-loopback.json"),
    JSON.stringify({
      id: "synthetic-loopback",
      name: "Synthetic loopback",
      type: "api",
      enabled: true,
      config: { baseUrl: `http://127.0.0.1:${upstreamPort}` },
      models: [{ model: "synthetic-loopback" }],
    }),
  );
  await writeFile(
    join(home, ".myagents", "config.json"),
    JSON.stringify({
      providerApiKeys: { "synthetic-loopback": "fixture-only" },
    }),
  );

  await withHardDeadline(
    initializeAgent(workspace, null, undefined, { preWarmDisabled: true }),
    "initializeAgent",
  );
  await withHardDeadline(
    setSessionProviderEnv({
      providerId: "synthetic-loopback",
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      apiKey: "fixture-only",
      apiProtocol: "anthropic",
    }),
    "setSessionProviderEnv",
  );
  await withHardDeadline(
    setSessionModel("synthetic-loopback"),
    "setSessionModel",
  );
  const engine = getSessionEngine();
  engineForCleanup = engine;
  const born = await withHardDeadline(
    engine.resetForNewDesktopSession(workspace),
    "resetForNewDesktopSession",
  );
  assert(born.success && born.sessionId);
  sessionId = born.sessionId;
  if (parallelMode || twoWorkersMode) {
    const agents = twoWorkersMode
      ? {
          "background-alpha": {
            description: "Credential-free alpha worker fixture",
            prompt:
              "SESSION_TASK_CHILD_ALPHA. Only write alpha's scoped artifact.",
            tools: ["Write"],
            model: "inherit",
          },
          "background-beta": {
            description: "Credential-free beta worker fixture",
            prompt:
              "SESSION_TASK_CHILD_BETA. Only write beta's scoped artifact.",
            tools: ["Write"],
            model: "inherit",
          },
        }
      : {
          "background-fixture": {
            description: "Credential-free managed task fixture",
            prompt:
              "SESSION_TASK_CHILD_SENTINEL. Only write the task's scoped artifact.",
            tools: ["Write"],
            model: "inherit",
          },
        };
    await withHardDeadline(engine.updateAgents(agents), "updateAgents");
  }
  const meta = store.getSessionMetadata(sessionId);
  assert(meta, "reset must persist an original SessionStore row");
  assert.equal(meta.runtime, "builtin");
  await taskOrchestration.recordSessionPlanHumanInput(
    sessionId,
    requestId,
    humanText,
  );

  let initialTerminal: unknown;
  const admitted = await withHardDeadline(
    engine.sendDesktopMessage({
      sessionId,
      workspacePath: workspace,
      text: humanText,
      clientRequestId: requestId,
      scenario: { type: "desktop" },
      permissionMode: "fullAgency",
      onTerminal: (outcome) => {
        initialTerminal = outcome;
      },
    }),
    "sendDesktopMessage",
  );
  assert(
    admitted.success && admitted.queueId,
    `original facade admission failed: ${admitted.error ?? "unknown"}`,
  );
  const taskCommand = await import("../src/shared/sessionTaskReviewCommand");
  const waitFor = async (predicate: () => boolean, label: string) => {
    while (
      Date.now() - started < deadlineMs &&
      !predicate() &&
      !fixtureFatalError
    )
      await new Promise((resolve) => setTimeout(resolve, 50));
    assert(
      predicate() && !fixtureFatalError,
      `${label} did not settle cleanly within ${deadlineMs}ms; fixtureFatalError=${fixtureFatalError ?? "none"}; fixture calls=${JSON.stringify(calls)} routeResults=${JSON.stringify(routeResults)} childToolResults=${JSON.stringify(childToolResults)} errors=${JSON.stringify(errors)} execution=${JSON.stringify(store.getSessionMetadata(sessionId)?.taskOrchestration)}`,
    );
  };
  await waitFor(
    () => !!store.getSessionMetadata(sessionId)?.taskOrchestration?.execution,
    "execution ledger",
  );
  await waitFor(
    () =>
      store.getSessionMetadata(sessionId)?.taskOrchestration?.execution
        ?.phase === "completed",
    "execution completion",
  );

  if (twoWorkersMode) {
    assert.equal(
      await readFile(join(workspace, "alpha-proof.txt"), "utf8"),
      "native-alpha-complete",
    );
    assert.equal(
      await readFile(join(workspace, "beta-proof.txt"), "utf8"),
      "native-beta-complete",
    );
  } else {
    const artifactPath = join(
      workspace,
      parallelMode ? "agent-proof.txt" : "loopback-proof.txt",
    );
    const contents = await readFile(artifactPath, "utf8");
    assert.equal(
      contents,
      parallelMode
        ? "native-background-task-complete"
        : reworkMode
          ? "native-loopback-correct"
          : "native-loopback-complete",
    );
  }
  const execution =
    store.getSessionMetadata(sessionId)?.taskOrchestration?.execution;
  assert.equal(execution?.phase, "completed");
  assert(planPrecedesNative, "the To Do List must exist before the first native model turn");
  if (todoPlanMode) {
    assert(nativePlanUpdatesVerified, "real native TaskCreate/TaskUpdate results must update the original ledger before verification");
    const snapshot = await taskHandler({ sessionId, kind: "list" });
    const tasks = snapshot.tasks as { phase: string }[];
    assert.equal(tasks.length, 2);
    assert(tasks.every(task => task.phase === "completed"), "root terminal acceptance must settle the same native To Do List");
  }
  assert(
    admitted.queueId?.startsWith("session-execution:"),
    "the original facade send must own its execution queue",
  );
  assert(
    initialTerminal &&
      (initialTerminal as { status?: string }).status === "complete",
    "the original analysis-only turn must reach its real terminal",
  );
  assert(
    (initialTerminal as { text?: string }).text?.includes(
      "I will carry out the requested file change",
    ),
    "the original queue terminal must be the deliberately analysis-only response",
  );
  assert(
    (execution?.turns ?? 0) >= 2 &&
      execution?.currentQueueId !== admitted.queueId,
    `the persisted execution must continue in a distinct normal queue after the analysis-only terminal: ${JSON.stringify({ turns: execution?.turns, originalQueueId: admitted.queueId, currentQueueId: execution?.currentQueueId, phase: execution?.phase, initialTerminal })}`,
  );
  assert(
    calls.findIndex((call) => call.kind === "analysis-only-native-turn") <
      calls.findIndex(
        (call) =>
          call.kind === "list" ||
          call.kind === "list-before-package" ||
          call.kind === "list-before-workers",
      ),
    "the first native model turn must be tool-free before continuation tools",
  );
  assert(
    calls.some((call) => call.tool === "Write") &&
      calls.some((call) => call.tool === "Read"),
    twoWorkersMode
      ? "native SDK must execute two child Writes and two root Reads"
      : parallelMode
        ? "native SDK must execute child Write and root Read"
        : "native SDK must execute root Write and Read",
  );
  if (parallelMode) {
    assert(
      calls.some((call) => call.kind === "agent-launch"),
      "the parent must launch a real native background Agent",
    );
    assert(
      calls.some((call) => call.kind === "conflicting-launch"),
      "the parent must attempt an overlapping write package",
    );
    assert.equal(calls.filter((call) => call.kind === "child-write").length, 1);
    const terminalPosition = calls.findIndex(
      (call) => call.kind === "root-ends-with-child-running",
    );
    const childPosition = calls.findIndex(
      (call) => call.kind === "child-write",
    );
    assert(
      terminalPosition >= 0 && childPosition > terminalPosition,
      "the scoped child write must start only after root terminal persistence",
    );
  }
  if (twoWorkersMode) {
    const alphaArrival = calls.findIndex(
      (call) => call.kind === "child-alpha-arrived",
    );
    const betaArrival = calls.findIndex(
      (call) => call.kind === "child-beta-arrived",
    );
    const terminalPosition = calls.findIndex(
      (call) => call.kind === "root-ends-with-two-workers-running",
    );
    assert(alphaArrival >= 0 && betaArrival >= 0);
    assert(terminalPosition > alphaArrival && terminalPosition > betaArrival);
    assert.equal(maxWorkersInFlight, 2);
    assert(
      calls.findIndex((call) => call.kind === "child-alpha-write") >
        terminalPosition &&
        calls.findIndex((call) => call.kind === "child-beta-write") >
          terminalPosition,
      "both workers must write only after the persisted parent terminal",
    );
    assert(calls.some((call) => call.kind === "launch-alpha"));
    assert(calls.some((call) => call.kind === "launch-beta"));
    assert(calls.some((call) => call.kind === "review-alpha"));
    assert(calls.some((call) => call.kind === "review-beta"));
    assert.equal(
      routeResults.filter(
        (result) => result.kind === "review" && result.success,
      ).length,
      2,
    );
    assert.deepEqual(
      routeResults
        .filter((result) => result.kind === "execution_review")
        .map((result) => ({
          success: result.success,
          decision: result.decision,
        })),
      [{ success: true, decision: "accept" }],
    );
  }
  assert(
    calls.some((call) =>
      twoWorkersMode
        ? call.kind === "review-two-workers-execution" && call.tool === "Bash"
        : reworkMode
          ? call.kind === "rework-review" && call.tool === "Bash"
          : call.kind === "review" && call.tool === "Bash",
    ),
    "review must execute through SDK Bash and the real route handler",
  );
  assert.equal(
    taskCommand.parseSessionTaskCommand({
      command: "myagents session tasks --json",
    })?.kind,
    "list",
  );
  assert.deepEqual(errors, []);
  assert(
    Date.now() - started < deadlineMs,
    "must stay within the 60 second bound",
  );
  const persistedRows = JSON.parse(
    await readFile(join(home, ".myagents", "sessions.json"), "utf8"),
  ) as Array<Record<string, unknown>>;
  const persistedSession = persistedRows.find((row) => row.id === sessionId);
  const persistedLedger = persistedSession?.taskOrchestration as
    | {
        execution?: typeof execution;
        executionInputs?: { requestId: string }[];
        executionEvidence?: {
          id: string;
          queueId: string;
          successful: boolean;
          pending?: boolean;
        }[];
        attempts?: {
          id: string;
          toolUseId: string;
          executionTaskId?: string;
          executionVerified?: boolean;
          lifecycle: { status: string };
        }[];
        delegationLaunches?: number;
        delegationClaims?: {
          toolUseId: string;
          taskId: string;
          state: string;
        }[];
        taskPackages?: { taskId: string }[];
      }
    | undefined;
  assert.equal(
    persistedLedger?.execution?.phase,
    "completed",
    "completion must exist in the actual sessions.json record",
  );
  const inputAdmissions = persistedLedger?.executionInputs?.filter(
    (input) => input.requestId === requestId,
  ).length;
  assert.equal(
    inputAdmissions,
    1,
    "the original human input proof must persist once",
  );
  const writeCalls = calls.filter((call) => call.tool === "Write");
  const readCalls = calls.filter((call) => call.tool === "Read");
  const writeUses = writeCalls.length;
  const readUses = readCalls.length;
  assert.equal(writeUses, reworkMode || twoWorkersMode ? 2 : 1);
  assert.equal(readUses, reworkMode || twoWorkersMode ? 2 : 1);
  if (reworkMode) {
    assert.deepEqual(
      writeCalls.map((call) => call.kind),
      ["rework-first-write", "rework-second-write"],
    );
    assert.deepEqual(
      readCalls.map((call) => call.kind),
      ["rework-first-read", "rework-second-read"],
    );
    assert.deepEqual(
      calls
        .filter((call) => call.kind.includes("review"))
        .map((call) => call.kind),
      ["rework-review", "rework-accept-review"],
    );
    assert.equal(execution?.reworks, 1);
    assert.equal(reviewDecision, "accept");
    assert.deepEqual(
      routeResults
        .filter((result) => result.kind === "execution_review")
        .map((result) => ({
          success: result.success,
          decision: result.decision,
        })),
      [
        { success: true, decision: "rework" },
        { success: true, decision: "accept" },
      ],
    );
    const evidence = persistedLedger?.executionEvidence ?? [];
    assert.deepEqual(
      evidence.map((item) => item.id),
      [
        "root-write-artifact-wrong",
        "root-read-artifact-wrong",
        "root-write-artifact-correct",
        "root-read-artifact-correct",
      ],
    );
    assert(evidence.every((item) => item.successful && !item.pending));
    assert.equal(evidence[0]?.queueId, evidence[1]?.queueId);
    assert.equal(evidence[2]?.queueId, evidence[3]?.queueId);
    assert.notEqual(evidence[0]?.queueId, evidence[2]?.queueId);
    assert.equal(evidence[2]?.queueId, execution?.currentQueueId);
  }
  if (parallelMode) {
    const nativeAttempt = persistedLedger?.attempts?.find(
      (attempt) => attempt.toolUseId === "root-launch-background-task",
    );
    assert(
      nativeAttempt?.executionTaskId,
      "actual SDK task_started identity must be recorded",
    );
    assert.equal(nativeAttempt?.executionVerified, true);
    assert.equal(
      nativeAttempt?.lifecycle.status,
      "completed",
      "only the native lifecycle completion can settle the attempt",
    );
    assert.equal(
      persistedLedger?.delegationClaims?.length,
      1,
      "the overlapping duplicate launch must not acquire a second write claim",
    );
    assert.equal(
      persistedLedger?.delegationClaims?.[0]?.taskId,
      "native-write-task",
    );
    assert.equal(
      persistedLedger?.delegationClaims?.[0]?.state,
      "settled",
      "native task completion must settle the claim",
    );
    assert.equal(
      persistedLedger?.delegationLaunches,
      1,
      "the denied duplicate launch must not consume a second dispatch",
    );
    assert.equal(
      persistedLedger?.taskPackages?.length,
      1,
      "only the admitted package participates in completion acceptance",
    );
  }
  if (twoWorkersMode) {
    const workerAttempts =
      persistedLedger?.attempts?.filter((attempt) =>
        [
          "root-launch-background-alpha",
          "root-launch-background-beta",
        ].includes(attempt.toolUseId),
      ) ?? [];
    assert.equal(workerAttempts.length, 2);
    assert(workerAttempts.every((attempt) => attempt.executionTaskId));
    assert(workerAttempts.every((attempt) => attempt.executionVerified));
    assert(
      workerAttempts.every(
        (attempt) => attempt.lifecycle.status === "completed",
      ),
    );
    assert.equal(new Set(workerAttempts.map((attempt) => attempt.id)).size, 2);
    assert.equal(
      new Set(workerAttempts.map((attempt) => attempt.executionTaskId)).size,
      2,
    );
    assert.equal(persistedLedger?.delegationLaunches, 2);
    assert.deepEqual(
      persistedLedger?.delegationClaims
        ?.map((claim) => ({ taskId: claim.taskId, state: claim.state }))
        .sort((left, right) => left.taskId.localeCompare(right.taskId)),
      [
        { taskId: "task-alpha", state: "settled" },
        { taskId: "task-beta", state: "settled" },
      ],
    );
    assert.equal(persistedLedger?.taskPackages?.length, 2);
    const rootEvidence = persistedLedger?.executionEvidence ?? [];
    assert(
      rootEvidence.some(
        (item) => item.id === "root-read-alpha-artifact" && item.successful,
      ) &&
        rootEvidence.some(
          (item) => item.id === "root-read-beta-artifact" && item.successful,
        ),
      "acceptance must reference successful root reads of both completed worker artifacts",
    );
    assert.equal(reviewDecision, "accept");
  }
  const receipt = {
    passed: true,
    evidenceClass: "synthetic-upstream-native-sdk-product-session-loopback",
    upstream: "127.0.0.1 synthetic fixture only",
    paidCalls: 0,
    publicNetwork: false,
    nativeSdk: true,
    originalBuiltinFacade: true,
    sessionStore: true,
    productionTaskRoute: true,
    planPrecedesNative,
    ...(todoPlanMode ? { mode: "native-todo-plan", nativePlanUpdatesVerified } : {}),
    sessionId,
    executionId: execution?.id,
    phase: execution?.phase,
    initialTerminalStatus: (initialTerminal as { status: string }).status,
    originalQueueId: admitted.queueId,
    finalQueueId: execution?.currentQueueId,
    executionTurns: execution?.turns,
    continuationState: execution?.continuation?.state,
    originalInputAdmissions: inputAdmissions,
    realWriteToolUses: writeUses,
    realReadToolUses: readUses,
    ...(reworkMode
      ? {
          mode: "native-rework",
          reworks: execution?.reworks,
          writeToolUseIds: [
            "root-write-artifact-wrong",
            "root-write-artifact-correct",
          ],
          readToolUseIds: [
            "root-read-artifact-wrong",
            "root-read-artifact-correct",
          ],
          reviewDecisions: ["rework", "accept"],
        }
      : {}),
    ...(twoWorkersMode
      ? {
          mode: "native-two-background-workers",
          maxWorkersInFlight,
          workerAttempts: persistedLedger?.attempts?.filter((attempt) =>
            [
              "root-launch-background-alpha",
              "root-launch-background-beta",
            ].includes(attempt.toolUseId),
          ),
          delegationLaunches: persistedLedger?.delegationLaunches,
          delegationClaims: persistedLedger?.delegationClaims,
          taskPackages: persistedLedger?.taskPackages,
          nativeReviewCount: routeResults.filter(
            (result) => result.kind === "review" && result.success,
          ).length,
        }
      : {}),
    toolCalls: calls,
    elapsedMs: Date.now() - started,
    persistedEvidencePath: evidencePath,
    ...(parallelMode
      ? {
          mode: "native-background-task-package",
          childWriteObservedAfterParentTerminal: true,
          conflictingLaunchAttempted: conflictLaunchAttempted,
          nativeTaskAttempt: persistedLedger?.attempts?.find(
            (attempt) => attempt.toolUseId === "root-launch-background-task",
          ),
          delegationLaunches: persistedLedger?.delegationLaunches,
          delegationClaims: persistedLedger?.delegationClaims,
        }
      : {}),
  };
  await writeFile(evidencePath, JSON.stringify(receipt, null, 2), {
    mode: 0o600,
  });
  runSucceeded = true;
  console.log(JSON.stringify(receipt));
} catch (error) {
  try {
    await boundedCleanup(saveFailureReceipt(error), 1_500);
    console.error(
      `[failure-receipt] ${join(evidenceDir, "failure-receipt.json")}`,
    );
  } catch (receiptError) {
    console.error(
      `[failure-receipt-write-failed] ${String(receiptError).slice(0, 1000)}`,
    );
  }
  throw error;
} finally {
  clearTimeout(hardDeadlineTimer);
  if (!runSucceeded && engineForCleanup) {
    try {
      await boundedCleanup(
        engineForCleanup.stopTurn({ wholeSession: true }),
        2_000,
      );
    } catch {
      /* Continue cleanup after a bounded native stop attempt. */
    }
  }
  try {
    const agent = await import("../src/server/agent-session");
    await boundedCleanup(agent.resetSession(), 3_000);
  } catch {
    /* Preserve the original failure. */
  }
  cliToken = "";
  for (const server of servers) {
    server.closeAllConnections();
    try {
      await boundedCleanup(
        new Promise<void>((resolve) => server.close(() => resolve())),
        1_000,
      );
    } catch {
      /* Sockets were already force-closed; don't block evidence delivery. */
    }
  }
  await boundedCleanup(rm(home, { recursive: true, force: true }), 1_000).catch(
    () => undefined,
  );
}
// The native SDK child owns a few process handles even after `resetSession()`
// has completed. All assertions, terminal persistence, listener shutdown and
// private-file cleanup are complete before this standalone verifier exits.
process.exit(0);
