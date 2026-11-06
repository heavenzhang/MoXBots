import type { SessionMetadata } from "@/api/sessionClient";
import type { Project } from "@/config/types";
import type { AgentConfig } from "../../../shared/types/agent";
import type { Tab } from "@/types/tab";
import { workspacePathsEqual } from "../../../shared/workspacePath";
import { isAutomationHistoryOrigin } from "../../../shared/session-origin";
import { isSystemMaintenanceSession } from "../../../shared/managedScheduledJob";
export interface BotConversation {
  session: SessionMetadata;
  project: Project;
  bot: Pick<AgentConfig, "id" | "name" | "icon">;
  projectLabel: string;
  projectSpaceId?: string;
  working: boolean;
  unread: number;
  collaborators?: BotConversation[];
  displayLastActiveAt?: string;
}
/** A pinned unread chat has one home, while retaining its unread badge. */
export function groupBotConversations(items: readonly BotConversation[]) {
  const groups: {
    pinned: BotConversation[];
    unread: BotConversation[];
    recent: BotConversation[];
  } = { pinned: [], unread: [], recent: [] };
  for (const item of items) {
    if (item.session.pinnedAt) groups.pinned.push(item);
    else if (item.unread > 0) groups.unread.push(item);
    else groups.recent.push(item);
  }
  return groups;
}
/** Projection only; App/Session owners retain navigation and execution. */
export function projectBotConversations(input: {
  projects: readonly Project[];
  agents: readonly AgentConfig[];
  sessions: readonly SessionMetadata[];
  tabs: readonly Tab[];
  badges?: ReadonlyMap<string, number>;
  projectId?: string;
  projectSpaceId?: string;
}): BotConversation[] {
  const agents = new Map(input.agents.map((agent) => [agent.id, agent]));
  return input.sessions
    .flatMap((session) => {
      if (
        session.archived ||
        isSystemMaintenanceSession(session) ||
        isAutomationHistoryOrigin(session.origin, session)
      )
        return [];
      const matches = input.projects.filter((project) =>
        workspacePathsEqual(project.path, session.agentDir),
      );
      if (matches.length !== 1) return [];
      const project = matches[0];
      const fixed = session.projectSpace;
      const configuredBot = agents.get(fixed?.botId ?? project.agentId ?? "");
      const bot = fixed
        ? {
            id: fixed.botId,
            name: fixed.botName,
            icon: fixed.botIcon ?? configuredBot?.icon,
          }
        : configuredBot;
      if (
        !bot ||
        (input.projectId && input.projectId !== project.id) ||
        (input.projectSpaceId && input.projectSpaceId !== fixed?.projectId)
      )
        return [];
      const tabs = input.tabs.filter(
        (tab) => tab.view === "chat" && tab.sessionId === session.id,
      );
      return [
        {
          session,
          project,
          bot,
          projectLabel:
            fixed?.projectName ?? project.displayName ?? project.name,
          projectSpaceId: fixed?.projectId,
          working: tabs.some((tab) => tab.view === "chat" && tab.isGenerating),
          unread: Math.max(
            input.badges?.get(session.id) ?? 0,
            tabs.some((tab) => tab.view === "chat" && tab.hasUnread) ? 1 : 0,
          ),
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(Boolean(b.session.pinnedAt)) -
          Number(Boolean(a.session.pinnedAt)) ||
        Date.parse(b.session.pinnedAt || b.session.lastActiveAt) -
          Date.parse(a.session.pinnedAt || a.session.lastActiveAt) ||
        a.session.id.localeCompare(b.session.id),
    );
}
/** Offer only existing authoritative bindings until cross-project birth exists. */
export function botConversationProjects(
  projects: readonly Project[],
  botId: string,
): Project[] {
  return projects.filter((project) => project.agentId === botId);
}

/** Fold only under the exact persisted lead. Orphaned/pinned chats stay reachable. */
export function foldCollaborationConversations(items: readonly BotConversation[]): BotConversation[] {
  const roots = new Map(items.filter(item => item.session.projectSpace?.collaboration?.leadSessionId === item.session.id
    && item.session.projectSpace.collaboration.leadBotId === item.bot.id).map(item => [item.session.id, { ...item, displayLastActiveAt: item.session.lastActiveAt, collaborators: [] as BotConversation[] }]));
  const result: BotConversation[] = [];
  for (const item of items) {
    const group = item.session.projectSpace?.collaboration;
    const root = group && roots.get(group.leadSessionId ?? '');
    if (root && root.session.id !== item.session.id && root.projectSpaceId === item.projectSpaceId && !item.session.pinnedAt) {
      root.collaborators.push(item); root.unread += item.unread; root.working ||= item.working;
      if (Date.parse(item.session.lastActiveAt) > Date.parse(root.displayLastActiveAt ?? root.session.lastActiveAt)) root.displayLastActiveAt = item.session.lastActiveAt;
    } else result.push(roots.get(item.session.id) ?? item);
  }
  return result.sort((a, b) => Number(Boolean(b.session.pinnedAt)) - Number(Boolean(a.session.pinnedAt))
    || Date.parse(b.session.pinnedAt || b.displayLastActiveAt || b.session.lastActiveAt) - Date.parse(a.session.pinnedAt || a.displayLastActiveAt || a.session.lastActiveAt)
    || a.session.id.localeCompare(b.session.id));
}
