import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecoveryReviewAction } from '../../shared/recoveryReconciliation';
import OverlayBackdrop from './OverlayBackdrop';
import { useCloseLayer } from '../hooks/useCloseLayer';
import { isImeComposingEvent } from '../utils/imeKeyboard';

export function RecoveryActionDetails({ actions, busy, error, onClose, onPrepareCheck }: {
  actions: RecoveryReviewAction[];
  busy: boolean;
  error: boolean;
  onClose: () => void;
  onPrepareCheck?: (action: RecoveryReviewAction) => void;
}) {
  const { t } = useTranslation('chat');
  const titleId = useId();
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
        const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), summary, [tabindex="0"]') ?? []);
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
        <ol className="mt-4 space-y-3">
          {actions.map((action, index) => <li key={action.actionHash} className="rounded-lg border border-[var(--line)] p-3">
            <h3 className="font-medium text-[var(--ink)]">{index + 1}. {t(`recoveryReview.kinds.${action.presentation?.kind ?? 'unknown'}`)}</h3>
            <p className="mt-1 break-words">{t('recoveryReview.target')}{action.presentation?.target ?? t('recoveryReview.targetUnavailable')}</p>
            <p className="mt-2 font-medium">{t(action.eligible ? action.reason === 'native_hook_denied' ? 'recoveryReview.notExecuted' : 'recoveryReview.queryOnly' : 'recoveryReview.unverified')}</p>
            <p className="mt-1">{t(`recoveryReview.reasons.${action.reason}`)}</p>
            <p className="mt-2">{t(`recoveryReview.nextSteps.${action.reason}`)}</p>
            {!action.eligible && onPrepareCheck && <button type="button" disabled={busy || error} className="mt-2 rounded-md px-2 py-1 font-medium text-[var(--accent)] hover:bg-[var(--paper-hover)] disabled:opacity-50"
              onClick={() => { onPrepareCheck(action); onClose(); }}>{t('recoveryReview.prepareCheck')}</button>}
            <details className="mt-3 text-xs text-[var(--ink-muted)]"><summary className="cursor-pointer">{t('recoveryReview.technical')}</summary>
              <p className="mt-2">{t('recoveryReview.tool')}{action.tool}</p><code className="break-all">SHA-256 {action.actionHash}</code>
            </details>
          </li>)}
        </ol>
      </div>
      <footer className="shrink-0 border-t border-[var(--line)] p-4"><p>{t('recoveryReview.laterHint')}</p></footer>
    </div>
  </OverlayBackdrop>;
}
