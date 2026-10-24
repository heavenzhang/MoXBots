import { compareBackgroundTaskRuns } from './backgroundTaskRun';
import { deriveSessionTodos, type ProgressMessage, type ProgressTodo } from './sessionWorkProgress';
import { mergeSubagentLifecycleUpdate, type SubagentLifecycle } from './types/subagent-lifecycle';
import { isSessionPlanConfirmed, type SessionPlanProposal } from './sessionPlanConfirmation';

/** Product owns task association and review; Runtime still owns execution. */
export type TaskPhase = 'pending' | 'running' | 'awaiting_review' | 'completed' | 'rework' | 'failed' | 'interrupted' | 'blocked' | 'unknown';
export interface SessionTaskAttempt {
  id: string;
  toolUseId: string;
  agentId?: string;
  nativeTaskId?: string;
  executionTaskId?: string;
  title: string;
  lifecycle: SubagentLifecycle;
  executionVerified?: boolean;
  runId?: string;
  /** Explicit root launch metadata, never a fuzzy title association. */
  taskIdHint?: string;
}
export interface SessionTaskRecord { id: string; title: string; blockedBy: string[]; mainAttempt?: number; proposalId?: string; proposalRevision?: number; retired?: boolean }
export interface SessionTaskReview { taskId: string; attemptId: string; decision: 'accept' | 'reject'; evidence: string; rootToolUseId?: string }
export interface SessionTaskLedger {
  revision: number;
  /** Original human ingress and bounded ordinary execution, owned by this ledger. */
  executionInputs?: {
    requestId: string;
    bodyDigest: string
    acceptedQueueId?: string;
  }[];
  execution?: import("./sessionExecution").SessionExecution;
  executionAdmission?: {
    requestId: string;
    queueId: string;
    intent?: import("./sessionExecution").ExecutionIntent;
    error?: string
  };
  executionEvidence?: {
    id: string;
    queueId: string;
    name: string;
    digest: string;
    successful: boolean;
    startOrder?: number;
    /** Original native scope at PreToolUse, and the unchanged scope at success. */
    verificationEpochAtStart?: string;
    verificationEpoch?: string;
    observationOrder: number;
    mutating: boolean;
    pending?: boolean;
  }[];
  executionReview?: {
    id: string;
    queueId: string;
    assessment: import("./sessionExecution").ExecutionAssessment;
    committedBy?: string;
  };
  taskPackages?: import("./sessionTaskDispatch").SessionTaskPackage[];
  delegationClaims?: {
    toolUseId: string;
    taskId: string;
    executionId: string;
    state: "reserved" | 'running' | "settled" | 'unknown';
  }[];
  delegationLaunches?: number;
  tasks: SessionTaskRecord[];
  bindings: Record<string, string>;
  currentTools?: Record<string, string>;
  attempts: SessionTaskAttempt[];
  reviews: SessionTaskReview[];
  plan?: ProgressTodo[];
  planTurnId?: string;
  reviewIntents?: { id: string; action: Extract<SessionTaskAction, { kind: 'review' }> }[];
  proposal?: SessionPlanProposal;
  proposalHistory?: SessionPlanProposal[];
  proposalUserBoundary?: string;
  pendingTaskIds?: string[];
  planRequests?: { id: string; fingerprint: string }[];
  humanInputs?: { requestId: string; proposalId: string; revision: number; bodyDigest: string }[];
  planStart?: { proposalId: string; revision: number; requestId: string; queueId: string; purpose?: 'execution' | 'revision'; state: 'pending' | 'claimed' | 'dispatched'; claimId?: string; error?: string };
}
export interface SessionTaskView extends SessionTaskRecord {
  phase: TaskPhase;
  attempts: SessionTaskAttempt[];
  review?: SessionTaskReview;
  source: 'task' | 'plan' | 'agent';
  activeForm?: string;
  reviewAttemptId?: string;
}
export interface SessionPlanSupport {
  supported: boolean;
  runtime: string;
  reason?: 'PLAN_RUNTIME_DELEGATION_UNAVAILABLE';
}
/** Runtime capability is a response projection, never part of the durable ledger/SSE. */
export type SessionExecutionRecoveryProjection = Pick<import('./modelRecovery').ModelRecoveryState,
  'turnId' | 'status' | 'attempt' | 'lastStatus' | 'nextRetryAt'>;
export interface SessionTaskSnapshot { sessionId: string; ledger: SessionTaskLedger; tasks: SessionTaskView[]; planSupport: SessionPlanSupport;
  executionRecovery?: SessionExecutionRecoveryProjection }
export type SessionTaskAction =
  | { kind: 'ensure'; taskId: string; title: string; blockedBy?: string[]; expectedRevision: number }
  | { kind: 'bind'; taskId: string; toolUseId: string; expectedRevision: number }
  | { kind: 'review'; taskId: string; attemptId: string; decision: 'accept' | 'reject'; evidence: string; expectedRevision: number };

export function emptyTaskLedger(): SessionTaskLedger { return { revision: 0, tasks: [], bindings: {}, attempts: [], reviews: [] }; }
const obj = (v: unknown): Record<string, unknown> | undefined => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
const str = (v: unknown): string | undefined => typeof v === 'string' && v.length > 0 ? v : undefined;
function json(v: unknown): Record<string, unknown> | undefined { try { return typeof v === 'string' ? obj(JSON.parse(v)) : obj(v); } catch { return undefined; } }

/** Only exact identities/receipts establish association. Never match task prose. */
export function collectTaskAttempts(messages: readonly ProgressMessage[], liveMessageId?: string | null): SessionTaskAttempt[] {
  const notifications = new Map<string, Record<string, unknown>>();
  for (const message of messages) {
    if (!message.id.startsWith('task-notification-') || typeof message.content !== 'string') continue;
    const body = message.content.match(/<task-notification>([\s\S]*?)<\/task-notification>/)?.[1];
    const value = json(body);
    if (value && str(value.toolUseId)) notifications.set(value.toolUseId as string, value);
  }
  const attempts: SessionTaskAttempt[] = [];
  function visit(value: unknown, messageId: string, root = true) {
    const tool = obj(value);
    if (!tool) return;
    const input = obj(tool.parsedInput) ?? json(tool.inputJson) ?? obj(tool.input);
    if (['Agent', 'Task', 'CollabAgent'].includes(String(tool.name)) && (tool.name !== 'CollabAgent' || input?.tool === 'spawnAgent' || tool.subagentLifecycle)) {
      const toolUseId = str(tool.id);
      if (!toolUseId) return;
      const result = json(tool.result);
      const notification = notifications.get(toolUseId);
      const native = obj(tool.subagentLifecycle) as unknown as SubagentLifecycle | undefined;
      const runId = str(notification?.runId) ?? str(result?.runId);
      const raw = native?.status ?? notification?.status;
      const status: SubagentLifecycle['status'] | undefined = raw === 'completed' ? 'completed'
        : raw === 'failed' || raw === 'error' ? 'failed' : raw === 'interrupted' || raw === 'stopped' ? 'interrupted'
          : raw === 'running' ? 'running' : undefined;
      // A launch result or an inactive catalog entry is not a successful report.
      const report = native?.result ?? str(notification?.summary);
      const launch = result?.status === 'async_launched' || result?.status === 'pending' || result?.outputFile || result?.output_file || tool.name === 'CollabAgent';
      const settledResult = !!tool.result && !launch && !tool.isLoading;
      const verified = (status !== undefined && (status !== 'running' || messageId === liveMessageId)) || !!tool.isError || !!tool.isStopped || settledResult || (messageId === liveMessageId && tool.isLoading === true);
      const effectiveStatus = status ?? (tool.isError ? 'failed' : tool.isStopped ? 'interrupted' : settledResult ? 'completed' : 'running');
      const lifecycle: SubagentLifecycle = native ?? { status: effectiveStatus, startedAt: typeof tool.taskStartTime === 'number' ? tool.taskStartTime : 0,
        timingVerified: typeof tool.taskStartTime === 'number', ...(report === undefined ? {} : { result: report }) };
      const marker = root ? (str(input?.description) ?? str(input?.prompt) ?? str(input?.message))?.match(/^\[task:([A-Za-z0-9][A-Za-z0-9_.:-]{0,127})\](?:\s|$)/)?.[1] : undefined;
      attempts.push({ id: `${toolUseId}:${native?.activation?.id ?? runId ?? 'initial'}`, toolUseId,
        ...(marker ? { taskIdHint: marker } : {}),
        executionVerified: verified, runId,
        agentId: native?.agentId ?? str(result?.agentId), nativeTaskId: native?.taskId,
        title: native?.description ?? str(input?.description) ?? str(input?.prompt)?.split('\n')[0].slice(0, 200) ?? toolUseId,
        lifecycle });
    }
    if (Array.isArray(tool.subagentCalls)) tool.subagentCalls.forEach(value => visit(value, messageId, false));
  }
  for (const message of messages) {
    let blocks = message.content;
    if (typeof blocks === 'string') { try { blocks = JSON.parse(blocks); } catch { continue; } }
    if (!Array.isArray(blocks) || message.role === 'user') continue;
    for (const block of blocks) { const b = obj(block); if (b?.type === 'tool_use') visit(b.tool, message.id); }
  }
  return attempts;
}

export function mergeTaskObservations(ledger: SessionTaskLedger, attempts: readonly SessionTaskAttempt[], plan?: readonly ProgressTodo[], planTurnId?: string): SessionTaskLedger {
  const next = structuredClone(ledger);
  for (let attempt of attempts) {
    attempt = { ...attempt, title: attempt.title.slice(0, 2000), lifecycle: { ...attempt.lifecycle,
      ...(attempt.lifecycle.result === undefined ? {} : { result: attempt.lifecycle.result.slice(0, 4000) }) } };
    const known = next.attempts.findLast(a => a.toolUseId === attempt.toolUseId);
    if (attempt.id.endsWith(':initial') && known && known.id !== attempt.id) continue;
    const index = next.attempts.findIndex(a => a.id === attempt.id);
    if (index < 0) next.attempts.push(structuredClone(attempt));
    else if (attempt.executionVerified !== false) next.attempts[index] = { ...next.attempts[index], ...attempt, lifecycle: mergeSubagentLifecycleUpdate(next.attempts[index].lifecycle, attempt.lifecycle) };
  }
  // A root's explicit launch marker binds execution immediately. Old history,
  // child-authored markers and parallel reuse cannot steal a current attempt.
  for (const attempt of next.attempts) {
    const task = next.tasks.find(task => task.id === attempt.taskIdHint && !task.retired);
    if (!task || next.bindings[attempt.toolUseId] || next.pendingTaskIds?.includes(task.id) || !next.proposal
      || !isSessionPlanConfirmed(next.proposal) || task.proposalId !== next.proposal.id || task.proposalRevision !== next.proposal.revision
      || attempt.lifecycle.startedAt < Date.parse(next.proposal.confirmation!.confirmedAt)) continue;
    const active = currentTaskAttempt(next.attempts.filter(item => next.bindings[item.toolUseId] === task.id), next.currentTools?.[task.id]);
    if (active?.lifecycle.status === 'running' && active.executionVerified !== false && active.toolUseId !== attempt.toolUseId) continue;
    next.bindings[attempt.toolUseId] = task.id;
    if (!active || compareTaskAttempts(active, attempt) <= 0) next.currentTools = { ...next.currentTools, [task.id]: attempt.toolUseId };
  }
  if (plan !== undefined) {
    for (const task of next.tasks) {
      const incoming = plan.find(todo => todo.key === task.id);
      const prior = ledger.plan?.find(todo => todo.key === task.id);
      const reviewed = ledger.reviews.some(review => review.taskId === task.id);
      if (incoming?.status === 'in_progress' && (prior?.status !== 'in_progress' || !!planTurnId && planTurnId !== ledger.planTurnId) && reviewed) {
        task.mainAttempt = (task.mainAttempt ?? 0) + 1;
        next.currentTools = { ...next.currentTools, [task.id]: '@main' };
      }
    }
    next.plan = plan.map(todo => ({ ...todo }));
    if (planTurnId) next.planTurnId = planTurnId;
  }
  if (JSON.stringify(next) !== JSON.stringify(ledger)) next.revision++;
  return next;
}

export function projectSessionTasks(ledger: SessionTaskLedger, messages: readonly ProgressMessage[] = [],
): SessionTaskView[] {
  const tasks = new Map<string, SessionTaskView>();
  const todos = deriveSessionTodos(messages, ledger.plan ?? null).todos;
  for (const todo of todos) {
    if (ledger.proposal && !ledger.tasks.some(task => task.id === todo.key)) continue;
    tasks.set(todo.key, { id: todo.key, title: todo.content, activeForm: todo.activeForm, blockedBy: [], attempts: [], source: 'plan', phase: todo.status === 'completed' ? 'awaiting_review' : todo.status === 'in_progress' ? 'running' : 'pending' });
  }
  for (const task of ledger.tasks) { const native = tasks.get(task.id); tasks.set(task.id, { ...task, source: 'task', phase: native?.phase ?? 'pending', activeForm: native?.activeForm, attempts: [] }); }
  for (const attempt of ledger.attempts) {
    const id = ledger.bindings[attempt.toolUseId] ?? `agent:${attempt.toolUseId}`;
    if (!tasks.has(id)) tasks.set(id, { id, title: attempt.title, blockedBy: [], attempts: [], phase: 'unknown', source: 'agent' });
    tasks.get(id)!.attempts.push(attempt);
  }
  for (const task of tasks.values()) {
    task.attempts.sort(compareTaskAttempts);
    const current = currentTaskAttempt(task.attempts, ledger.currentTools?.[task.id]);
    if (!current) {
      task.reviewAttemptId = task.mainAttempt ? `main:${task.mainAttempt}` : 'main';
      task.review = ledger.reviews.findLast(r => r.taskId === task.id && r.attemptId === task.reviewAttemptId);
      if (task.review) task.phase = task.review.decision === 'accept' ? 'completed' : 'rework';
      continue;
    }
    task.reviewAttemptId = current.id;
    task.review = ledger.reviews.findLast(r => r.taskId === task.id && r.attemptId === current.id);
    const running = current.lifecycle.status === 'running';
    task.phase = current.executionVerified === false ? 'unknown' : running ? 'running' : current.lifecycle.status === 'failed' ? 'failed' : current.lifecycle.status === 'interrupted' ? 'interrupted'
      : task.review ? task.review.decision === 'accept' ? 'completed' : 'rework' : 'awaiting_review';
  }
  for (const task of tasks.values()) {
    const claim = ledger.delegationClaims?.findLast(
      (claim) =>
        claim.taskId === task.id &&
        claim.toolUseId === ledger.currentTools?.[task.id],
    );
    if (claim && claim.state !== "settled")
      task.phase = claim.state === 'unknown' ? 'unknown' : 'running';
    if (ledger.pendingTaskIds?.includes(task.id) || task.phase === 'pending' && task.blockedBy.some(id => tasks.get(id)?.phase !== 'completed')) task.phase = 'blocked';
  }
  return [...tasks.values()].filter(task => !task.retired);
}

/** One task has one current execution attempt. Parallel work uses explicit subtasks. */
export function compareTaskAttempts(a: SessionTaskAttempt, b: SessionTaskAttempt): number {
  if (a.toolUseId === b.toolUseId) {
    const ordinal = (a.lifecycle.activation?.ordinal ?? 0) - (b.lifecycle.activation?.ordinal ?? 0);
    if (ordinal) return ordinal;
    const run = compareBackgroundTaskRuns(a.runId, b.runId);
    if (run) return run;
  }
  return a.lifecycle.startedAt - b.lifecycle.startedAt || a.id.localeCompare(b.id);
}
export function currentTaskAttempt(attempts: readonly SessionTaskAttempt[], toolUseId?: string): SessionTaskAttempt | undefined {
  return attempts.filter(a => !toolUseId || a.toolUseId === toolUseId).sort(compareTaskAttempts).at(-1);
}

export function applySessionTaskAction(ledger: SessionTaskLedger, action: SessionTaskAction, messages: readonly ProgressMessage[] = [],
): SessionTaskLedger {
  const duplicateReview = action.kind === 'review' && ledger.reviews.find(r => r.taskId === action.taskId && r.attemptId === action.attemptId && r.decision === action.decision && r.evidence === action.evidence);
  if (duplicateReview && action.kind === 'review' && (currentTaskAttempt(projectSessionTasks(ledger, messages).find(t => t.id === action.taskId)?.attempts ?? [], ledger.currentTools?.[action.taskId])?.id ?? projectSessionTasks(ledger, messages).find(t => t.id === action.taskId)?.reviewAttemptId ?? 'main') === action.attemptId) return ledger;
  if (action.expectedRevision !== ledger.revision) throw new Error('TASK_REVISION_CONFLICT');
  const next = structuredClone(ledger);
  const views = projectSessionTasks(next, messages);
  if (action.kind === 'ensure') {
    if (!next.tasks.some(t => t.id === action.taskId)) next.tasks.push({ id: action.taskId, title: action.title, blockedBy: action.blockedBy ?? [] });
  } else {
    const task = views.find(t => t.id === action.taskId);
    if (!task) throw new Error('TASK_NOT_FOUND');
    // Pin an explicitly addressed plan/agent row before associating/reviewing it.
    if (!next.tasks.some(t => t.id === task.id)) next.tasks.push({ id: task.id, title: task.title, blockedBy: task.blockedBy });
    if (action.kind === 'bind') {
      if (!next.attempts.some(a => a.toolUseId === action.toolUseId)) throw new Error('TASK_ATTEMPT_NOT_FOUND');
      const bound = next.bindings[action.toolUseId];
      if (bound && bound !== action.taskId) throw new Error('TASK_ATTEMPT_ALREADY_BOUND');
      const active = currentTaskAttempt(task.attempts, next.currentTools?.[task.id]);
      if (active?.lifecycle.status === 'running' && active.executionVerified !== false && active.toolUseId !== action.toolUseId) throw new Error('TASK_STILL_RUNNING');
      next.bindings[action.toolUseId] = action.taskId;
      next.currentTools = { ...next.currentTools, [action.taskId]: action.toolUseId };
    } else {
      const latest = currentTaskAttempt(task.attempts, next.currentTools?.[task.id]);
      if (
        next.delegationClaims?.some(
          (claim) =>
            claim.taskId === task.id &&
            claim.toolUseId === next.currentTools?.[task.id] &&
            claim.state !== "settled",
        )
      )
        throw new Error("TASK_NATIVE_EXECUTION_UNCONFIRMED");
      if (task.id.startsWith('codex-snapshot-')) throw new Error('TASK_STABLE_ID_REQUIRED');
      if ((latest?.id ?? task.reviewAttemptId ?? 'main') !== action.attemptId) throw new Error('TASK_ATTEMPT_CHANGED');
      if (latest?.lifecycle.status === 'running') throw new Error('TASK_STILL_RUNNING');
      if (action.decision === 'accept' && latest && (latest.executionVerified === false || latest.lifecycle.status !== 'completed')) throw new Error('TASK_RESULT_UNAVAILABLE');
      if (task.blockedBy.some(id => views.find(t => t.id === id)?.phase !== 'completed')) throw new Error('TASK_DEPENDENCY_INCOMPLETE');
      const prior = next.reviews.find(r => r.taskId === action.taskId && r.attemptId === action.attemptId);
      if (prior && (prior.decision !== action.decision || prior.evidence !== action.evidence)) throw new Error('TASK_ALREADY_REVIEWED');
      if (!prior) next.reviews.push({ taskId: action.taskId, attemptId: action.attemptId, decision: action.decision, evidence: action.evidence });
    }
  }
  if (JSON.stringify(next) !== JSON.stringify(ledger)) next.revision++;
  return next;
}

/** Chat, project board and Session activity share the same acceptance count. */
export function projectOrchestrationProgress(progress: import('./sessionWorkProgress').SessionWorkProgress, ledger: SessionTaskLedger | undefined,
  messages: readonly ProgressMessage[] = []): import('./sessionWorkProgress').SessionWorkProgress {
  if (!ledger) return progress;
  const tasks = projectSessionTasks(ledger, messages);
  return { ...progress, todoSource: 'orchestration', todoTotal: tasks.length, todoCompleted: tasks.filter(task => task.phase === 'completed').length,
    todos: tasks.slice(0, 100).map(task => ({ key: task.id, content: task.title, activeForm: task.activeForm ?? task.title,
      status: task.phase === 'completed' ? 'completed' : task.phase === 'pending' || task.phase === 'blocked' ? 'pending' : 'in_progress' })) };
}
