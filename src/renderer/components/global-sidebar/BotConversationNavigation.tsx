import type { ProjectSpace } from "../../../shared/projectSpaces";
import { normalizeWorkspacePathIdentity } from "../../../shared/workspacePath";
import { isImeComposingEvent } from "@/utils/imeKeyboard";
import CustomSelect from "@/components/CustomSelect";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import type { Project } from "@/config/types";
import type { AgentConfig } from "../../../shared/types/agent";
import type { TaskCenterData } from "@/hooks/useTaskCenterData";
import type { SessionMetadata } from "@/api/sessionClient";
import type { Tab } from "@/types/tab";
import WorkspaceIcon from "@/components/launcher/WorkspaceIcon";
import {
  ChevronRightIcon,
  FolderIcon,
  PlusIcon,
  MoreIcon,
  RefreshIcon,
} from "@/components/icons";
import { formatTime } from "@/utils/taskCenterUtils";
import {
  groupBotConversations,
  projectBotConversations,
} from "./botConversationProjection";
type RenderSessionMenu = (props: {
  session: SessionMetadata;
  open: boolean;
  anchorRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) => ReactNode;

// Keep the navigation row presentation here; the existing Session menu and
// mutation owner are supplied by GlobalSidebar, just as in the history tree.
function ConversationMenuRow({
  session,
  renderSessionMenu,
  onMenuOpenChange,
  children,
}: {
  session: SessionMetadata;
  renderSessionMenu: RenderSessionMenu;
  onMenuOpenChange: (key: string, open: boolean) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation("launcher");
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const key = `conversation:${session.id}`;
    onMenuOpenChange(key, open);
    return () => onMenuOpenChange(key, false);
  }, [onMenuOpenChange, session.id, open]);
  const openMenu = () => {
    anchorRef.current?.focus();
    setOpen(true);
  };
  return (
    <div
      className="group/conversation relative select-none"
      data-conversation-row={session.id}
      onMouseDown={(event) => {
        if (event.button === 2) event.preventDefault();
      }}
      onContextMenu={(event) => {
        if (!event.currentTarget.contains(event.target as Node)) return;
        event.preventDefault();
        event.stopPropagation();
        openMenu();
      }}
      onKeyDown={(event) => {
        if (
          !event.currentTarget.contains(event.target as Node) ||
          isImeComposingEvent(event)
        )
          return;
        if (
          event.key === "ContextMenu" ||
          (event.shiftKey && event.key === "F10")
        ) {
          event.preventDefault();
          event.stopPropagation();
          openMenu();
        }
      }}
    >
      {children}
      <button
        ref={anchorRef}
        data-conversation-menu-trigger
        type="button"
        title={t("rightRail.more")}
        aria-label={t("rightRail.more")}
        aria-expanded={open}
        className={`absolute right-1 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--paper-inset)] focus-visible:outline-2 focus-visible:outline-[var(--focus-border)] ${open ? "opacity-100" : "opacity-60 group-hover/conversation:opacity-100 group-focus-within/conversation:opacity-100"}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <MoreIcon className="h-3.5 w-3.5" />
      </button>
      {renderSessionMenu({
        session,
        open,
        anchorRef,
        onClose: () => {
          setOpen(false);
          anchorRef.current?.focus();
        },
      })}
    </div>
  );
}

export type BotNavigationView = "conversations" | "projects" | "history";
export default function BotConversationNavigation({
  view,
  spaces = [],
  catalogError = false,
  onOpenProjectSpace,
  onCreateProject,
  projects,
  agents,
  data,
  tabs,
  activeTab,
  badges,
  onOpenSession,
  onOpenProject,
  onNewConversation,
  onCreateBot,
  onManageHistory,
  renderSessionMenu,
  onMenuOpenChange,
}: {
  view: Exclude<BotNavigationView, "history">;
  spaces?: readonly ProjectSpace[];
  catalogError?: boolean;
  onOpenProjectSpace?: (project: ProjectSpace) => void;
  onCreateProject?: () => void;
  projects: readonly Project[];
  agents: readonly AgentConfig[];
  data: Pick<
    TaskCenterData,
    | "sessions"
    | "isSessionsLoading"
    | "workspaceSessionStates"
    | "sessionsError"
    | "refresh"
  >;
  tabs: readonly Tab[];
  activeTab?: Tab;
  badges?: ReadonlyMap<string, number>;
  onOpenSession: (session: SessionMetadata, project: Project) => void;
  onOpenProject: (project: Project) => void;
  onNewConversation: () => void;
  onCreateBot: () => void;
  onManageHistory: () => void;
  renderSessionMenu: RenderSessionMenu;
  onMenuOpenChange: (key: string, open: boolean) => void;
}) {
  const { t } = useTranslation("app");
  const [filter, setFilter] = useState("");
  const navigationRef = useRef<HTMLDivElement | null>(null);
  const historyRef = useRef<HTMLButtonElement | null>(null);
  const focusedRowRef = useRef<{ id: string; element: HTMLElement } | null>(
    null,
  );
  // Pinning moves a row between sections; archiving removes it. Restore only
  // focus lost with that DOM node, never focus now owned by another control.
  useLayoutEffect(() => {
    const previous = focusedRowRef.current;
    if (!previous || previous.element.isConnected) return;
    focusedRowRef.current = null;
    if (document.activeElement !== document.body) return;
    const rows = navigationRef.current?.querySelectorAll<HTMLElement>(
      "[data-conversation-row]",
    );
    const replacement = Array.from(rows ?? []).find(
      (row) => row.dataset.conversationRow === previous.id,
    );
    const target =
      replacement?.querySelector<HTMLButtonElement>(
        "[data-conversation-menu-trigger]",
      ) ?? historyRef.current;
    target?.focus();
  });
  const allConversations = useMemo(
    () =>
      projectBotConversations({
        projects,
        agents,
        sessions: data.sessions,
        tabs,
        badges,
      }),
    [projects, agents, data.sessions, tabs, badges],
  );
  const bots = useMemo(() => {
    const catalog = new Map(
      agents.map((bot) => [bot.id, { id: bot.id, name: bot.name }]),
    );
    for (const item of allConversations)
      if (!catalog.has(item.bot.id)) catalog.set(item.bot.id, item.bot);
    return [...catalog.values()];
  }, [agents, allConversations]);
  const activeFilter =
    bots.some((bot) => `bot/${bot.id}` === filter) ||
    spaces.some((space) => `project/${space.id}` === filter)
      ? filter
      : "";
  const selectedBotId = activeFilter.startsWith("bot/")
    ? activeFilter.slice(4)
    : "";
  const selectedSpaceId = activeFilter.startsWith("project/")
    ? activeFilter.slice(8)
    : "";
  const conversations = allConversations.filter(
    (item) =>
      (!selectedBotId || item.bot.id === selectedBotId) &&
      (!selectedSpaceId || item.projectSpaceId === selectedSpaceId),
  );
  const groups = groupBotConversations(conversations);
  const currentId = activeTab?.view === "chat" ? activeTab.sessionId : null;
  const states = projects
    .filter(
      (project) =>
        (!selectedBotId || project.agentId === selectedBotId) &&
        (!selectedSpaceId ||
          spaces
            .find((space) => space.id === selectedSpaceId)
            ?.memberBotIds.includes(project.agentId ?? "")),
    )
    .flatMap((project) => {
      const value = data.workspaceSessionStates.get(
        normalizeWorkspacePathIdentity(project.path),
      );
      return value ? [value] : [];
    });
  const loading =
    view === "conversations" &&
    projects.length > 0 &&
    (states.some((value) => value.isLoading) || data.isSessionsLoading);
  const error =
    states.find((value) => value.error)?.error || data.sessionsError;
  const list = (items: typeof conversations) =>
    items.map((item) => (
      <ConversationMenuRow
        key={item.session.id}
        session={item.session}
        renderSessionMenu={renderSessionMenu}
        onMenuOpenChange={onMenuOpenChange}
      >
        <button
          type="button"
          data-conversation-id={item.session.id}
          title={[
            item.session.title,
            item.bot.name,
            item.projectLabel,
            item.session.lastMessagePreview,
          ]
            .filter(Boolean)
            .join("\n")}
          onClick={() => onOpenSession(item.session, item.project)}
          aria-current={currentId === item.session.id ? "page" : undefined}
          className={`mb-0.5 flex w-full min-w-0 items-center gap-2 rounded-lg pl-2.5 pr-9 py-2 text-left hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--focus-border)] ${currentId === item.session.id ? "bg-[var(--paper-inset)]" : ""}`}
        >
          <WorkspaceIcon icon={item.bot.icon} size={24} className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <strong className="min-w-0 flex-1 truncate text-sm font-medium">
                {item.session.title.trim() ||
                  t("botExperience.newConversation")}
              </strong>
              {item.unread > 0 && (
                <span
                  className="shrink-0 rounded bg-[var(--accent)] px-1 text-xs text-[var(--button-primary-text)]"
                  aria-label={t("botExperience.unread", { count: item.unread })}
                >
                  {item.unread}
                </span>
              )}
            </span>
            <span className="mt-0.5 flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs text-[var(--ink-secondary)]">
                {item.bot.name}
                {(item.projectSpaceId ||
                  item.projectLabel !== item.bot.name) && (
                  <> · {item.projectLabel}</>
                )}
              </span>
              {item.working ? (
                <span
                  role="status"
                  className="shrink-0 text-xs text-[var(--accent)]"
                >
                  {t("botExperience.working")}
                </span>
              ) : null}
              <time className="shrink-0 text-xs text-[var(--ink-muted)]">
                {formatTime(item.session.lastActiveAt)}
              </time>
            </span>
          </span>
        </button>
      </ConversationMenuRow>
    ));
  return (
    <div
      className="flex h-full min-h-0 flex-col px-2"
      data-bot-navigation={view}
      ref={navigationRef}
      onFocusCapture={(event) => {
        const element = event.target as HTMLElement;
        if (!event.currentTarget.contains(element)) return;
        const row = element.closest<HTMLElement>("[data-conversation-row]");
        focusedRowRef.current = row?.dataset.conversationRow
          ? { id: row.dataset.conversationRow, element }
          : null;
      }}
    >
      {view === "conversations" && (
        <label className="mb-1 flex items-center gap-2 px-2 text-xs text-[var(--ink-muted)]">
          <FolderIcon className="h-3.5 w-3.5" />
          <CustomSelect
            ariaLabel={t("botExperience.filterConversations")}
            value={activeFilter}
            onChange={setFilter}
            className="min-w-0 flex-1"
            options={[
              { value: "", label: t("botExperience.allConversations") },
              {
                value: "bots-heading",
                label: t("botExperience.myBots"),
                isSeparator: true,
              },
              ...bots.map((bot) => ({
                value: `bot/${bot.id}`,
                label: t("botExperience.botFilterOption", { name: bot.name }),
              })),
              ...(spaces.length
                ? [
                    {
                      value: "projects-heading",
                      label: t("projectSpaces.projects"),
                      isSeparator: true,
                    },
                  ]
                : []),
              ...spaces.map((project) => ({
                value: `project/${project.id}`,
                label: t("botExperience.projectFilterOption", {
                  name: project.name,
                }),
              })),
            ]}
          />
        </label>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {catalogError && (
          <p role="alert" className="p-3 text-xs text-[var(--warning)]">
            {t("projectSpaces.readFailed")}
          </p>
        )}
        {view === "projects" ? (
          <>
            <div className="flex items-center justify-between px-2 py-2 text-xs text-[var(--ink-muted)]">
              <span>{t("projectSpaces.projects")}</span>
              <button
                type="button"
                onClick={onCreateProject}
                aria-label={t("projectSpaces.newProject")}
                className="rounded p-1 hover:bg-[var(--hover-bg)]"
              >
                <PlusIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            {spaces.map((space) => (
              <button
                type="button"
                key={space.id}
                onClick={() => onOpenProjectSpace?.(space)}
                className="mb-1 flex w-full items-start gap-2.5 rounded-lg px-2.5 py-3 text-left hover:bg-[var(--hover-bg)]"
              >
                <FolderIcon className="mt-1 h-5 w-5 shrink-0 text-[var(--accent)]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {space.name}
                  </span>
                  <span className="mt-1 block truncate text-xs text-[var(--ink-muted)]">
                    {space.archivedAt
                      ? t("projectSpaces.archived")
                      : space.description || t("projectSpaces.noDescription")}
                  </span>
                </span>
                <ChevronRightIcon className="mt-2 h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)]" />
              </button>
            ))}
            {!spaces.length && !catalogError && (
              <p className="px-2 py-3 text-xs text-[var(--ink-muted)]">
                {t("botExperience.emptyProjects")}
              </p>
            )}
            {projects.length > 0 && (
              <p className="border-t border-[var(--line-subtle)] px-2 pb-2 pt-4 text-xs text-[var(--ink-muted)]">
                {t("projectSpaces.legacyWorkspaces")}
              </p>
            )}
            {projects.map((project) => {
              const agent = agents.find((a) => a.id === project.agentId);
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onOpenProject(project)}
                  className="mb-1 flex w-full items-start gap-2.5 rounded-lg px-2.5 py-3 text-left hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--focus-border)]"
                >
                  <FolderIcon className="mt-1 h-5 w-5 shrink-0 text-[var(--accent)]" />
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm font-medium">
                      {project.displayName || project.name}
                    </strong>
                    <span className="mt-1 flex items-center gap-1.5 text-xs text-[var(--ink-secondary)]">
                      {agent && <WorkspaceIcon icon={agent.icon} size={18} />}
                      {agent?.name || t("botExperience.noBot")}
                    </span>
                    <span className="mt-1 block truncate text-xs text-[var(--ink-muted)]">
                      {project.path}
                    </span>
                  </span>
                  <ChevronRightIcon className="mt-2 h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)]" />
                </button>
              );
            })}
          </>
        ) : (
          <>
            {(["pinned", "unread", "recent"] as const).map((group) => {
              const label = t(
                `botExperience.${group === "unread" ? "unreadSection" : group}`,
              );
              return (
                groups[group].length > 0 && (
                  <section key={group} aria-label={label}>
                    <h3 className="flex items-center gap-2 px-2 py-2 text-xs font-normal text-[var(--ink-muted)]">
                      {label}
                      <span>{groups[group].length}</span>
                    </h3>
                    {list(groups[group])}
                  </section>
                )
              );
            })}
          </>
        )}
        {loading && (
          <p
            role="status"
            className="px-3 py-3 text-xs text-[var(--ink-muted)]"
          >
            {t("botExperience.loading")}
          </p>
        )}
        {!loading &&
          view === "conversations" &&
          !error &&
          !conversations.length && (
            <div className="px-3 py-8 text-center text-xs text-[var(--ink-muted)]">
              <p>{t("botExperience.noConversations")}</p>
              <button
                type="button"
                onClick={onNewConversation}
                className="mt-3 inline-flex min-h-8 items-center gap-1 text-[var(--accent)]"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                {t("botExperience.newConversation")}
              </button>
            </div>
          )}
        {view === "conversations" && projects.length > 0 && error && (
          <div role="alert" className="px-3 py-2 text-xs text-[var(--warning)]">
            <p>{t("botExperience.loadFailed")}</p>
            <button
              type="button"
              onClick={() => data.refresh("sessions", { force: true })}
              className="mt-1 inline-flex min-h-8 items-center gap-1"
            >
              <RefreshIcon className="h-3 w-3" />
              {t("botExperience.retry")}
            </button>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center border-t border-[var(--line-subtle)] px-2 py-2">
        <button
          type="button"
          className="compact-action text-xs text-[var(--ink-muted)]"
          onClick={onCreateBot}
        >
          {t("botExperience.newBot")}
        </button>
        <span className="flex-1" />
        <button
          type="button"
          className="compact-action text-xs text-[var(--ink-muted)]"
          ref={historyRef}
          onClick={onManageHistory}
        >
          {t("botExperience.manageHistory")}
        </button>
      </div>
    </div>
  );
}
