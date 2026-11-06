import type { TFunction } from 'i18next';
import { findProjectSpaceBotWorkspace, type ProjectSpace, type ProjectSpaceBotIdentity, type ProjectSpaceWorkspace } from '../../../shared/projectSpaces';
import type { BotGroup } from '../../../shared/botGroup';
export interface BotGroupChoice { id: string; name: string; icon?: string; workspacePath?: string; unavailable: boolean }
export function botGroupChoices(project: ProjectSpace, bots: readonly (ProjectSpaceBotIdentity & { enabled: boolean })[], workspaces: readonly ProjectSpaceWorkspace[], group?: BotGroup): BotGroupChoice[] {
  const ids = [...new Set([...project.memberBotIds, ...(group?.members.filter(member => member.active).map(member => member.botId) ?? [])])];
  return ids.map(id => {
    const matches = bots.filter(bot => bot.id === id); const bot = matches.length === 1 ? matches[0] : undefined;
    const workspace = findProjectSpaceBotWorkspace(id, workspaces); const historical = group?.members.find(member => member.botId === id);
    return { id, name: bot?.name ?? historical?.name ?? id, icon: bot?.icon ?? historical?.icon,
      workspacePath: workspace?.path ?? historical?.workspacePath,
      unavailable: !bot?.enabled || !workspace || !project.memberBotIds.includes(id) || !!project.archivedAt };
  });
}
export function botGroupErrorText(code: string, t: TFunction<'app'>): string {
  if (code === 'BOT_GROUP_READ_FAILED' || code === 'BOT_GROUP_PROJECT_UNAVAILABLE') return t('botGroups.readFailed');
  if (code === 'BOT_GROUP_REVISION_CONFLICT' || code === 'BOT_GROUP_PROJECT_CHANGED') return t('botGroups.conflict');
  if (code === 'BOT_GROUP_WORK_UNSETTLED') return t('botGroups.workUnsettled');
  if (code.includes('SESSION_CHANGED')) return t('botGroups.scopeChanged');
  if (code.includes('UNCONFIRMED')) return t('botGroups.unconfirmed');
  if (code.includes('HISTORY_LIMIT')) return t('botGroups.historyLimit');
  return t('botGroups.saveFailed');
}
