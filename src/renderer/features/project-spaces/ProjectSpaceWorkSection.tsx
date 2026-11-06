import { useTranslation } from 'react-i18next';
import type { SessionMetadata } from '@/api/sessionClient';
import WorkspaceIcon from '@/components/launcher/WorkspaceIcon';
import { ChevronRightIcon, RefreshIcon } from '@/components/icons';
import type { useProjectSpaceWork } from './useProjectSpaceWork';
import type { ProjectWorkRow, ProjectWorkStatus } from './projectSpaceWork';

export type ProjectSpaceWorkData = ReturnType<typeof useProjectSpaceWork>;
const colors: Record<ProjectWorkStatus, string> = {
  running: 'var(--accent)', attention: 'var(--warning)', completed: 'var(--success)',
  idle: 'var(--ink-muted)', unknown: 'var(--ink-muted)', todo: 'var(--ink-secondary)',
};
export default function ProjectSpaceWorkSection({ work, mode, onOpenConversation }: {
  work: ProjectSpaceWorkData; mode: 'current' | 'results'; onOpenConversation: (session: SessionMetadata) => void;
}) {
  const { t } = useTranslation('app');
  const title = t(`projectSpaces.work.${mode}`);
  const rows = work.rows.filter(row => mode === 'results' ? row.status === 'completed' : row.status !== 'completed' && row.status !== 'idle');
  const renderRow = (row: ProjectWorkRow) => <button type="button" key={row.id} data-project-work-id={row.id}
      className="flex w-full min-w-0 items-start gap-3 px-5 py-4 text-left hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--focus-border)]"
      onClick={() => onOpenConversation(row.session)}>
      <WorkspaceIcon icon={row.session.projectSpace?.botIcon} size={28} />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-medium">{row.title || t('projectSpaces.newConversation')}</span>
        {row.summary && <span className="mt-1 block line-clamp-2 break-words text-xs leading-5 text-[var(--ink-secondary)]">{row.summary}</span>}
        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--ink-muted)]">
          <span>{row.session.projectSpace?.botName ?? t('projectSpaces.unknownBot')}</span>
          <span style={{ color: colors[row.status] }}>{t(`projectSpaces.work.status.${row.status}`)}</span>
          <span>{t('projectSpaces.work.openConversation')}</span>
        </span>
      </span>
      <ChevronRightIcon className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)]" />
    </button>;
  return <section aria-label={title} className="min-w-0 overflow-hidden rounded-2xl border border-[var(--line-subtle)] bg-[var(--paper-elevated)]">
    <header className="flex items-center justify-between border-b border-[var(--line-subtle)] px-5 py-4">
      <h2 className="text-sm font-medium">{title} <span className="ml-1 text-xs text-[var(--ink-muted)]">{rows.length}</span></h2>
      <button type="button" aria-label={t('projectSpaces.work.refresh')} onClick={work.refresh} className="rounded-lg p-1.5 text-[var(--ink-muted)] hover:bg-[var(--hover-bg)]"><RefreshIcon className="h-4 w-4" /></button>
    </header>
    {work.checking && <p role="status" className="px-5 pt-3 text-xs text-[var(--ink-muted)]">{t('projectSpaces.work.checking')}</p>}
    {(work.taskError || work.failedCount > 0) && <p role="alert" className="px-5 pt-3 text-xs leading-5 text-[var(--warning)]">{t('projectSpaces.work.readFailed')}</p>}
    {mode === 'results' && <p className="px-5 pt-3 text-xs leading-5 text-[var(--ink-muted)]">{t('projectSpaces.work.resultsHint')}</p>}
    {!work.checking && !work.taskError && work.failedCount === 0 && !rows.length && <p className="px-5 py-6 text-sm leading-6 text-[var(--ink-muted)]">{t(`projectSpaces.work.${mode === 'results' ? 'noResults' : 'noCurrent'}`)}</p>}
    <div className="divide-y divide-[var(--line-subtle)]">{(mode === 'current' ? rows.slice(0, 6) : rows).map(renderRow)}</div>
    {mode === 'current' && rows.length > 6 && <details className="border-t border-[var(--line-subtle)]">
      <summary className="cursor-pointer px-5 py-3 text-xs text-[var(--accent)]">{t('projectSpaces.work.moreWork', { count: rows.length - 6 })}</summary>
      <div className="divide-y divide-[var(--line-subtle)]">{rows.slice(6).map(renderRow)}</div>
    </details>}
    {work.unobservedCount > 0 && <p className="px-5 py-3 text-xs leading-5 text-[var(--ink-muted)]">{t('projectSpaces.work.moreHistory', { count: work.unobservedCount })}</p>}
  </section>;
}
