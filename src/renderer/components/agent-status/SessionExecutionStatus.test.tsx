import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { renderWithTheme as render } from "@/test/renderWithTheme";
import { i18n } from "@/i18n";
import type { SessionExecution } from "../../../shared/sessionExecution";
import SessionExecutionStatus from "./SessionExecutionStatus";

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
  it("shows current execution with its objective, phase and bounded round", () => {
    render(<SessionExecutionStatus execution={base} />);
    expect(screen.getByText("运行中")).toBeInTheDocument();
    expect(screen.getByText("整理并核验导出流程")).toBeInTheDocument();
    expect(screen.getByText("第 2/8 轮")).toBeInTheDocument();
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
    expect(
      screen.getByText("执行意图未确认 · 自动续跑未启用"),
    ).toBeInTheDocument();
    expect(screen.queryByText("已完成")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/不会自动续跑/)).toBeInTheDocument();
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
    expect(
      screen.getByText("执行意图未确认 · 自动续跑未启用"),
    ).toBeInTheDocument();
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
    expect(screen.getByText("执行状态暂不可确认")).toBeInTheDocument();
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
    expect(screen.getAllByText(objective)).toHaveLength(2);
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

  it("does not render when there is no execution or admission failure", () => {
    const { container } = render(<SessionExecutionStatus />);
    expect(container.firstChild).toBeNull();
  });
});
