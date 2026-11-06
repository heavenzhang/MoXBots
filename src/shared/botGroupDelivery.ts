import { z } from 'zod';
import { botGroupRecipientSchema, botGroupSchema, selectBotGroupRecipient } from './botGroup';
import { workspacePathsEqual } from './workspacePath';
import type { SessionTaskLedger } from './sessionTaskOrchestration';

export const BOT_GROUP_DELIVERY_LIMITS = { records: 128, active: 8, inputBytes: 8192, resultBytes: 32768, contextBytes: 24576, ledgerBytes: 1024 * 1024 } as const;
const id = z.string().min(1).max(160).refine(value => value.trim() === value && Array.from(value).every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127));
const inputText = z.string().min(1).refine(value => value.trim().length > 0 && new TextEncoder().encode(value).length <= BOT_GROUP_DELIVERY_LIMITS.inputBytes);
export const botGroupSendSchema = z.strictObject({
  sessionId: id, requestId: z.uuid(), recipient: botGroupRecipientSchema,
  text: inputText,
});
export type BotGroupSend = z.infer<typeof botGroupSendSchema>;
/** Planned IDs are reserved by the root ledger; only original native FreshStart
 * may claim/materialize them. They never overwrite an existing Session. */
export const botGroupDispatchSchema = z.strictObject({ groupId: id, requestId: z.uuid(), targetSessionId: z.uuid(), messageId: z.uuid() });
export type BotGroupDispatch = z.infer<typeof botGroupDispatchSchema>;
export const botGroupDeliverySchema = z.strictObject({
  ...botGroupDispatchSchema.shape,
  groupRevision: z.number().int().positive().safe(), botId: id, botName: z.string().min(1).max(200),
  workspacePath: z.string().min(1).max(4096), digest: z.string().regex(/^[a-f0-9]{64}$/),
  text: inputText, createdAt: z.iso.datetime(),
  state: z.enum(['reserved', 'accepted', 'unconfirmed', 'rejected', 'completed', 'stopped', 'failed']),
  reason: z.string().max(1000).optional(),
  result: z.strictObject({ eventId: id, turnId: id.optional(), payloadSha256: z.string().regex(/^[a-f0-9]{64}$/), text: z.string().refine(value => new TextEncoder().encode(value).length <= BOT_GROUP_DELIVERY_LIMITS.resultBytes), truncated: z.boolean(),
    terminalStatus: z.enum(['complete', 'stopped', 'error']).optional(), receivedAt: z.iso.datetime() }).optional(),
}).superRefine((value, ctx) => {
  const expected = value.result?.terminalStatus === 'complete' ? 'completed' : value.result?.terminalStatus === 'stopped' ? 'stopped' : value.result?.terminalStatus === 'error' ? 'failed' : 'unconfirmed';
  if (value.groupId === value.targetSessionId || value.messageId === value.targetSessionId ||
    (value.result?.terminalStatus && !value.result.turnId) ||
    (value.result ? value.state !== expected : ['completed', 'stopped', 'failed'].includes(value.state))) {
    ctx.addIssue({ code: 'custom', message: 'Invalid group delivery identity or terminal evidence' });
  }
});
export type BotGroupDelivery = z.infer<typeof botGroupDeliverySchema>;
export const isBotGroupDeliverySettled = (delivery: BotGroupDelivery) => ['rejected', 'completed', 'stopped', 'failed'].includes(delivery.state);

export function readBotGroupDeliveries(ledger?: SessionTaskLedger): BotGroupDelivery[] {
  const values = z.array(botGroupDeliverySchema).max(BOT_GROUP_DELIVERY_LIMITS.records).parse(ledger?.botGroupDeliveries ?? []);
  const group = values.length ? botGroupSchema.parse(ledger?.botGroup) : undefined;
  for (const field of ['requestId', 'targetSessionId', 'messageId'] as const) {
    if (new Set(values.map(value => value[field])).size !== values.length) throw new Error('BOT_GROUP_HISTORY_INVALID');
  }
  if (values.some(value => value.groupId !== group?.groupId || value.groupRevision > group.revision)) throw new Error('BOT_GROUP_HISTORY_INVALID');
  return values;
}

/** A binding is a reference to an original persisted claim, never a grant
 * supplied by the sender. Both native birth and target admission check it. */
export function assertBotGroupDispatchClaim(ledger: SessionTaskLedger | undefined, binding: BotGroupDispatch, target: {
  sessionId: string; botId: string; workspacePath: string; messageId: string; text: string;
}) {
  const group = botGroupSchema.parse(ledger?.botGroup);
  const claim = readBotGroupDeliveries(ledger).find(item => item.requestId === binding.requestId);
  if (!claim || group.groupId !== binding.groupId || claim.result || !['reserved', 'accepted', 'unconfirmed'].includes(claim.state) ||
    claim.targetSessionId !== binding.targetSessionId || claim.messageId !== binding.messageId ||
    target.sessionId !== claim.targetSessionId || target.messageId !== claim.messageId || target.botId !== claim.botId ||
    target.text !== claim.text || !workspacePathsEqual(target.workspacePath, claim.workspacePath)) throw new Error('BOT_GROUP_DISPATCH_MISMATCH');
  const member = selectBotGroupRecipient(group, { groupId: binding.groupId, groupRevision: claim.groupRevision, botId: claim.botId });
  if (!workspacePathsEqual(member.workspacePath, claim.workspacePath)) throw new Error('BOT_GROUP_DISPATCH_MISMATCH');
  return { group, claim };
}

export function boundedGroupText(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= maxBytes) return { text, truncated: false };
  let output = ''; let bytes = 0;
  for (const char of text) { const size = encoder.encode(char).length; if (bytes + size > maxBytes) break; output += char; bytes += size; }
  return { text: output, truncated: true };
}

/** Only explicit messages/results in this group's ledger, never transcript,
 * private memory, other project conversations or external Inbox traffic. */
export function renderBotGroupHistory(deliveries: readonly BotGroupDelivery[], beforeRequestId: string): string {
  const end = deliveries.findIndex(item => item.requestId === beforeRequestId);
  if (end < 0) throw new Error('BOT_GROUP_REQUEST_NOT_FOUND');
  const entries = deliveries.slice(0, end).filter(item => item.state !== 'rejected').map(item =>
    `User → ${item.botName} (${item.botId})\n${item.text}` + (item.result ? `\n${item.botName} (${item.botId}), ${item.state}\n${item.result.text}` : '\n[No confirmed result yet]'));
  const kept: string[] = []; let bytes = 0;
  for (let index = entries.length - 1; index >= 0; index--) {
    const separator = kept.length ? 2 : 0;
    const remaining = BOT_GROUP_DELIVERY_LIMITS.contextBytes - bytes - separator;
    const marker = '\n[Excerpt]';
    if (remaining <= marker.length) break;
    const fullSize = new TextEncoder().encode(entries[index]).length;
    const value = fullSize <= remaining ? entries[index] : boundedGroupText(entries[index], remaining - marker.length).text + marker;
    kept.unshift(value); bytes += new TextEncoder().encode(value).length + separator;
    if (fullSize > remaining) break;
  }
  return kept.join('\n\n');
}
