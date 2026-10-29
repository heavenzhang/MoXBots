import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecoveryActionSnapshot, RecoveryActionRequest } from '../../shared/recoveryReconciliation';

export function RecoveryActionReview({ inspect, reconcile, disabled, sessionId }: {
  inspect: () => Promise<RecoveryActionSnapshot>;
  reconcile: (request: RecoveryActionRequest) => Promise<RecoveryActionSnapshot>;
  disabled: boolean;
  sessionId: string;
}) {
  const { t } = useTranslation('chat');
  const [snapshot, setSnapshot] = useState<RecoveryActionSnapshot>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const generation = useRef({ epoch: 0 });
  const pending = useRef(false);
  const current = useRef({ sessionId, disabled });
  current.current = { sessionId, disabled };
  useEffect(() => {
    const scope = generation.current;
    scope.epoch++;
    pending.current = false;
    setSnapshot(undefined); setBusy(false); setError(false);
    return () => { scope.epoch++; };
  }, [sessionId, disabled]);
  async function run(operation: () => Promise<RecoveryActionSnapshot>) {
    if (pending.current || current.current.disabled) return;
    pending.current = true;
    const epoch = generation.current.epoch;
    const target = sessionId;
    setBusy(true); setError(false);
    try {
      const result = await operation();
      if (epoch !== generation.current.epoch || current.current.sessionId !== target || current.current.disabled) return;
      if (result.sessionId !== target) throw new Error('review_owner_changed');
      setSnapshot(result);
    } catch {
      if (epoch === generation.current.epoch) { setSnapshot(undefined); setError(true); }
    } finally {
      if (epoch === generation.current.epoch) { pending.current = false; setBusy(false); }
    }
  }
  const buttonClass = 'rounded-md px-2 py-1 text-sm text-[var(--accent)] hover:bg-[var(--hover-bg)] focus-visible:outline focus-visible:outline-2 disabled:opacity-50';
  return <div className="px-4 py-1 text-sm text-[var(--ink-muted)]">
    <button type="button" className={buttonClass} disabled={disabled || busy} onClick={() => void run(inspect)} aria-expanded={!!snapshot}>
      {t(busy ? 'recoveryReview.loading' : 'recoveryReview.open')}
    </button>
    {error && <p role="alert">{t('recoveryReview.changed')}</p>}
    {snapshot && <section aria-label={t('recoveryReview.title')} className="mt-2 rounded-md border border-[var(--line)] p-3">
      <div className="flex items-center justify-between gap-2"><strong>{t('recoveryReview.title')}</strong>
        <button type="button" className={buttonClass} onClick={() => { generation.current.epoch++; pending.current = false; setBusy(false); setSnapshot(undefined); }}>{t('recoveryReview.close')}</button></div>
      <p className="my-2">{t('recoveryReview.boundary')}</p>
      {!snapshot.actions.length && <p>{t('recoveryReview.empty')}</p>}
      <div className="max-h-64 overflow-y-auto">
      {snapshot.actions.map(action => <article key={action.actionHash} className="my-2 rounded-md border border-[var(--line)] p-2">
        <p className="font-medium">{action.eligible ? t('recoveryReview.taskQuery', { tool: action.tool }) : t('recoveryReview.unverified')}</p>
        <p>{t(`recoveryReview.reasons.${action.reason}`)}</p>
        <details className="my-1 text-xs"><summary>{t('recoveryReview.technical')}</summary><code className="break-all">SHA-256 {action.actionHash}</code></details>
        {action.eligible && <button type="button" className={buttonClass} disabled={disabled || busy} onClick={() => void run(() => reconcile({
          reviewAuthority: snapshot.reviewAuthority, sessionId: snapshot.sessionId, sdkSessionId: snapshot.sdkSessionId,
          epoch: snapshot.epoch, ledgerDigest: snapshot.ledgerDigest, actionHash: action.actionHash,
        }))}>{t('recoveryReview.resolve')}</button>}
      </article>)}
      </div>
      <p role="status">{t('recoveryReview.resolved', { count: snapshot.resolvedCount })}</p>
    </section>}
  </div>;
}
