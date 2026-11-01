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
  bot: Pick<AgentConfig, 'id' | 'name' | 'icon'>;
  projectLabel: string;
  projectSpaceId?: string;
  working: boolean;
  unread: number;
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
      const configuredBot = agents.get(fixed?.botId ?? project.agentId ?? '');
      const bot = fixed ? { id: fixed.botId, name: fixed.botName, icon: fixed.botIcon ?? configuredBot?.icon } : configuredBot;
      if (!bot || (input.projectId && input.projectId !== project.id) || (input.projectSpaceId && input.projectSpaceId !== fixed?.projectId)) return [];
      const tabs = input.tabs.filter(
        (tab) => tab.view === "chat" && tab.sessionId === session.id,
      );
      return [
        {
          session,
          project,
          bot,
          projectLabel: fixed?.projectName ?? project.displayName ?? project.name,
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
