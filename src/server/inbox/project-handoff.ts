import { compileProjectSpaceHandoffSnapshot, ProjectSpaceError } from '../../shared/projectSpaces';
import { getSessionMetadata } from '../SessionStore';
import { loadConfig, loadProjects } from '../utils/admin-config';
import type { PendingInboxMessage } from './types';

/** Read persisted authorities at the target birth boundary, never a supplied
 * snapshot or prompt. Remote sessions cannot name a local project source. */
export function compileLocalProjectHandoff(message: PendingInboxMessage, targetBotId: string, workspacePath: string) {
  if (message.sourceKind === 'external-cli' || message.networkReturn || !message.fromSessionId) {
    throw new ProjectSpaceError('invalid', 'Project handoff requires a local source conversation');
  }
  const source = getSessionMetadata(message.fromSessionId);
  if (!source?.projectSpace || source.archived || source.materializationState === 'prepared') {
    throw new ProjectSpaceError('not-found', 'Source project conversation is unavailable');
  }
  const config = loadConfig({ strict: true });
  return compileProjectSpaceHandoffSnapshot({ source: source.projectSpace, sourceWorkspacePath: source.agentDir,
    targetBotId, workspacePath, projectSpaces: config.projectSpaces, bots: config.agents ?? [],
    workspaces: loadProjects({ strict: true }), capturedAt: new Date().toISOString() });
}
