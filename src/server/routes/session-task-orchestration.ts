import { z } from 'zod';
import { getSessionEngine } from '../session-engine';
import { actOnSessionPlan, readSessionPlanSupport, mutateSessionPlan, mutateSessionTasks, readSessionTasks } from '../session-engine/task-orchestration';
import { verifySessionUserAction } from '../session-engine/user-action-proof';
import { executionAssessmentSchema } from "../../shared/sessionExecution";
import {
  requestSessionExecutionReview,
  reconcileSessionExecution,
} from "../session-engine/session-execution";
import { registerSessionTaskPackage } from "../session-engine/session-task-dispatch";
import { taskPackageSchema } from "../../shared/sessionTaskDispatch";

const identifier = z.string().min(1).max(256).refine(s => Array.from(s).every(char => char.charCodeAt(0) >= 32));
const common = { taskId: identifier, expectedRevision: z.number().int().nonnegative().safe() };
const actionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ensure'), ...common, title: z.string().trim().min(1).max(2000), blockedBy: z.array(identifier).max(100).optional() }),
  z.strictObject({ kind: z.literal('bind'), ...common, toolUseId: identifier }),
  z.strictObject({ kind: z.literal('review'), ...common, attemptId: identifier, decision: z.enum(['accept', 'reject']), evidence: z.string().trim().min(1).max(8000) }),
]);
const content = z.strictObject({ objective: z.string().trim().min(1).max(8000), scope: z.string().trim().min(1).max(12000),
  steps: z.array(z.strictObject({ id: identifier, title: z.string().trim().min(1).max(2000), assignee: z.string().max(256).optional(), blockedBy: z.array(identifier).max(100).optional() })).min(1).max(100),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(2000)).min(1).max(100) });
const planCommand = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('propose'), proposalId: identifier, expectedRevision: common.expectedRevision, content }),
  z.strictObject({ kind: z.literal('revise'), proposalId: identifier, expectedRevision: common.expectedRevision, content, changes: z.array(z.string().trim().min(1).max(2000)).min(1).max(100) }),
  z.strictObject({ kind: z.literal('confirm_from_message'), proposalId: identifier, expectedRevision: common.expectedRevision, messageId: identifier }),
]);
const userTarget = { sessionId: identifier, proposalId: identifier, expectedRevision: common.expectedRevision, requestId: z.uuid() };
const userAction = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('confirm'), ...userTarget }),
  z.strictObject({ kind: z.literal('request_revision'), ...userTarget, feedback: z.string().trim().min(1).max(4000) }),
]);

export async function handleSessionTaskCommand(payload: unknown,
): Promise<Record<string, unknown>> {
  const engine = getSessionEngine();
  try {
    const value = payload as { kind?: unknown; sessionId?: unknown } | null;
    // Every mutation is addressed to the exact Product Session; ambient/fallback
    // identity cannot silently apply a stale action after a Tab/binding switch.
    if (!value || value.sessionId !== engine.getRuntimeIdentity().sessionId) throw new Error('TASK_SESSION_CHANGED');
    const { sessionId, ...input } = value;
    if (input.kind === 'list') {
      if (Object.keys(input).some(k => k !== 'kind')) throw new Error('TASK_INVALID_ACTION');
      await reconcileSessionExecution(engine, sessionId as string);
      const { messages: _messages, ...snapshot } = await readSessionTasks(engine);
      return { success: true, ...snapshot };
    }
    if (input.kind === "execution_review") {
      const review = z.strictObject({
          kind: z.literal("execution_review"),
          executionId: identifier,
          queueId: identifier,
          assessment: executionAssessmentSchema,
        })
        .parse(input);
      return {
        success: true,
        ...(await requestSessionExecutionReview(engine, review)),
      };
    }
    if (input.kind === "package") {
      const command = z.strictObject({
          kind: z.literal("package"),
          expectedRevision: common.expectedRevision,
          package: taskPackageSchema,
        })
        .parse(input);
      return {
        success: true,
        sessionId,
        ledger: await registerSessionTaskPackage(engine, {
          ...command.package,
          expectedRevision: command.expectedRevision,
        }),
      };
    }
    const planning = planCommand.safeParse(input);
    if (planning.success) return { success: true, ...await mutateSessionPlan(engine, sessionId as string, planning.data) };
    const parsed = actionSchema.safeParse(input);
    if (!parsed.success) throw new Error('TASK_INVALID_ACTION');
    return { success: true, ...await mutateSessionTasks(engine, sessionId as string, parsed.data) };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'TASK_UNAVAILABLE', planSupport: readSessionPlanSupport(engine) }; }
}

export async function handleSessionTaskRoute(pathname: string, request: Request): Promise<Response | null> {
  if (pathname === '/api/session/task-orchestration/plan' && request.method === 'POST') {
    try {
      const body = await request.text();
      const parsed = userAction.safeParse(JSON.parse(body));
      if (!parsed.success) throw new Error('PLAN_INVALID_ACTION');
      if (!verifySessionUserAction(request, parsed.data.sessionId, body)) throw new Error('PLAN_NATIVE_USER_ACTION_REQUIRED');
      return Response.json({ success: true, ...await actOnSessionPlan(getSessionEngine(), parsed.data) });
    } catch (error) { return Response.json({ success: false, error: error instanceof Error ? error.message : 'PLAN_UNAVAILABLE', planSupport: readSessionPlanSupport(getSessionEngine()) }, { status: 409 }); }
  }
  if (pathname !== '/api/session/task-orchestration' || request.method !== 'GET') return null;
  const result = await handleSessionTaskCommand({ kind: 'list', sessionId: new URL(request.url).searchParams.get('sessionId') });
  return Response.json(result, { status: result.success ? 200 : 409 });
}
