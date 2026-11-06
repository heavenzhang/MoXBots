import { createHash, randomUUID } from 'node:crypto';
import { botGroupSchema, selectBotGroupRecipient } from '../../shared/botGroup';
import { BOT_GROUP_DELIVERY_LIMITS, botGroupDeliverySchema, botGroupSendSchema, boundedGroupText, readBotGroupDeliveries,
  isBotGroupDeliverySettled, type BotGroupDelivery, type BotGroupSend } from '../../shared/botGroupDelivery';
import { compileProjectSpaceHandoffSnapshot, normalizeProjectSpaceSessionSnapshot } from '../../shared/projectSpaces';
import { workspacePathsEqual } from '../../shared/workspacePath';
import { getSessionMetadata } from '../SessionStore';
import { loadConfig, loadProjects } from '../utils/admin-config';
import { cancellableFetch } from '../utils/cancellation';
import { managementRequestHeaders } from '../utils/management-api-client';
import { mutateSessionTaskLedger } from './task-orchestration';
import { assertBotGroupRootIdle } from './bot-group';
import type { SessionEngine } from './types';
import type { PendingInboxMessage } from '../inbox/types';
function sourceForSend(engine: SessionEngine, input: BotGroupSend) {
  const metadata = getSessionMetadata(input.sessionId);
  const context = engine.getCurrentSessionContext();
  if (engine.getRuntimeIdentity().sessionId !== input.sessionId || !metadata || metadata.archived ||
    metadata.materializationState === 'prepared' || metadata.origin && metadata.origin.kind !== 'desktop' ||
    context?.sessionId !== input.sessionId || !workspacePathsEqual(context.workspacePath, metadata.agentDir)) throw new Error('BOT_GROUP_SESSION_CHANGED');
  const group = botGroupSchema.parse(metadata.taskOrchestration?.botGroup);
  if (group.groupId !== input.sessionId) throw new Error('BOT_GROUP_SESSION_CHANGED');
  const member = selectBotGroupRecipient(group, input.recipient);
  const project = normalizeProjectSpaceSessionSnapshot(metadata.projectSpace);
  if (project.projectId !== group.projectId || project.botId !== group.rootBotId) throw new Error('BOT_GROUP_IDENTITY_CHANGED');
  const config = loadConfig({ strict: true });
  for (const botId of [group.rootBotId, member.botId]) {
    const bots = (config.agents ?? []).filter(bot => bot.id === botId);
    if (bots.length !== 1 || !bots[0].enabled) throw new Error('BOT_GROUP_BOT_UNAVAILABLE');
  }
  compileProjectSpaceHandoffSnapshot({ source: project, sourceWorkspacePath: metadata.agentDir, targetBotId: member.botId,
    workspacePath: member.workspacePath, projectSpaces: config.projectSpaces, bots: config.agents ?? [], workspaces: loadProjects({ strict: true }), capturedAt: new Date().toISOString() });
  assertBotGroupRootIdle(engine, metadata.taskOrchestration, true);
  return { metadata, group, member };
}

/** A native-signed user request owns exactly one dispatch. The ledger records
 * its proposed native identities before any outbound I/O. Re-reading an old
 * request never starts a fresh Session, even after a crash or lost ACK. */
export async function sendBotGroupMessage(engine: SessionEngine, body: unknown) {
  const input = botGroupSendSchema.parse(body);
  const identity = JSON.stringify(engine.getRuntimeIdentity());
  const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const metadata = getSessionMetadata(input.sessionId);
  if (engine.getRuntimeIdentity().sessionId !== input.sessionId || !metadata) throw new Error('BOT_GROUP_SESSION_CHANGED');
  const known = readBotGroupDeliveries(metadata.taskOrchestration).find(value => value.requestId === input.requestId);
  if (known) {
    if (known.digest !== digest) throw new Error('BOT_GROUP_REQUEST_CONFLICT');
    return { sessionId: input.sessionId, delivery: known };
  }
  const { group, member } = sourceForSend(engine, input);
  const current = () => {
    if (JSON.stringify(engine.getRuntimeIdentity()) !== identity) throw new Error('BOT_GROUP_SESSION_CHANGED');
    sourceForSend(engine, input); return true;
  };
  let ownsDispatch = false;
  const ledger = await mutateSessionTaskLedger(input.sessionId, prior => {
    const deliveries = readBotGroupDeliveries(prior);
    const existing = deliveries.find(value => value.requestId === input.requestId);
    if (existing) {
      if (existing.digest !== digest) throw new Error('BOT_GROUP_REQUEST_CONFLICT');
      return prior;
    }
    if (deliveries.some(value => value.state === 'reserved' || value.state === 'unconfirmed')) throw new Error('BOT_GROUP_DELIVERY_UNCONFIRMED');
    if (deliveries.length >= BOT_GROUP_DELIVERY_LIMITS.records || deliveries.filter(value => !isBotGroupDeliverySettled(value)).length >= BOT_GROUP_DELIVERY_LIMITS.active) throw new Error('BOT_GROUP_HISTORY_LIMIT');
    const delivery: BotGroupDelivery = { groupId: group.groupId, requestId: input.requestId, targetSessionId: randomUUID(), messageId: randomUUID(),
      groupRevision: group.revision, botId: member.botId, botName: member.name, workspacePath: member.workspacePath,
      text: input.text, digest, createdAt: new Date().toISOString(), state: 'reserved' };
    const next = { ...prior, botGroupDeliveries: [...deliveries, delivery] };
    const reservedResults = next.botGroupDeliveries.filter(value => !isBotGroupDeliverySettled(value)).length * (BOT_GROUP_DELIVERY_LIMITS.resultBytes * 6 + 4096);
    if (Buffer.byteLength(JSON.stringify(next)) + reservedResults > BOT_GROUP_DELIVERY_LIMITS.ledgerBytes) throw new Error('BOT_GROUP_HISTORY_LIMIT');
    ownsDispatch = true;
    return next;
  }, current);
  const saved = readBotGroupDeliveries(ledger).find(value => value.requestId === input.requestId)!;
  if (!ownsDispatch) return { sessionId: input.sessionId, delivery: saved };
  let state: BotGroupDelivery['state'] = 'unconfirmed'; let reason: string | undefined;
  const port = process.env.MYAGENTS_MANAGEMENT_PORT;
  if (!port) { state = 'rejected'; reason = 'MANAGEMENT_UNAVAILABLE'; }
  else {
    try {
      current();
      const response = await cancellableFetch(`http://127.0.0.1:${port}/api/inbox/start-session`, {
        method: 'POST', headers: managementRequestHeaders(), body: JSON.stringify({ agentId: saved.botId, workspacePath: saved.workspacePath,
          fromSessionId: saved.groupId, sourceKind: 'internal-session', fromLabel: group.title, prompt: saved.text,
          replyBack: true, inheritProject: true,
          groupDispatch: { groupId: saved.groupId, requestId: saved.requestId, targetSessionId: saved.targetSessionId, messageId: saved.messageId } }),
      }, { timeoutMs: 180_000 });
      const value = await response.json() as { ok?: boolean; outcome?: { agentId?: string; sessionId?: string; messageId?: string; status?: string; reason?: string } };
      const outcome = value?.outcome;
      if (response.ok && value.ok === true && outcome?.agentId === saved.botId && outcome.sessionId === saved.targetSessionId && outcome.messageId === saved.messageId) {
        if (outcome.status === 'accepted') state = 'accepted';
        else if (outcome.status === 'rejected') state = 'rejected';
        reason = typeof outcome.reason === 'string' ? outcome.reason.slice(0, 1000) : undefined;
      } else reason = 'NATIVE_ACK_UNCONFIRMED';
    } catch { reason = 'NATIVE_ACK_UNCONFIRMED'; }
  }
  const updated = await mutateSessionTaskLedger(input.sessionId, prior => ({ ...prior,
    botGroupDeliveries: readBotGroupDeliveries(prior).map(value => value.requestId !== saved.requestId || value.result || isBotGroupDeliverySettled(value)
      ? value : { ...value, state, ...(reason ? { reason } : {}) }),
  }), () => engine.getRuntimeIdentity().sessionId === input.sessionId);
  return { sessionId: input.sessionId, delivery: readBotGroupDeliveries(updated).find(value => value.requestId === saved.requestId)! };
}

/** Native Inbox result projection only. A group reply is recorded, not injected
 * into the root model as a new command or treated as accepted Task/Goal work. */
export async function receiveBotGroupReply(engine: SessionEngine, message: PendingInboxMessage): Promise<boolean> {
  const identity = JSON.stringify(engine.getRuntimeIdentity());
  const sessionId = engine.getRuntimeIdentity().sessionId;
  // Ordinary lazy Inbox births have no bound Session yet. Only a persisted
  // group claim activates this interceptor; other Inbox flows retain admission.
  if (!sessionId) return false;
  if (message.toSessionId !== sessionId) throw new Error('BOT_GROUP_RESULT_WRONG_OWNER');
  const current = () => JSON.stringify(engine.getRuntimeIdentity()) === identity;
  const metadata = getSessionMetadata(sessionId);
  const deliveries = readBotGroupDeliveries(metadata?.taskOrchestration);
  const requestEventId = message.sessionEvent?.type === 'send.result' ? message.sessionEvent.requestEventId : undefined;
  const related = deliveries.find(value => value.targetSessionId === message.fromSessionId || requestEventId && value.messageId === requestEventId);
  if (!related) return false;
  if (message.toSessionId !== sessionId || metadata?.taskOrchestration?.botGroup?.groupId !== sessionId || related.groupId !== sessionId) throw new Error('BOT_GROUP_RESULT_WRONG_OWNER');
  const event = message.sessionEvent;
  if (message.toSessionId !== sessionId || message.kind !== 'reply' || message.replyBack || message.sourceKind === 'external-cli' || message.networkReturn ||
    message.fromSessionId !== related.targetSessionId || event?.type !== 'send.result' || event.requestEventId !== related.messageId || event.sourceSessionId !== related.targetSessionId || event.targetSessionId !== sessionId ||
    event.eventId !== message.messageId || event.payload !== message.text || event.version !== 1 ||
    (event.status !== 'ok' && event.status !== 'error') || (event.terminalStatus === 'complete' && event.status !== 'ok') ||
    (event.terminalStatus === 'error' && event.status !== 'error')) throw new Error('BOT_GROUP_RESULT_MISMATCH');
  const target = getSessionMetadata(related.targetSessionId);
  if (!target || target.materializationState === 'prepared' || !workspacePathsEqual(target.agentDir, related.workspacePath) ||
    target.projectSpace?.projectId !== metadata?.taskOrchestration?.botGroup?.projectId || target.projectSpace?.botId !== related.botId) throw new Error('BOT_GROUP_RESULT_IDENTITY_CHANGED');
  const text = boundedGroupText(event.payload, BOT_GROUP_DELIVERY_LIMITS.resultBytes);
  const terminalStatus = event.turnId ? event.terminalStatus : undefined;
  const result: BotGroupDelivery['result'] = { eventId: event.eventId, ...(event.turnId ? { turnId: event.turnId } : {}), ...text, payloadSha256: createHash('sha256').update(event.payload).digest('hex'),
    ...(terminalStatus ? { terminalStatus } : {}), receivedAt: new Date().toISOString() };
  await mutateSessionTaskLedger(sessionId, prior => ({ ...prior, botGroupDeliveries: readBotGroupDeliveries(prior).map(value => {
    if (value.requestId !== related.requestId) return value;
    if (value.result) {
      if (value.result.eventId !== result.eventId || value.result.payloadSha256 !== result.payloadSha256 || value.result.text !== result.text || value.result.turnId !== result.turnId || value.result.terminalStatus !== result.terminalStatus) throw new Error('BOT_GROUP_RESULT_CONFLICT');
      return value;
    }
    if (value.state === 'rejected') throw new Error('BOT_GROUP_RESULT_AFTER_REJECTION');
    const state = terminalStatus === 'complete' ? 'completed' : terminalStatus === 'stopped' ? 'stopped' : terminalStatus === 'error' ? 'failed' : 'unconfirmed';
    return botGroupDeliverySchema.parse({ ...value, state, result });
  }) }), current);
  return true;
}
