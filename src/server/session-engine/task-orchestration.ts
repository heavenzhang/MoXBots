import { parseTaskReviewCommand, sameTaskReview } from '../../shared/sessionTaskReviewCommand';
import { getSessionData, getSessionMetadata, updateSessionMetadata } from '../SessionStore';
import { broadcast } from '../sse';
import { applySessionTaskAction, collectTaskAttempts, emptyTaskLedger, mergeTaskObservations, projectSessionTasks,
  type SessionTaskAction, type SessionTaskAttempt, type SessionTaskLedger } from '../../shared/sessionTaskOrchestration';
import type { ProgressTodo } from '../../shared/sessionWorkProgress';
import type { SessionEngine } from './types';
import { createHash, randomUUID } from 'node:crypto';
import { deriveSessionTodos } from '../../shared/sessionWorkProgress';
import { confirmSessionPlan, createSessionPlan, isSessionPlanConfirmed, requestSessionPlanRevision, reviseSessionPlan,
  type SessionPlanContent, type SessionPlanTarget } from '../../shared/sessionPlanConfirmation';
import type { DispatchGuard } from '../session-core/turn-queue';
import { canDelegateForSessionPlan, sessionPlanSupport, SESSION_PLAN_QUEUE_PREFIX, type SessionPlanTurnScope } from './session-plan-policy';

/** Original native owners call this synchronously at their dispatch boundary. */
export function canSessionDelegateSubagents(sessionId: string, turn?: SessionPlanTurnScope | null): boolean {
  return canDelegateForSessionPlan(sessionId, getSessionMetadata(sessionId)?.taskOrchestration, turn, activePlanClaims.get(sessionId));
}

/** Ephemeral live owner capability: do not write it into metadata or SSE. */
export function readSessionPlanSupport(engine: SessionEngine) {
  return sessionPlanSupport(engine.kind, engine.getRuntimeIdentity().runtime);
}

/** Capture authority before any await; recheck inside the existing metadata CAS. */
function planMutationAuthority(engine: SessionEngine, sessionId: string): () => boolean {
  const identity = () => {
    const current = engine.getRuntimeIdentity();
    if (current.sessionId !== sessionId) throw new Error('TASK_SESSION_CHANGED');
    if (!readSessionPlanSupport(engine).supported) throw new Error('PLAN_RUNTIME_DELEGATION_UNAVAILABLE');
    return JSON.stringify([engine.kind, current.runtime, current.runtimeSource, current.boundSessionId]);
  };
  const captured = identity();
  return () => {
    if (identity() !== captured) throw new Error('TASK_RUNTIME_CHANGED');
    return true;
  };
}

/** Original external owner calls synchronously immediately before native root input. */
export function assertSessionPlanRootDispatch(sessionId: string, runtime: string | undefined, turn: SessionPlanTurnScope): void {
  if (!sessionPlanSupport('external', runtime).supported && !canSessionDelegateSubagents(sessionId, turn))
    throw new Error('PLAN_RUNTIME_DELEGATION_UNAVAILABLE');
}

const pending = new Map<string, Promise<unknown>>();
const admittingPlans = new Set<string>();
/** Ephemeral original-queue lease. A recovered unknown claim is never a grant. */
const activePlanClaims = new Map<string, string>();
function serialize<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
  const next = (pending.get(sessionId) ?? Promise.resolve()).catch(() => undefined).then(operation);
  pending.set(sessionId, next);
  void next.finally(() => { if (pending.get(sessionId) === next) pending.delete(sessionId); }).catch(() => undefined);
  return next;
}

async function publish(sessionId: string, prior: SessionTaskLedger, next: SessionTaskLedger, isCurrent: () => boolean = () => true): Promise<SessionTaskLedger> {
  if (next.revision === prior.revision) return prior;
  if (next.tasks.length > 256 || next.attempts.length > 1024 || Buffer.byteLength(JSON.stringify(next)) > 1024 * 1024) throw new Error('TASK_HISTORY_LIMIT');
  const updated = await updateSessionMetadata(sessionId, { taskOrchestration: next }, current => isCurrent() && (current.taskOrchestration?.revision ?? 0) === prior.revision);
  if (!updated) throw new Error('TASK_PERSISTENCE_CONFLICT');
  broadcast('chat:task-orchestration', { sessionId, ledger: next });
  return next;
}

/** Called by original execution owners, not by a new scheduler or model. */
export function observeSessionTasks(sessionId: string, observation: { attempts?: readonly SessionTaskAttempt[]; plan?: readonly ProgressTodo[]; planTurnId?: string }): Promise<SessionTaskLedger> {
  return serialize(sessionId, async () => {
    for (let retry = 0; retry < 3; retry++) {
      const metadata = getSessionMetadata(sessionId);
      if (!metadata) throw new Error('TASK_SESSION_NOT_FOUND');
      const prior = metadata.taskOrchestration ?? emptyTaskLedger();
      try { return await publish(sessionId, prior, mergeTaskObservations(prior, observation.attempts ?? [], observation.plan, observation.planTurnId)); }
      catch (error) { if (!(error instanceof Error) || error.message !== 'TASK_PERSISTENCE_CONFLICT' || retry === 2) throw error; }
    }
    throw new Error('TASK_PERSISTENCE_CONFLICT');
  });
}

export function observeSessionTasksInBackground(sessionId: string, observation: Parameters<typeof observeSessionTasks>[1]): void {
  if (!sessionId) return;
  void observeSessionTasks(sessionId, observation).catch(error => {
    // Preserve the last confirmed ledger; never publish an unpersisted review.
    console.warn('[session-task-orchestration] observation unavailable:', error instanceof Error ? error.message : 'unknown');
  });
}

export async function readSessionTasks(engine: SessionEngine) {
  const sessionId = engine.getRuntimeIdentity().sessionId;
  if (!sessionId || !getSessionMetadata(sessionId)) throw new Error('TASK_SESSION_NOT_FOUND');
  const overlay = engine.getLiveSessionOverlay(sessionId);
  let messages;
  if (overlay.inMemoryMessages?.length) messages = [...overlay.inMemoryMessages];
  else {
    const data = await getSessionData(sessionId);
    if (!data || data.transcriptRecovery) throw new Error('TASK_HISTORY_UNAVAILABLE');
    messages = [...data.messages];
  }
  if (overlay.liveStreamingMessage) {
    const index = messages.findIndex(m => m.id === overlay.liveStreamingMessage!.id);
    if (index < 0) messages.push(overlay.liveStreamingMessage); else messages[index] = overlay.liveStreamingMessage;
  }
  if (engine.getRuntimeIdentity().sessionId !== sessionId) throw new Error('TASK_SESSION_CHANGED');
  const live = engine.getLiveSessionState();
  const toolPlan = deriveSessionTodos(messages);
  const ledger = await observeSessionTasks(sessionId, { attempts: collectTaskAttempts(messages, overlay.liveStreamingMessage?.id),
    ...(engine.kind === 'builtin' && toolPlan.source !== 'none' ? { plan: toolPlan.todos } : {}) });
  const currentToolIds = new Set(collectTaskAttempts(overlay.liveStreamingMessage ? [overlay.liveStreamingMessage] : [], overlay.liveStreamingMessage?.id).map(a => a.toolUseId));
  const native = engine.getRuntimeIdentity().runtime === 'dsh' && engine.listAgentWork
    ? await engine.listAgentWork().catch(() => null) : null;
  if (engine.getRuntimeIdentity().sessionId !== sessionId) throw new Error('TASK_SESSION_CHANGED');
  const uncertainStart = ledger.planStart?.state === 'claimed' && live.sessionState === 'idle'
    && (!ledger.planStart.claimId || activePlanClaims.get(sessionId) !== ledger.planStart.claimId)
    && !engine.hasQueuedTurnOwnedBy({ kind: 'task', id: ledger.planStart.queueId });
  const confirmed = { ...ledger, ...(uncertainStart ? { planStart: { ...ledger.planStart!, error: 'PLAN_START_RECOVERY_REQUIRES_REVIEW' } } : {}), attempts: ledger.attempts.map(attempt => attempt.lifecycle.status !== 'running' ? attempt : {
    ...attempt, executionVerified: currentToolIds.has(attempt.toolUseId)
      || live.backgroundWork?.active.some(task => task.taskId === attempt.executionTaskId && task.runId === attempt.runId)
      || native?.items.some(item => item.agentId === attempt.agentId && (item.native?.activity === 'running'
        || !item.native && item.status === 'running' && item.activation?.id === attempt.lifecycle.activation?.id)) || false,
  }) };
  return { sessionId, ledger: confirmed, tasks: projectSessionTasks(confirmed, messages), messages, planSupport: readSessionPlanSupport(engine) };
}

export async function mutateSessionTasks(engine: SessionEngine, sessionId: string, action: SessionTaskAction) {
  if (engine.getRuntimeIdentity().sessionId !== sessionId) throw new Error('TASK_SESSION_CHANGED');
  const snapshot = await readSessionTasks(engine);
  return serialize(sessionId, async () => {
    if (engine.getRuntimeIdentity().sessionId !== sessionId) throw new Error('TASK_SESSION_CHANGED');
    const prior = getSessionMetadata(sessionId)?.taskOrchestration ?? emptyTaskLedger();
    if (action.kind !== 'review') {
      const task = prior.tasks.find(task => task.id === action.taskId);
      if (task?.retired) throw new Error('PLAN_TASK_RETIRED');
      const authorization = [prior.proposal, ...(prior.proposalHistory ?? [])].find(plan => plan && isSessionPlanConfirmed(plan)
        && plan.id === task?.proposalId && plan.revision === task.proposalRevision && plan.content.steps.some(step => step.id === task.id));
      // Tracking native/imported work is not a new execution grant. Only
      // proposal-owned/reserved step IDs require the exact plan authorization.
      const reserved = [prior.proposal, ...(prior.proposalHistory ?? [])].some(plan => plan?.content.steps.some(step => step.id === action.taskId));
      if ((task?.proposalId || reserved) && (!authorization || prior.pendingTaskIds?.includes(action.taskId))) throw new Error('PLAN_CONFIRMATION_REQUIRED');
    }
    const confirmed = snapshot.ledger.revision === prior.revision
      ? { ...prior, attempts: prior.attempts.map(attempt => {
          const fact = snapshot.ledger.attempts.find(fact => fact.id === attempt.id);
          return fact ? { ...attempt, executionVerified: fact.executionVerified } : attempt;
        }) } : prior;
    const checked = applySessionTaskAction(confirmed, action, snapshot.messages);
    if (action.kind === 'review' && checked.revision !== prior.revision) {
      // A CLI credential identifies the Session, not the main Agent. Only the
      // original owner's ROOT tool completion can commit this review intent.
      const id = randomUUID();
      const next = { ...prior, revision: prior.revision + 1,
        reviewIntents: [...(prior.reviewIntents ?? []), { id, action }] };
      const ledger = await publish(sessionId, prior, next);
      return { sessionId, ledger, tasks: projectSessionTasks(ledger, snapshot.messages), planSupport: readSessionPlanSupport(engine), taskReviewReceipt: id, pendingMainAgentReview: true };
    }
    const next = checked;
    const ledger = await publish(sessionId, prior, next);
    return { sessionId, ledger, tasks: projectSessionTasks(ledger, snapshot.messages), planSupport: readSessionPlanSupport(engine) };
  });
}

export type SessionPlanCommand =
  | { kind: 'propose'; proposalId: string; expectedRevision: number; content: SessionPlanContent }
  | { kind: 'revise'; proposalId: string; expectedRevision: number; content: SessionPlanContent; changes: string[] }
  | { kind: 'confirm_from_message'; proposalId: string; expectedRevision: number; messageId: string };
export type SessionPlanUserAction = SessionPlanTarget & { requestId: string } &
  ({ kind: 'confirm' } | { kind: 'request_revision'; feedback: string });

/** Conservative natural-language support. Quoted/model/tool text never counts. */
function isExplicitHumanConfirmation(content: string): boolean {
  if (content.length > 2000 || /[\n\r<>`"“”]|不要|不确认|先别|暂不|取消|如果|例如|比如|引用|not\b|don't\b/i.test(content)) return false;
  return /^(?:好[的，, ]*)?(?:(?:就)?按(?:这个|此|上述|该)方案(?:做|改|执行|实施|开始)|确认(?:方案)?[，, ]*(?:开始|执行|实施)|同意(?:方案)?[，, ]*(?:开始|执行|实施)|(?:yes[, ]*)?(?:proceed|implement|execute) (?:with )?(?:this|the) plan)[。.!！]?$/i.test(content.trim());
}

function commitConfirmedPlan(ledger: SessionTaskLedger): void {
  const proposal = ledger.proposal!;
  for (const task of ledger.tasks) if (task.proposalId === proposal.id && !proposal.content.steps.some(step => step.id === task.id)) task.retired = true;
  for (const step of proposal.content.steps) {
    const task = ledger.tasks.find(task => task.id === step.id);
    if (!task) ledger.tasks.push({ id: step.id, title: step.title, blockedBy: step.blockedBy ?? [], proposalId: proposal.id, proposalRevision: proposal.revision });
    else {
      if (ledger.pendingTaskIds?.includes(step.id)) {
        task.mainAttempt = (task.mainAttempt ?? 0) + 1;
        ledger.currentTools = { ...ledger.currentTools, [task.id]: '@main' };
      }
      Object.assign(task, { title: step.title, blockedBy: step.blockedBy ?? [], proposalId: proposal.id, proposalRevision: proposal.revision, retired: false });
    }
  }
  ledger.pendingTaskIds = [];
}

function confirmFromUserMessage(ledger: SessionTaskLedger, target: SessionPlanTarget, messageId: string,
  messages: readonly { id: string; role: string; content: string; metadata?: { clientRequestId?: string } }[]): void {
  const message = messages.find(message => message.id === messageId);
  if (!message || message.role !== 'user' || !isExplicitHumanConfirmation(message.content)) throw new Error('PLAN_HUMAN_CONFIRMATION_REQUIRED');
  if (ledger.proposalHistory?.some(plan => plan.confirmation?.evidenceId === messageId)) throw new Error('PLAN_CONFIRMATION_ALREADY_USED');
  const proof = ledger.humanInputs?.find(input => input.requestId === message.metadata?.clientRequestId && input.proposalId === target.proposalId
    && input.revision === target.expectedRevision && input.bodyDigest === createHash('sha256').update(message.content).digest('hex'));
  if (!proof) throw new Error('PLAN_HUMAN_CONFIRMATION_REQUIRED');
  const boundary = messages.findIndex(message => message.id === ledger.proposalUserBoundary);
  const index = messages.findIndex(message => message.id === messageId);
  if (boundary < 0 || index <= boundary || !ledger.proposal) throw new Error('PLAN_CONFIRMATION_STALE');
  ledger.proposal = confirmSessionPlan(ledger.proposal, target, { source: 'user_message', evidenceId: messageId, confirmedAt: new Date().toISOString() });
  commitConfirmedPlan(ledger);
  if (ledger.planStart?.proposalId !== target.proposalId || ledger.planStart.revision !== target.expectedRevision)
    ledger.planStart = { proposalId: target.proposalId, revision: target.expectedRevision, requestId: proof.requestId, queueId: SESSION_PLAN_QUEUE_PREFIX + randomUUID(), state: 'pending' };
}

/** Called only after Rust's signature has proved the original desktop ingress. */
export async function recordSessionPlanHumanInput(sessionId: string, requestId: string, text: string,
  target?: { proposalId: string; expectedRevision: number }): Promise<void> {
  if (!target || !isExplicitHumanConfirmation(text)) return;
  await serialize(sessionId, async () => {
    const prior = getSessionMetadata(sessionId)?.taskOrchestration;
    if (!prior?.proposal || prior.proposal.state !== 'awaiting_confirmation'
      || prior.proposal.id !== target.proposalId || prior.proposal.revision !== target.expectedRevision) return;
    const input = { requestId, proposalId: prior.proposal.id, revision: prior.proposal.revision, bodyDigest: createHash('sha256').update(text).digest('hex') };
    const duplicate = prior.humanInputs?.find(input => input.requestId === requestId);
    if (duplicate) {
      if (JSON.stringify(duplicate) !== JSON.stringify(input)) throw new Error('PLAN_INPUT_CONFLICT');
      return;
    }
    await publish(sessionId, prior, { ...prior, revision: prior.revision + 1, humanInputs: [...(prior.humanInputs ?? []), input].slice(-128) });
  });
}

/** Drafts and human receipts use the SAME metadata CAS as attempts/reviews. */
export async function mutateSessionPlan(engine: SessionEngine, sessionId: string, action: SessionPlanCommand) {
  const authorized = planMutationAuthority(engine, sessionId);
  const originTurn: SessionPlanTurnScope = { queueId: engine.getExecutionTurnId?.() ?? undefined,
    owner: structuredClone(engine.getCurrentTurnIdentity?.()?.owner) };
  const sameOriginTurn = () => action.kind !== 'propose' || (engine.getExecutionTurnId?.() ?? undefined) === originTurn.queueId;
  const snapshot = await readSessionTasks(engine);
  if (snapshot.sessionId !== sessionId) throw new Error('TASK_SESSION_CHANGED');
  const result = await serialize(sessionId, async () => {
    if (engine.getRuntimeIdentity().sessionId !== sessionId) throw new Error('TASK_SESSION_CHANGED');
    authorized();
    if (!sameOriginTurn()) throw new Error('TASK_TURN_CHANGED');
    const prior = getSessionMetadata(sessionId)?.taskOrchestration ?? emptyTaskLedger();
    const next = structuredClone(prior);
    const target = { sessionId, proposalId: action.proposalId, expectedRevision: action.expectedRevision };
    if (action.kind === 'propose') {
      if (prior.revision !== action.expectedRevision) throw new Error('TASK_REVISION_CONFLICT');
      if (next.proposal) throw new Error('PLAN_ALREADY_EXISTS_USE_REVISE');
      next.proposal = Object.assign(createSessionPlan({ id: action.proposalId, sessionId }, action.content), {
        // The native queue, not CLI parameters/source labels, identifies the
        // work that requested this new decision. Preserved across revisions.
        originTurn,
      });
      next.proposalUserBoundary = snapshot.messages.findLast(message => message.role === 'user')?.id;
    } else {
      if (!next.proposal) throw new Error('PLAN_NOT_FOUND');
      if (action.kind === 'confirm_from_message') confirmFromUserMessage(next, target, action.messageId, snapshot.messages);
      else {
        const old = next.proposal;
        next.proposal = reviseSessionPlan(old, target, action.content, action.changes);
        next.proposalHistory = [...(next.proposalHistory ?? []), old].slice(-32);
        next.proposalUserBoundary = snapshot.messages.findLast(message => message.role === 'user')?.id;
        const globalChange = old.content.objective !== action.content.objective || old.content.scope !== action.content.scope
          || JSON.stringify(old.content.acceptanceCriteria) !== JSON.stringify(action.content.acceptanceCriteria);
        const changed = old.content.steps.filter(step => globalChange || JSON.stringify(step) !== JSON.stringify(action.content.steps.find(next => next.id === step.id))).map(step => step.id);
        next.pendingTaskIds = [...new Set([...(next.pendingTaskIds ?? []), ...changed])];
      }
    }
    if (JSON.stringify(next) === JSON.stringify(prior)) return { sessionId, ledger: prior, tasks: projectSessionTasks(prior, snapshot.messages), planSupport: readSessionPlanSupport(engine) };
    next.revision++;
    const ledger = await publish(sessionId, prior, next, () => authorized() && sameOriginTurn());
    return { sessionId, ledger, tasks: projectSessionTasks(ledger, snapshot.messages), planSupport: readSessionPlanSupport(engine) };
  });
  if (action.kind === 'confirm_from_message') await startSessionPlanTurn(engine, sessionId);
  return result;
}

/** A durable one-shot claim is checked inside the original engine queue. */
async function startSessionPlanTurn(engine: SessionEngine, sessionId: string): Promise<void> {
  const authorized = planMutationAuthority(engine, sessionId);
  const start = getSessionMetadata(sessionId)?.taskOrchestration?.planStart;
  if (!start || start.state !== 'pending' || admittingPlans.has(sessionId)
    || engine.hasQueuedTurnOwnedBy({ kind: 'task', id: start.queueId })) return;
  admittingPlans.add(sessionId);
  const claimId = randomUUID();
  const validProposal = (ledger: SessionTaskLedger) => !!ledger.proposal && (start.purpose === 'revision'
    ? ledger.proposal.state === 'revising' && !!ledger.proposal.feedback : isSessionPlanConfirmed(ledger.proposal));
  const current = () => {
    const ledger = getSessionMetadata(sessionId)?.taskOrchestration;
    return engine.getRuntimeIdentity().sessionId === sessionId && ledger?.proposal?.id === start.proposalId
      && ledger.proposal.revision === start.revision && validProposal(ledger)
      && ledger.planStart?.requestId === start.requestId && ledger.planStart.claimId === claimId;
  };
  const guard: DispatchGuard = async () => serialize(sessionId, async () => {
    authorized();
    const prior = getSessionMetadata(sessionId)?.taskOrchestration;
    if (!prior?.proposal || prior.proposal.id !== start.proposalId || prior.proposal.revision !== start.revision
      || !validProposal(prior) || engine.getRuntimeIdentity().sessionId !== sessionId
      || prior.planStart?.requestId !== start.requestId || prior.planStart.state !== 'pending' && prior.planStart.claimId !== claimId) return { accepted: false, error: 'PLAN_START_ALREADY_CLAIMED_OR_STALE' };
    if (prior.planStart.state === 'pending') await publish(sessionId, prior, { ...prior, revision: prior.revision + 1, planStart: { ...prior.planStart, state: 'claimed', claimId } }, () => authorized());
    activePlanClaims.set(sessionId, claimId);
    return { accepted: true, validateAtCommit: () => ({ accepted: authorized() && current(), error: current() ? undefined : 'PLAN_START_STALE' }) };
  });
  guard.cancel = async () => serialize(sessionId, async () => {
    const prior = getSessionMetadata(sessionId)?.taskOrchestration;
    if (!prior?.planStart || prior.planStart.state !== 'claimed' || prior.planStart.claimId !== claimId) return;
    if (activePlanClaims.get(sessionId) === claimId) activePlanClaims.delete(sessionId);
    await publish(sessionId, prior, { ...prior, revision: prior.revision + 1, planStart: { ...prior.planStart, state: 'pending', claimId: undefined, error: 'PLAN_START_NOT_DISPATCHED' } });
  });
  try {
    const context = engine.getCurrentSessionContext();
    if (context.sessionId !== sessionId || !context.workspacePath) throw new Error('TASK_SESSION_CHANGED');
    const text = start.purpose === 'revision'
      ? `用户要求调整任务方案 ${start.proposalId} 第 ${start.revision} 版。请读取会话任务账本，讨论并用 revise 发布下一版草案，等待人类重新确认；不要创建正式任务或启动子 Agent。\n用户调整意见：\n${getSessionMetadata(sessionId)?.taskOrchestration?.proposal?.feedback ?? ''}`
      : `已确认任务方案 ${start.proposalId} 第 ${start.revision} 版。请读取会话任务账本，按已确认的范围开始执行；结果回传后先验收再标完成。`;
    const result = await engine.sendDesktopMessage({ sessionId, workspacePath: context.workspacePath,
      text,
      scenario: { type: 'desktop', surface: 'chat' }, clientRequestId: start.queueId, queueId: start.queueId,
      turnOwner: { kind: 'task', id: start.queueId },
      turnBoundaryOnly: true, beforeDispatch: guard });
    if (!result.success) throw new Error(result.error ?? 'PLAN_START_UNAVAILABLE');
    if (result.dispatchAcceptance) void result.dispatchAcceptance.then(async receipt => {
      // The original owner alone knows whether native dispatch was entered.
      // It awaits guard.cancel for a proven non-dispatch; lost ACK stays claimed.
      if (!receipt.accepted) { if (activePlanClaims.get(sessionId) === claimId) activePlanClaims.delete(sessionId); return; }
      await serialize(sessionId, async () => {
        const prior = getSessionMetadata(sessionId)?.taskOrchestration;
        if (!prior?.planStart || !current()) { if (activePlanClaims.get(sessionId) === claimId) activePlanClaims.delete(sessionId); return; }
        await publish(sessionId, prior, { ...prior, revision: prior.revision + 1, planStart: { ...prior.planStart, state: 'dispatched', error: undefined } });
        if (activePlanClaims.get(sessionId) === claimId) activePlanClaims.delete(sessionId);
      });
    }).catch(error => {
      if (activePlanClaims.get(sessionId) === claimId) activePlanClaims.delete(sessionId);
      console.warn('[session-task-orchestration] plan dispatch receipt unavailable:', String(error));
    });
  } catch (error) {
    if (activePlanClaims.get(sessionId) === claimId) activePlanClaims.delete(sessionId);
    await serialize(sessionId, async () => {
      const prior = getSessionMetadata(sessionId)?.taskOrchestration;
      if (!prior?.planStart || prior.planStart.requestId !== start.requestId) return;
      await publish(sessionId, prior, { ...prior, revision: prior.revision + 1, planStart: { ...prior.planStart, error: error instanceof Error ? error.message : 'PLAN_START_UNAVAILABLE' } });
    });
  } finally { admittingPlans.delete(sessionId); }
}

/** Only the renderer's explicit user-action route calls this, never the CLI. */
export async function actOnSessionPlan(engine: SessionEngine, action: SessionPlanUserAction) {
  const { sessionId, requestId } = action;
  const authorized = planMutationAuthority(engine, sessionId);
  if (engine.getRuntimeIdentity().sessionId !== sessionId) throw new Error('TASK_SESSION_CHANGED');
  const fingerprint = JSON.stringify(action);
  await serialize(sessionId, async () => {
    if (engine.getRuntimeIdentity().sessionId !== sessionId) throw new Error('TASK_SESSION_CHANGED');
    authorized();
    const prior = getSessionMetadata(sessionId)?.taskOrchestration;
    if (!prior?.proposal) throw new Error('PLAN_NOT_FOUND');
    const request = prior.planRequests?.find(request => request.id === requestId);
    if (request) {
      if (request.fingerprint !== fingerprint) throw new Error('PLAN_REQUEST_CONFLICT');
      return;
    }
    const next = structuredClone(prior);
    if (action.kind === 'confirm') {
      next.proposal = confirmSessionPlan(prior.proposal, action, { source: 'button', evidenceId: requestId, confirmedAt: new Date().toISOString() });
      commitConfirmedPlan(next);
      if (next.planStart?.proposalId !== next.proposal.id || next.planStart.revision !== next.proposal.revision)
        next.planStart = { proposalId: next.proposal.id, revision: next.proposal.revision, requestId, queueId: SESSION_PLAN_QUEUE_PREFIX + randomUUID(), state: 'pending' };
    } else {
      next.proposal = requestSessionPlanRevision(prior.proposal, action, action.feedback);
      next.planStart = { proposalId: next.proposal.id, revision: next.proposal.revision, requestId, queueId: SESSION_PLAN_QUEUE_PREFIX + randomUUID(), purpose: 'revision', state: 'pending' };
    }
    next.planRequests = [...(next.planRequests ?? []), { id: requestId, fingerprint }].slice(-128);
    next.revision++;
    await publish(sessionId, prior, next, () => authorized());
  });
  await startSessionPlanTurn(engine, sessionId);
  const { messages: _messages, ...snapshot } = await readSessionTasks(engine);
  return snapshot;
}

/** Trusted root/subagent scope comes from SDK hook/native Runtime events. */
export async function confirmSessionTaskReviewFromRootTool(sessionId: string, tool: {
  id: string; name?: string; input: unknown; output: unknown; root: boolean; isError?: boolean; isCurrent?: () => boolean;
}): Promise<void> {
  if (!tool.root || tool.isError || tool.isCurrent?.() === false || !['Bash', 'Shell', 'shell', 'exec_command'].includes(tool.name ?? '')) return;
  const requested = parseTaskReviewCommand(tool.input);
  if (!requested) return;
  const strings: string[] = [];
  function visit(value: unknown) {
    if (typeof value === 'string') { strings.push(value); try { const parsed: unknown = JSON.parse(value); if (parsed && typeof parsed === 'object') visit(parsed); } catch { /* Plain shell text. */ } }
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  }
  visit(tool.output);
  const ids = strings.flatMap(value => [...value.matchAll(/"taskReviewReceipt"\s*:\s*"([a-f0-9-]{36})"/g)].map(match => match[1]));
  if (!ids.length) return;
  await serialize(sessionId, async () => {
    let prior = getSessionMetadata(sessionId)?.taskOrchestration;
    if (!prior || tool.isCurrent?.() === false) return;
    for (const id of ids) {
      const intent = prior.reviewIntents?.find(intent => intent.id === id);
      if (!intent || !sameTaskReview(requested, intent.action)) continue;
      const next = structuredClone(applySessionTaskAction(prior, { ...intent.action, expectedRevision: prior.revision }));
      if (next.revision === prior.revision) next.revision++;
      next.reviewIntents = next.reviewIntents?.filter(intent => intent.id !== id);
      const review = next.reviews.findLast(review => review.taskId === intent.action.taskId && review.attemptId === intent.action.attemptId);
      if (review) review.rootToolUseId ??= tool.id;
      prior = await publish(sessionId, prior, next, () => tool.isCurrent?.() !== false);
    }
  });
}
