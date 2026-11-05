import { useTranslation } from 'react-i18next';
import WorkspaceIcon from './WorkspaceIcon';

interface BotIdentityButtonProps {
  name: string;
  icon?: string;
  onOpen: () => void;
}

/** Bot settings entry alongside the independent session title. */
export default function BotIdentityButton({ name, icon, onOpen }: BotIdentityButtonProps) {
  const { t } = useTranslation('chat');
  return (
    <button type="button" onClick={onOpen} title={name}
      aria-label={t('shell.openBotIdentity', { name })}
      className="flex min-w-0 max-w-48 items-center gap-1.5 rounded-md px-1 py-1 text-xs font-normal text-[var(--ink-muted)] hover:bg-[var(--hover-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
      <WorkspaceIcon icon={icon} size={16} />
      <span className="truncate">{name}</span>
    </button>
  );
}
