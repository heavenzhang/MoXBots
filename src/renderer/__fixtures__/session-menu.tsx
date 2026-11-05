/** Product navigation/menu with isolated synthetic metadata; no business requests. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import "../i18n";
import { ThemeRuntimeProvider } from "../theme";
import { ToastProvider } from "../components/Toast";
import BotConversationNavigation from "../components/global-sidebar/BotConversationNavigation";
import SessionContextMenu from "../components/SessionContextMenu";
import { updateSession, type SessionMetadata } from "../api/sessionClient";
import type { Project } from "../config/types";
import type { AgentConfig } from "../../shared/types/agent";
const at = "2026-11-05T00:00:00Z";
const bot: AgentConfig = {
  id: "fixture-bot",
  name: "测试 Bot",
  enabled: true,
  permissionMode: "plan",
  channels: [],
};
const project: Project = {
  id: "fixture-project",
  name: "菜单验收",
  path: "/synthetic/session-menu",
  agentId: bot.id,
  permissionMode: null,
  providerId: null,
};
const initial: SessionMetadata[] = Array.from({ length: 12 }, (_, index) => ({
  id: `fixture-menu-${index}`,
  title: index ? `菜单验收会话 ${index}` : "会话右键菜单恢复验证",
  agentDir: project.path,
  createdAt: at,
  lastActiveAt: at,
}));
const records = new Map(initial.map((session) => [session.id, session]));
// Only fixture IDs may be changed, entirely in memory. Never reach a Sidecar.
window.fetch = async (input, options) => {
  const endpoint = String(input);
  const id = endpoint.startsWith("/sessions/")
    ? endpoint.slice("/sessions/".length)
    : "";
  const session = records.get(id);
  if (!session || options?.method !== "PATCH")
    throw new Error("Fixture blocks non-synthetic requests");
  const { pinned, ...patch } = JSON.parse(String(options.body));
  const updated = {
    ...session,
    ...patch,
    ...(pinned === undefined ? {} : { pinnedAt: pinned ? at : undefined }),
  };
  records.set(id, updated);
  return Response.json({ success: true, session: updated });
};
function Fixture() {
  const [sessions, setSessions] = useState(initial);
  const [light, setLight] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [result, setResult] = useState(
    "仅合成数据；右键、⋯、Shift+F10 可打开菜单",
  );
  const apply = (session: SessionMetadata) => {
    setSessions((values) =>
      values.map((value) => (value.id === session.id ? session : value)),
    );
    setResult(`已更新 ${session.id}：${session.title}`);
    return true;
  };
  const patch = async (
    id: string,
    values: Parameters<typeof updateSession>[1],
  ) => {
    const updated = await updateSession(id, values);
    if (updated) apply(updated);
    return updated;
  };
  return (
    <ThemeRuntimeProvider
      selection={{ themeId: "sage", appearanceMode: light ? "light" : "dark" }}
      persistBootstrapSnapshot={false}
    >
      <ToastProvider>
        <div
          className="h-dvh bg-[var(--paper)] text-[var(--ink)]"
          style={{ maxWidth: narrow ? 390 : undefined }}
        >
          <header className="flex gap-4 p-3 text-sm">
            <strong>会话菜单 · 合成验收</strong>
            <button onClick={() => setLight(!light)}>切换主题</button>
            <button onClick={() => setNarrow(!narrow)}>窄屏</button>
          </header>
          <div className="flex h-[calc(100dvh-52px)] min-w-0">
            <aside className="w-[257px] shrink-0 border-r border-[var(--line)]">
              <BotConversationNavigation
                view="conversations"
                projects={[project]}
                agents={[bot]}
                tabs={[]}
                data={{
                  sessions,
                  isSessionsLoading: false,
                  sessionsError: null,
                  workspaceSessionStates: new Map(),
                  refresh: () => {},
                }}
                onOpenSession={(session) => setResult(`打开 ${session.id}`)}
                onOpenProject={() => {}}
                onNewConversation={() => {}}
                onCreateBot={() => {}}
                onManageHistory={() => {}}
                onMenuOpenChange={() => {}}
                renderSessionMenu={({ session, ...props }) => (
                  <SessionContextMenu
                    {...props}
                    session={session}
                    deleteProtected={false}
                    onCopySessionId={() =>
                      setResult(`复制 SessionID: ${session.id}`)
                    }
                    onToggleFavorite={async () => {
                      await patch(session.id, { favorite: !session.favorite });
                    }}
                    onTogglePin={async () => {
                      await patch(session.id, { pinned: !session.pinnedAt });
                    }}
                    onRenameSession={(id, title) => patch(id, { title })}
                    onShowStats={() => setResult(`统计 ${session.id}`)}
                    onDelete={() =>
                      setResult(`请求删除确认 ${session.id}，未删除`)
                    }
                    onSessionMutationStart={() => 1}
                    onSessionUpdated={apply}
                    onRefreshSessions={() => {}}
                  />
                )}
              />
            </aside>
            <main className="min-w-0 flex-1 p-4 text-sm">
              <p role="status" className="break-words">
                {result}
              </p>
            </main>
          </div>
        </div>
      </ToastProvider>
    </ThemeRuntimeProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
