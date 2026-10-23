import { ChevronDownIcon } from '@/components/icons';
import { memo, useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ContentBlock } from '@/types/chat';
import { useNotifyRowLayoutChanged } from '@/context/ChatRowLayoutContext';
import { buildProcessPhases, summarizeProcessPhase, type ProcessPhase } from '@/utils/processPresentation';
import { groupProcessResults, processPhaseResult } from '@/utils/processResults';
import { isSubagentContainerTool } from './tools/subagentActivity';
import ProcessRow from './ProcessRow';
import ProcessStatus from './ProcessStatus';
import ProcessTiming from './ProcessTiming';
import { useRemoteConversationContent } from '@/context/ConversationContentContext';

interface BlockGroupProps {
  blocks: ContentBlock[];
  isLatestActiveSection?: boolean;
  isStreaming?: boolean;
}

interface ProcessPhaseCardProps { phase: ProcessPhase; live: boolean; hasFollowingPhase: boolean }

// The projection creates new entry arrays on each stream event. Only changed
// blocks (or their lifecycle/outcome) invalidate a committed phase's rows.
function samePhase(previous: ProcessPhaseCardProps, next: ProcessPhaseCardProps) {
  return previous.live === next.live && previous.hasFollowingPhase === next.hasFollowingPhase
    && previous.phase.key === next.phase.key && previous.phase.kind === next.phase.kind
    && previous.phase.entries.length === next.phase.entries.length
    && previous.phase.entries.every((entry, index) => {
      const other = next.phase.entries[index];
      return entry.block === other.block && entry.index === other.index && entry.outcome === other.outcome;
    });
}

const ProcessPhaseCard = memo(function ProcessPhaseCard({ phase, live, hasFollowingPhase }: ProcessPhaseCardProps) {
  const { t } = useTranslation('chat');
  const remoteContent = useRemoteConversationContent();
  const [expanded, setExpanded] = useState(remoteContent);
  // File aggregation can reparent a completed row; keep user choices by event ID.
  const [rowExpansions, setRowExpansions] = useState<Record<string, boolean>>({});
  const detailsId = useId();
  const notify = useNotifyRowLayoutChanged();
  const handleChildExpand = useCallback(() => { notify('block-group-expand'); setExpanded(true); }, [notify]);
  const handleExpansionChange = useCallback((open: boolean, block: ContentBlock, index: number) => {
    setRowExpansions(previous => ({ ...previous, [block.id ?? block.tool?.id ?? index]: open }));
  }, []);
  const { counts, outcome } = summarizeProcessPhase(phase.entries);
  // Real active/failed calls and child navigation anchors remain reachable.
  const important = (entry: ProcessPhase['entries'][number]) =>
    ['running', 'failed', 'stopped'].includes(entry.outcome)
    || Boolean(entry.block.tool && isSubagentContainerTool(entry.block.tool.name));
  const single = phase.entries.length === 1;
  const visible = single || expanded ? phase.entries : phase.entries.filter(important);
  const hasImportant = phase.entries.some(important);
  const previousVisibleCount = useRef(visible.length);
  useLayoutEffect(() => {
    if (previousVisibleCount.current !== visible.length) notify('tool-complete');
    previousVisibleCount.current = visible.length;
  }, [visible.length, notify]);
  const result = processPhaseResult(phase, t);

  return <section data-process-phase={phase.kind} data-phase-outcome={outcome}
    className={`min-w-0 overflow-hidden rounded-lg ${phase.kind === 'think' ? '' : 'bg-[var(--paper-inset)]/30'}`}>
    {!single && <button type="button" aria-expanded={expanded} aria-controls={detailsId}
      aria-label={t(expanded ? 'process.hideResults' : 'process.showResults', { count: phase.entries.length })}
      onClick={() => { notify(expanded ? 'block-group-collapse' : 'block-group-expand'); setExpanded(!expanded); }}
      className="flex w-full min-w-0 items-start gap-2 px-3 py-2 text-left hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]">
      <ChevronDownIcon aria-hidden="true" className={`mt-0.5 size-3.5 shrink-0 text-[var(--ink-muted)] transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-[var(--ink)]">{t(`process.heading.${phase.kind}`)}</span>
          <span className="text-xs tabular-nums text-[var(--ink-muted)]">{t('process.result.progress', { completed: counts.succeeded, total: phase.entries.length })}</span>
          {counts.running > 0 && <span className="text-xs text-[var(--accent)]">{t('process.summary.running', { count: counts.running })}</span>}
          {counts.failed > 0 && <span className="text-xs text-[var(--error)]">{t('process.summary.failed', { count: counts.failed })}</span>}
          {counts.stopped > 0 && <span className="text-xs text-[var(--warning)]">{t('process.summary.stopped', { count: counts.stopped })}</span>}
          {counts.unknown > 0 && <span className="text-xs text-[var(--ink-secondary)]">{t('process.summary.unknown', { count: counts.unknown })}</span>}
          {!expanded && !hasImportant && <span className="ml-auto"><ProcessTiming blocks={phase.entries.map(entry => entry.block)} running={false} /></span>}
        </span>
        {!expanded && !hasImportant && <span data-phase-result className="mt-0.5 block break-words text-sm text-[var(--ink-secondary)]">{result}</span>}
      </span>
      {!expanded && !hasImportant && <span className="mt-0.5"><ProcessStatus outcome={outcome} compact={outcome === 'succeeded'} /></span>}
    </button>}
    <div id={detailsId}>
      {groupProcessResults(visible).map(group => <div key={group.key}>
        {group.path && group.entries.length > 1 && <p className="border-t border-[var(--line-subtle)] px-4 pt-2 text-xs text-[var(--ink-secondary)] break-all">
          {group.path.replaceAll('\\', '/').split('/').at(-1)} · {t('process.result.updates', { count: group.entries.length })}
        </p>}
        {group.entries.map((entry, index) => <ProcessRow
          key={entry.block.id ?? entry.block.tool?.id ?? entry.index}
          block={entry.block} index={entry.index}
          hasFollowingBlock={hasFollowingPhase || entry.index !== phase.entries.at(-1)?.index}
          isStreaming={live} onUserExpand={handleChildExpand}
          resultFirst resultLabel={group.entries.length > 1 ? t('process.result.updateNumber', { count: index + 1 }) : undefined}
          expandedOverride={rowExpansions[entry.block.id ?? entry.block.tool?.id ?? entry.index]}
          onExpansionChange={handleExpansionChange}
        />)}
      </div>)}
    </div>
  </section>;
}, samePhase);

const BlockGroup = memo(function BlockGroup({ blocks, isStreaming = false }: BlockGroupProps) {
  const phases = buildProcessPhases(blocks, isStreaming);
  if (!phases.length) return null;
  return <div className="my-2 min-w-0 space-y-1 select-none" data-process-group>
    {phases.map((phase, index) => <ProcessPhaseCard key={phase.key} phase={phase} live={isStreaming} hasFollowingPhase={index < phases.length - 1} />)}
  </div>;
});
export default BlockGroup;
