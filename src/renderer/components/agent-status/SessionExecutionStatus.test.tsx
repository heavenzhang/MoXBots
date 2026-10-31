import { useState } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { renderWithTheme as render } from "@/test/renderWithTheme";
import { i18n } from "@/i18n";
import type { SessionExecution } from "../../../shared/sessionExecution";
import type { SessionExecutionRecoveryProjection } from "../../../shared/sessionTaskOrchestration";
import SessionExecutionDetails, {
  useSessionExecutionPresentation,
  type SessionExecutionStatusProps,
} from "./SessionExecutionStatus";

// Exercise the shared presentation and details under an explicit disclosure owner.
function SessionExecutionStatus(props: SessionExecutionStatusProps) {
  const [open, setOpen] = useState(false);
  const presentation = useSessionExecutionPresentation(props);
  if (!presentation) return null;
  return (
    <>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {presentation.primaryStatus}
      </button>
      {open && <SessionExecutionDetails {...props} />}
    </>
  );
}

const base: SessionExecution = {
  id: "execution-1",
  requestId: "request-1",
  originalInput: "请执行任务",
  intent: {
    kind: "execute",
    objective: "整理并核验导出流程",
    scope: "仅导出模块",
    acceptanceCriteria: ["导出结果包含完整字段", "失败时保留用户输入"],
  },
  phase: "running",
  startedAt: 100,
  deadlineAt: 1_800_100,
  turns: 2,
  reworks: 0,
  noProgress: 0,
  currentQueueId: "queue-2",
};

beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
});

describe("SessionExecutionStatus", () => {
  it("shows current execution without implying a fixed turn limit", () => {
    render(<SessionExecutionStatus execution={base} />);
    expect(screen.getByText("运行中")).toBeInTheDocument();
    expect(screen.queryByText("整理并核验导出流程")).not.toBeInTheDocument();
    expect(screen.queryByText(/\/8/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("执行轮数：2")).toBeInTheDocument();
  });

  it("updates the visible phase when the authoritative projection changes", () => {
    const { rerender } = render(<SessionExecutionStatus execution={base} />);
    expect(screen.getByText("运行中")).toBeInTheDocument();
    rerender(
      <SessionExecutionStatus
        execution={{ ...base, phase: "awaiting_review" }}
      />,
    );
    expect(screen.getByText("待验收")).toBeInTheDocument();
  });

  it("shows classification failure as unconfirmed and never as completed", () => {
    render(
      <SessionExecutionStatus
        admission={{
          requestId: "r",
          queueId: "q",
          error: "INTENT_UNCONFIRMED",
        }}
      />,
    );
    expect(screen.getByText("执行未确认")).toBeInTheDocument();
    expect(screen.queryByText("已完成")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/不会自动续跑/)).toBeInTheDocument();
  });

  it('shows the bounded timeout reason while keeping execution unconfirmed', () => {
    render(<SessionExecutionStatus admission={{ requestId: 'r', queueId: 'q',
      error: 'INTENT_UNCONFIRMED', failureReason: 'timeout' }} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/识别请求超时/)).toBeInTheDocument();
    expect(screen.getByText('执行未确认')).toBeInTheDocument();
    expect(screen.queryByText('已完成')).not.toBeInTheDocument();
  });

  it("keeps a classification failure visible beside an earlier execution", () => {
    render(
      <SessionExecutionStatus
        execution={base}
        admission={{
          requestId: base.requestId,
          queueId: "q2",
          error: "INTENT_UNCONFIRMED",
        }}
      />,
    );
    expect(screen.getByText("运行中")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/不会自动续跑/)).toBeInTheDocument();
  });

  it("hides a completed execution when the admission belongs to a newer request", () => {
    const previous = {
      ...base,
      phase: "completed" as const,
      assessment: {
        decision: "accept" as const,
        summary: "旧请求已完成",
        checks: [
          { criterion: 0, toolUseIds: ["tool-1"] },
          { criterion: 1, toolUseIds: ["tool-2"] },
        ],
      },
    };
    render(
      <SessionExecutionStatus
        execution={previous}
        admission={{
          requestId: "new-request",
          queueId: "new-queue",
          error: "INTENT_UNCONFIRMED",
        }}
      />,
    );
    expect(screen.getByText("执行未确认")).toBeInTheDocument();
    expect(screen.queryByText("已完成")).not.toBeInTheDocument();
    expect(screen.queryByText("整理并核验导出流程")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByText("旧请求已完成")).not.toBeInTheDocument();
    expect(screen.queryByText("已证明覆盖 2/2 项")).not.toBeInTheDocument();
  });

  it("marks a stale or loading projection unknown and withholds old completion claims", () => {
    render(
      <SessionExecutionStatus
        execution={{
          ...base,
          phase: "completed",
          assessment: {
            decision: "accept",
            summary: "已验收",
            checks: [
              { criterion: 0, toolUseIds: ["tool-1"] },
              { criterion: 1, toolUseIds: ["tool-2"] },
            ],
          },
        }}
        unknown
      />,
    );
    expect(screen.getByText("状态待同步")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/暂不显示验收结论/)).toBeInTheDocument();
    expect(screen.queryByText("已证明覆盖 2/2 项")).not.toBeInTheDocument();
  });

  it("keeps long objectives readable and contained in the detail view", () => {
    const objective = "导出数据并核对字段完整性。".repeat(70);
    render(
      <SessionExecutionStatus
        execution={{ ...base, intent: { ...base.intent, objective } }}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getAllByText(objective)).toHaveLength(1);
    expect(
      screen
        .getAllByText(objective)
        .some((element) => element.classList.contains("break-words")),
    ).toBe(true);
  });

  it("counts proven coverage only after the execution reaches completed", () => {
    const accepted = {
      ...base,
      phase: "completed" as const,
      assessment: {
        decision: "accept" as const,
        summary: "验收完成",
        checks: [{ criterion: 0, toolUseIds: ["tool-1"] }],
      },
    };
    const { rerender } = render(
      <SessionExecutionStatus execution={accepted} />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("已证明覆盖 1/2 项")).toBeInTheDocument();
    expect(
      screen.getByText("导出结果包含完整字段 · 已验证"),
    ).toBeInTheDocument();
    expect(screen.getByText("失败时保留用户输入")).toBeInTheDocument();
    rerender(
      <SessionExecutionStatus
        execution={{ ...accepted, phase: "incomplete" }}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("已证明覆盖 0/2 项")).toBeInTheDocument();
    expect(
      screen.queryByText("导出结果包含完整字段 · 已验证"),
    ).not.toBeInTheDocument();
  });

  it("renders execution reasons as readable feedback without exposing raw technical codes", () => {
    render(
      <SessionExecutionStatus
        execution={{ ...base, phase: "paused", reason: "stopped" }}
      />,
    );
    expect(screen.getByText("已暂停")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("本轮执行已停止")).toBeInTheDocument();
    expect(screen.queryByText("stopped")).not.toBeInTheDocument();
  });

  it("uses a generic localized explanation for an unknown backend reason", () => {
    render(
      <SessionExecutionStatus
        execution={{
          ...base,
          phase: "paused",
          reason: "PRIVATE_INTERNAL_REASON",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(
      screen.getByText("当前执行遇到阻碍，详情尚未确认"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("PRIVATE_INTERNAL_REASON"),
    ).not.toBeInTheDocument();
  });

  it("shows model recovery only for the execution's current queue", () => {
    const recovery: SessionExecutionRecoveryProjection = {
      turnId: base.currentQueueId,
      status: "waiting",
      attempt: 2,
      lastStatus: 503,
      nextRetryAt: 200,
    };
    const { rerender } = render(
      <SessionExecutionStatus execution={base} recovery={recovery} />,
    );
    expect(screen.getByRole("button").textContent).toContain("等待模型恢复");
    expect(screen.queryByText("运行中")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(
      screen.getByText("模型正在恢复，已尝试 2 次；预计稍后自动重试"),
    ).toBeInTheDocument();
    rerender(
      <SessionExecutionStatus
        execution={base}
        recovery={{ ...recovery, turnId: "older-queue" }}
      />,
    );
    expect(screen.getByText("运行中")).toBeInTheDocument();
    expect(screen.queryByText(/模型正在恢复/)).not.toBeInTheDocument();
  });

  it("uses paused recovery as the primary state, without a running badge", () => {
    const recovery: SessionExecutionRecoveryProjection = {
      turnId: base.currentQueueId,
      status: "paused",
      attempt: 3,
      lastStatus: 503,
      nextRetryAt: 200,
    };
    render(<SessionExecutionStatus execution={base} recovery={recovery} />);
    expect(screen.getByRole("button").textContent).toContain("模型恢复已暂停");
    expect(screen.queryByText("运行中")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(
      screen.getByText("模型自动恢复已暂停（已尝试 3 次）"),
    ).toBeInTheDocument();
  });

  it.each(["paused", "completed", "incomplete"] as const)(
    "does not let model recovery override terminal or paused %s state",
    (phase) => {
      const recovery: SessionExecutionRecoveryProjection = {
        turnId: base.currentQueueId,
        status: "paused",
        attempt: 3,
        lastStatus: 503,
        nextRetryAt: 200,
      };
      render(
        <SessionExecutionStatus
          execution={{ ...base, phase }}
          recovery={recovery}
        />,
      );
      const statusLabel =
        phase === "paused"
          ? "已暂停"
          : phase === "completed"
            ? "已完成"
            : "未完成";
      expect(screen.getByRole("button").textContent).toContain(statusLabel);
      expect(screen.queryByText("模型恢复已暂停")).not.toBeInTheDocument();
      expect(screen.queryByText(/模型自动恢复已暂停/)).not.toBeInTheDocument();
    },
  );

  it("does not render when there is no execution or admission failure", () => {
    const { container } = render(<SessionExecutionStatus />);
    expect(container.firstChild).toBeNull();
  });
});
