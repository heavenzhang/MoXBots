import { lstat, realpath, stat } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { getSessionMetadata } from "../SessionStore";
import { parseSessionTaskCommand } from "../../shared/sessionTaskReviewCommand";
import {
  admitTaskDispatch,
  taskPackageSchema,
  taskResourcesConflict,
  type SessionTaskPackage,
  type TaskResource,
} from "../../shared/sessionTaskDispatch";
import { mutateSessionTaskLedger } from "./task-orchestration";
import type { SessionEngine } from "./types";

const terminalExecutionPhases = new Set(["paused", "incomplete", "completed"]);
const activeClaimStates = new Set(["reserved", "running", "unknown"]);
const rootTools = new Set(["Agent", "Task"]);
const readonlyTools = new Set(["Read", "Grep", "Glob"]);
const writableTools = new Set(["Write", "Edit", "MultiEdit"]);
const pathProperties = ["file_path", "path", "filename"];

export const SESSION_TASK_DISPATCH_ERRORS = {
  builtinRequired: "SESSION_TASK_PACKAGE_BUILTIN_REQUIRED",
  executionRequired: "SESSION_TASK_EXECUTION_REQUIRED",
  queueMismatch: "SESSION_TASK_QUEUE_MISMATCH",
  taskNotEnsured: "SESSION_TASK_PACKAGE_TASK_NOT_ENSURED",
  revisionConflict: "SESSION_TASK_PACKAGE_REVISION_CONFLICT",
  activePackage: "SESSION_TASK_PACKAGE_CLAIM_ACTIVE",
  staleTool: "SESSION_TASK_TOOL_STALE",
  taskMarker: "SESSION_TASK_MARKER_REQUIRED",
  childNested: "SESSION_TASK_CHILD_NESTED_LAUNCH_DENIED",
  childIdentity: "SESSION_TASK_CHILD_IDENTITY_UNVERIFIED",
  childTool: "SESSION_TASK_CHILD_TOOL_DENIED",
  packageScope: "SESSION_TASK_RESOURCE_OUT_OF_PACKAGE",
  resourceConflict: "SESSION_TASK_RESOURCE_CONFLICT",
  opaqueTool: "SESSION_TASK_OPAQUE_TOOL_DURING_DELEGATION",
  pathInvalid: "SESSION_TASK_WORKSPACE_PATH_INVALID",
} as const;

type DispatchClaim = {
  toolUseId: string;
  taskId: string;
  executionId: string;
  state: "reserved" | "running" | "settled" | "unknown";
};
type DispatchLedger =
  import("../../shared/sessionTaskOrchestration").SessionTaskLedger & {
    taskPackages?: SessionTaskPackage[];
    delegationClaims?: DispatchClaim[];
    delegationLaunches?: number;
  };

function runtimeQueueId(engine: SessionEngine): string | undefined {
  return (
    engine.getExecutionTurnId() ??
    engine.getCurrentTurnIdentity()?.queueId ??
    undefined
  );
}

function executionActive(phase: string): boolean {
  return !terminalExecutionPhases.has(phase);
}

function message(code: string, detail: string): string {
  return `${code}: ${detail}`;
}

export async function registerSessionTaskPackage(
  engine: SessionEngine,
  input: SessionTaskPackage & { expectedRevision: number },
): Promise<DispatchLedger> {
  const identity = engine.getRuntimeIdentity();
  const sessionId = identity.sessionId;
  if (!sessionId || engine.kind !== "builtin")
    throw new Error(SESSION_TASK_DISPATCH_ERRORS.builtinRequired);
  const metadata = getSessionMetadata(sessionId);
  const execution = metadata?.taskOrchestration?.execution;
  if (
    !execution ||
    execution.id !== input.executionId ||
    !executionActive(execution.phase) ||
    execution.deadlineAt < Date.now()
  ) {
    throw new Error(SESSION_TASK_DISPATCH_ERRORS.executionRequired);
  }
  const queueId = runtimeQueueId(engine);
  if (!queueId || queueId !== execution.currentQueueId)
    throw new Error(SESSION_TASK_DISPATCH_ERRORS.queueMismatch);
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0
  )
    throw new Error(SESSION_TASK_DISPATCH_ERRORS.revisionConflict);
  const { expectedRevision, ...rawPackage } = input;
  const parsed = taskPackageSchema.safeParse(rawPackage);
  if (!parsed.success) throw new Error("SESSION_TASK_PACKAGE_INVALID");
  const current = () => {
    const currentIdentity = engine.getRuntimeIdentity();
    const latestExecution =
      getSessionMetadata(sessionId)?.taskOrchestration?.execution;
    return (
      currentIdentity.sessionId === sessionId &&
      runtimeQueueId(engine) === queueId &&
      latestExecution?.id === execution.id &&
      latestExecution.currentQueueId === queueId &&
      executionActive(latestExecution.phase) &&
      latestExecution.deadlineAt >= Date.now()
    );
  };
  return mutateSessionTaskLedger(
    sessionId,
    (prior) => {
      const ledger = prior as DispatchLedger;
      if (prior.revision !== expectedRevision)
        throw new Error(SESSION_TASK_DISPATCH_ERRORS.revisionConflict);
      if (
        !ledger.execution ||
        ledger.execution.id !== execution.id ||
        ledger.execution.currentQueueId !== queueId ||
        !executionActive(ledger.execution.phase) ||
        ledger.execution.deadlineAt < Date.now()
      )
        throw new Error(SESSION_TASK_DISPATCH_ERRORS.executionRequired);
      const task = ledger.tasks.find(
        (item) => item.id === parsed.data.taskId && !item.retired,
      );
      if (!task) throw new Error(SESSION_TASK_DISPATCH_ERRORS.taskNotEnsured);
      const packages = ledger.taskPackages ?? [];
      const existing = packages.find(
        (item) =>
          item.taskId === parsed.data.taskId &&
          item.executionId === execution.id,
      );
      if (existing && JSON.stringify(existing) === JSON.stringify(parsed.data))
        return prior;
      const active = (ledger.delegationClaims ?? []).some(
        (claim) =>
          claim.taskId === parsed.data.taskId &&
          claim.executionId === execution.id &&
          claim.state !== "settled",
      );
      if (active) throw new Error(SESSION_TASK_DISPATCH_ERRORS.activePackage);
      ledger.taskPackages = [
        ...packages.filter(
          (item) =>
            !(
              item.taskId === parsed.data.taskId &&
              item.executionId === execution.id
            ),
        ),
        parsed.data,
      ];
      return ledger;
    },
    current,
  ) as Promise<DispatchLedger>;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function taskMarker(input: unknown): string | undefined {
  const value = object(input);
  if (!value) return undefined;
  const texts = ["description", "prompt", "message"]
    .map((key) => value[key])
    .filter(
      (item): item is string => typeof item === "string" && !!item.trim(),
    );
  if (!texts.length) return undefined;
  const found = texts.map(
    (text) => /^\[task:([^\]]+)\](?:\s|$)/.exec(text)?.[1],
  );
  return found.length && found.every((id) => !!id && id === found[0])
    ? found[0]
    : undefined;
}

function rawPaths(name: string, input: unknown): string[] {
  const value = object(input);
  if (!value) return [];
  const result: string[] = [];
  for (const key of pathProperties)
    if (typeof value[key] === "string") result.push(value[key] as string);
  if (Array.isArray(value.edits))
    for (const edit of value.edits) {
      const item = object(edit);
      if (!item) continue;
      for (const key of pathProperties)
        if (typeof item[key] === "string") result.push(item[key] as string);
    }
  if (name === "Grep" && typeof value.path === "string")
    result.push(value.path);
  if (name === "Glob" && typeof value.pattern === "string") {
    const pattern = value.pattern;
    const wildcard = pattern.search(/[?*[{]/);
    if (wildcard >= 0) {
      const prefix = pattern.slice(0, wildcard);
      result.push(prefix.endsWith("/") ? prefix : dirname(prefix));
    } else result.push(pattern);
  }
  return [...new Set(result)];
}

function globBase(path: string): string {
  const wildcard = path.search(/[?*[{]/);
  if (wildcard < 0) return path;
  const prefix = path.slice(0, wildcard);
  return prefix.endsWith("/") ? prefix : dirname(prefix);
}

function escapes(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

async function canonicalResource(
  workspacePath: string,
  rawPath: string,
  access: TaskResource["access"],
  denyParent: boolean,
): Promise<TaskResource> {
  const raw = rawPath.trim();
  if (
    !raw ||
    Array.from(raw).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    throw new Error(SESSION_TASK_DISPATCH_ERRORS.pathInvalid);
  if (
    denyParent &&
    ((!isAbsolute(raw) && raw.split(/[\\/]/).includes("..")) ||
      raw.includes("\\"))
  )
    throw new Error(SESSION_TASK_DISPATCH_ERRORS.pathInvalid);
  const root = await realpath(workspacePath);
  const basePath = globBase(raw);
  const requested = isAbsolute(basePath)
    ? resolve(basePath)
    : resolve(root, basePath || ".");
  if (denyParent && escapes(root, requested))
    throw new Error(SESSION_TASK_DISPATCH_ERRORS.pathInvalid);
  let cursor = requested;
  const suffix: string[] = [];
  let resolved: string | undefined;
  while (!resolved) {
    try {
      resolved = await realpath(cursor);
    } catch (error) {
      const missing = error as NodeJS.ErrnoException;
      if (missing.code !== "ENOENT" && missing.code !== "ENOTDIR") throw error;
      try {
        const stat = await lstat(cursor);
        if (stat.isSymbolicLink())
          throw new Error(SESSION_TASK_DISPATCH_ERRORS.pathInvalid);
      } catch (lstatError) {
        if (
          (lstatError as NodeJS.ErrnoException).code !== "ENOENT" &&
          (lstatError as NodeJS.ErrnoException).code !== "ENOTDIR"
        )
          throw lstatError;
      }
      const parent = dirname(cursor);
      if (parent === cursor)
        throw new Error(SESSION_TASK_DISPATCH_ERRORS.pathInvalid);
      suffix.unshift(basename(cursor));
      cursor = parent;
    }
  }
  const canonical = resolve(resolved, ...suffix);
  if (escapes(root, canonical)) {
    if (denyParent) throw new Error(SESSION_TASK_DISPATCH_ERRORS.pathInvalid);
    return { path: ".", access: "write" };
  }
  let directory = raw.endsWith("/");
  if (!directory) {
    try {
      directory = (await stat(canonical)).isDirectory();
    } catch {
      /* a new file remains a file */
    }
  }
  const relativePath = relative(root, canonical).split(sep).join("/") || ".";
  return {
    path: relativePath === "." ? "." : `${relativePath}${directory ? "/" : ""}`,
    access,
  };
}

function packageCovers(grant: TaskResource, requested: TaskResource): boolean {
  if (requested.access === "write" && grant.access !== "write") return false;
  if (grant.path === ".") return true;
  const grantPath = grant.path.endsWith("/")
    ? grant.path.slice(0, -1)
    : grant.path;
  const requestedPath = requested.path.endsWith("/")
    ? requested.path.slice(0, -1)
    : requested.path;
  if (grantPath === requestedPath) return true;
  return grant.path.endsWith("/") && requestedPath.startsWith(`${grantPath}/`);
}

function packageFor(
  ledger: DispatchLedger,
  taskId: string,
  executionId: string,
): SessionTaskPackage | undefined {
  const result = taskPackageSchema.safeParse(
    ledger.taskPackages?.find(
      (item) => item.taskId === taskId && item.executionId === executionId,
    ),
  );
  return result.success ? result.data : undefined;
}

function claims(ledger: DispatchLedger): DispatchClaim[] {
  return (ledger.delegationClaims ?? []).filter((claim) =>
    activeClaimStates.has(claim.state),
  );
}

async function rejectResourceConflicts(
  ledger: DispatchLedger,
  workspacePath: string,
  requested: TaskResource[],
  ownToolUseId?: string,
  allowUnknownRead = false,
): Promise<string | undefined> {
  for (const claim of claims(ledger)) {
    if (claim.toolUseId === ownToolUseId) continue;
    // The primary may inspect an uncertain result. Reads never release its
    // write lock or manufacture a native terminal/acceptance receipt.
    if (
      allowUnknownRead &&
      claim.state === "unknown" &&
      requested.every((resource) => resource.access === "read")
    )
      continue;
    const pkg = packageFor(ledger, claim.taskId, claim.executionId);
    if (!pkg) {
      if (
        requested.some(
          (resource) => resource.access === "write" || resource.path === ".",
        )
      )
        return message(
          SESSION_TASK_DISPATCH_ERRORS.resourceConflict,
          "存在资源范围未知的活动任务",
        );
      continue;
    }
    for (const resource of pkg.resources) {
      let canonical: TaskResource;
      try {
        canonical = await canonicalResource(
          workspacePath,
          resource.path,
          resource.access,
          false,
        );
      } catch {
        canonical = { path: ".", access: "write" };
      }
      if (requested.some((item) => taskResourcesConflict(item, canonical)))
        return message(
          SESSION_TASK_DISPATCH_ERRORS.resourceConflict,
          `与活动任务 ${claim.taskId} 的资源范围冲突`,
        );
    }
  }
  return undefined;
}

function isTaskLedgerCli(name: string, input: unknown): boolean {
  if (!["Bash", "Shell", "shell", "exec_command"].includes(name)) return false;
  const parsed = parseSessionTaskCommand(input);
  if (!parsed) return false;
  const value = object(input);
  const command = value?.command ?? value?.cmd;
  if (parsed.kind === undefined)
    return (
      typeof command === "string" && !/(?:^|\s)--data(?:\s|$)/.test(command)
    );
  return ["ensure", "bind", "package", "review", "execution_review", "list"].includes(
    String(parsed.kind),
  );
}

function opaque(name: string): boolean {
  return (
    ["Bash", "Shell", "shell", "exec_command"].includes(name) ||
    /^mcp(?:[._:-]|$)/i.test(name)
  );
}

export async function authorizeSessionTaskTool(input: {
  sessionId: string;
  queueId?: string;
  toolUseId: string;
  name: string;
  input: unknown;
  agentId?: string;
  nativeLaunchToolUseId?: string;
  workspacePath: string;
  isCurrent: () => boolean;
}): Promise<string | undefined> {
  const metadata = getSessionMetadata(input.sessionId);
  const ledger = metadata?.taskOrchestration as DispatchLedger | undefined;
  const execution = ledger?.execution;
  if (!execution) return undefined; // Preserve legacy non-execution runtime behavior.
  const queueId = input.queueId;
  if (!queueId || queueId !== execution.currentQueueId || !input.isCurrent()) {
    if (executionActive(execution.phase))
      return message(
        SESSION_TASK_DISPATCH_ERRORS.staleTool,
        "工具调用不属于当前执行轮次",
      );
    return undefined;
  }
  if (terminalExecutionPhases.has(execution.phase))
    return message(SESSION_TASK_DISPATCH_ERRORS.staleTool, "行动已暂停或结束");

  const active = claims(ledger);
  if (input.agentId) {
    if (rootTools.has(input.name))
      return message(
        SESSION_TASK_DISPATCH_ERRORS.childNested,
        "子 Agent 不能再启动 Agent/Task",
      );
    if (!readonlyTools.has(input.name) && !writableTools.has(input.name))
      return message(
        SESSION_TASK_DISPATCH_ERRORS.childTool,
        "子 Agent 仅可使用受限文件工具",
      );
    const readOnlyWithoutIdentity =
      readonlyTools.has(input.name) && !input.nativeLaunchToolUseId;
    let ownClaim: DispatchClaim | undefined;
    let taskPackage: SessionTaskPackage | undefined;
    if (!readOnlyWithoutIdentity) {
      if (!input.nativeLaunchToolUseId) {
        if (writableTools.has(input.name))
          return message(
            SESSION_TASK_DISPATCH_ERRORS.childIdentity,
            "未能将子 Agent 身份绑定到原始 launch",
          );
      } else {
        ownClaim = active.find(
          (claim) =>
            claim.toolUseId === input.nativeLaunchToolUseId &&
            claim.executionId === execution.id,
        );
        if (
          !ownClaim ||
          ownClaim.state === "unknown" ||
          ledger.bindings[input.nativeLaunchToolUseId] !== ownClaim.taskId
        )
          return message(
            SESSION_TASK_DISPATCH_ERRORS.childIdentity,
            "原始 launch 不属于当前执行、结果未知或已结束",
          );
        taskPackage = packageFor(ledger, ownClaim.taskId, execution.id);
        if (!taskPackage)
          return message(
            SESSION_TASK_DISPATCH_ERRORS.packageScope,
            "原始 launch 缺少持久化任务范围",
          );
      }
    }
    const paths = rawPaths(input.name, input.input);
    if (!paths.length)
      return message(
        SESSION_TASK_DISPATCH_ERRORS.pathInvalid,
        "工具输入缺少可核验路径",
      );
    const access = writableTools.has(input.name) ? "write" : "read";
    let resources: TaskResource[];
    try {
      resources = await Promise.all(
        paths.map((path) =>
          canonicalResource(input.workspacePath, path, access, true),
        ),
      );
    } catch (error) {
      return message(
        SESSION_TASK_DISPATCH_ERRORS.pathInvalid,
        error instanceof Error ? error.message : "路径解析失败",
      );
    }
    if (taskPackage) {
      const grants = await Promise.all(
        taskPackage.resources.map((resource) =>
          canonicalResource(
            input.workspacePath,
            resource.path,
            resource.access,
            true,
          ).catch(() => undefined),
        ),
      );
      if (
        resources.some(
          (resource) =>
            !grants.some((grant) => grant && packageCovers(grant, resource)),
        )
      )
        return message(
          SESSION_TASK_DISPATCH_ERRORS.packageScope,
          "工具路径超出该任务的资源包",
        );
    }
    return rejectResourceConflicts(
      ledger,
      input.workspacePath,
      resources,
      ownClaim?.toolUseId,
    );
  }

  if (rootTools.has(input.name)) {
    // Only native background runs expose the exact launch/task lifecycle needed
    // for identity-bound resources. A synchronous text return is not that proof.
    if (object(input.input)?.run_in_background !== true)
      return message(
        "SESSION_TASK_BACKGROUND_LIFECYCLE_REQUIRED",
        "此任务包需要原生后台运行身份，请使用 run_in_background=true；缺少身份时由主 Agent 直接执行。",
      );
    const taskId = taskMarker(input.input);
    if (!taskId)
      return message(
        SESSION_TASK_DISPATCH_ERRORS.taskMarker,
        "Agent/Task 描述必须以 [task:id] 开头",
      );
    const value = object(input.input);
    const assignee =
      typeof value?.subagent_type === "string" && value.subagent_type.trim()
        ? value.subagent_type.trim()
        : "native";
    try {
      await mutateSessionTaskLedger(
        input.sessionId,
        (prior) =>
          admitTaskDispatch(prior, {
            taskId,
            toolUseId: input.toolUseId,
            assignee,
            executionId: execution.id,
            now: Date.now(),
          }),
        () =>
          input.isCurrent() &&
          getSessionMetadata(input.sessionId)?.taskOrchestration?.execution
            ?.id === execution.id &&
          getSessionMetadata(input.sessionId)?.taskOrchestration?.execution
            ?.currentQueueId === queueId,
      );
      return undefined;
    } catch (error) {
      const code =
        error instanceof Error ? error.message : "TASK_DISPATCH_REJECTED";
      const detail: Record<string, string> = {
        TASK_DISPATCH_DEPENDENCIES_INCOMPLETE: "前置任务尚未验收",
        TASK_DISPATCH_RESOURCE_CONFLICT: "与其他活动任务的资源范围冲突",
        TASK_DISPATCH_CONCURRENCY_LIMIT: "并行任务数量已达上限",
        TASK_DISPATCH_LAUNCH_LIMIT: "任务启动预算已用完",
        TASK_DISPATCH_ATTEMPT_LIMIT: "该任务重试预算已用完",
      };
      return message(code, detail[code] ?? "任务派发未获准");
    }
  }

  if (writableTools.has(input.name) || readonlyTools.has(input.name)) {
    const paths = rawPaths(input.name, input.input);
    if (!paths.length)
      return active.length
        ? message(
            SESSION_TASK_DISPATCH_ERRORS.resourceConflict,
            "活动任务期间无法确认工具路径",
          )
        : undefined;
    const access = writableTools.has(input.name) ? "write" : "read";
    let resources: TaskResource[];
    try {
      resources = await Promise.all(
        paths.map((path) =>
          canonicalResource(input.workspacePath, path, access, false),
        ),
      );
    } catch {
      return active.length
        ? message(
            SESSION_TASK_DISPATCH_ERRORS.resourceConflict,
            "活动任务期间无法确认工具路径",
          )
        : undefined;
    }
    return rejectResourceConflicts(
      ledger,
      input.workspacePath,
      resources,
      undefined,
      true,
    );
  }
  if (
    opaque(input.name) &&
    active.length &&
    !isTaskLedgerCli(input.name, input.input)
  ) {
    return message(
      SESSION_TASK_DISPATCH_ERRORS.opaqueTool,
      "存在活动任务时，测试、网络和不透明副作用由根 Agent 顺序执行",
    );
  }
  return undefined;
}

export async function settleSessionTaskDispatchTool(
  sessionId: string,
  input: {
    toolUseId: string;
    success: boolean;
    async: boolean;
    isCurrent: () => boolean;
  },
): Promise<void> {
  if (!input.isCurrent()) return;
  await mutateSessionTaskLedger(
    sessionId,
    (prior) => {
      const ledger = prior as DispatchLedger;
      const claim = ledger.delegationClaims?.find(
        (item) => item.toolUseId === input.toolUseId,
      );
      if (!claim || claim.state === "settled" || claim.state === "unknown")
        return prior;
      claim.state = !input.success
        ? "unknown"
        : input.async
          ? "running"
          : "settled";
      return ledger;
    },
    input.isCurrent,
  );
}
