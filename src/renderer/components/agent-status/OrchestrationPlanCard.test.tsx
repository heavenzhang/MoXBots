import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  confirmSessionPlan,
  createSessionPlan,
  reviseSessionPlan,
} from "../../../shared/sessionPlanConfirmation";
import { OrchestrationPlanCard } from "./OrchestrationPlanCard";
import { projectSessionTasks, type SessionTaskLedger } from '../../../shared/sessionTaskOrchestration';

const make = () =>
  createSessionPlan(
    { id: "plan-a", sessionId: "session-a" },
    {
      objective: "修复导出并验证结果",
      scope: "仅修改导出接口与相关测试",
      steps: [
        { id: "inspect", title: "检查接口" },
        { id: "repair", title: "修复并验收", assignee: "主 Agent" },
      ],
      acceptanceCriteria: ["导出结果与原记录一致"],
    },
  );
const callbacks = () => ({
  planSupport: { supported: true, runtime: 'builtin' },
  onConfirm: vi.fn(async () => {}),
  onRequestRevision: vi.fn(async () => {}),
  onDiscuss: vi.fn(),
});

describe('native plan support', () => {
  it('preserves a recovered draft but prevents unsupported confirmation or adjustment', () => {
    const props = callbacks();
    render(<OrchestrationPlanCard proposal={make()} {...props}
      planSupport={{ supported: false, runtime: 'codex', reason: 'PLAN_RUNTIME_DELEGATION_UNAVAILABLE' }} />);
    expect(screen.getByText('修复导出并验证结果')).toBeVisible();
    expect(screen.getByText(/此运行时暂不支持确认或调整任务方案/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '确认并开始' }));
    fireEvent.click(screen.getByRole('button', { name: '调整方案' }));
    expect(screen.getByRole('button', { name: '确认并开始' })).toBeDisabled();
    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(props.onRequestRevision).not.toHaveBeenCalled();
  });

  it('keeps unsent adjustment text across a runtime capability change', () => {
    const props = callbacks();
    const proposal = make();
    const { rerender } = render(<OrchestrationPlanCard proposal={proposal} {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '调整方案' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '只处理本次范围' } });
    rerender(<OrchestrationPlanCard proposal={proposal} {...props} planSupport={undefined} />);
    expect(screen.getByRole('textbox')).toHaveValue('只处理本次范围');
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: '提交调整意见' })).toBeDisabled();
    rerender(<OrchestrationPlanCard proposal={proposal} {...props} />);
    expect(screen.getByRole('textbox')).toHaveValue('只处理本次范围');
    expect(screen.getByRole('button', { name: '提交调整意见' })).toBeEnabled();
  });
});

describe("orchestration plan draft interaction", () => {
  it("shows a draft and explicit actions without starting any work on mount", () => {
    const props = callbacks();
    render(<OrchestrationPlanCard proposal={make()} {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent("待确认");
    expect(screen.getByText("工作范围")).toBeVisible();
    expect(screen.getByText("验收标准")).toBeVisible();
    expect(screen.getByRole("button", { name: "确认并开始" })).toBeEnabled();
    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
  it("fences rapid confirmation clicks and waits for authoritative confirmation", async () => {
    const props = callbacks();
    render(<OrchestrationPlanCard proposal={make()} {...props} />);
    const button = screen.getByRole("button", { name: "确认并开始" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(props.onConfirm).toHaveBeenCalledOnce());
    expect(props.onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-a",
        proposalId: "plan-a",
        expectedRevision: 1,
        requestId: expect.any(String),
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("待确认");
    expect(screen.queryByText("方案已确认")).not.toBeInTheDocument();
  });
  it("opens an accessible feedback editor and does not treat its text as approval", async () => {
    const props = callbacks();
    render(<OrchestrationPlanCard proposal={make()} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "调整方案" }));
    const input = screen.getByRole("textbox", { name: "希望调整哪些内容？" });
    expect(input).toHaveFocus();
    expect(screen.getByRole("button", { name: "提交调整意见" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "先讨论验收范围" } });
    fireEvent.click(screen.getByRole("button", { name: "提交调整意见" }));
    await waitFor(() =>
      expect(props.onRequestRevision).toHaveBeenCalledWith(
        expect.objectContaining({
          feedback: "先讨论验收范围",
          expectedRevision: 1,
        }),
      ),
    );
    expect(props.onConfirm).not.toHaveBeenCalled();
  });
  it("keeps discussion separate from confirmation", () => {
    const props = callbacks();
    render(<OrchestrationPlanCard proposal={make()} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "继续讨论" }));
    expect(props.onDiscuss).toHaveBeenCalledWith({
      sessionId: "session-a",
      proposalId: "plan-a",
      expectedRevision: 1,
    });
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it("does not silently discard unsent revision feedback when confirming", () => {
    const props = callbacks();
    render(<OrchestrationPlanCard proposal={make()} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "调整方案" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "先补充验收标准" },
    });
    const confirm = screen.getByRole("button", { name: "确认并开始" });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(props.onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "取消调整" }));
    expect(confirm).toBeEnabled();
  });
  it("preserves feedback on transport failure and reuses the same idempotency key", async () => {
    const props = callbacks();
    props.onRequestRevision.mockRejectedValueOnce(new Error("network"));
    render(<OrchestrationPlanCard proposal={make()} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "调整方案" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "增加异常回归" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交调整意见" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "填写内容已保留",
    );
    expect(screen.getByRole("textbox")).toHaveValue("增加异常回归");
    fireEvent.click(screen.getByRole("button", { name: "提交调整意见" }));
    await waitFor(() =>
      expect(props.onRequestRevision).toHaveBeenCalledTimes(2),
    );
    expect(props.onRequestRevision.mock.calls[0]).toEqual(
      props.onRequestRevision.mock.calls[1],
    );
  });
  it("shows only the new draft version and its changes", () => {
    const plan = make();
    const props = callbacks();
    const { rerender } = render(
      <OrchestrationPlanCard proposal={plan} {...props} />,
    );
    const next = reviseSessionPlan(
      plan,
      { sessionId: plan.sessionId, proposalId: plan.id, expectedRevision: 1 },
      { ...plan.content, objective: "修复导出与异常回归" },
      ["增加异常回归"],
    );
    rerender(<OrchestrationPlanCard proposal={next} {...props} />);
    expect(screen.getByText("方案第 2 版")).toBeVisible();
    expect(screen.getByText("本次调整")).toBeVisible();
    expect(screen.queryByText("修复导出并验证结果")).not.toBeInTheDocument();
  });
  it("isolates a late failed response from a different Session", async () => {
    let reject: (error: Error) => void = () => {};
    const props = callbacks();
    props.onConfirm.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        }),
    );
    const { rerender } = render(
      <OrchestrationPlanCard proposal={make()} {...props} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "确认并开始" }));
    const another = { ...make(), sessionId: "session-b", id: "plan-b" };
    rerender(<OrchestrationPlanCard proposal={another} {...props} />);
    await act(async () => reject(new Error("old connection")));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认并开始" })).toBeEnabled();
  });
  it("renders a persisted chat confirmation as confirmed without another click", () => {
    const plan = confirmSessionPlan(
      make(),
      { sessionId: "session-a", proposalId: "plan-a", expectedRevision: 1 },
      {
        source: "user_message",
        evidenceId: "message-a",
        confirmedAt: "2026-10-22T01:00:00Z",
      },
    );
    render(
      <OrchestrationPlanCard
        proposal={JSON.parse(JSON.stringify(plan))}
        {...callbacks()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("方案已确认");
    expect(
      screen.getByText("本版方案已根据你在聊天中的明确确认保存，无需重复点击。执行状态以任务进度为准。"),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "确认并开始" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a recovered but unverified confirmation from looking approved", () => {
    render(
      <OrchestrationPlanCard
        proposal={{ ...make(), state: "confirmed" }}
        {...callbacks()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("确认记录待核实");
    expect(
      screen.queryByRole("button", { name: "确认并开始" }),
    ).not.toBeInTheDocument();
  });
});

describe('confirmation and execution start are separate facts', () => {
  const confirmed = () => confirmSessionPlan(make(), {sessionId:'session-a',proposalId:'plan-a',expectedRevision:1}, {source:'button',evidenceId:'human',confirmedAt:'2026-10-22T01:00:00Z'});
  it('shows pending and claimed start without asserting that execution has begun', () => {
    const base = {proposalId:'plan-a',revision:1,requestId:'request',queueId:'queue'};
    const {rerender}=render(<OrchestrationPlanCard proposal={confirmed()} startStatus={{...base,state:'pending'}} {...callbacks()}/>);
    expect(screen.getByText('启动请求已保存，正在等待执行通道处理。方案确认不代表任务已经开始。')).toBeVisible();
    rerender(<OrchestrationPlanCard proposal={confirmed()} startStatus={{...base,state:'claimed'}} {...callbacks()}/>);
    expect(screen.getByText('启动请求正在核对，请先查看会话与任务进度，暂不重复启动。')).toBeVisible();
  });
  it('explains recovery uncertainty without exposing error codes or replaying work', () => {
    const props=callbacks();
    render(<OrchestrationPlanCard proposal={confirmed()} startStatus={{proposalId:'plan-a',revision:1,requestId:'request',queueId:'queue',state:'claimed',error:'PLAN_START_RECOVERY_REQUIRES_REVIEW'}} {...props}/>);
    expect(screen.getByRole('alert')).toHaveTextContent('请先核对会话和已有结果');
    expect(screen.getByRole('alert')).toHaveTextContent('不会自动重播');
    expect(screen.queryByText('PLAN_START_RECOVERY_REQUIRES_REVIEW')).not.toBeInTheDocument();
    expect(props.onConfirm).not.toHaveBeenCalled();
  });
  it('does not attach an old start receipt to a different proposal revision', () => {
    render(<OrchestrationPlanCard proposal={confirmed()} startStatus={{proposalId:'plan-a',revision:0,requestId:'request',queueId:'queue',state:'claimed',error:'OLD'}} {...callbacks()}/>);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

it('keeps revision delivery failure separate from execution confirmation', () => {
  const proposal = { ...make(), state: 'revising' as const, feedback: '先缩小范围' };
  render(<OrchestrationPlanCard proposal={proposal} {...callbacks()} startStatus={{ proposalId: proposal.id, revision: 1, queueId: 'queue', requestId: 'request', purpose: 'revision', state: 'claimed', error: 'PRIVATE_TECHNICAL_ERROR' }} />);
  expect(screen.getByRole('alert')).toHaveTextContent('调整请求未能确认送达');
  expect(screen.queryByText('PRIVATE_TECHNICAL_ERROR')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '确认并开始' })).not.toBeInTheDocument();
  expect(screen.getByText('已提交调整意见：先缩小范围')).toBeVisible();
});

describe('confirmed plan execution feedback', () => {
  function snapshot(): SessionTaskLedger {
    const proposal = confirmSessionPlan(make(), { sessionId: 'session-a', proposalId: 'plan-a', expectedRevision: 1 }, { source: 'button', evidenceId: 'human', confirmedAt: '2026-10-23T00:00:00Z' });
    return { revision: 4, proposal, tasks: proposal.content.steps.map(step => ({ ...step, blockedBy: [], proposalId: proposal.id, proposalRevision: proposal.revision })), bindings: {}, attempts: [], reviews: [] };
  }
  it('replaces the stale start message with accepted progress and inspectable main evidence after reopen', () => {
    const state = snapshot();
    state.reviews = state.tasks.map(task => ({ taskId: task.id, attemptId: 'main', decision: 'accept', evidence: `已核对实际结果 ${task.id}` }));
    const restored = JSON.parse(JSON.stringify(state)) as SessionTaskLedger;
    render(<OrchestrationPlanCard proposal={restored.proposal!} tasks={projectSessionTasks(restored)} startStatus={{ proposalId: 'plan-a', revision: 1, requestId: 'request', queueId: 'queue', state: 'dispatched' }} {...callbacks()} />);
    expect(screen.getByRole('heading', { name: '执行计划' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('已完成 · 验收通过');
    expect(screen.getByText('已验收 2/2 步骤')).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '2');
    expect(screen.queryByText('计划草案')).not.toBeInTheDocument();
    expect(screen.queryByText(/启动请求已交给会话执行通道/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('步骤进度与验收依据'));
    expect(screen.getByText('已核对实际结果 inspect')).toBeVisible();
    expect(screen.getByText('已核对实际结果 repair')).toBeVisible();
  });
  it('updates from running to returned to accepted without asking for confirmation again', () => {
    const state = snapshot();
    state.tasks = [state.tasks[0]];
    state.proposal!.content.steps = [state.proposal!.content.steps[0]];
    state.bindings.child = 'inspect';
    state.attempts = [{ id: 'child:1', toolUseId: 'child', title: '检查接口', executionVerified: true, lifecycle: { status: 'running', startedAt: 1 } }];
    const props = callbacks();
    const onInspect = vi.fn();
    const view = () => <OrchestrationPlanCard proposal={state.proposal!} tasks={projectSessionTasks(state)} onInspect={onInspect} {...props} />;
    const { rerender } = render(view());
    expect(screen.getByRole('status')).toHaveTextContent('执行中');
    state.attempts[0].lifecycle = { status: 'completed', startedAt: 1, result: '实际检查结果' };
    rerender(view());
    expect(screen.getByRole('status')).toHaveTextContent('待主 Agent 验收');
    expect(screen.getByText('已验收 0/1 步骤')).toBeVisible();
    fireEvent.click(screen.getByText('步骤进度与验收依据'));
    expect(screen.getByText('实际检查结果')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '查看执行记录' }));
    expect(onInspect).toHaveBeenCalledWith('child');
    state.reviews = [{ taskId: 'inspect', attemptId: 'child:1', decision: 'accept', evidence: '核对实际接口通过' }];
    rerender(view());
    expect(screen.getByRole('status')).toHaveTextContent('已完成 · 验收通过');
    expect(screen.getByText('核对实际接口通过')).toBeVisible();
    expect(props.onConfirm).not.toHaveBeenCalled();
  });
  it('keeps accepted evidence through a disconnect, refreshes read-only and restores the final state', () => {
    const state = snapshot();
    state.reviews = state.tasks.map(task => ({ taskId: task.id, attemptId: 'main', decision: 'accept', evidence: `验收 ${task.id}` }));
    const onRefresh = vi.fn();
    const props = { proposal: state.proposal!, tasks: projectSessionTasks(state), onRefresh, ...callbacks() };
    const { rerender } = render(<OrchestrationPlanCard {...props} stale />);
    expect(screen.getByRole('status')).toHaveTextContent('同步待恢复');
    expect(screen.getByText('已验收 2/2 步骤')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '重新同步' }));
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(props.onConfirm).not.toHaveBeenCalled();
    rerender(<OrchestrationPlanCard {...props} />);
    expect(screen.getByRole('status')).toHaveTextContent('已完成 · 验收通过');
  });
  it('does not display old version evidence or completion on the current version', () => {
    const state = snapshot();
    state.tasks.forEach(task => { task.proposalRevision = 0; });
    state.reviews = state.tasks.map(task => ({ taskId: task.id, attemptId: 'main', decision: 'accept', evidence: 'OLD_VERSION_EVIDENCE' }));
    render(<OrchestrationPlanCard proposal={state.proposal!} tasks={projectSessionTasks(state)} {...callbacks()} />);
    fireEvent.click(screen.getByText('步骤进度与验收依据'));
    expect(screen.getByText('已验收 0/2 步骤')).toBeVisible();
    expect(screen.queryByText('OLD_VERSION_EVIDENCE')).not.toBeInTheDocument();
  });
  it('keeps reused-handle history separate from the current execution record', () => {
    const state = snapshot();
    state.bindings.child = 'inspect';
    state.attempts = [
      { id: 'child:1', toolUseId: 'child', title: '检查接口', executionVerified: true, lifecycle: { status: 'completed', startedAt: 1, result: '上次检查结果' } },
      { id: 'child:2', toolUseId: 'child', title: '检查接口', executionVerified: true, lifecycle: { status: 'running', startedAt: 2 } },
    ];
    state.reviews = [{ taskId: 'inspect', attemptId: 'child:1', decision: 'accept', evidence: '上次验收' }];
    const onInspect = vi.fn();
    render(<OrchestrationPlanCard proposal={state.proposal!} tasks={projectSessionTasks(state)} onInspect={onInspect} {...callbacks()} />);
    fireEvent.click(screen.getByText('步骤进度与验收依据'));
    expect(screen.getByText('已验收 0/2 步骤')).toBeVisible();
    expect(screen.getByText('上次检查结果')).toBeVisible();
    expect(screen.queryByText('上次验收')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '查看执行记录' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '查看执行记录' }));
    expect(onInspect).toHaveBeenCalledWith('child');
  });
});
