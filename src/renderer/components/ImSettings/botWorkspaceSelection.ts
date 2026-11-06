import type { AgentConfig } from '../../../shared/types/agent';
import { resolveAgentWorkspaceProjections } from '../../../shared/agentWorkspaceIdentity';
import { workspacePathsEqual } from '../../../shared/workspacePath';
import {
  isProjectActiveForUser,
  isProjectVisibleToUser,
  type Project,
} from '@/config/types';
import { orderWorkspaceSelectorProjects } from '@/components/launcher/WorkspaceSelector';

/** Launcher-compatible eligibility and ordering for Bot workspace targeting. */
export function getBotWorkspaceCandidates(
  projects: readonly Project[],
  defaultWorkspacePath?: string,
): Project[] {
  return orderWorkspaceSelectorProjects(
    projects.filter(isProjectVisibleToUser).filter(isProjectActiveForUser),
    defaultWorkspacePath,
  );
}

/** Only an explicit, unambiguous existing Bot is a binding target. Resolve all
 * projects before hiding archived/internal entries so hidden conflicts still fail. */
export function getBotBindingCandidates(
  projects: readonly Project[],
  agents: readonly AgentConfig[],
  defaultWorkspacePath?: string,
): BotBindingTarget[] {
  const { agentProjections } = resolveAgentWorkspaceProjections(projects, agents);
  return getBotWorkspaceCandidates(projects, defaultWorkspacePath).flatMap(project => {
    const matches = agentProjections.filter(item => item.association === 'project-linked'
      && item.projectId === project.id && item.agentId === project.agentId);
    return matches.length === 1 ? [{ project, agent: matches[0].agent }] : [];
  });
}

export interface BotBindingTarget {
  project: Project;
  agent: AgentConfig;
}

export function botBindingName({ project, agent }: BotBindingTarget): string {
  return project.displayName || agent.name || project.name;
}

/** A stale picker must not silently bind to a replacement Bot at the same path. */
export function resolveCurrentBotBindingTarget(
  targets: readonly BotBindingTarget[], selectedProject: Project,
): BotBindingTarget | undefined {
  return targets.find(({ project, agent }) => project.id === selectedProject.id
    && agent.id === selectedProject.agentId
    && workspacePathsEqual(project.path, selectedProject.path));
}
