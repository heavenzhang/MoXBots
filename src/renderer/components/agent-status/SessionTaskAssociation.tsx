import { useTranslation } from 'react-i18next';
import { useNotifyRowLayoutChanged } from '@/context/ChatRowLayoutContext';
import { useLayoutEffect, useRef } from 'react';
import { useSessionTaskOrchestrationContext } from './useSessionTaskOrchestration';
import { useSessionTaskActions } from './SessionTaskActionsContext';
import { subagentDetailAction } from './subagentOutcome';

/** Annotation on the existing native row, never another tool card or observer. */
export default function SessionTaskAssociation({ toolUseId, activationId }: { toolUseId: string; activationId?: string }) {
  const state = useSessionTaskOrchestrationContext();
  const actions = useSessionTaskActions();
  const { t } = useTranslation('app');
  const task = state?.tasks.find(task => task.attempts.some(attempt => attempt.toolUseId === toolUseId));
  const attempts = task?.attempts.filter(attempt => attempt.toolUseId === toolUseId) ?? [];
  const attempt = activationId ? attempts.find(attempt => attempt.lifecycle.activation?.id === activationId)
    : attempts.length === 1 ? attempts[0] : undefined;
  const current = !!attempt && attempt.id === task?.reviewAttemptId;
  const phase = current ? task?.phase : attempt?.executionVerified === false ? 'unknown'
    : attempt?.lifecycle.status === 'completed' ? 'awaiting_review' : attempt?.lifecycle.status;
  const notify = useNotifyRowLayoutChanged();
  const previous = useRef<string | null>(null);
  const identity = task ? `${task.id}:${attempt?.id}:${current}:${phase}` : null;
  useLayoutEffect(() => {
    if (previous.current !== identity) notify('tool-complete');
    previous.current = identity;
  }, [identity, notify]);
  if (!task) return null;
  return <div data-session-task-association={task.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-2 text-xs text-[var(--ink-muted)]">
    <span className="min-w-0 break-words [overflow-wrap:anywhere]">{task.title}</span>
    {!current && <span>{t(attempt ? 'orchestration.inline.historical' : 'orchestration.inline.attemptHistory', { count: attempt ? task.attempts.indexOf(attempt) + 1 : task.attempts.length })}</span>}
    {phase && <span className={phase === 'failed' ? 'text-[var(--error)]' : current && phase === 'completed' ? 'text-[var(--success)]' : phase === 'awaiting_review' || phase === 'rework' ? 'text-[var(--warning)]' : ''}>{t(!current && phase === 'awaiting_review' ? 'orchestration.returned' : `orchestration.phase.${phase}`)}</span>}
    {state?.stale && <span>{t('orchestration.syncPending')}</span>}
    {actions && <button type="button" className="compact-action ml-auto shrink-0 text-[var(--accent)]" onClick={() => actions.onInspect(toolUseId)}>{t(subagentDetailAction(phase))}</button>}
  </div>;
}
