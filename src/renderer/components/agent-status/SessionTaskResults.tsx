import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSessionTaskOrchestrationContext } from './useSessionTaskOrchestration';
import { useSessionTaskActions, type TaskReviewTarget } from './SessionTaskActionsContext';

/** Requests the main Agent's review through Chat; cannot accept a task itself. */
export default function SessionTaskResults() {
  const state = useSessionTaskOrchestrationContext();
  const actions = useSessionTaskActions();
  const { t } = useTranslation('app');
  const inFlight = useRef<string | null>(null);
  const [submission, setSubmission] = useState<{ sessionId: string; key: string; status: 'sending' | 'sent' | 'failed' } | null>(null);
  if (!state?.sessionId || !actions) return null;
  const awaiting = state.tasks.filter(task => task.phase === 'awaiting_review');
  const completed = state.tasks.filter(task => task.phase === 'completed');
  if (!awaiting.length) {
    const accepted = completed.filter(task => task.attempts.length > 0);
    return accepted.length > 0 ? <section aria-label={t('orchestration.inline.results')} className="my-3 flex min-w-0 flex-wrap items-center gap-2 border-t border-[var(--line-subtle)] px-3 py-2 text-xs text-[var(--ink-muted)]">
      <span className="text-[var(--success)]">{t('orchestration.inline.accepted', { count: accepted.length })}</span>
      {accepted.map(task => <button key={task.id} type="button" className="compact-action min-w-0 break-words text-left text-[var(--accent)]" onClick={() => {
        const current = task.attempts.find(attempt => attempt.id === task.reviewAttemptId);
        if (current) actions.onInspect(current.toolUseId);
      }}>{task.title}</button>)}
    </section> : null;
  }
  const targets: TaskReviewTarget[] = awaiting.map(task => ({ sessionId: state.sessionId!, taskId: task.id, attemptId: task.reviewAttemptId ?? 'main' }));
  const key = JSON.stringify([state.epoch, targets]);
  const status = submission?.sessionId === state.sessionId && submission.key === key ? submission.status : null;
  const submit = async (retry = false) => {
    if (inFlight.current === key || status === 'sent' && (!retry || !state.canRetryReview) || state.stale || actions.disabled) return;
    inFlight.current = key;
    setSubmission({ sessionId: state.sessionId!, key, status: 'sending' });
    try {
      const accepted = await actions.onReview(targets);
      setSubmission({ sessionId: state.sessionId!, key, status: accepted ? 'sent' : 'failed' });
    } catch {
      setSubmission({ sessionId: state.sessionId!, key, status: 'failed' });
    } finally { if (inFlight.current === key) inFlight.current = null; }
  };
  return <section aria-label={t('orchestration.inline.results')} className="my-3 min-w-0 border-t border-[var(--line-subtle)] px-3 py-2 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ink-muted)]">
      <span>{t('orchestration.inline.results')}</span>
      <span>{t('orchestration.awaiting', { count: awaiting.length })}{completed.length > 0 && ` · ${t('orchestration.inline.acceptedCount', { count: completed.length })}`}</span>
    </div>
    <ul className="my-1 list-none p-0">{awaiting.map(task => <li key={task.id} className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 break-words text-sm [overflow-wrap:anywhere]">{task.title}</span>
      {task.attempts.length > 0 && <button type="button" className="compact-action shrink-0 text-xs text-[var(--accent)]" onClick={() => {
        const current = task.attempts.find(attempt => attempt.id === task.reviewAttemptId);
        if (current) actions.onInspect(current.toolUseId);
      }}>{t('orchestration.inline.viewResult')}</button>}
    </li>)}</ul>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button type="button" className="compact-action text-xs text-[var(--accent)] disabled:opacity-50" disabled={state.stale || actions.disabled || status === 'sending' || status === 'sent'} onClick={() => void submit()}>{t(status === 'sending' ? 'orchestration.inline.sending' : status === 'sent' ? 'orchestration.inline.requested' : 'orchestration.inline.review')}</button>
      {status === 'sent' && state.canRetryReview && <button type="button" className="compact-action text-xs text-[var(--accent)] disabled:opacity-50" disabled={state.stale || actions.disabled} onClick={() => void submit(true)}>{t('orchestration.inline.retryReview')}</button>}
      <button type="button" className="compact-action text-xs text-[var(--accent)] disabled:opacity-50" disabled={state.stale || actions.disabled || status === 'sending'} onClick={() => actions.onComposeRework(targets)}>{t('orchestration.inline.rework')}</button>
    </div>
    {(state.stale || status === 'sent' || status === 'failed') && <p role="status" className={`mt-1 text-xs ${state.stale || status === 'failed' ? 'text-[var(--warning)]' : 'text-[var(--ink-muted)]'}`}>{t(state.stale ? 'orchestration.stale' : status === 'failed' ? 'orchestration.inline.failed' : 'orchestration.inline.requestBoundary')}</p>}
  </section>;
}
