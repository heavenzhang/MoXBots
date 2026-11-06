import { assertBotGroupDispatchClaim, botGroupDispatchSchema, readBotGroupDeliveries, renderBotGroupHistory } from '../../shared/botGroupDelivery';
import { getSessionMetadata } from '../SessionStore';
import { compileLocalProjectHandoff } from './project-handoff';
import { loadConfig } from '../utils/admin-config';
import type { PendingInboxMessage } from './types';

/** Read the source's original claim. Target admission never accepts caller
 * supplied membership, project snapshots or private conversation history. */
export function compileBotGroupDispatch(message: PendingInboxMessage, context: {
  groupDispatch: unknown; sessionId: string; botId: string; workspacePath: string; inheritProject?: boolean;
}) {
  const binding = botGroupDispatchSchema.parse(context.groupDispatch);
  if (!context.inheritProject || message.sourceKind === 'external-cli' || message.networkReturn ||
    message.kind !== 'request' || !message.replyBack || message.fromSessionId !== binding.groupId ||
    message.toSessionId !== context.sessionId) throw new Error('BOT_GROUP_DISPATCH_MISMATCH');
  const source = getSessionMetadata(binding.groupId);
  if (!source || source.archived || source.materializationState === 'prepared' ||
    source.origin && source.origin.kind !== 'desktop') throw new Error('BOT_GROUP_SOURCE_UNAVAILABLE');
  const { group } = assertBotGroupDispatchClaim(source.taskOrchestration, binding, {
    sessionId: context.sessionId, botId: context.botId, workspacePath: context.workspacePath, messageId: message.messageId, text: message.text,
  });
  if (source.projectSpace?.projectId !== group.projectId || source.projectSpace.botId !== group.rootBotId) throw new Error('BOT_GROUP_IDENTITY_CHANGED');
  const config = loadConfig({ strict: true });
  for (const botId of [group.rootBotId, context.botId]) {
    const bots = (config.agents ?? []).filter(bot => bot.id === botId);
    if (bots.length !== 1 || !bots[0].enabled) throw new Error('BOT_GROUP_BOT_UNAVAILABLE');
  }
  if (message.sessionEvent && (message.sessionEvent.type !== 'send.request' ||
    message.sessionEvent.eventId !== message.messageId || message.sessionEvent.sourceSessionId !== binding.groupId ||
    message.sessionEvent.targetSessionId !== context.sessionId || message.sessionEvent.payload !== message.text ||
    message.sessionEvent.sourceNotification !== 'auto' || message.sessionEvent.sourceKind === 'external-cli')) throw new Error('BOT_GROUP_DISPATCH_MISMATCH');
  const projectSpace = compileLocalProjectHandoff(message, context.botId, context.workspacePath);
  return { projectSpace, history: renderBotGroupHistory(readBotGroupDeliveries(source.taskOrchestration), binding.requestId) };
}
