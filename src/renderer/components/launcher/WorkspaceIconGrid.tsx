/**
 * WorkspaceIconGrid — the single Agent icon library grid.
 *
 * Agent Settings and the New Agent panel both pick an Agent identity icon, and
 * users must see the exact same library in both places (set, order, default
 * first, selected style). Callers own the floating container; this component
 * owns the scrollable grid. Selecting the default icon reports `''` so callers
 * store "no icon" instead of persisting the default ID.
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ALL_WORKSPACE_ICON_IDS, DEFAULT_WORKSPACE_ICON, resolveWorkspaceIconId } from '@/assets/workspace-icons';
import { BOT_AVATARS, resolveBotAvatar } from '@/assets/bot-avatars';
import WorkspaceIcon from './WorkspaceIcon';

/** Scroll box + padding shared by every caller's floating container. */
export const WORKSPACE_ICON_GRID_PANEL_CLASS = 'max-h-[min(360px,60vh)] w-[320px] max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain p-2';

interface WorkspaceIconGridProps {
  /** Current icon ID (empty / undefined = default). */
  value: string | undefined;
  /** Receives the chosen icon ID, or `''` for the default icon. */
  onSelect: (iconId: string) => void;
}

export default memo(function WorkspaceIconGrid({ value, onSelect }: WorkspaceIconGridProps) {
  const { t } = useTranslation('settings');
  const selected = resolveBotAvatar(value)?.id ?? resolveWorkspaceIconId(value);
  const ids = [DEFAULT_WORKSPACE_ICON, ...ALL_WORKSPACE_ICON_IDS.filter((id) => id !== DEFAULT_WORKSPACE_ICON)];

  return (
    <div className="space-y-2">
      <p className="px-1 text-xs text-[var(--ink-muted)]">{t('agentSettings.basics.avatars.title')}</p>
      <div className="grid grid-cols-3 gap-2">
        {BOT_AVATARS.map(avatar => (
          <button key={avatar.id} type="button" aria-pressed={selected === avatar.id}
            aria-label={t(`agentSettings.basics.avatars.${avatar.nameKey}`)}
            onClick={() => onSelect(avatar.id)}
            className={`flex flex-col items-center gap-1 rounded-lg py-2 text-xs text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${selected === avatar.id ? 'bg-[var(--accent-warm-muted)] ring-1 ring-[var(--accent-warm)]' : 'hover:bg-[var(--hover-bg)]'}`}>
            <WorkspaceIcon icon={avatar.id} size={40} />
            {t(`agentSettings.basics.avatars.${avatar.nameKey}`)}
          </button>
        ))}
      </div>
      <p className="px-1 pt-1 text-xs text-[var(--ink-muted)]">{t('agentSettings.basics.avatars.classic')}</p>
      <div className="flex flex-wrap gap-1.5">
      {ids.map((iconId) => (
        <button
          key={iconId}
          type="button"
          aria-pressed={selected === iconId}
          onClick={() => onSelect(iconId === DEFAULT_WORKSPACE_ICON ? '' : iconId)}
          className={`flex h-9 w-9 items-center justify-center rounded-lg transition-all ${
            selected === iconId
              ? 'bg-[var(--accent-warm-muted)] ring-1 ring-[var(--accent-warm)]'
              : 'hover:bg-[var(--hover-bg)]'
          }`}
          title={iconId === DEFAULT_WORKSPACE_ICON ? t('agentSettings.basics.defaultIcon') : iconId}
        >
          <WorkspaceIcon icon={iconId} size={20} />
        </button>
      ))}
      </div>
    </div>
  );
});
