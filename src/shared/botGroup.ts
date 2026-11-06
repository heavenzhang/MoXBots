import { z } from 'zod';
import { findProjectSpaceBotWorkspace, readProjectSpaces, type ProjectSpaceBotIdentity, type ProjectSpaceWorkspace } from './projectSpaces';
import { workspacePathsEqual } from './workspacePath';

// These are product membership limits, not Runtime execution or delegation grants.
export const BOT_GROUP_LIMITS = { activeMembers: 8, historicalMembers: 32, receipts: 128 } as const;
const identifier = z.string().min(1).max(160).refine(value => value.trim() === value && Array.from(value).every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127));
const revision = z.number().int().nonnegative().safe();
const timestamp = z.iso.datetime();
const memberSchema = z.strictObject({
  botId: identifier, name: z.string().min(1).max(200), icon: z.string().max(4096).optional(),
  workspacePath: z.string().min(1).max(4096), active: z.boolean(), joinedAt: timestamp,
});
export const botGroupSchema = z.strictObject({
  schemaVersion: z.literal(1), groupId: identifier, projectId: identifier, rootBotId: identifier,
  title: z.string().min(1).max(200), revision: revision.min(1),
  createdAt: timestamp, updatedAt: timestamp,
  // The existing transcript owns messages; this marker never copies private history.
  historyBoundaryMessageId: identifier.nullable(),
  members: z.array(memberSchema).min(2).max(BOT_GROUP_LIMITS.historicalMembers),
  receipts: z.array(z.strictObject({ requestId: z.uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/), revision: revision.min(1) })).max(BOT_GROUP_LIMITS.receipts),
}).superRefine((group, ctx) => {
  const active = group.members.filter(member => member.active);
  if (new Set(group.members.map(member => member.botId)).size !== group.members.length ||
    active.length < 2 || active.length > BOT_GROUP_LIMITS.activeMembers || !active.some(member => member.botId === group.rootBotId) ||
    new Set(group.receipts.map(receipt => receipt.requestId)).size !== group.receipts.length ||
    group.receipts.some(receipt => receipt.revision > group.revision)) {
    ctx.addIssue({ code: 'custom', message: 'Invalid group identity or history' });
  }
});
export type BotGroup = z.infer<typeof botGroupSchema>;
export type BotGroupMember = BotGroup['members'][number];
export const botGroupConfigurationSchema = z.strictObject({
  sessionId: identifier, requestId: z.uuid(), expectedRevision: revision, projectRevision: revision.min(1),
  title: z.string().min(1).max(200).refine(value => value.trim() === value),
  memberBotIds: z.array(identifier).min(2).max(BOT_GROUP_LIMITS.activeMembers)
    .refine(ids => new Set(ids).size === ids.length),
});
export type BotGroupConfiguration = z.infer<typeof botGroupConfigurationSchema>;
export class BotGroupError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'BotGroupError'; }
}
const fail = (code: string): never => { throw new BotGroupError(`BOT_GROUP_${code}`); };

/** Catalogs must come from the original config owner, never request snapshots. */
export function resolveBotGroupMembers(input: {
  command: BotGroupConfiguration; projectId: string; rootBotId: string; rootWorkspacePath: string;
  projectSpaces: unknown; bots: readonly (ProjectSpaceBotIdentity & { enabled: boolean })[];
  workspaces: readonly ProjectSpaceWorkspace[]; at: string;
}): BotGroupMember[] {
  const project = readProjectSpaces(input.projectSpaces).find(item => item.id === input.projectId);
  if (!project || project.archivedAt) return fail('PROJECT_UNAVAILABLE');
  if (project.revision !== input.command.projectRevision) return fail('PROJECT_CHANGED');
  if (!input.command.memberBotIds.includes(input.rootBotId)) return fail('ROOT_REQUIRED');
  return input.command.memberBotIds.map(botId => {
    if (!project.memberBotIds.includes(botId)) return fail('BOT_NOT_PROJECT_MEMBER');
    const matches = input.bots.filter(bot => bot.id === botId);
    const workspace = findProjectSpaceBotWorkspace(botId, input.workspaces);
    if (matches.length !== 1 || !matches[0].enabled || !workspace) return fail('BOT_UNAVAILABLE');
    if (botId === input.rootBotId && !workspacePathsEqual(workspace.path, input.rootWorkspacePath)) return fail('ROOT_WORKSPACE_CHANGED');
    const bot = matches[0];
    return memberSchema.parse({ botId, name: bot.name, icon: bot.icon, workspacePath: workspace.path, active: true, joinedAt: input.at });
  });
}

/** An identical acknowledged command is read-only, even after a later edit. */
export function hasBotGroupReceipt(group: BotGroup | undefined, command: BotGroupConfiguration, digest: string): boolean {
  if (!group) return false;
  if (group.groupId !== command.sessionId) return fail('SESSION_CHANGED');
  const receipt = group.receipts.find(item => item.requestId === command.requestId);
  if (!receipt) return false;
  if (receipt.digest !== digest) return fail('REQUEST_CONFLICT');
  return true;
}

/** Pure configuration transition. The original metadata CAS persists it. */
export function configureBotGroup(prior: BotGroup | undefined, command: BotGroupConfiguration, context: {
  projectId: string; rootBotId: string; members: BotGroupMember[];
  at: string; historyBoundaryMessageId: string | null; digest: string;
}): BotGroup {
  if (hasBotGroupReceipt(prior, command, context.digest)) return prior!;
  if ((prior?.revision ?? 0) !== command.expectedRevision) return fail('REVISION_CONFLICT');
  if (prior && (prior.projectId !== context.projectId || prior.rootBotId !== context.rootBotId)) return fail('IDENTITY_CHANGED');
  if ((prior?.receipts.length ?? 0) >= BOT_GROUP_LIMITS.receipts) return fail('HISTORY_LIMIT');
  const incoming = new Map(context.members.map(member => [member.botId, member]));
  if (incoming.size !== command.memberBotIds.length || command.memberBotIds.some(id => !incoming.has(id))) return fail('MEMBERS_MISMATCH');
  const previous = new Map(prior?.members.map(member => [member.botId, member]));
  const active = command.memberBotIds.map(id => {
    const member = incoming.get(id)!; const old = previous.get(id);
    // A changed Bot workspace must not silently rebind an existing participant Session.
    if (old && !workspacePathsEqual(old.workspacePath, member.workspacePath)) return fail('MEMBER_WORKSPACE_CHANGED');
    return { ...member, active: true, joinedAt: old?.joinedAt ?? member.joinedAt };
  });
  const members = [...active, ...(prior?.members ?? []).filter(member => !incoming.has(member.botId)).map(member => ({ ...member, active: false }))];
  if (members.length > BOT_GROUP_LIMITS.historicalMembers) return fail('HISTORY_LIMIT');
  const nextRevision = (prior?.revision ?? 0) + 1;
  return botGroupSchema.parse({ schemaVersion: 1, groupId: command.sessionId,
    projectId: context.projectId, rootBotId: context.rootBotId, title: command.title, revision: nextRevision,
    createdAt: prior?.createdAt ?? context.at, updatedAt: context.at,
    historyBoundaryMessageId: prior ? prior.historyBoundaryMessageId : context.historyBoundaryMessageId,
    members, receipts: [...(prior?.receipts ?? []), { requestId: command.requestId, digest: context.digest, revision: nextRevision }],
  });
}

export const botGroupRecipientSchema = z.strictObject({ groupId: identifier, botId: identifier, groupRevision: revision.min(1) });
/** A selection is not an execution grant. The target Session owner still admits it. */
export function selectBotGroupRecipient(group: BotGroup, input: unknown): BotGroupMember {
  const target = botGroupRecipientSchema.safeParse(input);
  if (!target.success) return fail('RECIPIENT_REQUIRED');
  if (target.data.groupId !== group.groupId) return fail('SESSION_CHANGED');
  if (target.data.groupRevision !== group.revision) return fail('REVISION_CONFLICT');
  const member = group.members.find(item => item.botId === target.data.botId && item.active);
  if (!member) return fail('RECIPIENT_UNAVAILABLE');
  return { ...member };
}
