import { useTranslation } from 'react-i18next';
import { useSessionTaskOrchestrationContext } from './useSessionTaskOrchestration';
import { useSessionTaskActions } from './SessionTaskActionsContext';
import { useSubagentViews } from './useSubagentViews';
import SessionTaskResultRow, { taskPhaseColor } from './SessionTaskResultRow';

/** Read-only task results; review and feedback stay in the original Agent conversation. */
export default function SessionTaskResults() {
  const state = useSessionTaskOrchestrationContext();
  const actions = useSessionTaskActions();
  const { views } = useSubagentViews();
  const { t } = useTranslation('app');
  if (!state?.sessionId || !actions || !state.tasks.length) return null;
  const completed = state.tasks.filter(task => task.phase === 'completed');
  const children = state.tasks.filter(task => task.attempts.length > 0);
  const mainTasks = state.tasks.filter(task => !task.attempts.length);
  // Live main-agent tasks have one owner: the composer's task disclosure.
  // Keep a collapsed completed summary for cold history after that bar disappears.
  const showMainHistory = mainTasks.length > 0 && mainTasks.every(task => task.phase === 'completed');
  const accepted = completed.filter(task => task.attempts.length > 0);
  const phases = ['failed', 'interrupted', 'unknown', 'rework', 'running', 'blocked', 'pending', 'awaiting_review', 'completed'] as const;
  const ordered = [...children].sort((a, b) => phases.indexOf(a.phase) - phases.indexOf(b.phase));
  if (!children.length && !showMainHistory) return null;
  return <section aria-label={t('orchestration.collaboration.title')} className="my-4 min-w-0 border-t border-[var(--line-subtle)] pt-3 text-sm">
    {children.length > 0 && <>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1" aria-live="polite">
        <h3 className="text-sm font-medium">{t('orchestration.collaboration.title')} <span className="text-[var(--ink-muted)]">{children.length}</span></h3>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">{phases.filter(phase => children.some(task => task.phase === phase)).map(phase => <span key={phase} style={{ color: taskPhaseColor(phase) }}>{t(`orchestration.phase.${phase}`)} {children.filter(task => task.phase === phase).length}</span>)}</div>
      </div>
      <ul className="m-0 list-none space-y-2 p-0">{ordered.map(task => {
        const attempt = task.attempts.find(item => item.id === task.reviewAttemptId);
        const view = attempt && views.find(item => item.id === attempt.toolUseId && item.tool.subagentLifecycle?.activation?.id === attempt.lifecycle.activation?.id && (!attempt.runId || item.runId === attempt.runId));
        return <SessionTaskResultRow key={task.id} task={task} report={view?.result} onInspect={actions.onInspect} />;
      })}</ul>
      {accepted.length > 0 && <p className="mt-2 text-xs text-[var(--success)]">{t('orchestration.inline.accepted', { count: accepted.length })}</p>}
    </>}
    {showMainHistory && <details className="my-2 rounded-lg border border-[var(--line-subtle)] px-3 py-1.5">
      <summary className="min-h-8 cursor-pointer text-xs text-[var(--ink-secondary)]">{t('orchestration.collaboration.mainTasks', { count: mainTasks.length })} · {t('orchestration.inline.acceptedCount', { count: mainTasks.filter(task => task.phase === 'completed').length })}</summary>
      <ul className="mb-1 list-none space-y-2 p-0">{mainTasks.map(task => <li key={task.id} className="flex items-start gap-3 text-xs">
        <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{task.title}</span>
        <span className="shrink-0" style={{ color: taskPhaseColor(task.phase) }}>{t(`orchestration.phase.${task.phase}`)}</span>
      </li>)}</ul>
    </details>}
    {state.stale && <p role="status" className="mt-1 text-xs text-[var(--warning)]">{t('orchestration.stale')}</p>}
  </section>;
}
