import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { workspacePathsEqual } from '../../shared/workspacePath';
import { SkillInstallError } from './installer';

/** Resolve the write authority before inspecting or downloading any install source. */
export function resolveSkillInstallTarget(options: {
  scope: unknown;
  agentDir?: unknown;
  sidecarRole: string;
  currentAgentDir: string;
  userSkillsDir: string;
  projectDirectory?: 'skills' | 'commands';
  validateWorkspace: (path: string) => { valid: boolean };
  isRegisteredWorkspace: (path: string) => boolean;
}): string {
  if (options.scope === 'user') return options.userSkillsDir;
  if (options.scope !== 'project') {
    throw new SkillInstallError('Invalid skill scope', 400);
  }
  const explicit = options.agentDir !== undefined;
  if (explicit && (typeof options.agentDir !== 'string' || !options.agentDir.trim())) {
    throw new SkillInstallError('Invalid workspace path', 400);
  }
  // A Global Sidecar's cwd is process state, never the selected Bot's authority.
  const workspace = explicit ? options.agentDir as string
    : options.sidecarRole === 'global' ? '' : options.currentAgentDir;
  if (!workspace) throw new SkillInstallError('Workspace is unavailable', 409);
  if (!isAbsolute(workspace) || !options.validateWorkspace(workspace).valid) {
    throw new SkillInstallError('Invalid workspace path', 400);
  }
  let canonical: string;
  try {
    canonical = realpathSync(workspace);
    if (!statSync(canonical).isDirectory()) throw new Error('Not a directory');
  } catch {
    throw new SkillInstallError('Workspace is unavailable', 409);
  }
  if (!options.validateWorkspace(canonical).valid) {
    throw new SkillInstallError('Invalid workspace path', 400);
  }
  if (options.sidecarRole !== 'global' && !workspacePathsEqual(
    resolve(workspace), resolve(options.currentAgentDir),
  )) {
    throw new SkillInstallError('Session workspace mismatch', 409);
  }
  if (explicit && !options.isRegisteredWorkspace(resolve(workspace))) {
    throw new SkillInstallError('Workspace is not registered', 409);
  }
  return join(workspace, '.claude', options.projectDirectory ?? 'skills');
}
