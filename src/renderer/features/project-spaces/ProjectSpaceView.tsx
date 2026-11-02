import { copyPlainText } from '@/utils/clipboard';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SessionMetadata } from '@/api/sessionClient';
import type { ProjectSpace, ProjectSpaceDraft, ProjectSpaceBotIdentity } from '../../../shared/projectSpaces';
import WorkspaceIcon from '@/components/launcher/WorkspaceIcon';
import { ChevronRightIcon, ComposeIcon, FolderIcon, PlusIcon, RefreshIcon } from '@/components/icons';
import { formatTime } from '@/utils/taskCenterUtils';
import ProjectSpaceEditor from './ProjectSpaceEditor';
import { projectSpaceErrorText } from './projectSpaceUi';

/** Product view. App/ConfigStore/SessionStore retain navigation and writes. */
export default function ProjectSpaceView({ project, bots, sessions, loading, readError, onSave, onArchive, onNewConversation, onOpenConversation, onRefresh, onBack, onCreateBot, onReload }: {
  project: ProjectSpace; bots: readonly ProjectSpaceBotIdentity[]; sessions: readonly SessionMetadata[];
  loading?: boolean; readError?: string | null;
  onSave: (draft: ProjectSpaceDraft, expectedRevision: number) => Promise<ProjectSpace>;
  onArchive: (archived: boolean, expectedRevision: number) => Promise<ProjectSpace>;
  onNewConversation: (botId?: string) => void; onOpenConversation: (session: SessionMetadata) => void;
  onReload?: () => Promise<ProjectSpace>;
  onRefresh: () => void; onBack?: () => void; onCreateBot: () => void;
}) {
  const { t } = useTranslation('app'); const l = (key: string) => t(`projectSpaces.${key}`);
  const instanceId = useId(); const tabs = useRef<HTMLDivElement>(null); const archivePending = useRef(false);
  const [section, setSection] = useState<'overview' | 'members' | 'materials'>('overview');
  const [editing, setEditing] = useState(false); const [notice, setNotice] = useState('');
  const [error, setError] = useState(''); const [changingArchive, setChangingArchive] = useState(false);
  const [committed, setCommitted] = useState<ProjectSpace | null>(null);
  useEffect(() => { if (committed && (committed.id !== project.id || project.revision >= committed.revision)) setCommitted(null); }, [project, committed]);
  const current = committed && committed.id === project.id && committed.revision > project.revision ? committed : project;
  const members = current.memberBotIds.map(id => ({ id, bot: bots.find(bot => bot.id === id) }));
  const conversations = sessions.filter(session => session.projectSpace?.projectId === current.id && !session.archived)
    .slice().sort((a, b) => Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt));
  const primary = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-[var(--button-primary-bg)] px-4 text-sm text-[var(--button-primary-text)] disabled:opacity-40';
  const secondary = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[var(--line-subtle)] px-3 text-sm text-[var(--ink-secondary)] hover:bg-[var(--hover-bg)] disabled:opacity-40';
  const card = 'rounded-2xl border border-[var(--line-subtle)] bg-[var(--paper-elevated)]';
  const botRows = (compact = false) => <div className="space-y-2">{(compact ? members.slice(0, 4) : members).map(({ id, bot }) => <div key={id} className={`flex min-w-0 items-center gap-3 ${compact ? 'py-2' : `${card} px-4 py-4`}`}>
    <WorkspaceIcon icon={bot?.icon} size={compact ? 32 : 40} />
    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{bot?.name ?? l('unavailableBot')}</p>{!compact && <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">{l(bot ? 'memberHint' : 'botUnavailable')}</p>}</div>
    {!current.archivedAt && bot && <button type="button" className="shrink-0 rounded-lg p-2 text-[var(--ink-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--accent)]" aria-label={`${bot.name} · ${l('startWithBot')}`} onClick={() => onNewConversation(bot.id)}><ComposeIcon className="h-4 w-4" /></button>}
  </div>)}</div>;
  async function archive() {
    if (archivePending.current) return;
    archivePending.current = true; setChangingArchive(true); setError('');
    try { setCommitted(await onArchive(!current.archivedAt, current.revision)); }
    catch (cause) { setError(projectSpaceErrorText(cause, t)); }
    finally { archivePending.current = false; setChangingArchive(false); }
  }
  return <div className="h-full overflow-y-auto bg-[var(--paper)] text-[var(--ink)]" data-project-space={current.id}>
    <div className="mx-auto max-w-[1120px] px-5 py-7 sm:px-8 lg:py-10">
      <div className="mb-7 flex min-w-0 items-center gap-2 text-xs text-[var(--ink-muted)]">
        {onBack ? <button type="button" onClick={onBack} className="hover:text-[var(--ink)]">{l('projects')}</button> : <span>{l('projects')}</span>}<ChevronRightIcon className="h-3 w-3 shrink-0" /><span className="truncate">{current.name}</span>
      </div>
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 flex-1 basis-[260px]"><div className="mb-3 flex items-center gap-2 text-xs text-[var(--accent)]"><FolderIcon className="h-4 w-4" /><span>{l('projects')}</span>{current.archivedAt && <span className="rounded bg-[var(--paper-inset)] px-2 py-1 text-[var(--ink-muted)]">{l('archived')}</span>}</div><h1 className="break-words text-3xl font-semibold leading-tight tracking-tight">{current.name}</h1><p className="mt-3 max-w-[650px] whitespace-pre-line break-words text-sm leading-6 text-[var(--ink-secondary)]">{current.description || l('noDescription')}</p></div>
        <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => setEditing(true)} disabled={!!current.archivedAt} className={secondary}>{l('edit')}</button><button type="button" onClick={() => onNewConversation()} disabled={!!current.archivedAt || !members.some(item => item.bot)} className={primary}><PlusIcon className="h-4 w-4" />{l('newConversation')}</button></div>
      </header>
      <div className="mt-7 flex gap-6 border-b border-[var(--line-subtle)]" ref={tabs} role="tablist" aria-label={l('projects')} onKeyDown={event => {
        const keys = ['overview', 'members', 'materials'] as const; const index = keys.indexOf(section);
        const next = event.key === 'ArrowRight' ? (index + 1) % keys.length : event.key === 'ArrowLeft' ? (index + keys.length - 1) % keys.length : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
        if (next < 0) return; event.preventDefault(); setSection(keys[next]); tabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
      }}>
        {(['overview', 'members', 'materials'] as const).map(key => <button key={key} type="button" role="tab" id={`${instanceId}-${key}`} aria-controls={`${instanceId}-panel`} tabIndex={section === key ? 0 : -1} aria-selected={section === key} className={`min-h-11 border-b-2 pb-2 text-sm ${section === key ? 'border-[var(--accent)] font-medium text-[var(--ink)]' : 'border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]'}`} onClick={() => setSection(key)}>{l(key)}{key === 'members' ? <span className="ml-1.5 text-xs text-[var(--ink-muted)]">{members.length}</span> : key === 'materials' ? <span className="ml-1.5 text-xs text-[var(--ink-muted)]">{current.materials.length + current.resources.length}</span> : null}</button>)}
      </div>
      {notice && <p role="status" className="mt-4 text-xs text-[var(--accent)]">{notice}</p>}{error && <p role="alert" className="mt-4 text-xs text-[var(--warning)]">{error}</p>}
      {current.archivedAt && <p className="mt-5 rounded-xl border border-[var(--line-subtle)] p-4 text-xs leading-6 text-[var(--ink-muted)]">{l('archivedHint')}</p>}
      <div role="tabpanel" id={`${instanceId}-panel`} aria-labelledby={`${instanceId}-${section}`}>
      {section === 'overview' && <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <main className="min-w-0 space-y-5">
          {current.instructions && <section className={`${card} px-5 py-4`}><h2 className="text-xs font-medium text-[var(--ink-muted)]">{l('instructions')}</h2><p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-[var(--ink-secondary)]">{current.instructions}</p></section>}
          <section className={`${card} overflow-hidden`}><div className="flex items-center justify-between border-b border-[var(--line-subtle)] px-5 py-4"><h2 className="text-sm font-medium">{l('conversations')} <span className="ml-1 text-xs text-[var(--ink-muted)]">{conversations.length}</span></h2><button type="button" onClick={onRefresh} aria-label={l('refresh')} className="rounded-lg p-1.5 text-[var(--ink-muted)] hover:bg-[var(--hover-bg)]"><RefreshIcon className="h-4 w-4" /></button></div>
            {loading && <p role="status" className="px-5 py-3 text-xs text-[var(--ink-muted)]">{l('loading')}</p>}
            {readError && <div role="alert" className="px-5 py-4 text-xs text-[var(--warning)]"><p>{l('readFailed')}</p><button type="button" className="mt-2 underline" onClick={onRefresh}>{l('retry')}</button></div>}
            {!loading && !readError && !conversations.length && <div className="px-5 py-12 text-center"><ComposeIcon className="mx-auto mb-3 h-7 w-7 text-[var(--ink-muted)]" /><p className="text-sm">{l('noConversations')}</p><p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">{l('startHint')}</p>{!current.archivedAt && !!members.some(item => item.bot) && <button type="button" className="mt-4 text-sm text-[var(--accent)]" onClick={() => onNewConversation()}>{l('newConversation')}</button>}</div>}
            <div className="divide-y divide-[var(--line-subtle)]">{conversations.map(session => <button key={session.id} type="button" className="flex w-full min-w-0 items-start gap-3 px-5 py-4 text-left hover:bg-[var(--hover-bg)]" onClick={() => onOpenConversation(session)}><WorkspaceIcon icon={session.projectSpace?.botIcon ?? bots.find(bot => bot.id === session.projectSpace?.botId)?.icon} size={32} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{session.title}</span>{session.lastMessagePreview && <span className="mt-1 block truncate text-xs text-[var(--ink-secondary)]">{session.lastMessagePreview}</span>}<span className="mt-2 block truncate text-xs text-[var(--ink-muted)]">{session.projectSpace?.botName ?? l('unknownBot')} · {formatTime(session.lastActiveAt)}</span></span><ChevronRightIcon className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)]" /></button>)}</div>
          </section>
        </main>
        <aside className="min-w-0 space-y-5"><section className={`${card} px-5 py-4`}><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-medium">{l('members')}</h2><button type="button" className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]" onClick={() => setSection('members')}>{l('manageMembers')}</button></div>{members.length ? botRows(true) : <p className="py-3 text-xs text-[var(--ink-muted)]">{l('noMembers')}</p>}</section><section className={`${card} px-5 py-4`}><h2 className="text-sm font-medium">{l('materials')}</h2><div className="mt-3 space-y-3">{current.materials.slice(0, 3).map(item => <p key={item.id} className="truncate text-xs text-[var(--ink-secondary)]">{item.title}</p>)}{current.resources.slice(0, 2).map(item => <p key={item.id} className="truncate text-xs text-[var(--ink-secondary)]"><FolderIcon className="mr-2 inline h-3.5 w-3.5" />{item.label}</p>)}{!current.materials.length && !current.resources.length && <p className="text-xs text-[var(--ink-muted)]">{l('noMaterials')}</p>}</div><button type="button" className="mt-4 text-xs text-[var(--accent)]" onClick={() => setSection('materials')}>{l('manageMaterials')}</button></section><p className="px-1 text-xs leading-6 text-[var(--ink-muted)]">{l('sharingHint')}</p></aside>
      </div>}
      {section === 'members' && <section className="mt-6 max-w-[760px]"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><p className="max-w-[560px] text-sm leading-6 text-[var(--ink-secondary)]">{l('memberHint')}</p><button type="button" className={secondary} disabled={!!current.archivedAt} onClick={() => setEditing(true)}>{l('manageMembers')}</button></div>{botRows()}{!members.length && <div className={`${card} p-8 text-center text-sm text-[var(--ink-muted)]`}>{l('noMembers')}</div>}<button type="button" className="mt-5 text-xs text-[var(--accent)]" onClick={onCreateBot}>{l('createBot')}</button></section>}
      {section === 'materials' && <section className="mt-6 max-w-[800px] space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><p className="max-w-[620px] text-sm leading-6 text-[var(--ink-secondary)]">{l('materialsHint')}</p><button type="button" className={secondary} disabled={!!current.archivedAt} onClick={() => setEditing(true)}>{l('edit')}</button></div>{current.materials.map(item => <article key={item.id} className={`${card} px-5 py-4`}><h2 className="text-sm font-medium">{item.title}</h2><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--ink-secondary)]">{item.content}</p></article>)}{current.resources.map(item => <article key={item.id} className={`${card} px-5 py-4`}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex min-w-0 items-center gap-2 text-sm font-medium"><FolderIcon className="h-4 w-4 shrink-0 text-[var(--accent)]" /><span className="truncate">{item.label}</span></h2><button type="button" className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]" onClick={() => { void copyPlainText(item.path).then(() => setNotice(l('copied')), () => setError(l('copyFailed'))); }}>{l('copyPath')}</button></div><p className="mt-2 break-all text-xs leading-5 text-[var(--ink-muted)]">{item.path}</p></article>)}{!current.materials.length && !current.resources.length && <p className={`${card} p-10 text-center text-sm text-[var(--ink-muted)]`}>{l('noMaterials')}</p>}<p className="text-xs leading-5 text-[var(--ink-muted)]">{l('longContextHint')}</p></section>}
      </div>
      <footer className="mt-9 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line-subtle)] pt-5 text-xs text-[var(--ink-muted)]"><span>{l('updated')} · {formatTime(current.updatedAt)}</span><button type="button" disabled={changingArchive} className="hover:text-[var(--ink)] disabled:opacity-40" onClick={() => { void archive(); }}>{l(current.archivedAt ? 'restore' : 'archive')}</button></footer>
    </div>
    {editing && <ProjectSpaceEditor key={current.id} onReload={onReload} project={current} bots={bots} onClose={() => setEditing(false)} onSave={async (draft, expectedRevision) => { const result = await onSave(draft, expectedRevision!); setCommitted(result); setNotice(l('saved')); return result; }} />}
  </div>;
}
