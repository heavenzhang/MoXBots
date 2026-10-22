/** Confirmation belongs to the Session's existing task ledger, never a second scheduler. */
export const SESSION_PLAN_POLICY_VERSION = "1";

export interface SessionPlanContent {
  objective: string;
  scope: string;
  steps: { id: string; title: string; assignee?: string; blockedBy?: string[] }[];
  acceptanceCriteria: string[];
}

export interface SessionPlanTarget {
  sessionId: string;
  proposalId: string;
  expectedRevision: number;
}

export interface SessionPlanConfirmation {
  /** Set by the trusted user-action owner; model prose is not confirmation. */
  source: "button" | "user_message";
  evidenceId: string;
  confirmedAt: string;
  revision: number;
}

export interface SessionPlanProposal {
  id: string;
  sessionId: string;
  revision: number;
  policyVersion: string;
  state: "awaiting_confirmation" | "revising" | "confirmed";
  content: SessionPlanContent;
  changes: string[];
  feedback?: string;
  confirmation?: SessionPlanConfirmation;
}

export interface SessionPlanRequirement {
  userRequestsPlan: boolean;
  execution: "answer" | "single_action" | "multi_stage";
  delegatesWork: boolean;
  multipleDeliverables: boolean;
  hasDependencies: boolean;
}

/** Inputs are structured planning facts. Do not classify natural-language keywords here. */
export function requiresSessionPlan(input: SessionPlanRequirement): boolean {
  return (
    input.userRequestsPlan ||
    input.execution === "multi_stage" ||
    input.delegatesWork ||
    input.multipleDeliverables ||
    input.hasDependencies
  );
}

function validContent(content: SessionPlanContent): boolean {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const byId = new Map(content.steps.map(step => [step.id, step]));
  function acyclic(id: string): boolean {
    if (visited.has(id)) return true;
    const step = byId.get(id);
    if (!step || visiting.has(id)) return false;
    visiting.add(id);
    if (!step.blockedBy?.every(acyclic) && step.blockedBy) return false;
    visiting.delete(id); visited.add(id); return true;
  }
  return Boolean(
    content.objective.trim() &&
      content.scope.trim() &&
      content.steps.length &&
      content.steps.length <= 100 &&
      content.steps.every((step) => step.id.trim() && step.title.trim()) &&
      content.steps.every(step => acyclic(step.id)) &&
      new Set(content.steps.map((step) => step.id)).size ===
        content.steps.length &&
      content.acceptanceCriteria.length &&
      content.acceptanceCriteria.every((item) => item.trim()),
  );
}

export function createSessionPlan(
  identity: { id: string; sessionId: string },
  content: SessionPlanContent,
): SessionPlanProposal {
  if (
    !identity.id.trim() ||
    !identity.sessionId.trim() ||
    !validContent(content)
  )
    throw new Error("PLAN_INVALID");
  return {
    ...identity,
    revision: 1,
    policyVersion: SESSION_PLAN_POLICY_VERSION,
    state: "awaiting_confirmation",
    content: structuredClone(content),
    changes: [],
  };
}

function assertTarget(
  plan: SessionPlanProposal,
  target: SessionPlanTarget,
): void {
  if (target.sessionId !== plan.sessionId || target.proposalId !== plan.id)
    throw new Error("PLAN_SESSION_CHANGED");
  if (target.expectedRevision !== plan.revision)
    throw new Error("PLAN_REVISION_CHANGED");
}

/** A recovered status label alone does not prove human confirmation. */
export function isSessionPlanConfirmed(plan: SessionPlanProposal): boolean {
  const receipt = plan.confirmation;
  return (
    plan.policyVersion === SESSION_PLAN_POLICY_VERSION &&
    plan.state === "confirmed" &&
    receipt?.revision === plan.revision &&
    (receipt.source === "button" || receipt.source === "user_message") &&
    typeof receipt.evidenceId === "string" &&
    !!receipt.evidenceId.trim() &&
    Number.isFinite(Date.parse(receipt.confirmedAt))
  );
}

/** A retry preserves the original human receipt; it cannot create a second start. */
export function confirmSessionPlan(
  plan: SessionPlanProposal,
  target: SessionPlanTarget,
  receipt: Omit<SessionPlanConfirmation, "revision">,
): SessionPlanProposal {
  assertTarget(plan, target);
  if (plan.policyVersion !== SESSION_PLAN_POLICY_VERSION) throw new Error("PLAN_POLICY_CHANGED");
  if (isSessionPlanConfirmed(plan)) return plan;
  if (plan.state !== "awaiting_confirmation") throw new Error("PLAN_NOT_READY");
  if (
    (receipt.source !== "button" && receipt.source !== "user_message") ||
    !receipt.evidenceId.trim() ||
    !Number.isFinite(Date.parse(receipt.confirmedAt))
  )
    throw new Error("PLAN_CONFIRMATION_REQUIRED");
  return {
    ...plan,
    state: "confirmed",
    confirmation: { ...receipt, revision: plan.revision },
  };
}

export function requestSessionPlanRevision(
  plan: SessionPlanProposal,
  target: SessionPlanTarget,
  feedback: string,
): SessionPlanProposal {
  assertTarget(plan, target);
  if (plan.state === "confirmed") throw new Error("PLAN_ALREADY_CONFIRMED");
  if (!feedback.trim() || feedback.length > 4000)
    throw new Error("PLAN_FEEDBACK_REQUIRED");
  return {
    ...plan,
    state: "revising",
    feedback: feedback.trim(),
    confirmation: undefined,
  };
}

/** Replaces the same draft. Old confirmations cannot authorize the new content. */
export function reviseSessionPlan(
  plan: SessionPlanProposal,
  target: SessionPlanTarget,
  content: SessionPlanContent,
  changes: string[],
): SessionPlanProposal {
  assertTarget(plan, target);
  if (
    !validContent(content) ||
    !changes.length ||
    changes.some((change) => !change.trim())
  )
    throw new Error("PLAN_INVALID");
  return {
    ...plan,
    revision: plan.revision + 1,
    state: "awaiting_confirmation",
    content: structuredClone(content),
    changes: changes.map((change) => change.trim()),
    confirmation: undefined,
    feedback: undefined,
  };
}

/** The existing execution owner calls this before creating/dispatching planned work. */
export function assertSessionPlanConfirmed(
  plan: SessionPlanProposal,
  target: SessionPlanTarget,
): void {
  assertTarget(plan, target);
  if (!isSessionPlanConfirmed(plan))
    throw new Error("PLAN_CONFIRMATION_REQUIRED");
}
