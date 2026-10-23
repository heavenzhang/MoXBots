import { useTranslation } from 'react-i18next';
import type { SessionPlanExecution } from '../../../shared/sessionPlanExecution';

/** The same task/attempt/review projection as the Session task panel. */
export function PlanExecutionProgress({ execution, onInspect }: {
  execution: SessionPlanExecution;
  onInspect?: (toolUseId: string) => void;
}) {
  const { t } = useTranslation('app');
  return <div className="mt-3 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ink-secondary)]">
      <span>{t('orchestrationPlan.progress', { completed: execution.completed, total: execution.total })}</span>
      <span>{t('orchestration.reviewBoundary')}</span>
    </div>
    <progress aria-label={t('orchestrationPlan.progressLabel')} value={execution.completed} max={Math.max(1, execution.total)} className="block h-1.5 w-full accent-[var(--success)]" />
    <details className="rounded-lg bg-[var(--paper-inset)] p-3 text-xs">
      <summary className="min-h-8 cursor-pointer rounded text-sm text-[var(--ink-secondary)] focus-visible:outline-2 focus-visible:outline-[var(--focus-border)]">
        {t('orchestrationPlan.executionDetails')}
      </summary>
      <ol className="mt-2 list-none space-y-3 p-0">
        {execution.steps.map(({ step, task, phase }, index) => <li key={step.id} className="min-w-0 border-t border-[var(--line-subtle)] pt-2 [overflow-wrap:anywhere]">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <span className="min-w-0 flex-1 whitespace-pre-wrap text-sm">{index + 1}. {step.title}</span>
            <span className={phase === 'completed' ? 'text-[var(--success)]' : ['failed', 'rework', 'interrupted', 'unknown'].includes(phase) ? 'text-[var(--warning)]' : 'text-[var(--ink-secondary)]'}>{t(`orchestration.phase.${phase}`)}</span>
          </div>
          {step.assignee && <p className="mt-1 text-[var(--ink-muted)]">{step.assignee}</p>}
          {task?.activeForm && phase === 'running' && task.activeForm !== task.title && <p className="mt-1 whitespace-pre-wrap text-[var(--ink-secondary)]">{task.activeForm}</p>}
          {(task?.blockedBy ?? step.blockedBy ?? []).length > 0 && <p className="mt-1 text-[var(--ink-muted)]">
            {t('orchestration.dependencies')}: {(task?.blockedBy ?? step.blockedBy ?? []).map(id => execution.steps.find(item => item.step.id === id)?.step.title ?? id).join(', ')}
          </p>}
          {!task && <p className="mt-1 text-[var(--ink-muted)]">{t('orchestrationPlan.taskPending')}</p>}
          {task && task.attempts.length === 0 && <p className="mt-1 text-[var(--ink-muted)]">{t('orchestration.mainAgent')}</p>}
          {task?.review && <div className="mt-2">
            <p className="font-medium text-[var(--ink-secondary)]">{t('orchestration.reviewEvidence')}</p>
            <p className="mt-1 whitespace-pre-wrap text-[var(--ink-secondary)]">{task.review.evidence}</p>
          </div>}
          {task && task.attempts.length > 0 && <ul className="mt-2 list-none space-y-2 p-0">{task.attempts.map(attempt => <li key={attempt.id}>
            <p className="text-[var(--ink-muted)]">{attempt.id === task.reviewAttemptId ? t('orchestrationPlan.currentAttempt') : t('orchestrationPlan.previousAttempt')} · {attempt.agentId ?? attempt.title} · {t(attempt.executionVerified === false ? 'orchestration.phase.unknown' : attempt.lifecycle.status === 'completed' ? 'orchestration.returned' : `orchestration.phase.${attempt.lifecycle.status}`)}</p>
            {attempt.lifecycle.result && <p className="mt-1 whitespace-pre-wrap text-[var(--ink-secondary)]">{attempt.lifecycle.result}</p>}
            {onInspect && attempt.id === task.reviewAttemptId && <button type="button" onClick={() => onInspect(attempt.toolUseId)} className="compact-action mt-1 rounded text-left text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--focus-border)]">
              {t('orchestrationPlan.viewExecution')}
            </button>}
          </li>)}</ul>}
        </li>)}
      </ol>
    </details>
  </div>;
}
