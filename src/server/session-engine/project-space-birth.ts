import { compileProjectSpaceSessionSnapshot, ProjectSpaceError } from '../../shared/projectSpaces';
import type { ProjectSpaceSessionSnapshot } from '../../shared/projectSpaces';
import type { SessionOrigin } from '../../shared/session-origin';
import { loadConfig, loadProjects } from '../utils/admin-config';

/** Read-only birth validation. Call before entering any preparation/writer. */
export function compileProjectSpaceBirth(input: {
  pathname: string;
  payload: { projectSpaceSelection?: unknown; projectSpace?: unknown; birthSnapshot?: unknown };
  workspacePath: string;
  origin?: SessionOrigin;
}): ProjectSpaceSessionSnapshot | undefined {
  const { payload } = input;
  if (Object.prototype.hasOwnProperty.call(payload, 'projectSpace') || Object.prototype.hasOwnProperty.call(payload, 'birthSnapshot')) {
    throw new ProjectSpaceError('invalid', 'Project snapshots are server-owned; submit projectSpaceSelection only');
  }
  if (payload.projectSpaceSelection === undefined) return undefined;
  if (input.pathname !== '/api/session/birth' || input.origin && input.origin.kind !== 'desktop') {
    throw new ProjectSpaceError('invalid', 'Project conversations require desktop owner birth');
  }
  const config = loadConfig({ strict: true });
  return compileProjectSpaceSessionSnapshot({ selection: payload.projectSpaceSelection,
    projectSpaces: config.projectSpaces, bots: config.agents ?? [], workspaces: loadProjects({ strict: true }),
    workspacePath: input.workspacePath, capturedAt: new Date().toISOString() });
}
