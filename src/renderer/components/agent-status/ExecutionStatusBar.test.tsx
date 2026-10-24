import { act, fireEvent, screen, within, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithTheme as render } from "@/test/renderWithTheme";
import { i18n } from "@/i18n";
import type { Message, AgentStatusTodoSnapshot } from "@/types/chat";
import type { SessionGoal } from "@/types/sessionGoal";
import {
  clearAllBackgroundTaskStatuses,
  registerBackgroundTask,
} from "@/utils/backgroundTaskStatus";
import ExecutionStatusBar from "./ExecutionStatusBar";
import { emptyTaskLedger, materializeExecutionTodos, mergeTaskObservations } from "../../../shared/sessionTaskOrchestration";

const tab = vi.hoisted(() => ({
  messages: [] as Message[],
  agentPlanTodos: [] as AgentStatusTodoSnapshot[],
  sessionId: "s1",
  sessionState: "running",
  isSessionLoading: false,
  streamingMessage: null,
  hasMoreBefore: false,
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  loadOlderMessages: vi.fn(),
}));
vi.mock("@/context/TabContext", () => ({ useTabStateOptional: () => tab }));
const goal: SessionGoal = {
  id: "g1",
  workspacePath: "/synthetic",
  sessionId: "s1",
  objective: "完整目标只在详情中显示",
  status: "active",
  endConditions: { aiCanExit: true },
  notifyEnabled: false,
  permissionMode: "",
  turnCount: 1,
  createdAt: "",
  updatedAt: "",
  totalDurationMs: 125000,
  totalTokens: 12000,
  revision: 1,
  controlRevision: 1,
  isExecuting: true,
};
const activity = {
  containerRef: { current: null },
  onJumpToTool: vi.fn(),
  onSelectSubagent: vi.fn(),
};
function agentMessage(): Message {
  return {
    id: "a",
    role: "assistant",
    timestamp: new Date(1000),
    content: [
      {
        id: "b",
        type: "tool_use",
        tool: {
          id: "child",
          name: "Agent",
          input: {},
          streamIndex: 0,
          parsedInput: { description: "独立审阅" },
          result: "已回传",
          subagentLifecycle: {
            status: "completed",
            startedAt: 1000,
            finishedAt: 2000,
          },
        },
      },
    ],
  };
}
beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
  clearAllBackgroundTaskStatuses();
  vi.clearAllMocks();
  const logResponse = {
    success: true,
    task: {
      taskId: "shell-bg",
      toolUseId: "shell-tool",
      status: "running",
      output: "日志已连接",
      outputState: "ready",
      truncated: false,
      totalBytes: 15,
      updatedAt: 1000,
    },
  };
  tab.apiGet.mockImplementation((path: string) => Promise.resolve(path.includes("task-orchestration")
    ? { success: true, sessionId: tab.sessionId, ledger: { ...emptyTaskLedger(), plan: tab.agentPlanTodos } } : logResponse));
  tab.sessionState = "running";
  tab.messages = [agentMessage()];
  tab.sessionId = "s1";
  tab.isSessionLoading = false;
  tab.hasMoreBefore = false;
  tab.agentPlanTodos = [
    { key: "done", content: "已完成工作", activeForm: "", status: "completed" },
    {
      key: "doing",
      content: "当前工作",
      activeForm: "正在验证",
      status: "in_progress",
    },
  ];
});

describe("unified execution status", () => {
  it("shows precreated steps before any tool message and synchronizes native progress without a confirmation card", async () => {
    const ledger = emptyTaskLedger();
    ledger.executionAdmission = { requestId: "human", queueId: "queue", taskPlanId: "plan" };
    materializeExecutionTodos(ledger, "plan", ["核对资料", "完成修改", "验证结果"]);
    tab.messages = [];
    tab.agentPlanTodos = [];
    tab.apiGet.mockResolvedValue({ success: true, sessionId: tab.sessionId, ledger });
    render(<ExecutionStatusBar activity={activity} />);
    const trigger = await screen.findByRole("button", { name: /任务编排 0\/3/ });
    fireEvent.click(trigger);
    expect(screen.getByText("核对资料")).toBeInTheDocument();
    expect(screen.getByText("完成修改")).toBeInTheDocument();
    expect(screen.getByText("验证结果")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /确认方案|确认执行/ })).not.toBeInTheDocument();
    const updated = mergeTaskObservations(ledger, [], ledger.plan!.map((todo, index) => ({ ...todo, status: index === 0 ? "completed" : index === 1 ? "in_progress" : "pending" })), "queue");
    act(() => window.dispatchEvent(new CustomEvent("session-task-orchestration", { detail: { sessionId: tab.sessionId, ledger: updated } })));
    expect(await screen.findByRole("button", { name: /任务编排 0\/3.*待验收 1/ })).toBeInTheDocument();
    expect(tab.apiPost).not.toHaveBeenCalled();
  });
  it("starts collapsed with all three summaries and one external pause", () => {
    const pause = vi.fn();
    const { container } = render(
      <ExecutionStatusBar
        goal={goal}
        activity={activity}
        isExecuting
        onPause={pause}
      />,
    );
    expect(container.querySelectorAll("[data-execution-status]")).toHaveLength(
      1,
    );
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.queryByText(goal.objective)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /任务编排 0\/3/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(
      screen.getByRole("button", { name: /任务编排.*待验收 2/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/运行中 0|异常 0/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "暂停" }));
    expect(pause).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
  it("switches one detail region, retains pause, expands completed todos and restores focus on Escape", () => {
    render(
      <ExecutionStatusBar
        goal={goal}
        activity={activity}
        isExecuting
        onPause={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /目标执行中/ }));
    expect(screen.getByText(goal.objective)).toBeInTheDocument();
    const todos = screen.getByRole("button", { name: /任务编排 0\/3/ });
    fireEvent.click(todos);
    expect(
      screen.getAllByRole("region", { name: /目标详情|任务编排详情|协作详情/ }),
    ).toHaveLength(1);
    expect(screen.queryByText(goal.objective)).not.toBeInTheDocument();
    expect(screen.getByText("正在验证")).toBeInTheDocument();
    expect(screen.getAllByText("待验收")).toHaveLength(2);
    expect(screen.getByText("已完成工作")).toBeInTheDocument();
    fireEvent.keyDown(
      screen.getByRole("region", { name: /目标详情|任务编排详情|协作详情/ }),
      { key: "Escape", isComposing: true },
    );
    expect(
      screen.getByRole("region", { name: /目标详情|任务编排详情|协作详情/ }),
    ).toBeInTheDocument();
    fireEvent.keyDown(
      screen.getByRole("region", { name: /目标详情|任务编排详情|协作详情/ }),
      { key: "Escape" },
    );
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(todos).toHaveFocus();
  });
  it("opens the original subagent inspector callback through the shared panel", () => {
    render(<ExecutionStatusBar goal={goal} activity={activity} />);
    fireEvent.click(screen.getByRole("button", { name: /任务编排.*待验收 2/ }));
    fireEvent.click(screen.getByText("执行记录（1 次）"));
    fireEvent.click(screen.getByRole("button", { name: /1\. 独立审阅/ }));
    expect(activity.onSelectSubagent).toHaveBeenCalledWith("child");
    fireEvent.keyDown(
      screen.getByRole("region", { name: /目标详情|任务编排详情|协作详情/ }),
      { key: "Escape" },
    );
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
  it("keeps history loading and error recovery available", async () => {
    tab.messages = [
      { id: "u", role: "user", content: "下一轮", timestamp: new Date() },
    ];
    tab.hasMoreBefore = true;
    tab.loadOlderMessages.mockRejectedValue(new Error("offline"));
    render(<ExecutionStatusBar activity={activity} />);
    fireEvent.click(screen.getByRole("button", { name: /任务编排/ }));
    fireEvent.click(screen.getByRole("button", { name: "查看全部执行记录" }));
    fireEvent.click(screen.getByRole("button", { name: /整个会话/ }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "载入更早记录" })),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("载入失败");
    expect(tab.loadOlderMessages).toHaveBeenCalledTimes(1);
  });
  it("routes edit and cancel only from the shared overflow menu", () => {
    const edit = vi.fn(),
      cancel = vi.fn();
    render(<ExecutionStatusBar goal={goal} onEdit={edit} onCancel={cancel} />);
    expect(
      screen.queryByRole("button", { name: "取消目标" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle("更多操作"));
    fireEvent.click(screen.getByText("编辑目标"));
    expect(edit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTitle("更多操作"));
    fireEvent.click(screen.getByText("取消目标"));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("shows external resume only for paused goals and settled totals only in goal details", () => {
    const resume = vi.fn();
    const { rerender } = render(
      <ExecutionStatusBar
        goal={{ ...goal, status: "paused" }}
        onResume={resume}
        onPause={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "暂停" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "继续" }));
    expect(resume).toHaveBeenCalledTimes(1);
    rerender(<ExecutionStatusBar goal={{ ...goal, status: "complete" }} />);
    fireEvent.click(screen.getByRole("button", { name: /目标已完成/ }));
    expect(
      within(
        screen.getByRole("region", { name: /目标详情|任务编排详情|协作详情/ }),
      ).getByText(/12.0K tokens/),
    ).toBeInTheDocument();
  });
  it("does not leak disclosure or dialog into another session or invent an empty bar", () => {
    const { rerender } = render(
      <ExecutionStatusBar goal={goal} activity={activity} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /任务编排/ }));
    tab.sessionId = "s2";
    rerender(<ExecutionStatusBar goal={goal} activity={activity} />);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    tab.messages = [];
    tab.agentPlanTodos = [];
    rerender(<ExecutionStatusBar activity={activity} />);
    expect(screen.queryByLabelText("执行状态")).not.toBeInTheDocument();
  });
  it("keeps local background task logs reachable without a transcript tool card", async () => {
    tab.messages = [];
    tab.agentPlanTodos = [];
    registerBackgroundTask(
      "shell-bg",
      "shell-tool",
      { description: "本地检查", taskType: "local_bash" },
      "s1",
    );
    render(<ExecutionStatusBar activity={activity} />);
    fireEvent.click(screen.getByRole("button", { name: /任务编排/ }));
    fireEvent.click(screen.getByRole("button", { name: "查看全部执行记录" }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /本地检查/ })),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByText("日志已连接")).toBeInTheDocument();
    expect(tab.apiGet).toHaveBeenCalled();
  });
  it("retains returned native plan entries awaiting explicit acceptance after remount", () => {
    tab.messages = [];
    tab.sessionState = "idle";
    tab.agentPlanTodos = tab.agentPlanTodos.map((todo) => ({
      ...todo,
      status: "completed",
    }));
    const { container } = render(<ExecutionStatusBar activity={activity} />);
    expect(container.querySelector("[data-execution-status]")).not.toBeNull();
    expect(screen.getByRole("button", { name: /待验收 2/ })).toBeInTheDocument();
  });
  it("closes with Escape while focus is still on the summary trigger", () => {
    render(<ExecutionStatusBar goal={goal} />);
    const trigger = screen.getByRole("button", { name: /目标模式运行中/ });
    fireEvent.click(trigger);
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it("keeps a goal-only entry when a runtime has no activity projection", () => {
    render(<ExecutionStatusBar goal={goal} />);
    expect(
      screen.getByRole("button", { name: /目标模式运行中/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /任务编排|子 Agent/ }),
    ).not.toBeInTheDocument();
  });

  it("shows session execution even when no Goal, todos or subagents exist", async () => {
    tab.messages = [];
    tab.agentPlanTodos = [];
    tab.sessionState = "idle";
    const execution = {
      id: "execution-only",
      requestId: "request-only",
      originalInput: "修复导出",
      intent: {
        kind: "execute",
        objective: "修复并核验导出",
        scope: "导出功能",
        acceptanceCriteria: ["文件字段齐全"],
},
      phase: "running",
      startedAt: 10,
      deadlineAt: 1_800_010,
      turns: 1,
      reworks: 0,
      noProgress: 0,
      currentQueueId: "q1",
    };
    tab.apiGet.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes("task-orchestration")
          ? {
              success: true,
              sessionId: tab.sessionId,
              ledger: { ...emptyTaskLedger(), execution },
            }
          : { success: true },
      ),
    );
    render(<ExecutionStatusBar />);
    expect(await screen.findByText("修复并核验导出")).toBeInTheDocument();
    expect(screen.getByText("运行中")).toBeInTheDocument();
    expect(screen.queryByText(/任务编排/)).not.toBeInTheDocument();
    expect(screen.queryByText(/目标模式/)).not.toBeInTheDocument();
  });

  it("does not project a prior completed execution under a newer unconfirmed request", async () => {
    tab.messages = [];
    tab.agentPlanTodos = [];
    tab.sessionState = "idle";
    const prior = {
      id: "old-execution",
      requestId: "old-request",
      originalInput: "旧请求",
      intent: {
        kind: "execute",
        objective: "旧请求已完成的目标",
        scope: "旧范围",
        acceptanceCriteria: ["旧条件"],
      },
      phase: "completed",
      startedAt: 10,
      deadlineAt: 1_800_010,
      turns: 2,
      reworks: 0,
      noProgress: 0,
      currentQueueId: "old-q",
      assessment: {
        decision: "accept",
        summary: "旧请求已完成",
        checks: [{ criterion: 0, toolUseIds: ["old-tool"] }],
      },
    };
    tab.apiGet.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes("task-orchestration")
          ? {
              success: true,
              sessionId: tab.sessionId,
              ledger: {
                ...emptyTaskLedger(),
                execution: prior,
                executionAdmission: {
                  requestId: "new-request",
                  queueId: "new-q",
                  error: "INTENT_UNCONFIRMED",
                },
              },
            }
          : { success: true },
      ),
    );
    render(<ExecutionStatusBar />);
    expect(
      await screen.findByText("执行意图未确认 · 自动续跑未启用"),
    ).toBeInTheDocument();
    expect(screen.queryByText("已完成")).not.toBeInTheDocument();
    expect(screen.queryByText("旧请求已完成的目标")).not.toBeInTheDocument();
  });
});

function planOnly() {
  tab.messages=[];tab.agentPlanTodos=[];tab.sessionState='idle';
  const proposal={id:'proposal-1',sessionId:'s1',revision:1,policyVersion:'1',state:'awaiting_confirmation' as const,content:{objective:'先确认范围后修复导出',scope:'仅修改导出与必要回归',steps:[{id:'inspect',title:'核查接口'}],acceptanceCriteria:['核对结果']},changes:[]};
  tab.apiGet.mockResolvedValue({success:true,planSupport:{supported:true,runtime:'builtin'},sessionId:'s1',ledger:{...emptyTaskLedger(),revision:1,proposal}});
  return proposal;
}
describe('plan confirmation in the actual execution status composition',()=>{
  it('shows a draft when formal tasks and agents do not exist; discussion delegates a draft without posting',async()=>{
    planOnly();const discuss=vi.fn();
    render(<ExecutionStatusBar activity={{...activity,onDiscussPlan:discuss}}/>);
    await screen.findByRole('button',{name:'确认并开始'});
    expect(screen.queryByRole('button',{name:/任务编排 0/})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'继续讨论'}));
    expect(discuss).toHaveBeenCalledWith({sessionId:'s1',proposalId:'proposal-1',expectedRevision:1},expect.stringContaining('先确认范围后修复导出'));
    expect(tab.apiPost).not.toHaveBeenCalled();
  });
  it('renders confirmed only from an authoritative receipt and collapses the confirmed plan',async()=>{
    const proposal=planOnly();
    tab.apiPost.mockResolvedValue({success:true,planSupport:{supported:true,runtime:'builtin'},sessionId:'s1',ledger:{...emptyTaskLedger(),revision:2,proposal:{...proposal,state:'confirmed',confirmation:{source:'button',revision:1,evidenceId:'user-click',confirmedAt:'2026-10-22T01:00:00Z'}}}});
    render(<ExecutionStatusBar activity={activity}/>);
    fireEvent.click(await screen.findByRole('button',{name:'确认并开始'}));
    await screen.findByText('方案已确认');
    expect(screen.queryByRole('button',{name:'确认并开始'})).not.toBeInTheDocument();
    expect(screen.getByText('工作范围')).not.toBeVisible();
  });
  it('keeps a rejected POST retryable with the same requestId and preserves the proposal',async()=>{
    planOnly();tab.apiPost.mockRejectedValue(new Error('offline'));
    render(<ExecutionStatusBar activity={activity}/>);
    fireEvent.click(await screen.findByRole('button',{name:'确认并开始'}));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button',{name:'确认并开始'}));
    await waitFor(()=>expect(tab.apiPost).toHaveBeenCalledTimes(2));
    expect(tab.apiPost.mock.calls[0][1].requestId).toBe(tab.apiPost.mock.calls[1][1].requestId);
    expect(screen.queryByText('方案已确认')).not.toBeInTheDocument();
  });
  it('posts requested revision feedback and keeps it visibly awaiting a new proposal',async()=>{
    const proposal=planOnly();tab.apiPost.mockResolvedValue({success:true,planSupport:{supported:true,runtime:'builtin'},sessionId:'s1',ledger:{...emptyTaskLedger(),revision:2,proposal:{...proposal,state:'revising',feedback:'仅先排查'}}});
    render(<ExecutionStatusBar activity={activity}/>);
    fireEvent.click(await screen.findByRole('button',{name:'调整方案'}));
    fireEvent.change(screen.getByRole('textbox',{name:'希望调整哪些内容？'}),{target:{value:'仅先排查'}});
    fireEvent.click(screen.getByRole('button',{name:'提交调整意见'}));
    await screen.findByText('调整中 · 待重新确认');
    expect(tab.apiPost).toHaveBeenCalledWith('/api/session/task-orchestration/plan',expect.objectContaining({kind:'request_revision',feedback:'仅先排查'}));
  });
});
