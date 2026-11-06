import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfigData } from '@/config/useConfigData';
import { useConfigActions } from '@/config/useConfigActions';
import { useToast } from '@/components/Toast';
import OverlayBackdrop from '@/components/OverlayBackdrop';
import WorkspaceIcon from '@/components/launcher/WorkspaceIcon';
import { CloseIcon, PlusIcon } from '@/components/icons';
import { WorkspaceGeneralTab } from '@/components/AgentSettings';
import AgentIdentityConflicts from '@/components/AgentSettings/AgentIdentityConflicts';
import { useCloseLayer } from '@/hooks/useCloseLayer';
import { dismissTopmost } from '@/utils/closeLayer';
import { isImeComposingEvent } from '@/utils/imeKeyboard';
import { resolveAgentWorkspaceProjections } from '../../../shared/agentWorkspaceIdentity';
import type { Project } from '../../../shared/config-types';
import BotCareDocuments, { type BotCareDocumentsRef } from './BotCareDocuments';
import BotCareSkills, { type BotCareSkillsRef } from './BotCareSkills';
import BotCareChecks from './BotCareChecks';

type Section = 'definition' | 'skills' | 'memory' | 'tests' | 'settings';
const SECTIONS: Section[] = ['definition', 'skills', 'memory', 'tests', 'settings'];
interface Props {
  onClose: () => void;
  onCreateBot: () => void;
  /** Hand off to the existing new-conversation dialog, without sending a task. */
  onStartWork: (project: Project) => void;
  initialWorkspace?: string;
}

export default function BotCarePanel({ onClose, onCreateBot, onStartWork, initialWorkspace }: Props) {
  const { t } = useTranslation('app');
  const { config, projects, isLoading, error } = useConfigData();
  const { refreshConfig } = useConfigActions();
  const toast = useToast();
  const { agentProjections: bots, diagnostics } = useMemo(
    () => resolveAgentWorkspaceProjections(projects, config.agents ?? []), [projects, config.agents],
  );
  // Pin the workspace selected by the user. Config refresh must not remount an
  // open editor against a different path or discard its draft.
  const [selection, setSelection] = useState<(typeof bots)[number] | null>(() =>
    bots.find(bot => bot.workspacePath === initialWorkspace) ?? null);
  const selectedId = selection?.agentId;
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<Section>('definition');
  const documentsRef = useRef<BotCareDocumentsRef>(null);
  const skillsRef = useRef<BotCareSkillsRef>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const liveSelection = bots.find(bot => bot.agentId === selectedId && bot.workspacePath === selection?.workspacePath && bot.projectId === selection?.projectId);
  const selected = selection ? (liveSelection ?? selection) : null;
  const scopeChanged = !!selection && !liveSelection;
  const filtered = bots.filter(bot => `${bot.agent.name} ${bot.project?.name ?? ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const canLeave = useCallback(() => {
    if (documentsRef.current?.isEditing() || skillsRef.current?.isEditing()) {
      toast.warning(t('botCare.finishEditing')); return false;
    }
    return true;
  }, [t, toast]);
  const close = () => { if (canLeave()) onClose(); };
  useCloseLayer(() => { close(); return true; }, 200);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isImeComposingEvent(event)) return;
      if (event.key === 'Escape') { event.preventDefault(); dismissTopmost(); return; }
      // Keep keyboard navigation in this dialog, without trapping nested portals.
      if (event.key !== 'Tab' || !panelRef.current?.contains(document.activeElement)) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]')]
        .filter(element => element.getClientRects().length > 0);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus(); };
  }, []);
  const openSection = (next: Section) => { if (canLeave()) setSection(next); };
  const start = () => {
    if (!selected?.project || scopeChanged || !canLeave()) return;
    onStartWork(selected.project);
  };
  return <OverlayBackdrop portal className="z-[200] p-3 sm:p-6" onClose={close}>
    <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="bot-care-title" className="flex h-full max-h-[960px] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] shadow-2xl">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--paper-elevated)] px-5 py-4">
        <div className="min-w-0 flex-1"><h2 id="bot-care-title" className="text-xl font-semibold">{t('botCare.title')}</h2><p className="mt-1 hidden text-sm text-[var(--ink-muted)] sm:block">{t('botCare.subtitle')}</p></div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => { if (canLeave()) onCreateBot(); }} className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--paper-inset)]"><PlusIcon className="h-4 w-4" />{t('botCare.create')}</button>
          <button ref={closeRef} type="button" aria-label={t('botCare.close')} onClick={close} className="rounded-lg p-2 hover:bg-[var(--paper-inset)]"><CloseIcon className="h-5 w-5" /></button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <nav aria-label={t('botCare.roster')} className="flex max-h-48 shrink-0 flex-col border-b border-[var(--line)] bg-[var(--paper-elevated)] sm:max-h-none sm:w-56 sm:border-b-0 sm:border-r lg:w-64">
          <div className="p-3"><input aria-label={t('botCare.search')} placeholder={t('botCare.search')} value={query} onChange={event => setQuery(event.target.value)} className="w-full rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]" /></div>
          <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
            {isLoading && <p className="p-3 text-sm text-[var(--ink-muted)]">{t('botCare.loading')}</p>}
            {error && <div role="alert" className="p-3 text-sm"><p>{error}</p><button type="button" onClick={() => { void refreshConfig().catch(() => toast.error(t('botCare.loadFailed'))); }}>{t('botCare.retry')}</button></div>}
            {!isLoading && filtered.map(bot => <button key={bot.agentId} type="button" aria-current={selectedId === bot.agentId ? 'page' : undefined}
              onClick={() => { if (canLeave()) { setSelection(bot); setSection('definition'); } }}
              className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${selectedId === bot.agentId ? 'bg-[var(--paper-inset)] ring-1 ring-inset ring-[var(--line)]' : 'hover:bg-[var(--paper-inset)]'}`}>
              <WorkspaceIcon icon={bot.agent.icon ?? bot.project?.icon} size={36} />
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{bot.agent.name}</span><span className="mt-0.5 block truncate text-xs text-[var(--ink-muted)]">{bot.agent.model || t('botCare.defaultModel')}</span></span>
            </button>)}
            {!isLoading && !filtered.length && <p className="p-3 text-sm text-[var(--ink-muted)]">{t(query ? 'botCare.noMatch' : 'botCare.noBots')}</p>}
          </div>
        </nav>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {selected ? <>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 px-6 py-5">
              <div className="flex min-w-0 items-center gap-4"><WorkspaceIcon icon={selected.agent.icon ?? selected.project?.icon} size={60} /><div className="min-w-0"><h3 className="truncate text-2xl font-semibold">{selected.agent.name}</h3><p className="mt-1 text-sm text-[var(--ink-muted)]">{t('botCare.profile')}</p></div></div>
              <div className="flex flex-wrap gap-2"><button type="button" disabled={scopeChanged} onClick={() => openSection('tests')} className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm hover:bg-[var(--paper-inset)]">{t('botCare.test')}</button>
                <button type="button" disabled={!selected.project || scopeChanged} onClick={start} className="rounded-lg bg-[var(--button-primary-bg)] px-4 py-2 text-sm font-medium text-[var(--button-primary-text)] disabled:opacity-50">{t('botCare.startWork')}</button></div>
            </div>
            {scopeChanged && <p role="alert" className="mx-6 mb-3 text-sm text-[var(--warning)]">{t('botCare.scopeChanged')}</p>}
            <div className="mx-6 mb-4 rounded-lg bg-[var(--paper-inset)] px-4 py-3 text-sm leading-relaxed text-[var(--ink-muted)]">{t('botCare.effectiveHint')}</div>
            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--line)] px-4" role="tablist" aria-label={t('botCare.sections')} onKeyDown={event => {
              if (isImeComposingEvent(event) || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              if (!canLeave() || scopeChanged) return;
              const current = SECTIONS.indexOf(section);
              const index = event.key === 'Home' ? 0 : event.key === 'End' ? SECTIONS.length - 1
                : (current + (event.key === 'ArrowRight' ? 1 : -1) + SECTIONS.length) % SECTIONS.length;
              setSection(SECTIONS[index]);
              event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
            }}>
              {SECTIONS.map(item => <button key={item} type="button" role="tab" tabIndex={section === item ? 0 : -1} disabled={scopeChanged} aria-selected={section === item} aria-controls="bot-care-content" onClick={() => openSection(item)}
                className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium ${section === item ? 'border-[var(--accent)] text-[var(--ink)]' : 'border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}>{t(`botCare.tabs.${item}`)}</button>)}
            </div>
            <div id="bot-care-content" role="tabpanel" className="min-h-0 flex-1 overflow-auto" key={`${selected.agentId}:${selected.workspacePath}`}>
              {(section === 'definition' || section === 'memory') && <BotCareDocuments key={section} ref={documentsRef} kind={section} agentDir={selected.workspacePath} />}
              {section === 'skills' && <BotCareSkills ref={skillsRef} agentDir={selected.workspacePath} />}
              {section === 'tests' && <BotCareChecks agentDir={selected.workspacePath} />}
              {section === 'settings' && (scopeChanged ? <p className="p-6 text-sm text-[var(--ink-muted)]">{t('botCare.scopeChanged')}</p> : <WorkspaceGeneralTab agentDir={selected.workspacePath} />)}
            </div>
          </> : <div className="flex-1 overflow-auto p-6 sm:p-10">
            <p className="text-sm font-medium text-[var(--accent)]">{t('botCare.homeEyebrow')}</p><h3 className="mt-3 text-2xl font-semibold">{t('botCare.homeTitle')}</h3>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--ink-muted)]">{t('botCare.homeDescription')}</p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">{bots.map(bot => <button key={bot.agentId} type="button" onClick={() => setSelection(bot)} className="rounded-2xl border border-[var(--line)] bg-[var(--paper-elevated)] p-5 text-left transition-colors hover:bg-[var(--paper-inset)]">
              <WorkspaceIcon icon={bot.agent.icon ?? bot.project?.icon} size={64} /><h4 className="mt-4 text-lg font-semibold">{bot.agent.name}</h4><p className="mt-1 text-sm text-[var(--ink-muted)]">{t('botCare.openProfile')}</p></button>)}</div>
            {selectedId && <p className="mt-4" role="alert">{t('botCare.unavailable')}</p>}
            {!!diagnostics.length && <div className="mt-6"><AgentIdentityConflicts /></div>}
          </div>}
        </main>
      </div>
    </div>
  </OverlayBackdrop>;
}
