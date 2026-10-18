import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";
import { i18n } from "@/i18n";
import { ThemeRuntimeProvider } from "@/theme";
import AgentStatusPanel from "@/components/agent-status/AgentStatusPanel";
import GoalStatusBar from "@/components/goal/GoalStatusBar";
import type { SessionGoal } from "@/types/sessionGoal";
import { FixtureContext, todos } from "./fixture";
void i18n.changeLanguage("zh-CN");
const initialGoal: SessionGoal = {
  id: "fixture",
  sessionId: "fixture",
  workspacePath: "/synthetic",
  objective: "强化通用审批流：支持金额条件、审批人规则与历史记录兼容",
  status: "active",
  endConditions: { aiCanExit: true },
  notifyEnabled: false,
  permissionMode: "",
  turnCount: 1,
  createdAt: "2026-10-18",
  updatedAt: "2026-10-18",
  totalDurationMs: 125000,
  totalTokens: 12345,
  revision: 1,
  controlRevision: 1,
  isExecuting: true,
};
function Preview() {
  const [dark, setDark] = useState(false);
  const [goal, setGoal] = useState(initialGoal);
  const [receipt, setReceipt] = useState("");
  const [many, setMany] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const items = many
    ? [
        ...todos,
        ...Array.from({ length: 24 }, (_, i) => ({
          key: `long-${i}`,
          content: `边界验证 ${i + 1}：${"ReimbursementApprovalRuleService".repeat(3)}`,
          activeForm: "",
          status: "pending" as const,
        })),
      ]
    : todos;
  return (
    <ThemeRuntimeProvider
      selection={{
        themeId: "myagents-default",
        appearanceMode: dark ? "dark" : "light",
      }}
    >
      <main className="min-h-screen bg-[var(--paper)] p-4 text-[var(--ink)] sm:p-8">
        <header className="mx-auto mb-8 flex max-w-3xl flex-wrap items-center gap-2 text-sm">
          <span className="mr-auto text-xs text-[var(--ink-muted)]">
            组件验收 · 合成数据 · 不连接实际任务
          </span>
          <button onClick={() => setDark(!dark)}>切换明暗</button>
          <select
            aria-label="目标状态"
            value={goal.status}
            onChange={(e) =>
              setGoal({
                ...goal,
                status: e.target.value as SessionGoal["status"],
              })
            }
          >
            {["active", "paused", "blocked", "complete", "canceled"].map(
              (s) => (
                <option key={s}>{s}</option>
              ),
            )}
          </select>
          <button onClick={() => setMany(!many)}>长列表</button>
          <button
            onClick={() =>
              setGoal({
                ...goal,
                objective: "核实金额审批规则与兼容性".repeat(30),
              })
            }
          >
            长目标
          </button>
        </header>
        <div
          ref={ref}
          className="mx-auto flex min-h-[360px] max-w-3xl flex-col justify-end gap-4"
        >
          <div className="space-y-3 pb-8 text-sm text-[var(--ink-secondary)]">
            <p>已完成数据库迁移、规则管理和测试更新。</p>
            <p>正在校验金额条件，并验证历史审批记录兼容性。</p>
          </div>
          <div className="pointer-events-none flex flex-wrap items-end justify-end gap-2">
            <FixtureContext value={items}>
              <AgentStatusPanel
                containerRef={ref}
                onJumpToTool={() => setReceipt("已请求定位协作记录")}
              />
            </FixtureContext>
          </div>
          <section>
            <GoalStatusBar
              goal={goal}
              isExecuting={goal.status === "active"}
              executionNumber={2}
              onEdit={() => setReceipt("编辑目标：1 次回调")}
              onPause={() => {
                setGoal({ ...goal, status: "paused", isExecuting: false });
                setReceipt("暂停目标：1 次回调（合成）");
              }}
              onCancel={() => setReceipt("取消目标：1 次回调（合成）")}
              onResume={() => {
                setGoal({ ...goal, status: "active", isExecuting: true });
                setReceipt("继续目标：1 次回调");
              }}
              onDismiss={() => setReceipt("关闭目标状态：1 次回调")}
            />
            <textarea
              aria-label="消息输入"
              placeholder="输入消息，使用 @ 引用文件，/ 使用技能…"
              className="min-h-28 w-full resize-y rounded-b-lg border border-[var(--line)] bg-[var(--paper-elevated)] p-4 text-base outline-none focus:border-[var(--focus-border)]"
            />
          </section>
          <p
            role="status"
            className="min-h-6 text-xs text-[var(--ink-secondary)]"
          >
            {receipt}
          </p>
        </div>
      </main>
    </ThemeRuntimeProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
