import { act, fireEvent, screen, within } from "@testing-library/react";
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

const tab = vi.hoisted(() => ({
  messages: [] as Message[],
  agentPlanTodos: [] as AgentStatusTodoSnapshot[],
  sessionId: "s1",
  sessionState: "running",
  isSessionLoading: false,
  streamingMessage: null,
  hasMoreBefore: false,
  apiGet: vi.fn(),
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
  tab.apiGet.mockResolvedValue({
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
  });
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
    expect(screen.getByRole("button", { name: /待办 1\/2/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(
      screen.getByRole("button", { name: /子 Agent.*已回传 1/ }),
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
    const todos = screen.getByRole("button", { name: /待办 1\/2/ });
    fireEvent.click(todos);
    expect(
      screen.getAllByRole("region", { name: /目标详情|待办详情|协作详情/ }),
    ).toHaveLength(1);
    expect(screen.queryByText(goal.objective)).not.toBeInTheDocument();
    expect(screen.getByText("正在验证")).toBeInTheDocument();
    expect(screen.queryByText("已完成工作")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "已完成 1 项" }));
    expect(screen.getByText("已完成工作")).toBeInTheDocument();
    fireEvent.keyDown(
      screen.getByRole("region", { name: /目标详情|待办详情|协作详情/ }),
      { key: "Escape", isComposing: true },
    );
    expect(
      screen.getByRole("region", { name: /目标详情|待办详情|协作详情/ }),
    ).toBeInTheDocument();
    fireEvent.keyDown(
      screen.getByRole("region", { name: /目标详情|待办详情|协作详情/ }),
      { key: "Escape" },
    );
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(todos).toHaveFocus();
  });
  it("opens the original subagent inspector callback through the shared panel", () => {
    render(<ExecutionStatusBar goal={goal} activity={activity} />);
    fireEvent.click(screen.getByRole("button", { name: /子 Agent.*已回传 1/ }));
    fireEvent.click(screen.getByRole("button", { name: /独立审阅/ }));
    expect(activity.onSelectSubagent).toHaveBeenCalledWith("child");
    fireEvent.keyDown(
      screen.getByRole("region", { name: /目标详情|待办详情|协作详情/ }),
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
    fireEvent.click(screen.getByRole("button", { name: /子 Agent/ }));
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
        screen.getByRole("region", { name: /目标详情|待办详情|协作详情/ }),
      ).getByText(/12.0K tokens/),
    ).toBeInTheDocument();
  });
  it("does not leak disclosure or dialog into another session or invent an empty bar", () => {
    const { rerender } = render(
      <ExecutionStatusBar goal={goal} activity={activity} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /待办/ }));
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
    fireEvent.click(screen.getByRole("button", { name: /子 Agent.*运行中 1/ }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /本地检查/ })),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByText("日志已连接")).toBeInTheDocument();
    expect(tab.apiGet).toHaveBeenCalled();
  });
  it("keeps completed-only idle history hidden after remount", () => {
    tab.messages = [];
    tab.sessionState = "idle";
    tab.agentPlanTodos = tab.agentPlanTodos.map((todo) => ({
      ...todo,
      status: "completed",
    }));
    const { container } = render(<ExecutionStatusBar activity={activity} />);
    expect(container.querySelector("[data-execution-status]")).toBeNull();
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
      screen.queryByRole("button", { name: /待办|子 Agent/ }),
    ).not.toBeInTheDocument();
  });
});
