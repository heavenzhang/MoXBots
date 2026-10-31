import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecoveryActionSnapshot, RecoveryActionRequest } from '../../shared/recoveryReconciliation';

export function RecoveryActionReview({ inspect, reconcile, disabled, sessionId, inspectRevision }: {
  inspect: () => Promise<RecoveryActionSnapshot>;
  reconcile: (request: RecoveryActionRequest) => Promise<RecoveryActionSnapshot>;
  disabled: boolean;
  sessionId: string;
  /** Stable idle transcript revision; each settled revision is inspected once. */
  inspectRevision?: string;
}) {
  const { t } = useTranslation('chat');
  const [snapshot, setSnapshot] = useState<RecoveryActionSnapshot>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const generation = useRef({ epoch: 0 });
  const pending = useRef(false);
  const lastAutoInspection = useRef<string | undefined>(undefined);
  const inspectRef = useRef(inspect);
  inspectRef.current = inspect;
  const reconcileRef = useRef(reconcile);
  reconcileRef.current = reconcile;
  const [recovered, setRecovered] = useState(false);
  const current = useRef({ sessionId, disabled });
  current.current = { sessionId, disabled };
  useEffect(() => {
    const scope = generation.current;
    scope.epoch++;
    pending.current = false;
    setSnapshot(undefined); setBusy(false); setError(false); setRecovered(false);
    return () => { scope.epoch++; };
  }, [sessionId, disabled]);
  const run = useCallback(async (operation: () => Promise<RecoveryActionSnapshot>, automatic = false, recoveryAction = false) => {
    if (pending.current || current.current.disabled) return;
    pending.current = true;
    const epoch = generation.current.epoch;
    const target = sessionId;
    setBusy(true); setError(false);
    if (recoveryAction) setRecovered(false);
    if (automatic) setRecovered(false);
    try {
      const result = await operation();
      if (epoch !== generation.current.epoch || current.current.sessionId !== target || current.current.disabled) return;
      if (result.sessionId !== target) throw new Error('review_owner_changed');
      setSnapshot(automatic && result.actions.length === 0 ? undefined : result);
      if (recoveryAction) setRecovered(result.actions.length === 0);
    } catch {
      if (epoch === generation.current.epoch) {
        setSnapshot(undefined);
        if (!automatic) setError(true);
      }
    } finally {
      if (epoch === generation.current.epoch) { pending.current = false; setBusy(false); }
    }
  }, [sessionId]);
  const recoverSession = useCallback(async () => {
    const operationEpoch = generation.current.epoch;
    let latest = await inspectRef.current();
    const target = current.current.sessionId;
    const assertCurrent = () => {
      if (generation.current.epoch !== operationEpoch || current.current.sessionId !== target || current.current.disabled) {
        throw new Error('recovery_review_superseded');
      }
    };
    assertCurrent();
    if (latest.sessionId !== target) throw new Error('review_owner_changed');
    const owner = { sdkSessionId: latest.sdkSessionId, epoch: latest.epoch };
    const attempted = new Set<string>();
    while (true) {
      assertCurrent();
      const action = latest.actions.find(item => item.eligible);
      if (!action) return latest;
      if (attempted.has(action.actionHash) || attempted.size >= 100) {
        throw new Error('recovery_review_no_progress');
      }
      attempted.add(action.actionHash);
      try {
        latest = await reconcileRef.current({
          reviewAuthority: latest.reviewAuthority, sessionId: latest.sessionId,
          sdkSessionId: latest.sdkSessionId, epoch: latest.epoch,
          ledgerDigest: latest.ledgerDigest, actionHash: action.actionHash,
        });
        assertCurrent();
      } catch {
        // A lost response may follow a durable commit. Refresh authoritative
        // state before deciding whether to continue; never resend this hash.
        latest = await inspectRef.current();
        assertCurrent();
      }
      if (latest.sessionId !== target || latest.sdkSessionId !== owner.sdkSessionId || latest.epoch !== owner.epoch
        || latest.actions.some(item => item.actionHash === action.actionHash)) {
        throw new Error('recovery_review_unresolved');
      }
    }
  }, []);
  useEffect(() => {
    if (disabled || !inspectRevision) return;
    const key = `${sessionId}:${inspectRevision}`;
    if (lastAutoInspection.current === key) return;
    if (busy || pending.current) return;
    lastAutoInspection.current = key;
    void run(() => inspectRef.current(), true);
  }, [busy, disabled, inspectRevision, sessionId, run]);
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
      {snapshot.actions.length > 0 && <p role="status">{t('recoveryReview.pendingCount', { count: snapshot.actions.length })}</p>}
      <div className="max-h-64 overflow-y-auto">
      {snapshot.actions.map(action => <article key={action.actionHash} className="my-2 rounded-md border border-[var(--line)] p-2">
        <p className="font-medium">{action.eligible
          ? t(action.reason === 'native_hook_denied' ? 'recoveryReview.hookDenied' : 'recoveryReview.taskQuery', { tool: action.tool })
          : t('recoveryReview.unverified')}</p>
        <p>{t(`recoveryReview.reasons.${action.reason}`)}</p>
        <p className="text-[var(--ink-muted)]">{t(`recoveryReview.nextSteps.${action.reason}`)}</p>
        <details className="my-1 text-xs"><summary>{t('recoveryReview.technical')}</summary><code className="break-all">SHA-256 {action.actionHash}</code></details>
      </article>)}
      </div>
      {snapshot.actions.some(action => action.eligible) && <button type="button" className={`${buttonClass} mt-2 font-semibold`} disabled={disabled || busy}
        onClick={() => void run(recoverSession, false, true)}>{t('recoveryReview.recoverSession')}</button>}
      {recovered && snapshot.actions.length === 0 && <p role="status">{t('recoveryReview.sessionReady')}</p>}
      <p role="status">{t('recoveryReview.resolved', { count: snapshot.resolvedCount })}</p>
    </section>}
  </div>;
}
