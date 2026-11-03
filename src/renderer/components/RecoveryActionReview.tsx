import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecoveryActionSnapshot, RecoveryMutationRequest, RecoveryReviewAction } from '../../shared/recoveryReconciliation';
import { useSessionTaskOrchestrationContext } from './agent-status/useSessionTaskOrchestration';
import { RecoveryActionDetails } from './RecoveryActionDetails';

export function RecoveryActionReview({ inspect, reconcile, disabled, sessionId, inspectRevision, continuation, onPrepareCheck, onViewOperation }: {
  inspect: () => Promise<RecoveryActionSnapshot>;
  reconcile: (request: RecoveryMutationRequest) => Promise<RecoveryActionSnapshot>;
  disabled: boolean;
  sessionId: string;
  /** Each settled revision is inspected once, including after a busy transition. */
  inspectRevision?: string;
  continuation?: ReactNode;
  onPrepareCheck?: (action: RecoveryReviewAction) => void;
  onViewOperation?: (toolUseId: string) => void;
}) {
  const { t } = useTranslation('chat');
  const taskContext = useSessionTaskOrchestrationContext();
  const publishRecovery = taskContext?.publishRecoveryReview;
  const openDetails = useCallback(() => setDetails(true), []);
  const [snapshot, setSnapshot] = useState<RecoveryActionSnapshot>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [details, setDetails] = useState(false);
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
    setSnapshot(undefined); setBusy(false); setError(false); setDetails(false);
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
      if (latest.investigationAvailable && latest.actions.length) {
        assertCurrent();
        latest = await current.current.reconcile({ reviewAuthority: latest.reviewAuthority, sessionId: latest.sessionId,
          sdkSessionId: latest.sdkSessionId, epoch: latest.epoch, ledgerDigest: latest.ledgerDigest,
          actionHash: latest.actions[0].actionHash, kind: 'investigate' });
        assertCurrent(); setSnapshot(latest);
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

  const saveFollowup = useCallback(async (action: RecoveryReviewAction, kind: 'note' | 'defer', text: string, requestId: string) => {
    if (pending.current || current.current.disabled || !snapshot) return false;
    pending.current = true; setBusy(true); setError(false);
    const epoch = generation.current.epoch;
    try {
      let result: RecoveryActionSnapshot;
      try {
        result = await current.current.reconcile({ reviewAuthority: snapshot.reviewAuthority, sessionId: snapshot.sessionId,
          sdkSessionId: snapshot.sdkSessionId, epoch: snapshot.epoch, ledgerDigest: snapshot.ledgerDigest,
          actionHash: action.actionHash, kind, text, requestId });
      } catch {
        if (epoch !== generation.current.epoch) return false;
        result = await current.current.inspect();
        if (!result.actions.some(item => item.followups?.some(note => note.requestId === requestId && note.text === text.trim() && note.kind === kind))) throw new Error('not_saved');
      }
      if (epoch !== generation.current.epoch || result.sessionId !== current.current.sessionId
        || result.sdkSessionId !== snapshot.sdkSessionId || result.epoch !== snapshot.epoch || result.reviewAuthority !== snapshot.reviewAuthority) return false;
      setSnapshot(result); return true;
    } catch { if (epoch === generation.current.epoch) setError(true); return false; }
    finally { if (epoch === generation.current.epoch) { pending.current = false; setBusy(false); } }
  }, [snapshot]);

  const attentionActions = snapshot?.actions.filter(action => snapshot.attention?.actionHashes.includes(action.actionHash)) ?? [];
  const attentionCount = attentionActions.length;
  const showCard = !disabled && !busy && !error && attentionCount > 0;
  useEffect(() => {
    publishRecovery?.(showCard ? { sessionId, count: attentionCount, checking: false, failed: false, open: openDetails } : undefined);
    return () => publishRecovery?.(undefined);
  }, [publishRecovery, sessionId, attentionCount, showCard, openDetails]);
  const buttonClass = 'rounded-md px-2 py-1 text-sm font-medium text-[var(--accent)] hover:bg-[var(--paper-hover)] focus-visible:outline-2 focus-visible:outline-[var(--focus-border)] disabled:opacity-50';
  return <>
    {showCard && <section aria-label={t('recoveryReview.decision.title')} className="shrink-0 px-4 py-2 text-sm text-[var(--ink-secondary)]">
      <div className="mx-auto max-w-3xl rounded-lg border border-[var(--line)] bg-[var(--paper-inset)] px-3 py-2.5">
        <p role="status" className="font-medium text-[var(--ink)]">{t('recoveryReview.decision.title')}</p>
        <p className="mt-1">{t('recoveryReview.decision.explanation')}</p>
        <ul className="mt-2 space-y-2">
          {attentionActions.slice(0, 3).map(action => <li key={action.actionHash}>
            <p className="break-words font-medium text-[var(--ink)]">{t(`recoveryReview.kinds.${action.presentation?.kind ?? 'unknown'}`)} · {action.presentation?.target ?? t('recoveryReview.decision.targetMissing')}</p>
            <p>{action.association ? t('recoveryReview.decision.impact', { task: action.association.title, count: action.association.blockedTaskIds.length }) : t('recoveryReview.decision.currentTask')}</p>
            {action.check && <p>{t(`recoveryReview.checks.${action.check.kind}`)}</p>}
            <p>{t(`recoveryReview.decision.next.${action.presentation?.kind ?? 'unknown'}`)}</p>
            {onViewOperation && action.toolUseIds?.[0] && <button type="button" className={buttonClass}
              onClick={() => onViewOperation(action.toolUseIds![0])}>{t('recoveryReview.decision.viewOperation')}</button>}
          </li>)}
        </ul>
        {attentionCount > 3 && <p className="mt-2">{t('recoveryReview.decision.more', { count: attentionCount - 3 })}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={buttonClass} aria-haspopup="dialog" onClick={openDetails}>{t('recoveryReview.decision.resolve')}</button>
        </div>
      </div>
    </section>}
    {/* Background inspection never hides or remounts the original continuation owner. */}
    {continuation}
    {!disabled && details && <RecoveryActionDetails actions={attentionActions} completed={snapshot?.completed ?? []} reviewed={snapshot?.reviewed ?? []}
      independentTasks={snapshot?.independentTasks ?? []} busy={busy} error={error}
      onClose={() => setDetails(false)} onPrepareCheck={onPrepareCheck} onSave={saveFollowup} />}
  </>;
}
