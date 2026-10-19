import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";
import { i18n } from "@/i18n";
import { ThemeRuntimeProvider } from "@/theme";
import ExecutionStatusBar from "@/components/agent-status/ExecutionStatusBar";
import type { SessionGoal } from "@/types/sessionGoal";
import { FixtureContext, initialTab } from "./fixture";
void i18n.changeLanguage("zh-CN");
const initialGoal: SessionGoal = {
  id: "fixture-goal",
  workspacePath: "/synthetic",
  sessionId: "synthetic",
  objective: "直接把四个阶段按照既定方案开发完",
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
function Preview() {
  const ref = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(false);
  const [goal, setGoal] = useState<SessionGoal | null>(initialGoal);
  const [tab, setTab] = useState(initialTab);
  const [receipt, setReceipt] = useState("");
  const [count, setCount] = useState(0);
  const record = (message: string) => {
    setReceipt(message);
    setCount((n) => n + 1);
  };
  return (
    <ThemeRuntimeProvider
      selection={{
        themeId: "myagents-default",
        appearanceMode: dark ? "dark" : "light",
      }}
    >
      <main className="min-h-screen bg-[var(--paper)] p-4 text-[var(--ink)] sm:p-8">
        <header className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 text-sm">
          <p className="w-full text-xs text-[var(--ink-muted)]">
            组件验收 · 合成记录 · 不执行真实任务
          </p>
          <button onClick={() => setDark(!dark)}>切换明暗</button>
          <button
            onClick={() =>
              setGoal(
                goal
                  ? {
                      ...goal,
                      objective: "核对任务的执行结果、权限与交付证据".repeat(
                        30,
                      ),
                    }
                  : initialGoal,
              )
            }
          >
            长目标
          </button>
          <button
            onClick={() => {
              setGoal(null);
              setTab({ ...tab, messages: [], agentPlanTodos: [] });
            }}
          >
            清空数据
          </button>
          <button
            onClick={() => {
              setGoal(initialGoal);
              setTab({
                ...initialTab,
                sessionId: tab.sessionId === "synthetic" ? "next" : "synthetic",
              });
            }}
          >
            切换会话
          </button>
          <select
            aria-label="目标状态"
            value={goal?.status ?? "none"}
            onChange={(e) =>
              setGoal(
                e.target.value === "none"
                  ? null
                  : {
                      ...initialGoal,
                      status: e.target.value as SessionGoal["status"],
                    },
              )
            }
          >
            {[
              "active",
              "paused",
              "blocked",
              "complete",
              "canceled",
              "none",
            ].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </header>
        <div ref={ref} className="mx-auto mt-12 max-w-3xl">
          <div className="mb-8 space-y-4 text-sm text-[var(--ink-secondary)]">
            <p>已完成 8 项工作。独立审阅已回传，正在验证交互。</p>
            <p>这里展示实际状态栏组件与合成会话记录。</p>
          </div>
          <FixtureContext value={tab}>
            <ExecutionStatusBar
              key={tab.sessionId}
              activity={{
                containerRef: ref,
                onJumpToTool: () => record("定位后台记录"),
                onSelectSubagent: () => record("打开子 Agent 原有详情入口"),
              }}
              goal={goal}
              isExecuting={goal?.status === "active"}
              executionNumber={2}
              onPause={() => {
                record("暂停一次");
                if (goal) setGoal({ ...goal, status: "paused" });
              }}
              onResume={() => {
                record("继续一次");
                if (goal) setGoal({ ...goal, status: "active" });
              }}
              onEdit={() => record("编辑目标一次")}
              onCancel={() => {
                record("取消目标一次");
                if (goal) setGoal({ ...goal, status: "canceled" });
              }}
              onDismiss={() => {
                record("关闭目标一次");
                setGoal(null);
              }}
            />
          </FixtureContext>
          <textarea
            aria-label="消息输入"
            placeholder="输入消息，使用 @ 引用文件，/ 使用技能…"
            className="min-h-32 w-full rounded-2xl border border-[var(--line)] bg-[var(--paper-elevated)] p-4 text-base"
          />
          <p data-receipt className="mt-3 text-xs text-[var(--ink-muted)]">
            {receipt} · 回调 {count} 次
          </p>
        </div>
      </main>
    </ThemeRuntimeProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
