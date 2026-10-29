import { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";
import { i18n } from "@/i18n";
import { ThemeRuntimeProvider } from "@/theme";
import ExecutionStatusBar from "@/components/agent-status/ExecutionStatusBar";
import { ComposerSurface, ComposerTextarea, ComposerToolbar, ComposerSendButton } from "@/components/chat-input/ComposerSurface";
import { initialTab, FixtureContext, makeLedger } from "./fixture";
import type { SessionGoal } from "@/types/sessionGoal";
void i18n.changeLanguage("zh-CN");
function Preview() {
  const [mode, setMode] = useState("unconfirmed");
  const [dark, setDark] = useState(true);
  const [session, setSession] = useState(0);
  const [withGoal, setWithGoal] = useState(false);
  const [paused, setPaused] = useState(false);
  const [callbacks, setCallbacks] = useState(0);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const tab = useMemo(() => {
    const sessionId = `synthetic-${session}`;
    return { ...initialTab, sessionId, hasMoreBefore: mode === "history", apiGet: async <T,>(): Promise<T> => {
      if (mode === "unknown") throw new Error("Synthetic snapshot unavailable");
      return { success: true, sessionId, ledger: makeLedger(mode),
        ...(mode === "recovery" ? { executionRecovery: { turnId: "queue", status: "waiting", attempt: 2 } } : {}) } as T;
    } };
  }, [mode, session]);
  const goal: SessionGoal | null = withGoal ? {
    id: "goal", sessionId: tab.sessionId, workspacePath: "/synthetic", objective: "完成输入区交互优化并核验结果", status: paused ? "paused" : "active",
    endConditions: { aiCanExit: true }, notifyEnabled: false, permissionMode: "", turnCount: 2,
    createdAt: "", updatedAt: "", revision: 1, controlRevision: 1, isExecuting: !paused,
  } : null;
  return <ThemeRuntimeProvider selection={{ themeId: "myagents-default", appearanceMode: dark ? "dark" : "light" }}>
    <main className="min-h-screen bg-[var(--paper)] p-4 text-[var(--ink)] sm:p-8">
      <header className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 text-xs text-[var(--ink-secondary)]">
        <p className="w-full">实际生产组件 · 合成账本 · 仅本地验证</p>
        <select aria-label="执行场景" value={mode} onChange={e => setMode(e.target.value)}>
          {["unconfirmed", "running", "rework", "paused", "incomplete", "completed", "recovery", "unknown", "long", "history", "empty"].map(mode => <option key={mode}>{mode}</option>)}
        </select>
        <button onClick={() => setDark(!dark)}>切换明暗</button>
        <button onClick={() => { void i18n.changeLanguage(i18n.language === "zh-CN" ? "en-US" : "zh-CN"); }}>切换语言</button>
        <button onClick={() => setSession(session + 1)}>切换会话</button>
        <button onClick={() => setWithGoal(!withGoal)}>目标模式</button>
        <span data-receipt>控制回调 {callbacks} 次</span>
      </header>
      <div data-composer-demo className="mx-auto flex min-h-[60vh] max-w-3xl flex-col justify-end" ref={ref}>
        <p className="mb-16 text-sm leading-6 text-[var(--ink-secondary)]">交互设计已更新，接下来核验任务结果。</p>
        <FixtureContext.Provider value={tab}>
          <ExecutionStatusBar goal={goal} isExecuting={!paused} activity={{ containerRef: ref, onJumpToTool: () => {}, onSelectSubagent: () => {} }} onPause={() => { setPaused(true); setCallbacks(n => n + 1); }} onResume={() => { setPaused(false); setCallbacks(n => n + 1); }} />
        </FixtureContext.Provider>
        <ComposerSurface>
          <div className="px-4 pb-2 pt-3"><ComposerTextarea aria-label="消息" placeholder="输入消息，使用 @ 引用文件，/ 使用技能…" value={draft} onChange={e => setDraft(e.target.value)} /></div>
          <ComposerToolbar><span className="text-sm text-[var(--ink-secondary)]">＋</span><span className="ml-3 text-sm text-[var(--ink-secondary)]">自动</span><ComposerSendButton className="ml-auto" aria-label="发送" disabled={!draft} onClick={() => setDraft("")} /></ComposerToolbar>
        </ComposerSurface>
      </div>
    </main>
  </ThemeRuntimeProvider>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
