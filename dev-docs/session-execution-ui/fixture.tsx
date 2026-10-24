// Isolated real-component fixture. Its control buttons and data are synthetic.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import type { SessionExecution } from "../../src/shared/sessionExecution";
import SessionExecutionStatus from "../../src/renderer/components/agent-status/SessionExecutionStatus";
import { ThemeRuntimeProvider } from "../../src/renderer/theme";
import { i18n } from "../../src/renderer/i18n";
import "../../src/renderer/index.css";

const running: SessionExecution = {
  id: "fixture-execution",
  requestId: "fixture-request",
  originalInput: "完成导出改进",
  intent: {
    kind: "execute",
    objective: "完成导出改进并检查真实行为",
    scope: "本地隔离 UI fixture",
    acceptanceCriteria: ["导出文件包含全部字段", "失败后保留已填写内容"],
  },
  phase: "running",
  startedAt: Date.now(),
  deadlineAt: Date.now() + 30 * 60_000,
  turns: 2,
  reworks: 0,
  noProgress: 0,
  currentQueueId: "fixture-queue",
};
const completed: SessionExecution = {
  ...running,
  phase: "completed",
  turns: 4,
  assessment: {
    decision: "accept",
    summary: "两项验收条件均有验证记录。",
    checks: [
      { criterion: 0, toolUseIds: ["tool-1"] },
      { criterion: 1, toolUseIds: ["tool-2"] },
    ],
  },
};
function Fixture() {
  const [state, setState] = useState<
    "running" | "completed" | "unknown" | "classification"
  >("running");
  const execution =
    state === "completed"
      ? completed
      : state === "classification"
        ? undefined
        : running;
  return (
    <ThemeRuntimeProvider selection={null} persistBootstrapSnapshot={false}>
      <main className="mx-auto min-h-screen max-w-3xl space-y-3 p-4">
        <h1 className="text-base font-semibold">执行状态 UI 本地隔离验收</h1>
        <div className="flex flex-wrap gap-2">
          {(["running", "completed", "unknown", "classification"] as const).map(
            (value) => (
              <button
                key={value}
                className="compact-action rounded-md border border-[var(--line)] px-3 py-2"
                onClick={() => setState(value)}
              >
                {value}
              </button>
            ),
          )}
        </div>
        <SessionExecutionStatus
          execution={execution}
          admission={
            state === "classification"
              ? {
                  requestId: "fixture",
                  queueId: "fixture",
                  error: "INTENT_UNCONFIRMED",
                }
              : undefined
          }
          unknown={state === "unknown"}
        />
      </main>
    </ThemeRuntimeProvider>
  );
}
await i18n.changeLanguage("zh-CN");
createRoot(document.getElementById("root")!).render(<Fixture />);
