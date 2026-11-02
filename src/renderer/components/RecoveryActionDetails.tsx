import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecoveryReviewAction } from '../../shared/recoveryReconciliation';
import OverlayBackdrop from './OverlayBackdrop';
import { useCloseLayer } from '../hooks/useCloseLayer';
import { isImeComposingEvent } from '../utils/imeKeyboard';

export function RecoveryActionDetails({ actions, completed = [], reviewed = [], independentTasks = [], busy, error, onClose, onPrepareCheck, onSave }: {
  completed?: RecoveryReviewAction[];
  reviewed?: RecoveryReviewAction[];
  independentTasks?: {taskId: string; title: string}[];
  onSave?: (action: RecoveryReviewAction, kind: 'note' | 'defer', text: string, requestId: string) => Promise<boolean>;
  actions: RecoveryReviewAction[];
  busy: boolean;
  error: boolean;
  onClose: () => void;
  onPrepareCheck?: (action: RecoveryReviewAction) => void;
}) {
  const { t } = useTranslation('chat');
  const titleId = useId();
  const [editing, setEditing] = useState<string>();
  const [draft, setDraft] = useState('');
  const [requestId, setRequestId] = useState('');
  const [saved, setSaved] = useState<string>();
  const groups = new Map<string, RecoveryReviewAction[]>();
  for (const action of actions) {
    const key = action.association?.taskId ?? `kind:${action.presentation?.kind ?? 'unknown'}`;
    groups.set(key, [...(groups.get(key) ?? []), action]);
  }
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useCloseLayer(() => { onClose(); return true; }, 210);
  useEffect(() => {
    const previous = document.activeElement;
    close.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <OverlayBackdrop portal className="z-[210] !justify-end" onClose={onClose}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId}
      className="flex h-full w-full max-w-lg flex-col border-l border-[var(--line)] bg-[var(--paper-elevated)] text-sm text-[var(--ink-secondary)] shadow-xl"
      onKeyDown={event => {
        if (isImeComposingEvent(event)) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
        if (event.key !== 'Tab') return;
        const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]') ?? []);
        const first = items[0]; const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] p-4">
        <h2 id={titleId} className="text-base font-semibold text-[var(--ink)]">{t('recoveryReview.title')}</h2>
        <button ref={close} type="button" className="rounded-md px-3 py-2 hover:bg-[var(--paper-hover)] focus-visible:outline-2" onClick={onClose}>{t('recoveryReview.close')}</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p>{t('recoveryReview.boundary')}</p>
        {busy && <p role="status" className="mt-3">{t('recoveryReview.states.checking')}</p>}
        {error && <p role="alert" className="mt-3">{t('recoveryReview.changed')}</p>}
        {!busy && !error && !actions.length && <p className="mt-3">{t('recoveryReview.empty')}</p>}
        {independentTasks.length > 0 && <section className="mt-4 rounded-lg border border-[var(--line)] p-3">
          <h3 className="font-medium">{t('recoveryReview.independent')}</h3>
          <ul className="mt-2 list-inside list-disc">{independentTasks.map(task => <li key={task.taskId}>{task.title}</li>)}</ul>
        </section>}
        {[...groups].map(([key, entries]) => <section key={key} className="mt-4">
          <h3 className="mb-2 font-semibold text-[var(--ink)]">{entries[0].association?.title ?? t(`recoveryReview.kinds.${entries[0].presentation?.kind ?? 'unknown'}`)} · {entries.length}</h3>
          <ol className="space-y-3">
          {entries.map((action, index) => <li key={action.actionHash} className="rounded-lg border border-[var(--line)] p-3">
            <h4 className="font-medium text-[var(--ink)]">{index + 1}. {t(`recoveryReview.kinds.${action.presentation?.kind ?? 'unknown'}`)}</h4>
            <p className="mt-1 break-words">{t('recoveryReview.target')}{action.presentation?.target ?? t('recoveryReview.targetUnavailable')}</p>
            <p className="mt-2 font-medium">{t(action.reason === 'native_success' ? 'recoveryReview.completed' : action.eligible ? action.reason === 'native_hook_denied' ? 'recoveryReview.notExecuted' : 'recoveryReview.queryOnly' : 'recoveryReview.unverified')}</p>
            <p className="mt-1">{t(`recoveryReview.reasons.${action.reason}`)}</p>
            {action.check && <p className="mt-2 rounded-md bg-[var(--paper-inset)] p-2">{t(`recoveryReview.checks.${action.check.kind}`)}</p>}
            {action.association && <p className="mt-2">{t('recoveryReview.affected', {count: action.association.blockedTaskIds.length})}</p>}
            <p className="mt-2">{t(`recoveryReview.nextSteps.${action.reason}`)}</p>
            {!!action.followups?.length && <div className="mt-3 space-y-2 border-t border-[var(--line)] pt-2">
              {action.followups.map(note => <p key={note.requestId} className="whitespace-pre-wrap break-words"><strong>{t(note.kind === 'defer' ? 'recoveryReview.deferred' : 'recoveryReview.userNote')}</strong>{note.text}</p>)}
            </div>}
            {saved === action.actionHash && <p role="status" className="mt-2">{t('recoveryReview.saved')}</p>}
            {!action.eligible && <div className="mt-2 flex flex-wrap gap-2">
              {onSave && <button type="button" disabled={busy} className="rounded-md px-2 py-1 font-medium text-[var(--accent)] hover:bg-[var(--paper-hover)] disabled:opacity-50"
                onClick={() => {setEditing(action.actionHash); setDraft(''); setRequestId(crypto.randomUUID()); setSaved(undefined);}}>{t('recoveryReview.addNote')}</button>}
              {onPrepareCheck && <button type="button" disabled={busy || error} className="rounded-md px-2 py-1 font-medium text-[var(--accent)] hover:bg-[var(--paper-hover)] disabled:opacity-50"
                onClick={() => { onPrepareCheck(action); onClose(); }}>{t('recoveryReview.prepareCheck')}</button>}
              {onSave && !action.followups?.some(note => note.kind === 'defer') && <button type="button" disabled={busy}
                className="rounded-md px-2 py-1 hover:bg-[var(--paper-hover)] disabled:opacity-50"
                onClick={() => { void onSave(action, 'defer', '', crypto.randomUUID()).then(ok => {if(ok) setSaved(action.actionHash);}); }}>{t('recoveryReview.defer')}</button>}
            </div>}
            {editing === action.actionHash && <form className="mt-3" onSubmit={event => {
              event.preventDefault();
              if (!onSave || busy || !draft.trim()) return;
              void onSave(action, 'note', draft, requestId).then(ok => {if(ok) {setEditing(undefined); setSaved(action.actionHash);}});
            }}>
              <label className="block">{t('recoveryReview.noteLabel')}
                <textarea maxLength={4000} rows={4} value={draft} disabled={busy} onChange={event => {setDraft(event.target.value); setRequestId(crypto.randomUUID());}}
                  className="mt-2 w-full rounded-md border border-[var(--line)] bg-[var(--paper)] p-2 text-[var(--ink)]" />
              </label>
              <p className="mt-1">{t('recoveryReview.noteBoundary')}</p>
              <div className="mt-2 flex gap-2">
                <button type="submit" disabled={busy || !draft.trim()} className="rounded-md px-3 py-1 text-[var(--accent)] disabled:opacity-50">{t('recoveryReview.saveNote')}</button>
                <button type="button" disabled={busy} onClick={() => setEditing(undefined)}>{t('recoveryReview.cancel')}</button>
              </div>
            </form>}
            <details className="mt-3 text-xs text-[var(--ink-muted)]"><summary className="cursor-pointer">{t('recoveryReview.technical')}</summary>
              <p className="mt-2">{t('recoveryReview.tool')}{action.tool}</p><code className="break-all">SHA-256 {action.actionHash}</code>
            </details>
          </li>)}
          </ol>
        </section>)}
        {reviewed.length > 0 && <details className="mt-4 rounded-lg border border-[var(--line)] p-3"><summary>{t('recoveryReview.reviewedCount', {count: reviewed.length})}</summary>
          <ul className="mt-2 space-y-2">{reviewed.map(action => <li key={action.actionHash}>
            {t(`recoveryReview.kinds.${action.presentation?.kind ?? 'unknown'}`)} · {t(action.reason === 'native_hook_denied' ? 'recoveryReview.notExecuted' : 'recoveryReview.queryOnly')}
          </li>)}</ul>
        </details>}
        {completed.length > 0 && <details className="mt-4 rounded-lg border border-[var(--line)] p-3"><summary>{t('recoveryReview.completedCount', {count: completed.length})}</summary>
          <ul className="mt-2 space-y-2">{completed.map(action => <li key={action.actionHash}>
            {t(`recoveryReview.kinds.${action.presentation?.kind ?? 'unknown'}`)} · {action.presentation?.target ?? t('recoveryReview.completed')}
          </li>)}</ul>
        </details>}

      </div>
      <footer className="shrink-0 border-t border-[var(--line)] p-4"><p>{t('recoveryReview.laterHint')}</p></footer>
    </div>
  </OverlayBackdrop>;
}
