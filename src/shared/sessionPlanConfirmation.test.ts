import { describe, expect, it } from "vitest";
import {
  assertSessionPlanConfirmed,
  confirmSessionPlan,
  isSessionPlanConfirmed,
  createSessionPlan,
  requestSessionPlanRevision,
  requiresSessionPlan,
  reviseSessionPlan,
  type SessionPlanContent,
} from "./sessionPlanConfirmation";

const content: SessionPlanContent = {
  objective: "修复导出并验证结果",
  scope: "仅修改导出接口与相关测试",
  steps: [
    { id: "inspect", title: "检查接口" },
    { id: "repair", title: "修复并验收", assignee: "主 Agent" },
  ],
  acceptanceCriteria: ["导出结果与原记录一致"],
};
const target = {
  sessionId: "session-a",
  proposalId: "plan-a",
  expectedRevision: 1,
};
const receipt = {
  source: "button" as const,
  evidenceId: "user-click-a",
  confirmedAt: "2026-10-22T01:00:00Z",
};
const make = () =>
  createSessionPlan({ id: "plan-a", sessionId: "session-a" }, content);

describe("session plan confirmation boundary", () => {
  it("requires discussion for structured long-task facts and permits a simple answer", () => {
    const simple = {
      userRequestsPlan: false,
      execution: "answer" as const,
      delegatesWork: false,
      multipleDeliverables: false,
      hasDependencies: false,
    };
    expect(requiresSessionPlan(simple)).toBe(false);
    expect(requiresSessionPlan({ ...simple, execution: "single_action" })).toBe(
      false,
    );
    for (const input of [
      { ...simple, userRequestsPlan: true },
      { ...simple, delegatesWork: true },
      { ...simple, multipleDeliverables: true },
      { ...simple, hasDependencies: true },
      { ...simple, execution: "multi_stage" as const },
    ])
      expect(requiresSessionPlan(input)).toBe(true);
  });
  it("creates a reviewable draft without authorizing execution", () => {
    const plan = make();
    expect(plan.state).toBe("awaiting_confirmation");
    expect(plan.confirmation).toBeUndefined();
    expect(() => assertSessionPlanConfirmed(plan, target)).toThrow(
      "PLAN_CONFIRMATION_REQUIRED",
    );
  });
  it("records human confirmation once and preserves its receipt on retry", () => {
    const confirmed = confirmSessionPlan(make(), target, receipt);
    expect(() => assertSessionPlanConfirmed(confirmed, target)).not.toThrow();
    expect(
      confirmSessionPlan(confirmed, target, {
        ...receipt,
        evidenceId: "retry",
      }),
    ).toBe(confirmed);
    expect(confirmed.confirmation?.evidenceId).toBe("user-click-a");
  });
  it("accepts a trusted explicit user-message receipt without another button", () => {
    const plan = confirmSessionPlan(make(), target, {
      ...receipt,
      source: "user_message",
      evidenceId: "message-a",
    });
    expect(plan.confirmation?.source).toBe("user_message");
    expect(() => assertSessionPlanConfirmed(plan, target)).not.toThrow();
  });
  it("blocks confirmation while the user is waiting for a revision", () => {
    const revising = requestSessionPlanRevision(
      make(),
      target,
      "增加异常文件回归",
    );
    expect(revising.feedback).toBe("增加异常文件回归");
    expect(() => confirmSessionPlan(revising, target, receipt)).toThrow(
      "PLAN_NOT_READY",
    );
  });
  it("replaces the same draft and rejects old-version confirmation", () => {
    const plan = reviseSessionPlan(
      make(),
      target,
      { ...content, scope: "包含异常文件回归" },
      ["增加异常文件回归"],
    );
    expect(plan.id).toBe("plan-a");
    expect(plan.revision).toBe(2);
    expect(plan.state).toBe("awaiting_confirmation");
    expect(() => confirmSessionPlan(plan, target, receipt)).toThrow(
      "PLAN_REVISION_CHANGED",
    );
  });
  it("requires fresh confirmation for a material change to an approved plan", () => {
    const prior = confirmSessionPlan(make(), target, receipt);
    const changed = reviseSessionPlan(
      prior,
      target,
      { ...content, objective: "增加新的交付物" },
      ["扩大交付范围"],
    );
    expect(changed.confirmation).toBeUndefined();
    expect(prior.state).toBe("confirmed");
    expect(() =>
      assertSessionPlanConfirmed(changed, { ...target, expectedRevision: 2 }),
    ).toThrow("PLAN_CONFIRMATION_REQUIRED");
  });
  it("restores pending and confirmed states through the Session JSON snapshot", () => {
    for (const plan of [make(), confirmSessionPlan(make(), target, receipt)]) {
      const recovered = JSON.parse(JSON.stringify(plan));
      expect(recovered).toEqual(plan);
      if (plan.state === "confirmed")
        expect(() =>
          assertSessionPlanConfirmed(recovered, target),
        ).not.toThrow();
      else
        expect(() => assertSessionPlanConfirmed(recovered, target)).toThrow(
          "PLAN_CONFIRMATION_REQUIRED",
        );
    }
  });

  it("does not trust a recovered confirmed label without matching human evidence", () => {
    const plan = { ...make(), state: "confirmed" as const };
    expect(() => assertSessionPlanConfirmed(plan, target)).toThrow(
      "PLAN_CONFIRMATION_REQUIRED",
    );
    const stale = { ...plan, confirmation: { ...receipt, revision: 0 } };
    expect(() => assertSessionPlanConfirmed(stale, target)).toThrow(
      "PLAN_CONFIRMATION_REQUIRED",
    );
  });
  it("rejects cross-session or cross-proposal actions", () => {
    for (const wrong of [
      { ...target, sessionId: "session-b" },
      { ...target, proposalId: "plan-b" },
    ])
      expect(() => confirmSessionPlan(make(), wrong, receipt)).toThrow(
        "PLAN_SESSION_CHANGED",
      );
  });
  it("rejects an incomplete plan, duplicated step identity or empty human evidence", () => {
    expect(() =>
      createSessionPlan(
        { id: "x", sessionId: "s" },
        { ...content, acceptanceCriteria: [] },
      ),
    ).toThrow("PLAN_INVALID");
    expect(() =>
      createSessionPlan(
        { id: "x", sessionId: "s" },
        { ...content, steps: [content.steps[0], content.steps[0]] },
      ),
    ).toThrow("PLAN_INVALID");
    expect(() =>
      confirmSessionPlan(make(), target, { ...receipt, evidenceId: "" }),
    ).toThrow("PLAN_CONFIRMATION_REQUIRED");
  });
});

describe('plan policy and dependency safety', () => {
  const content = { objective: 'Deliver', scope: 'Scoped', steps: [{ id: 'a', title: 'A', blockedBy: ['b'] }, { id: 'b', title: 'B' }], acceptanceCriteria: ['Verified'] };
  it('accepts explicit acyclic dependencies and rejects missing/cyclic steps', () => {
    expect(createSessionPlan({ id: 'p', sessionId: 's' }, content).content.steps[0].blockedBy).toEqual(['b']);
    expect(() => createSessionPlan({ id: 'p', sessionId: 's' }, { ...content, steps: [{ id: 'a', title: 'A', blockedBy: ['missing'] }] })).toThrow('PLAN_INVALID');
    expect(() => createSessionPlan({ id: 'p', sessionId: 's' }, { ...content, steps: [{ id: 'a', title: 'A', blockedBy: ['a'] }] })).toThrow('PLAN_INVALID');
  });
  it('does not restore an unsupported policy as a confirmed grant', () => {
    const proposal = { ...createSessionPlan({ id: 'p', sessionId: 's' }, content), policyVersion: 'future-policy' };
    expect(isSessionPlanConfirmed(proposal)).toBe(false);
    expect(() => confirmSessionPlan(proposal, { sessionId: 's', proposalId: 'p', expectedRevision: 1 }, { source: 'button', evidenceId: 'human', confirmedAt: new Date().toISOString() })).toThrow('PLAN_POLICY_CHANGED');
  });
});
