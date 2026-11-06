import { useTranslation } from 'react-i18next';
import CustomSelect from '@/components/CustomSelect';
import WorkspaceIcon from '@/components/launcher/WorkspaceIcon';
import { selectBotGroupRecipient, type BotGroup } from '../../../shared/botGroup';
export interface BotGroupRecipientValue { groupId: string; botId: string; groupRevision: number }
export default function BotGroupRecipient({ group, value, disabled, onChange }: {
  group: BotGroup; value?: BotGroupRecipientValue; disabled?: boolean; onChange: (value: BotGroupRecipientValue | undefined) => void;
}) {
  const { t } = useTranslation('app');
  let selected = ''; if (value) { try { selected = selectBotGroupRecipient(group, value).botId; } catch { /* An old selection is never silently rebound. */ } }
  const members = group.members.filter(member => member.active);
  return <div className="min-w-0 space-y-1.5">
    <p className="text-xs text-[var(--ink-secondary)]">{t('botGroups.recipient')}</p>
    <CustomSelect ariaLabel={t('botGroups.recipient')} size="md" disabled={disabled} value={selected} onChange={botId => {
      if (!botId) { onChange(undefined); return; }
      const target = { groupId: group.groupId, botId, groupRevision: group.revision };
      selectBotGroupRecipient(group, target); onChange(target);
    }} options={[{ value: '', label: t('botGroups.chooseRecipient') }, ...members.map(member => ({ value: member.botId,
      label: member.name + (members.some(other => other.botId !== member.botId && other.name === member.name) ? ` · ${member.workspacePath} · ${member.botId}` : ''),
      icon: <WorkspaceIcon icon={member.icon} size={28} />,
      content: <span className="block min-w-0"><span className="block break-words">{member.name}</span><span className="block break-all text-xs text-[var(--ink-muted)]">{member.workspacePath} · {member.botId}</span></span>,
    }))]} />
    <p role={value && !selected ? 'status' : undefined} className="text-xs leading-5 text-[var(--ink-muted)]">{t(value && !selected ? 'botGroups.selectionChanged' : 'botGroups.singleRecipientHint')}</p>
  </div>;
}
