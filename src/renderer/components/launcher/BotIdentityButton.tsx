import { useTranslation } from 'react-i18next';
import WorkspaceIcon from './WorkspaceIcon';

interface BotIdentityButtonProps {
  name: string;
  icon?: string;
  onOpen: () => void;
}

/** One durable identity, followed by the independent session title in Chat. */
export default function BotIdentityButton({ name, icon, onOpen }: BotIdentityButtonProps) {
  const { t } = useTranslation('chat');
  return (
    <button type="button" onClick={onOpen} title={name}
      aria-label={t('shell.openBotIdentity', { name })}
      className="flex min-w-0 max-w-48 items-center gap-1.5 rounded-md px-1 py-1 text-sm font-medium text-[var(--ink)] hover:bg-[var(--hover-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
      <WorkspaceIcon icon={icon} size={20} />
      <span className="truncate">{name}</span>
      <span className="shrink-0 rounded border border-[var(--line)] px-1 text-xs font-normal text-[var(--ink-muted)]">Bot</span>
    </button>
  );
}
