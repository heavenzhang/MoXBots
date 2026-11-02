import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecoveryActionSnapshot, RecoveryActionRequest, RecoveryReviewAction } from '../../shared/recoveryReconciliation';
import { RecoveryActionDetails } from './RecoveryActionDetails';

export function RecoveryActionReview({ inspect, reconcile, disabled, sessionId, inspectRevision, interrupted = false, continuation, onPrepareCheck }: {
  inspect: () => Promise<RecoveryActionSnapshot>;
  reconcile: (request: RecoveryActionRequest) => Promise<RecoveryActionSnapshot>;
  disabled: boolean;
  sessionId: string;
  /** Each settled revision is inspected once, including after a busy transition. */
  inspectRevision?: string;
  interrupted?: boolean;
  continuation?: ReactNode;
  onPrepareCheck?: (action: RecoveryReviewAction) => void;
}) {
  const { t } = useTranslation('chat');
  const [snapshot, setSnapshot] = useState<RecoveryActionSnapshot>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [details, setDetails] = useState(false);
  const [hadActions, setHadActions] = useState(false);
  const generation = useRef({ epoch: 0 });
  const pending = useRef(false);
  const lastAutoInspection = useRef<string | undefined>(undefined);
  const current = useRef({ sessionId, disabled, inspect, reconcile });
  useLayoutEffect(() => {
    current.current = { sessionId, disabled, inspect, reconcile };
  });
  useLayoutEffect(() => {
    const scope = generation.current;
    scope.epoch++;
    pending.current = false;
    lastAutoInspection.current = undefined;
    setSnapshot(undefined); setBusy(false); setError(false); setDetails(false); setHadActions(false);
    return () => { scope.epoch++; };
  }, [sessionId, disabled]);

  const run = useCallback(async () => {
    if (pending.current || current.current.disabled) return;
    pending.current = true;
    const epoch = generation.current.epoch;
    const target = current.current.sessionId;
    const assertCurrent = () => {
      if (generation.current.epoch !== epoch || current.current.sessionId !== target || current.current.disabled) {
        throw new Error('recovery_review_superseded');
      }
    };
    setBusy(true); setError(false);
    try {
      let latest = await current.current.inspect();
      assertCurrent();
      if (latest.sessionId !== target) throw new Error('review_owner_changed');
      setSnapshot(latest);
      if (latest.actions.length) setHadActions(true);
      const owner = { sdkSessionId: latest.sdkSessionId, epoch: latest.epoch, authority: latest.reviewAuthority };
      const attempted = new Set<string>();
      // These existing owner-validated receipts record proof only. They never
      // execute tools, send model messages, or grant an unknown action permission.
      while (latest.actions.some(action => action.eligible)) {
        assertCurrent();
        const action = latest.actions.find(item => item.eligible)!;
        if (attempted.has(action.actionHash) || attempted.size >= 100) throw new Error('recovery_review_no_progress');
        attempted.add(action.actionHash);
        try {
          latest = await current.current.reconcile({
            reviewAuthority: latest.reviewAuthority, sessionId: latest.sessionId,
            sdkSessionId: latest.sdkSessionId, epoch: latest.epoch,
            ledgerDigest: latest.ledgerDigest, actionHash: action.actionHash,
          });
          assertCurrent();
        } catch {
          assertCurrent();
          // A response may be lost after commit. Read authority; never resend.
          latest = await current.current.inspect();
          assertCurrent();
        }
        if (latest.sessionId !== target || latest.sdkSessionId !== owner.sdkSessionId || latest.epoch !== owner.epoch
          || latest.reviewAuthority !== owner.authority) throw new Error('review_owner_changed');
        setSnapshot(latest);
        if (latest.actions.some(item => item.actionHash === action.actionHash)) throw new Error('recovery_review_unresolved');
      }
    } catch {
      if (epoch === generation.current.epoch) setError(true);
    } finally {
      if (epoch === generation.current.epoch) { pending.current = false; setBusy(false); }
    }
  }, []);

  useEffect(() => {
    if (disabled || busy || pending.current) return;
    const key = `${sessionId}:${inspectRevision ?? 'initial'}`;
    if (lastAutoInspection.current === key) return;
    lastAutoInspection.current = key;
    void run();
  }, [busy, disabled, inspectRevision, sessionId, run]);

  const pendingCount = snapshot?.actions.length ?? 0;
  const visible = hadActions || interrupted || details;
  // Ordinary conversations have no recovery banner. Explicit continuation keeps
  // its existing admission; inspecting evidence cannot claim task completion.
  const showCard = !disabled && (visible || pendingCount > 0);
  const checking = busy || (!snapshot && !error);
  const state = checking ? 'checking' : error ? 'unavailable' : pendingCount ? 'pending' : 'ready';
  const buttonClass = 'rounded-md px-2 py-1 text-sm font-medium text-[var(--accent)] hover:bg-[var(--paper-hover)] focus-visible:outline-2 focus-visible:outline-[var(--focus-border)] disabled:opacity-50';
  return <div className={showCard ? 'shrink-0 px-4 py-2 text-sm text-[var(--ink-secondary)]' : ''}>
    <section aria-label={showCard ? t('recoveryReview.title') : undefined} aria-busy={showCard && checking}
      className={showCard ? 'mx-auto max-w-3xl rounded-lg border border-[var(--line)] bg-[var(--paper-inset)] px-3 py-2.5' : ''}>
      <div hidden={!showCard}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p role="status" className="font-medium text-[var(--ink)]">{t(`recoveryReview.states.${state}`, { count: pendingCount })}</p>
          <p className="mt-1">{t(`recoveryReview.descriptions.${state}`)}</p>
        </div>
        <button type="button" className={buttonClass} aria-haspopup="dialog" onClick={() => setDetails(true)}>{t('recoveryReview.details')}</button>
      </div>
      {error && <p role="alert" className="mt-2">{t('recoveryReview.changed')}</p>}
      {!checking && <div className="mt-2 flex flex-wrap items-center gap-2">
        {(pendingCount > 0 || error) && <button type="button" className={buttonClass} onClick={() => void run()}>{t('recoveryReview.checkAgain')}</button>}
      </div>}
      </div>
      {/* Keep the continuation owner mounted through check/busy transitions. */}
      <div hidden={showCard && checking} className={showCard ? 'mt-2' : ''}>{continuation}</div>
    </section>
    {showCard && details && <RecoveryActionDetails actions={snapshot?.actions ?? []} busy={checking} error={error}
      onClose={() => setDetails(false)} onPrepareCheck={onPrepareCheck} />}
  </div>;
}
