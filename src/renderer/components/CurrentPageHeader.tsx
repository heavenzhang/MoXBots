import { useTranslation } from 'react-i18next';

import { CloseIcon } from '@/components/icons';
import TabActivityIndicator from '@/components/TabActivityIndicator';
import type { TabChromeModel } from '@/tab-workspace/contracts';

/** Only the selected resource appears in native window chrome. Conversation
 * files, terminal and browser remain inside that conversation's workspace. */
export default function CurrentPageHeader({ chrome, onClose }: {
  chrome: TabChromeModel;
  onClose?: () => void;
}) {
  const { t } = useTranslation('app');
  return <div className="flex h-full min-w-0 flex-1 items-center gap-2 px-3" data-current-page-header data-tauri-drag-region>
    <TabActivityIndicator isGenerating={chrome.isGenerating} hasUnread={chrome.hasUnread} />
    <span className="min-w-0 truncate text-sm font-medium text-[var(--ink)]" data-tauri-drag-region>{chrome.title}</span>
    {chrome.subtitle && chrome.subtitle !== chrome.title && <span className="hidden min-w-0 truncate text-xs text-[var(--ink-muted)] sm:block" data-tauri-drag-region>{chrome.subtitle}</span>}
    <div className="h-full min-w-4 flex-1" data-tauri-drag-region />
    {onClose && <button type="button" onClick={onClose} aria-label={t('tabs.closeCurrentPage')} title={t('tabs.closeCurrentPage')}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]" data-no-drag>
      <CloseIcon className="h-4 w-4" />
    </button>}
  </div>;
}
