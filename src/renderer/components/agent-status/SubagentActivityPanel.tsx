import { memo, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDownIcon, ChevronUpIcon, GitBranchIcon } from '@/components/icons';
import { useSubagentViews } from './useSubagentViews';
import type { SubagentView } from './subagentViewModel';
import { useElapsedSeconds } from './useElapsedSeconds';
import { SubagentRunningIcon } from './icons';

export function AgentActivityRow({ agent, onSelect }: { agent: SubagentView; onSelect: (id: string) => void }) {
  const { t } = useTranslation('app');
  const elapsed = useElapsedSeconds(agent.status === 'running' || agent.finishedAt !== undefined ? agent.startedAt ?? null : null, agent.finishedAt);
  return <button type="button" onClick={() => onSelect(agent.id)} className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--hover-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
    {agent.status === 'running' ? <SubagentRunningIcon /> : <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${agent.status === 'failed' ? 'bg-[var(--error)]' : agent.status === 'completed' ? 'bg-[var(--success)]' : 'bg-[var(--ink-muted)]'}`} />}
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium text-[var(--ink)]">{agent.title}</span>
      <span className="block truncate text-xs text-[var(--ink-muted)]">{agent.model || t('subagentView.modelUnknown')}{agent.parentAgentId ? ` · ${t('subagentView.nested')}` : ''}</span>
    </span>
    <span className="shrink-0 text-right text-xs text-[var(--ink-secondary)]"><span className="block">{t(`subagentView.status.${agent.status}`)}</span>{elapsed && <span className="block text-[var(--ink-muted)]">{elapsed}</span>}</span>
  </button>;
}

/** A durable entry survives completion; expanding never covers the composer. */
export default memo(function SubagentActivityPanel({ onSelect }: { onSelect: (id: string) => void }) {
  const { t } = useTranslation('app');
  const { views, tab } = useSubagentViews();
  const [disclosure, setDisclosure] = useState<{ sessionId: string | null; expanded: boolean; history: boolean } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const sessionId = tab?.sessionId ?? null;
  const expanded = disclosure?.sessionId === sessionId && disclosure.expanded;
  const history = disclosure?.sessionId === sessionId && disclosure.history;
  const running = views.filter(agent => agent.status === 'running').length;
  const current = views.filter(agent => agent.currentTurn || agent.status === 'running');
  const visible = history ? views : current;
  const returned = views.filter(agent => agent.status === 'completed').length;
  const failed = views.filter(agent => agent.status === 'failed' || agent.status === 'interrupted').length;
  if (tab?.isSessionLoading || (views.length === 0 && !tab?.hasMoreBefore)) return null;
  return <section data-subagent-activity className="pointer-events-auto w-full min-w-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--paper-elevated)] text-[var(--ink)] shadow-sm">
    <button ref={toggleRef} type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setDisclosure({ sessionId, expanded: !expanded, history: Boolean(history) })}
      className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--hover-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
      <GitBranchIcon className="size-4 shrink-0 text-[var(--accent)]" /><span className="font-medium">{t('subagentView.title')}</span>
      <span className="min-w-0 flex-1 truncate text-[var(--ink-secondary)]">{t('subagentView.summary', { running, returned, failed })}</span>
      {expanded ? <ChevronDownIcon className="size-3.5" /> : <ChevronUpIcon className="size-3.5" />}
    </button>
    {expanded && <div id={panelId} onKeyDown={event => { if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.stopPropagation(); setDisclosure({ sessionId, expanded: false, history: Boolean(history) }); toggleRef.current?.focus(); } }}>
      <div className="flex gap-2 border-y border-[var(--line-subtle)] px-3" role="group" aria-label={t('subagentView.scope')}>
        <button type="button" aria-pressed={!history} onClick={() => setDisclosure({ sessionId, expanded: true, history: false })} className={`min-h-9 border-b-2 px-2 text-xs ${!history ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--ink-muted)]'}`}>{t('subagentView.current')} {current.length}</button>
        <button type="button" aria-pressed={history} onClick={() => setDisclosure({ sessionId, expanded: true, history: true })} className={`min-h-9 border-b-2 px-2 text-xs ${history ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--ink-muted)]'}`}>{t('subagentView.history')} {views.length}{tab?.hasMoreBefore ? '+' : ''}</button>
      </div>
      <div className="max-h-44 divide-y divide-[var(--line-subtle)] overflow-y-auto overscroll-contain" aria-label={t('subagentView.list')}>
        {visible.length ? visible.map(agent => <AgentActivityRow key={agent.id} agent={agent} onSelect={onSelect} />) : <p className="p-3 text-xs text-[var(--ink-muted)]">{t('subagentView.currentEmpty')}</p>}
        {history && tab?.hasMoreBefore && <div className="p-3 text-xs text-[var(--ink-muted)]"><p>{t('subagentView.partialHistory')}</p><button type="button" disabled={loading} className="mt-1 min-h-8 text-[var(--accent)] disabled:opacity-50" onClick={async () => { setLoading(true); setLoadError(false); try { await tab.loadOlderMessages({ onError: () => setLoadError(true) }); } catch { setLoadError(true); } finally { setLoading(false); } }}>{t(loading ? 'subagentView.loading' : 'subagentView.loadMore')}</button>{loadError && <p role="alert">{t('subagentView.loadFailed')}</p>}</div>}
      </div>
    </div>}
  </section>;
});
