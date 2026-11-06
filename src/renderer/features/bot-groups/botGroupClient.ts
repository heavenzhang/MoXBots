import { botGroupConfigurationSchema, botGroupSchema, type BotGroup, type BotGroupConfiguration } from '../../../shared/botGroup';

export class BotGroupSaveError extends Error {
  constructor(public readonly disposition: 'rejected' | 'unconfirmed' | 'scope-changed', public readonly code: string) {
    super(code); this.name = 'BotGroupSaveError';
  }
}
const definitive = new Set(['BOT_GROUP_INVALID_CONFIGURATION', 'BOT_GROUP_NATIVE_USER_ACTION_REQUIRED', 'BOT_GROUP_WORK_UNSETTLED',
  'BOT_GROUP_SESSION_CHANGED', 'BOT_GROUP_SESSION_UNAVAILABLE', 'BOT_GROUP_PROJECT_REQUIRED', 'BOT_GROUP_HISTORY_UNAVAILABLE',
  'BOT_GROUP_PROJECT_UNAVAILABLE', 'BOT_GROUP_PROJECT_CHANGED', 'BOT_GROUP_ROOT_REQUIRED', 'BOT_GROUP_BOT_NOT_PROJECT_MEMBER',
  'BOT_GROUP_BOT_UNAVAILABLE', 'BOT_GROUP_ROOT_WORKSPACE_CHANGED', 'BOT_GROUP_MEMBER_WORKSPACE_CHANGED', 'BOT_GROUP_CATALOG_CHANGED',
  'BOT_GROUP_REVISION_CONFLICT', 'BOT_GROUP_REQUEST_CONFLICT', 'BOT_GROUP_IDENTITY_CHANGED', 'BOT_GROUP_HISTORY_LIMIT', 'BOT_GROUP_MEMBERS_MISMATCH']);
const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const current = (isCurrent: () => boolean) => { if (!isCurrent()) throw new BotGroupSaveError('scope-changed', 'BOT_GROUP_SESSION_CHANGED'); };

/** Exactly one explicit write through the current Tab. No transport retries. */
export async function saveBotGroupConfiguration(command: BotGroupConfiguration,
  post: (path: string, body: unknown) => Promise<unknown>, isCurrent: () => boolean): Promise<BotGroup> {
  current(isCurrent);
  const parsed = botGroupConfigurationSchema.safeParse(command);
  if (!parsed.success) throw new BotGroupSaveError('rejected', 'BOT_GROUP_INVALID_CONFIGURATION');
  const input = parsed.data;
  let response: unknown;
  try { response = await post('/api/session/task-orchestration/bot-group', input); }
  catch (cause) {
    current(isCurrent);
    const error = record(cause); const code = cause instanceof Error ? cause.message : '';
    if (error?.status === 409 && definitive.has(code)) throw new BotGroupSaveError('rejected', code);
    throw new BotGroupSaveError('unconfirmed', 'BOT_GROUP_SAVE_UNCONFIRMED');
  }
  current(isCurrent);
  const result = record(response);
  if (result?.success === false && typeof result.error === 'string' && definitive.has(result.error)) throw new BotGroupSaveError('rejected', result.error);
  const group = botGroupSchema.safeParse(result?.group);
  if (result?.success !== true || result.sessionId !== input.sessionId || !group.success || group.data.groupId !== input.sessionId ||
    !group.data.receipts.some(receipt => receipt.requestId === input.requestId)) {
    throw new BotGroupSaveError('unconfirmed', 'BOT_GROUP_SAVE_UNCONFIRMED');
  }
  return group.data;
}

/** User-requested reconciliation through the existing snapshot endpoint. */
export async function readBotGroupConfiguration(sessionId: string, get: (path: string) => Promise<unknown>, isCurrent: () => boolean): Promise<BotGroup | undefined> {
  current(isCurrent);
  let value: unknown;
  try { value = await get(`/api/session/task-orchestration?sessionId=${encodeURIComponent(sessionId)}`); }
  catch (cause) { current(isCurrent); throw cause; }
  const response = record(value);
  current(isCurrent);
  const ledger = record(response?.ledger);
  if (response?.success !== true || response?.sessionId !== sessionId || !ledger || !Number.isSafeInteger(ledger.revision) || Number(ledger.revision) < 0) throw new Error('BOT_GROUP_READ_FAILED');
  if (ledger.botGroup === undefined) return undefined;
  const group = botGroupSchema.safeParse(ledger.botGroup);
  if (!group.success) throw new Error('BOT_GROUP_READ_FAILED');
  if (group.data.groupId !== sessionId) throw new Error('BOT_GROUP_SESSION_CHANGED');
  return group.data;
}
