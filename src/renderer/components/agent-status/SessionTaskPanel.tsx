import { useTranslation } from 'react-i18next';
import type { SessionTaskView } from '../../../shared/sessionTaskOrchestration';

export default function SessionTaskPanel({ tasks, stale, onRetry, onSelectAgent, onHistory }: {
  tasks: readonly SessionTaskView[]; stale: boolean; onRetry: () => void; onSelectAgent: (id: string) => void; onHistory?: () => void;
}) {
  const { t } = useTranslation('app');
  const active = tasks.filter(task => task.phase !== 'completed');
  const hasAttempts = tasks.some(task => task.attempts.length > 0);
  const completed = tasks.filter(task => task.phase === 'completed');
  const row = (task: SessionTaskView) => <li key={task.id} className="py-1.5">
    <div className="flex min-h-5 items-start justify-between gap-3">
      <span className="min-w-0 break-words text-sm [overflow-wrap:anywhere]">{task.title}</span>
      <span className={`shrink-0 text-xs ${task.phase === 'completed' || task.phase === 'running' ? 'text-[var(--success)]' : task.phase === 'awaiting_review' || task.phase === 'rework' || task.phase === 'failed' || task.phase === 'unknown' || task.phase === 'interrupted' ? 'text-[var(--warning)]' : 'text-[var(--ink-secondary)]'}`}>{t(`orchestration.phase.${task.phase}`)}</span>
    </div>
    {task.phase === 'running' && task.activeForm && task.activeForm !== task.title && <p className="mt-1 text-xs text-[var(--ink-secondary)]">{task.activeForm}</p>}
    {task.blockedBy.length > 0 && <p className="mt-1 break-words text-xs text-[var(--ink-muted)]">{t('orchestration.dependencies')}: {task.blockedBy.map(id => tasks.find(task => task.id === id)?.title ?? id).join(', ')}</p>}
    {task.attempts.length > 0 && <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-[var(--ink-secondary)]">{t('orchestration.attempts', { count: task.attempts.length })}</summary>
      <ul className="mt-1 space-y-1">{task.attempts.map((attempt, index) => <li key={attempt.id}>
        <button type="button" onClick={() => onSelectAgent(attempt.toolUseId)} className="min-h-8 max-w-full break-words text-left text-[var(--accent)] underline-offset-2 hover:underline [overflow-wrap:anywhere]">
          {index + 1}. {attempt.agentId ?? attempt.title} · {t(attempt.lifecycle.status === 'completed' && attempt.executionVerified !== false ? 'orchestration.returned' : `orchestration.phase.${attempt.executionVerified === false ? 'unknown' : attempt.lifecycle.status}`)}
        </button>
      </li>)}</ul>
    </details>}
    {task.review && <p className="mt-2 whitespace-pre-wrap break-words text-xs text-[var(--ink-secondary)] [overflow-wrap:anywhere]">{t(task.review.decision === 'accept' && task.phase !== 'completed' ? 'orchestration.collaboration.historicalReview' : 'orchestration.reviewEvidence')}: {task.review.evidence}</p>}
  </li>;
  return <section aria-label={t('orchestration.title')} className="px-3 py-1">
    {stale && <p role="status" className="mb-2 text-xs text-[var(--warning)]">{t('orchestration.stale')} <button type="button" onClick={onRetry} className="underline">{t('orchestration.retry')}</button></p>}
    <ul className="m-0 list-none divide-y divide-[var(--line-subtle)] p-0">{active.map(row)}</ul>
    {completed.length > 0 && <details className="mt-2 border-t border-[var(--line-subtle)] pt-2 text-xs">
      <summary className="min-h-8 cursor-pointer text-[var(--ink-secondary)]">{t('orchestration.completedCount', { count: completed.length })}</summary>
      <ul className="m-0 list-none divide-y divide-[var(--line-subtle)] p-0">{completed.map(row)}</ul>
    </details>}
    {(hasAttempts || onHistory) && <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 border-t border-[var(--line-subtle)] pt-1 text-xs text-[var(--ink-muted)]">
      {hasAttempts && <span>{t('orchestration.reviewBoundary')}</span>}
      {onHistory && <button type="button" onClick={onHistory} className="min-h-8 shrink-0 text-[var(--accent)]">{t('orchestration.executionHistory')}</button>}
    </div>}
  </section>;
}
