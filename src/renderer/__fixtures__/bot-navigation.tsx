/** Actual product component, synthetic data only; never loaded by the App entry. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import "../i18n";
import { ThemeRuntimeProvider } from "../theme";
import BotConversationNavigation from "../components/global-sidebar/BotConversationNavigation";
import type { Project } from "../config/types";
import type { AgentConfig } from "../../shared/types/agent";
import type { SessionMetadata } from "../api/sessionClient";
import type { ProjectSpace } from "../../shared/projectSpaces";

const at = "2026-11-02T00:00:00Z";
const bots: AgentConfig[] = [
  {
    id: "mino",
    name: "Mino",
    icon: "bot:spark",
    enabled: true,
    channels: [],
    permissionMode: "plan",
  },
  {
    id: "reader",
    name: "资料助手",
    icon: "bot:moss",
    enabled: true,
    channels: [],
    permissionMode: "plan",
  },
];
const workspaces: Project[] = bots.map((bot) => ({
  id: `workspace-${bot.id}`,
  agentId: bot.id,
  name: bot.name,
  path: `/demo/${bot.id}`,
  providerId: null,
  permissionMode: null,
}));
const spaces: ProjectSpace[] = ["产品发布", "课程研究"].map((name, i) => ({
  id: `project-${i}`,
  name,
  description: `${name}的目标和参考资料`,
  instructions: "",
  memberBotIds: ["mino"],
  materials: [],
  resources: [],
  revision: 1,
  createdAt: at,
  updatedAt: at,
}));
const subjects = [
  "发布方案与交付检查",
  "验收清单与风险核对",
  "资料目录与来源说明",
  "交互问题复盘",
  "组件状态整理",
  "下一轮界面改进",
  "项目资料版本说明",
  "团队协作流程",
  "接口调用与结果核对",
  "课程提纲和示例",
  "测试环境检查",
  "日常讨论",
];
const sessions: SessionMetadata[] = subjects.map((title, i) => ({
  id: `session-${i}`,
  agentDir: i === 9 ? "/demo/reader" : "/demo/mino",
  title,
  lastMessagePreview: "请继续沿用原目标和既有进度，完成尚未完成的任务。",
  createdAt: at,
  lastActiveAt: `2026-11-02T${String(13 - Math.floor(i / 6)).padStart(2, "0")}:${String(50 - i).padStart(2, "0")}:00Z`,
  ...(i < 2 ? { pinnedAt: "2026-10-25T00:00:00Z" } : {}),
  ...(i < 4
    ? {
        projectSpace: {
          schemaVersion: 1 as const,
          projectId: spaces[i % 2].id,
          projectName: spaces[i % 2].name,
          projectRevision: 1,
          botId: "mino",
          botName: "Mino",
          botIcon: "bot:spark",
          workspacePath: "/demo/mino",
          capturedAt: at,
          description: "",
          instructions: "",
          materials: [],
          resources: [],
        },
      }
    : {}),
}));
function Fixture() {
  const [light, setLight] = useState(false),
    [view, setView] = useState<"conversations" | "projects">("conversations");
  const [empty, setEmpty] = useState(false),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(false),
    [working, setWorking] = useState(false);
  const [selectedId, setSelectedId] = useState(""),
    [result, setResult] = useState("请选择一段会话");
  return (
    <ThemeRuntimeProvider
      selection={{ themeId: "sage", appearanceMode: light ? "light" : "dark" }}
      persistBootstrapSnapshot={false}
    >
      <div className="flex h-dvh min-w-0 flex-col bg-[var(--paper)] text-[var(--ink)]">
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--line-subtle)] p-3 text-xs">
          <strong>会话导航 · 产品组件 / 合成数据</strong>
          <button onClick={() => setLight((v) => !v)}>切换主题</button>
          <label>
            <input
              type="checkbox"
              checked={empty}
              onChange={(e) => setEmpty(e.target.checked)}
            />
            空态
          </label>
          <label>
            <input
              type="checkbox"
              checked={error}
              onChange={(e) => setError(e.target.checked)}
            />
            读取失败
          </label>
          <label>
            <input
              type="checkbox"
              checked={loading}
              onChange={(e) => setLoading(e.target.checked)}
            />
            加载中
          </label>
          <label>
            <input
              type="checkbox"
              checked={working}
              onChange={(e) => setWorking(e.target.checked)}
            />
            进行中
          </label>
        </header>
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-64 max-w-full shrink-0 flex-col border-r border-[var(--line-subtle)] bg-[var(--paper-elevated)]">
            <strong className="px-4 py-4 text-sm">MoXBots</strong>
            <div
              role="tablist"
              aria-label="导航视图"
              className="mx-3 mb-3 flex rounded-lg bg-[var(--paper-inset)] p-1"
            >
              {(["conversations", "projects"] as const).map((id) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={view === id}
                  className="min-h-8 flex-1 rounded text-sm"
                  onClick={() => setView(id)}
                >
                  {id === "conversations" ? "对话" : "项目"}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              <BotConversationNavigation
                renderSessionMenu={() => null}
                onMenuOpenChange={() => {}}
                view={view}
                projects={workspaces}
                agents={bots}
                spaces={empty ? [] : spaces}
                data={{
                  sessions: empty ? [] : sessions,
                  isSessionsLoading: loading,
                  sessionsError: error ? "fixture only" : null,
                  workspaceSessionStates: new Map(),
                  refresh: () => setError(false),
                }}
                tabs={
                  working
                    ? [
                        {
                          id: "working",
                          view: "chat",
                          title: "资料目录与来源说明",
                          agentDir: "/demo/mino",
                          sessionId: "session-2",
                          sidecarConfigDisposition: "adopt",
                          isGenerating: true,
                        },
                      ]
                    : []
                }
                badges={
                  new Map([
                    ["session-0", 2],
                    ["session-2", 1],
                  ])
                }
                activeTab={
                  selectedId
                    ? {
                        id: "selected",
                        view: "chat",
                        title: selectedId,
                        agentDir: "/demo/mino",
                        sessionId: selectedId,
                        sidecarConfigDisposition: "adopt",
                      }
                    : undefined
                }
                onOpenSession={(s, p) => {
                  setSelectedId(s.id);
                  setResult(`已打开：${s.title} · ${s.id} · ${p.id}`);
                }}
                onOpenProject={(p) => setResult(`原工作目录：${p.id}`)}
                onOpenProjectSpace={(p) => setResult(`项目：${p.id}`)}
                onCreateProject={() => setResult("请求新建项目")}
                onNewConversation={() => setResult("请求新对话")}
                onCreateBot={() => setResult("请求新 Bot")}
                onManageHistory={() => setResult("请求原历史管理入口")}
              />
            </div>
          </aside>
          <main className="min-w-0 flex-1 overflow-auto p-4 text-sm">
            <h1 className="text-lg">会话导航验收</h1>
            <p role="status" className="mt-4 break-words">
              {result}
            </p>
            <p className="mt-4 break-words text-xs text-[var(--ink-muted)]">
              只调用合成回调，不访问本机业务或模型。此页验证实际导航组件，不代表正式应用安装验收。
            </p>
          </main>
        </div>
      </div>
    </ThemeRuntimeProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
