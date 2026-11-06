import { createHash } from 'node:crypto';
import { botGroupConfigurationSchema, botGroupSchema, BotGroupError, configureBotGroup, hasBotGroupReceipt, resolveBotGroupMembers, type BotGroupConfiguration } from '../../shared/botGroup';
import { normalizeProjectSpaceSessionSnapshot } from '../../shared/projectSpaces';
import { workspacePathsEqual } from '../../shared/workspacePath';
import { projectSessionTasks, type SessionTaskLedger } from '../../shared/sessionTaskOrchestration';
import { getSessionData, getSessionMetadata } from '../SessionStore';
import { loadConfig, loadProjects } from '../utils/admin-config';
import { mutateSessionTaskLedger } from './task-orchestration';
import type { SessionEngine } from './types';
import { isBotGroupDeliverySettled } from '../../shared/botGroupDelivery';

export function assertBotGroupRootIdle(engine: SessionEngine, ledger?: SessionTaskLedger, sending = false) {
  const live = engine.getLiveSessionState();
  if (live.sessionState !== 'idle' || live.isBusy || live.hasNativeWork || live.waitingForUser ||
    live.backgroundWorkActive || live.hasBackgroundWork || live.backgroundWork?.active.length || engine.getQueueStatus().length ||
    ledger?.execution && ledger.execution.phase !== 'completed' ||
    ledger?.planStart && ledger.planStart.state !== 'dispatched' ||
    ledger?.delegationClaims?.some(claim => claim.state !== 'settled') ||
    ledger?.executionEvidence?.some(fact => fact.pending) ||
    ledger && projectSessionTasks(ledger, [], 'idle').some(task => ['running', 'unknown', 'awaiting_review'].includes(task.phase)) ||
    !sending && ledger?.botGroupDeliveries?.some(delivery => !isBotGroupDeliverySettled(delivery))) {
    throw new BotGroupError('BOT_GROUP_WORK_UNSETTLED');
  }
}

/** Configuration only, called after the route verifies the native user-action
 * boundary. Runtime execution and delivery remain with their existing owners. */
export async function configureSessionBotGroup(engine: SessionEngine, input: unknown) {
  const command = botGroupConfigurationSchema.parse(input);
  const capturedIdentity = JSON.stringify(engine.getRuntimeIdentity());
  const at = new Date().toISOString();
  // Canonical parsed command, including IDs/revisions. Not a caller-provided digest.
  const digest = createHash('sha256').update(JSON.stringify(command)).digest('hex');
  const current = () => {
    const identity = engine.getRuntimeIdentity();
    if (identity.sessionId !== command.sessionId || JSON.stringify(identity) !== capturedIdentity) throw new BotGroupError('BOT_GROUP_SESSION_CHANGED');
    const metadata = getSessionMetadata(command.sessionId);
    const context = engine.getCurrentSessionContext();
    if (!metadata || metadata.archived || metadata.origin && metadata.origin.kind !== 'desktop' ||
      !context || context.sessionId !== command.sessionId || !workspacePathsEqual(context.workspacePath, metadata.agentDir)) {
      throw new BotGroupError('BOT_GROUP_SESSION_UNAVAILABLE');
    }
    if (!metadata.projectSpace) throw new BotGroupError('BOT_GROUP_PROJECT_REQUIRED');
    const project = normalizeProjectSpaceSessionSnapshot(metadata.projectSpace);
    if (!workspacePathsEqual(project.workspacePath, metadata.agentDir)) throw new BotGroupError('BOT_GROUP_ROOT_WORKSPACE_CHANGED');
    return { metadata, project };
  };
  const initial = current();
  const initialGroup = initial.metadata.taskOrchestration?.botGroup;
  if (initialGroup && hasBotGroupReceipt(botGroupSchema.parse(initialGroup), command, digest)) return { sessionId: command.sessionId, group: structuredClone(initialGroup) };
  assertBotGroupRootIdle(engine, initial.metadata.taskOrchestration);
  const history = await getSessionData(command.sessionId);
  if (!history || history.transcriptRecovery) throw new BotGroupError('BOT_GROUP_HISTORY_UNAVAILABLE');
  const historyBoundaryMessageId = history.messages.at(-1)?.id ?? null;
  const resolve = (command: BotGroupConfiguration) => {
    const { project } = current();
    const config = loadConfig({ strict: true });
    const members = resolveBotGroupMembers({ command, projectId: project.projectId, rootBotId: project.botId,
      rootWorkspacePath: project.workspacePath, projectSpaces: config.projectSpaces,
      bots: (config.agents ?? []).map(bot => ({ id: bot.id, name: bot.name, enabled: bot.enabled, ...(typeof bot.icon === 'string' ? { icon: bot.icon } : {}) })),
      workspaces: loadProjects({ strict: true }), at });
    return { projectId: project.projectId, rootBotId: project.botId, members };
  };
  const resolved = resolve(command);
  const fingerprint = JSON.stringify(resolved);
  const isCurrent = () => {
    const { metadata } = current();
    assertBotGroupRootIdle(engine, metadata.taskOrchestration);
    if (JSON.stringify(resolve(command)) !== fingerprint) throw new BotGroupError('BOT_GROUP_CATALOG_CHANGED');
    return true;
  };
  const ledger = await mutateSessionTaskLedger(command.sessionId, prior => {
    const group = prior.botGroup ? botGroupSchema.parse(prior.botGroup) : undefined;
    const next = configureBotGroup(group, command, { ...resolved, at, digest, historyBoundaryMessageId });
    return { ...prior, botGroup: next };
  }, isCurrent);
  return { sessionId: command.sessionId, group: structuredClone(ledger.botGroup!) };
}
