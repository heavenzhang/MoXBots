import { useTranslation } from 'react-i18next';
import { GitBranchIcon } from '@/components/icons';
import type { SessionTaskView } from '../../../shared/sessionTaskOrchestration';
import { useElapsedSeconds } from './useElapsedSeconds';
import { SubagentRunningIcon } from './icons';
import { subagentDetailAction, subagentOutcome } from './subagentOutcome';

export function taskPhaseColor(phase: SessionTaskView['phase']) {
  return phase === 'failed' ? 'var(--error)' : phase === 'completed' ? 'var(--success)'
    : phase === 'interrupted' || phase === 'rework' || phase === 'unknown' || phase === 'blocked' ? 'var(--warning)'
      : phase === 'running' ? 'var(--accent)' : 'var(--ink-secondary)';
}

/** Each row is one task, with its current execution and review kept distinct. */
export default function SessionTaskResultRow({ task, report, onInspect, onFeedback, disabled = false }: {
  task: SessionTaskView; report?: string; onInspect: (id: string) => void; onFeedback?: () => void; disabled?: boolean;
}) {
  const { t } = useTranslation('app');
  const attempt = task.attempts.find(item => item.id === task.reviewAttemptId);
  const lifecycle = attempt?.lifecycle;
  const elapsed = useElapsedSeconds(lifecycle?.timingVerified !== false && lifecycle?.startedAt
    && (task.phase === 'running' || lifecycle.finishedAt !== undefined) ? lifecycle.startedAt : null, lifecycle?.finishedAt);
  const outcome = subagentOutcome(lifecycle?.result ?? report);
  const exceptional = task.phase === 'failed' || task.phase === 'interrupted' || task.phase === 'unknown' || task.phase === 'rework';
  const summary = exceptional && outcome.kind !== 'report' ? t(`orchestration.collaboration.${outcome.kind}`)
    : outcome.text ?? (task.phase === 'running' ? task.activeForm : undefined);
  const color = taskPhaseColor(task.phase);
  return <li data-task-result={task.id} data-task-phase={task.phase} className={`min-w-0 rounded-lg border bg-[var(--paper-elevated)] px-3 py-2.5 ${task.phase === 'failed' ? 'border-[var(--error)]/30' : 'border-[var(--line-subtle)]'}`}>
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 shrink-0" style={{ color }} aria-hidden="true">{task.phase === 'running' ? <SubagentRunningIcon /> : <GitBranchIcon className="size-4" />}</span>
      <span className="min-w-0 flex-1 break-words text-sm font-medium [overflow-wrap:anywhere]">{task.title}</span>
      <span className="shrink-0 rounded-md border border-current/20 px-1.5 py-0.5 text-xs" style={{ color }}>{t(`orchestration.phase.${task.phase}`)}</span>
    </div>
    {summary && <p className={`mt-1.5 line-clamp-2 break-words text-xs leading-5 [overflow-wrap:anywhere] ${task.phase === 'failed' ? 'text-[var(--error)]' : 'text-[var(--ink-secondary)]'}`}>{summary}</p>}
    {exceptional && !summary && <p className="mt-1.5 text-xs leading-5 text-[var(--ink-secondary)]">{t(`orchestration.collaboration.hint.${task.phase}`)}</p>}
    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--ink-muted)]">
      {lifecycle?.model && <span className="break-all">{lifecycle.model}</span>}
      {elapsed && <span className="tabular-nums">{elapsed}</span>}
      {task.attempts.length > 1 && <span>{t('orchestration.inline.attemptHistory', { count: task.attempts.length })}</span>}
      {attempt && <button type="button" onClick={() => onInspect(attempt.toolUseId)} className="compact-action rounded px-1 text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--focus-border)]">{t(subagentDetailAction(task.phase))}</button>}
      {exceptional && onFeedback && <button type="button" disabled={disabled} onClick={onFeedback} className="compact-action rounded px-1 text-[var(--ink-secondary)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--focus-border)] disabled:opacity-50">{t('orchestration.collaboration.feedback')}</button>}
    </div>
    {task.review && (task.review.decision === 'accept' && task.phase !== 'completed'
      ? <details className="mt-1 text-xs leading-5 text-[var(--ink-muted)]"><summary className="cursor-pointer">{t('orchestration.collaboration.historicalReview')}</summary><p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{task.review.evidence}</p></details>
      : <p className="mt-1 text-xs leading-5 text-[var(--ink-secondary)]">{t('orchestration.reviewEvidence')}: {task.review.evidence}</p>)}
  </li>;
}
