/** Local component acceptance only; not imported by the application entry. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import "../i18n";
import { ThemeRuntimeProvider } from "../theme";
import BotConversationNavigation, {
  type BotNavigationView,
} from "../components/global-sidebar/BotConversationNavigation";
import NewBotConversationDialog from "../components/global-sidebar/NewBotConversationDialog";
import type { Project } from "../config/types";
import type { AgentConfig } from "../../shared/types/agent";
import type { TaskCenterData } from "../hooks/useTaskCenterData";
import type { SessionMetadata } from "../api/sessionClient";
const projects: Project[] = [
  {
    id: "r3-p1",
    name: "MoXBots",
    path: "/demo/MoXBots",
    agentId: "r3-mino",
    providerId: null,
    permissionMode: null,
  },
  {
    id: "r3-p2",
    name: "请假统计",
    path: "/demo/统计",
    agentId: "r3-analyst",
    providerId: null,
    permissionMode: null,
  },
];
const agents: AgentConfig[] = [
  {
    id: "r3-mino",
    name: "Mino",
    icon: "bot:spark",
    enabled: true,
    channels: [],
    permissionMode: "plan",
  },
  {
    id: "r3-analyst",
    name: "业务分析",
    icon: "bot:mox",
    enabled: true,
    channels: [],
    permissionMode: "plan",
  },
];
const sessions: SessionMetadata[] = [
  {
    id: "r3-s1",
    agentDir: "/demo/MoXBots",
    title: "Bot 与项目关系",
    lastMessagePreview: "界面关系草案已整理，请核对项目入口。",
    createdAt: "2026-11-01T01:00:00Z",
    lastActiveAt: "2026-11-01T13:00:00Z",
  },
  {
    id: "r3-s2",
    agentDir: "/demo/统计",
    title: "统计口径与异常依据",
    lastMessagePreview: "本次统计按项目口径复核，结果稍后回报。",
    createdAt: "2026-11-01T02:00:00Z",
    lastActiveAt: "2026-11-01T12:00:00Z",
  },
];
function Fixture() {
  const [light, setLight] = useState(false),
    [open, setOpen] = useState(false),
    [failure, setFailure] = useState(false),
    [empty, setEmpty] = useState(false),
    [error, setError] = useState(false);
  const [view, setView] =
      useState<Exclude<BotNavigationView, "history">>("conversations"),
    [selection, setSelection] = useState("选择左侧对话或项目"),
    [calls, setCalls] = useState(0);
  const data: Pick<
    TaskCenterData,
    | "sessions"
    | "isSessionsLoading"
    | "workspaceSessionStates"
    | "sessionsError"
    | "refresh"
  > = {
    sessions: empty ? [] : sessions,
    isSessionsLoading: false,
    workspaceSessionStates: new Map(),
    sessionsError: error ? "fixture read error" : null,
    refresh: () => setError(false),
  };
  return (
    <ThemeRuntimeProvider
      selection={{ themeId: "sage", appearanceMode: light ? "light" : "dark" }}
      persistBootstrapSnapshot={false}
    >
      <div className="flex h-dvh min-w-0 flex-col bg-[var(--paper)] text-[var(--ink)]">
        <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-3 border-b border-[var(--line-subtle)] px-4 text-xs">
          <strong>R3 实际组件 · 合成数据验收</strong>
          <button onClick={() => setLight((v) => !v)}>切换主题</button>
          <label>
            <input
              type="checkbox"
              checked={failure}
              onChange={(e) => setFailure(e.target.checked)}
            />
            模拟打开失败
          </label>
          <label>
            <input
              type="checkbox"
              checked={empty}
              onChange={(e) => setEmpty(e.target.checked)}
            />
            会话空态
          </label>
          <label>
            <input
              type="checkbox"
              checked={error}
              onChange={(e) => setError(e.target.checked)}
            />
            读取失败
          </label>
        </div>
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--line-subtle)] bg-[var(--global-sidebar-bg)] max-sm:w-44">
            <div className="flex items-center px-4 py-5">
              <strong>MoXBots</strong>
              <span className="flex-1" />
              <button aria-label="新建" onClick={() => setOpen(true)}>
                ＋
              </button>
            </div>
            <div
              role="tablist"
              aria-label="导航视图"
              className="mx-3 mb-3 flex rounded-lg bg-[var(--paper-inset)] p-1"
            >
              {(["conversations", "projects"] as const).map((id) => (
                <button
                  role="tab"
                  aria-selected={view === id}
                  key={id}
                  className="min-h-8 flex-1 rounded text-sm"
                  onClick={() => setView(id)}
                >
                  {id === "conversations" ? "对话" : "项目"}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              <BotConversationNavigation
                view={view}
                projects={projects}
                agents={agents}
                data={data}
                tabs={[]}
                badges={new Map([["r3-s1", 1]])}
                onOpenSession={(s, p) =>
                  setSelection(`对话：${s.title} · 项目：${p.name}`)
                }
                onOpenProject={(p) =>
                  setSelection(`项目：${p.name} · 目录：${p.path}`)
                }
                onNewConversation={() => setOpen(true)}
                onCreateBot={() => setSelection("请求打开原 NewAgentPanel")}
                onManageHistory={() => setSelection("请求回到原历史管理树")}
              />
            </div>
          </aside>
          <main className="min-w-0 flex-1 overflow-auto p-5">
            <h1 className="text-lg">R3 开发组件验收</h1>
            <p className="mt-5 break-words text-sm" role="status">
              {selection}
            </p>
            <p className="mt-4 text-xs text-[var(--ink-muted)]">
              新建请求次数：{calls}
            </p>
            <p className="mt-5 text-xs leading-6 text-[var(--ink-muted)]">
              此页直接导入产品导航与新会话组件，回调使用合成数据；不创建真实会话、不调用模型、不访问业务目录。完整
              App 接线在主页，原生验收另追踪。
            </p>
          </main>
        </div>
        {open && (
          <NewBotConversationDialog
            projects={projects}
            agents={agents}
            onOpen={async (p, message) => {
              setCalls((v) => v + 1);
              if (failure) {
                setFailure(false);
                return { status: 'not-started' };
              }
              setSelection(
                `已接收新对话请求：${p.name} · ${message?.text || "空白会话"}`,
              );
              return { status: 'opened' };
            }}
            onClose={() => setOpen(false)}
            onCreateBot={() => {
              setOpen(false);
              setSelection("请求打开原 NewAgentPanel");
            }}
          />
        )}
      </div>
    </ThemeRuntimeProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
