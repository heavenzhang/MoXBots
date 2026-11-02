import type { ProjectSpace } from '../../../shared/projectSpaces';
import { normalizeWorkspacePathIdentity } from "../../../shared/workspacePath";
import CustomSelect from "@/components/CustomSelect";
import { useMemo, useState } from "react";
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
  RefreshIcon,
} from "@/components/icons";
import { formatTime } from "@/utils/taskCenterUtils";
import { projectBotConversations } from "./botConversationProjection";
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
}) {
  const { t } = useTranslation("app");
  const [filter, setFilter] = useState("");
  const activeFilter = spaces.some((project) => project.id === filter)
    ? filter
    : "";
  const conversations = useMemo(
    () =>
      projectBotConversations({
        projects,
        agents,
        sessions: data.sessions,
        tabs,
        badges,
        projectSpaceId: activeFilter,
      }),
    [projects, agents, data.sessions, tabs, badges, activeFilter],
  );
  const currentId = activeTab?.view === "chat" ? activeTab.sessionId : null;
  const states = projects
    .filter((project) => !activeFilter || spaces.find(space => space.id === activeFilter)?.memberBotIds.includes(project.agentId ?? ''))
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
      <button
        key={item.session.id}
        type="button"
        onClick={() => onOpenSession(item.session, item.project)}
        aria-current={currentId === item.session.id ? "page" : undefined}
        className={`mb-1 flex w-full min-w-0 items-start gap-2.5 rounded-lg px-2.5 py-3 text-left hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--focus-border)] ${currentId === item.session.id ? "bg-[var(--paper-inset)]" : ""}`}
      >
        <WorkspaceIcon
          icon={item.bot.icon}
          size={32}
          className="mt-0.5 shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <strong className="min-w-0 flex-1 truncate text-sm font-medium">
              {item.bot.name}
            </strong>
            <time className="shrink-0 text-xs text-[var(--ink-muted)]">
              {formatTime(item.session.lastActiveAt)}
            </time>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs text-[var(--ink-secondary)]">
              {item.session.lastMessagePreview || item.session.title}
            </span>
            {item.working ? (
              <span
                role="status"
                className="shrink-0 text-xs text-[var(--accent)]"
              >
                {t("botExperience.working")}
              </span>
            ) : item.unread > 0 ? (
              <span
                className="rounded bg-[var(--accent)] px-1 text-xs text-[var(--button-primary-text)]"
                aria-label={t("botExperience.unread", { count: item.unread })}
              >
                {item.unread}
              </span>
            ) : null}
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-1 text-xs text-[var(--ink-muted)]">
            <FolderIcon className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {item.projectLabel} ·{" "}
              {item.session.title}
            </span>
          </span>
        </span>
      </button>
    ));
  return (
    <div
      className="flex h-full min-h-0 flex-col px-2"
      data-bot-navigation={view}
    >
      {view === "conversations" && (
        <label className="mb-1 flex items-center gap-2 px-2 text-xs text-[var(--ink-muted)]">
          <FolderIcon className="h-3.5 w-3.5" />
          <CustomSelect
            ariaLabel={t("botExperience.filterProject")}
            value={activeFilter}
            onChange={setFilter}
            className="min-w-0 flex-1"
            options={[
              { value: "", label: t("botExperience.allProjects") },
              ...spaces.map((project) => ({
                value: project.id,
                label: project.name,
              })),
            ]}
          />
        </label>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {catalogError && <p role="alert" className="p-3 text-xs text-[var(--warning)]">{t('projectSpaces.readFailed')}</p>}
        {view === "projects" ? (<>
          <div className="flex items-center justify-between px-2 py-2 text-xs text-[var(--ink-muted)]"><span>{t('projectSpaces.projects')}</span><button type="button" onClick={onCreateProject} aria-label={t('projectSpaces.newProject')} className="rounded p-1 hover:bg-[var(--hover-bg)]"><PlusIcon className="h-3.5 w-3.5" /></button></div>
          {spaces.map(space => <button type="button" key={space.id} onClick={() => onOpenProjectSpace?.(space)} className="mb-1 flex w-full items-start gap-2.5 rounded-lg px-2.5 py-3 text-left hover:bg-[var(--hover-bg)]"><FolderIcon className="mt-1 h-5 w-5 shrink-0 text-[var(--accent)]" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{space.name}</span><span className="mt-1 block truncate text-xs text-[var(--ink-muted)]">{space.archivedAt ? t('projectSpaces.archived') : space.description || t('projectSpaces.noDescription')}</span></span><ChevronRightIcon className="mt-2 h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)]" /></button>)}
          {!spaces.length && !catalogError && <button type="button" onClick={onCreateProject} className="m-3 text-xs text-[var(--accent)]">{t('projectSpaces.newProject')}</button>}
          {projects.length > 0 && <p className="border-t border-[var(--line-subtle)] px-2 pb-2 pt-4 text-xs text-[var(--ink-muted)]">{t('projectSpaces.legacyWorkspaces')}</p>}
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
          })}</>
        ) : (
          <>
            {conversations.some((item) => item.unread > 0) && (
              <>
                <p className="px-2 py-2 text-xs text-[var(--ink-muted)]">
                  {t("botExperience.unreadSection")}
                </p>
                {list(conversations.filter((item) => item.unread > 0))}
              </>
            )}
            {conversations.some((item) => item.unread === 0) && (
              <>
                <p className="px-2 py-2 text-xs text-[var(--ink-muted)]">
                  {t("botExperience.recent")}
                </p>
                {list(conversations.filter((item) => item.unread === 0))}
              </>
            )}
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
          view === "conversations" && !error && !conversations.length && (
            <div className="px-3 py-8 text-center text-xs text-[var(--ink-muted)]">
              <p>
                {t("botExperience.noConversations")}
              </p>
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
          onClick={view === "projects" ? onCreateProject : onCreateBot}
        >
          {t(view === "projects" ? "projectSpaces.newProject" : "botExperience.newBot")}
        </button>
        <span className="flex-1" />
        <button
          type="button"
          className="compact-action text-xs text-[var(--ink-muted)]"
          onClick={onManageHistory}
        >
          {t("botExperience.manageHistory")}
        </button>
      </div>
    </div>
  );
}
