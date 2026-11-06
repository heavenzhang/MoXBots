import type { AgentConfig } from '../../../shared/types/agent';
import { normalizeWorkspacePathIdentity } from '../../../shared/workspacePath';
import type { Project } from '@/config/types';
import type { TaskCenterData } from '@/hooks/useTaskCenterData';
import type { BotConversation } from './botConversationProjection';

/** Filter choices describe this list, not the full Bot creation catalogue. */
export function projectConversationBotFilters(
  conversations: readonly BotConversation[],
  agents: readonly AgentConfig[],
) {
  const configured = new Map(agents.map(bot => [bot.id, bot]));
  const choices = new Map<string, { id: string; name: string; workspaces: Map<string, string>; count: number }>();
  for (const item of conversations) {
    const choice = choices.get(item.bot.id) ?? {
      id: item.bot.id,
      name: configured.get(item.bot.id)?.name ?? item.bot.name,
      workspaces: new Map<string, string>(),
      count: 0,
    };
    choice.workspaces.set(item.project.path, item.project.displayName || item.project.name);
    choice.count++;
    choices.set(choice.id, choice);
  }
  const items = [...choices.values()];
  const normalizedName = (name: string) => name.trim().toLocaleLowerCase();
  return items.map(choice => {
    const peers = items.filter(other => normalizedName(other.name) === normalizedName(choice.name));
    const workspaceLabel = [...new Set(choice.workspaces.values())].join(' / ');
    const sameContext = peers.some(other => other.id !== choice.id &&
      [...new Set(other.workspaces.values())].join(' / ') === workspaceLabel);
    // Two frozen identities can share a workspace and display name. Keep the
    // stable identity as a last-resort discriminator; never merge by name.
    const context = sameContext ? `${[...choice.workspaces.keys()].join(' / ')} · ${choice.id}` : workspaceLabel;
    return {
      id: choice.id,
      name: peers.length > 1 ? `${choice.name} · ${context}` : choice.name,
      count: choice.count,
    };
  });
}

/** Workspace reads and full-index reads have different lifecycle owners.
 * An observed workspace state wins over the global initial-loading flag.
 * Only unobserved workspaces fall back to the full-index state.
 */
export function projectNavigationReadState(
  projects: readonly Project[],
  data: Pick<TaskCenterData, 'workspaceSessionStates' | 'isSessionsLoading' | 'sessionsError'>,
) {
  const scoped = [...new Map(projects.map(project => [normalizeWorkspacePathIdentity(project.path), project])).values()];
  const failed = scoped.filter(project => data.workspaceSessionStates.get(normalizeWorkspacePathIdentity(project.path))?.error);
  const unknown = scoped.filter(project => !data.workspaceSessionStates.has(normalizeWorkspacePathIdentity(project.path)));
  return {
    loading: scoped.some(project => data.workspaceSessionStates.get(normalizeWorkspacePathIdentity(project.path))?.isLoading) ||
      (unknown.length > 0 && data.isSessionsLoading),
    failed,
    globalError: unknown.length > 0 ? data.sessionsError : null,
  };
}
