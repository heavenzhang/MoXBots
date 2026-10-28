import { memo, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRightIcon, CloseIcon, GitBranchIcon } from '@/components/icons';
import { useCloseLayer } from '@/hooks/useCloseLayer';
import { isImeComposingEvent } from '@/utils/imeKeyboard';
import Markdown from '@/components/Markdown';
import { useSubagentViews } from './useSubagentViews';
import { useElapsedSeconds } from './useElapsedSeconds';
import { subagentOutcome } from './subagentOutcome';

type InspectorTab = 'result' | 'task' | 'progress' | 'tools';

/** This is a session-local reading pane, not a new agent or a second runtime owner. */
export default memo(function SubagentInspector({ toolId, overlay, onClose, onJumpToTool }: {
  toolId: string; overlay: boolean; onClose: () => void; onJumpToTool: (id: string) => void;
}) {
  const { t, i18n } = useTranslation('app');
  const { views } = useSubagentViews();
  const agent = views.find(view => view.id === toolId);
  const outcome = subagentOutcome(agent?.result);
  const [activeTab, setActiveTab] = useState<InspectorTab>('result');
  const closeRef = useRef<HTMLButtonElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const elapsed = useElapsedSeconds(agent && (agent.status === 'running' || agent.finishedAt !== undefined) ? agent.startedAt ?? null : null, agent?.finishedAt);
  const parentId = agent?.parentAgentId;
  const parent = parentId ? views.find(view => view.agentId === parentId || view.id === parentId) : undefined;
  let anchorAgent = agent;
  const ancestors = new Set<string>();
  while (anchorAgent?.parentAgentId && !ancestors.has(anchorAgent.id)) {
    ancestors.add(anchorAgent.id);
    const owner = views.find(view => view.agentId === anchorAgent?.parentAgentId || view.id === anchorAgent?.parentAgentId);
    if (!owner) break;
    anchorAgent = owner;
  }
  const jumpToolId = anchorAgent?.id ?? toolId;
  const publicCalls = (agent?.tool.subagentCalls ?? []).filter(call => call.name !== 'Thinking');
  const lastCall = publicCalls.at(-1);
  const stamp = (value?: number) => value === undefined ? t('subagentView.notRecorded') : new Date(value).toLocaleString(i18n.language);
  useCloseLayer(() => { onClose(); return true; }, 60);
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <aside ref={paneRef} role={overlay ? 'dialog' : 'complementary'} aria-modal={overlay || undefined} aria-labelledby={titleId}
    data-subagent-inspector className={overlay
      ? 'absolute inset-y-0 right-0 z-[60] flex w-[420px] max-w-full flex-col border-l border-[var(--line)] bg-[var(--paper-elevated)] text-[var(--ink)] shadow-xl'
      : 'relative z-10 flex w-[380px] min-w-0 shrink-0 flex-col border-l border-[var(--line-subtle)] bg-[var(--paper-elevated)] text-[var(--ink)]'}
    onKeyDown={event => {
      if (isImeComposingEvent(event.nativeEvent)) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (!overlay || event.key !== 'Tab') return;
      const items = paneRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]');
      if (!items?.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    }}>
    <header className="shrink-0 border-b border-[var(--line-subtle)] p-4">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="mb-2 flex items-center gap-2 text-xs text-[var(--ink-muted)]"><GitBranchIcon className="size-4" />{t('subagentView.details')}</p><h2 id={titleId} className="break-words text-base font-semibold">{agent?.title ?? t('subagentView.unavailable')}</h2></div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label={t('subagentView.close')} className="rounded-lg p-2 text-[var(--ink-muted)] hover:bg-[var(--hover-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"><CloseIcon className="size-4" /></button></div>
      {agent && <><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className={`rounded-full px-2 py-1 ${agent.status === 'failed' ? 'bg-[var(--error)]/10 text-[var(--error)]' : 'bg-[var(--accent)]/10 text-[var(--accent)]'}`}>{t(`subagentView.status.${agent.status}`)}</span><span className="break-all py-1 text-[var(--ink-secondary)]">{agent.model ?? t('subagentView.modelUnknown')}</span>{elapsed && <span className="py-1 text-[var(--ink-muted)]">{elapsed}</span>}</div><p className="mt-2 text-xs text-[var(--ink-muted)]">{t('subagentView.assignedBy', { parent: parent?.title || t('subagentView.mainAgent') })}</p></>}
    </header>
    <div className="flex shrink-0 border-b border-[var(--line-subtle)] px-3" role="tablist" aria-label={t('subagentView.details')}>
      {(['result', 'task', 'progress', 'tools'] as const).map(name => <button key={name} id={`${bodyId}-${name}`} type="button" role="tab" aria-selected={activeTab === name} aria-controls={bodyId} tabIndex={activeTab === name ? 0 : -1} onKeyDown={event => {
        const tabs: InspectorTab[] = ['result', 'task', 'progress', 'tools'];
        const index = tabs.indexOf(name);
        const next = event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length]
          : event.key === 'ArrowLeft' ? tabs[(index + tabs.length - 1) % tabs.length]
          : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : null;
        if (!next) return;
        event.preventDefault(); setActiveTab(next); paneRef.current?.querySelector<HTMLElement>(`[id="${bodyId}-${next}"]`)?.focus();
      }} onClick={() => setActiveTab(name)} className={`min-h-11 flex-1 border-b-2 px-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${activeTab === name ? 'border-[var(--accent)] font-medium text-[var(--accent)]' : 'border-transparent text-[var(--ink-muted)]'}`}>{t(`subagentView.tabs.${name}`)}</button>)}
    </div>
    <div id={bodyId} role="tabpanel" aria-labelledby={`${bodyId}-${activeTab}`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 text-sm">
      {!agent ? <p className="text-[var(--ink-muted)]">{t('subagentView.unavailable')}</p> : <>
        {activeTab === 'result' && <>{agent.status === 'failed' ? <>
          <div className="mb-4 rounded-lg border border-[var(--error)]/30 bg-[var(--error)]/5 p-3" role="status"><h3 className="mb-1 font-medium text-[var(--error)]">{t('orchestration.phase.failed')}</h3><p className="text-sm leading-relaxed">{outcome.kind !== 'report' ? t(`orchestration.collaboration.${outcome.kind}`) : outcome.text || t('orchestration.collaboration.hint.failed')}</p><p className="mt-2 text-xs leading-relaxed text-[var(--ink-secondary)]">{t('orchestration.collaboration.failureNext')}</p></div>
          {agent.result && <details><summary className="min-h-9 cursor-pointer text-xs text-[var(--ink-secondary)]">{t('orchestration.collaboration.rawError')}</summary><div className="mt-2 min-w-0 break-words text-xs [overflow-wrap:anywhere]"><Markdown compact>{agent.result}</Markdown></div></details>}
        </> : <><h3 className="mb-3 font-medium">{t('subagentView.report')}</h3>{agent.result ? <div className="min-w-0 break-words [overflow-wrap:anywhere]"><Markdown compact>{agent.result}</Markdown></div> : <p className="rounded-lg bg-[var(--paper-inset)] p-3 leading-relaxed text-[var(--ink-muted)]">{t(agent.status === 'running' ? 'subagentView.awaitingReport' : 'subagentView.noReport')}</p>}<div className="mt-5 rounded-lg border border-[var(--line-subtle)] bg-[var(--paper-inset)] p-3 text-xs leading-relaxed text-[var(--ink-secondary)]"><h3 className="mb-1 font-medium">{t('subagentView.mainReview')}</h3>{t('subagentView.reviewBoundary')}</div></>}</>}
        {activeTab === 'task' && <><h3 className="mb-2 font-medium">{t('subagentView.assignment')}</h3><p className="whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">{agent.prompt ?? t('subagentView.notRecorded')}</p><dl className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-xs"><dt className="text-[var(--ink-muted)]">{t('subagentView.requestedModel')}</dt><dd className="break-all">{agent.requestedModel ?? t('subagentView.inherit')}</dd><dt className="text-[var(--ink-muted)]">{t('subagentView.runtimeModel')}</dt><dd className="break-all">{agent.model ?? t('subagentView.modelUnknown')}</dd><dt className="text-[var(--ink-muted)]">{t('subagentView.started')}</dt><dd>{stamp(agent.startedAt)}</dd><dt className="text-[var(--ink-muted)]">{t('subagentView.finished')}</dt><dd>{stamp(agent.finishedAt)}</dd></dl></>}
        {activeTab === 'progress' && <><h3 className="mb-3 font-medium">{t('subagentView.latest')}</h3><p className="text-xs text-[var(--ink-muted)]">{t('subagentView.lastActivity')}: {stamp(agent.lastActivityAt)}</p><p className="my-3 whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">{lastCall ? `${lastCall.name}\n${(lastCall.result ?? '').slice(-4000)}` : t('subagentView.noActivity')}</p><p className="mt-4 text-xs leading-relaxed text-[var(--ink-muted)]">{t('subagentView.progressBoundary')}</p></>}
        {activeTab === 'tools' && <><h3 className="mb-3 font-medium">{t('subagentView.toolCount', { count: publicCalls.length })}</h3>{publicCalls.length ? publicCalls.map(call => <details key={call.id} className="mb-2 rounded-lg border border-[var(--line-subtle)]"><summary className="cursor-pointer px-3 py-2 text-xs">{call.name} · {t(call.isLoading && agent.status === 'running' ? 'subagentView.status.running' : call.isError ? 'subagentView.status.failed' : call.result ? 'subagentView.hasOutput' : 'subagentView.notRecorded')}</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words border-t border-[var(--line-subtle)] p-3 font-mono text-xs [overflow-wrap:anywhere]">{call.result?.slice(0, 12000) || t('subagentView.noActivity')}</pre></details>) : <p className="text-[var(--ink-muted)]">{t('subagentView.noActivity')}</p>}</>}
      </>}
    </div>
    <footer className="shrink-0 border-t border-[var(--line-subtle)] p-3"><button type="button" onClick={() => onJumpToTool(jumpToolId)} className="flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-2 text-xs text-[var(--accent)] hover:bg-[var(--hover-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">{t('subagentView.locate')}<ChevronRightIcon className="size-3.5" /></button></footer>
  </aside>;
});
