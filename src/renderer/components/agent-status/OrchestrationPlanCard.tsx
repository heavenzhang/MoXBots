import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import {
  isSessionPlanConfirmed,
  type SessionPlanProposal,
  type SessionPlanTarget,
} from "../../../shared/sessionPlanConfirmation";
import type { SessionTaskLedger, SessionTaskSnapshot, SessionTaskView } from "../../../shared/sessionTaskOrchestration";
import { projectSessionPlanExecution } from "../../../shared/sessionPlanExecution";
import { PlanExecutionProgress } from "./PlanExecutionProgress";

export interface PlanUserAction extends SessionPlanTarget {
  requestId: string;
}
export interface OrchestrationPlanCardProps {
  proposal: SessionPlanProposal;
  planSupport: SessionTaskSnapshot['planSupport'] | undefined;
  containerRef?: RefObject<HTMLElement | null>;
  startStatus?: SessionTaskLedger['planStart'];
  tasks?: readonly SessionTaskView[];
  stale?: boolean;
  onRefresh?: () => void;
  onInspect?: (toolUseId: string) => void;
  onConfirm: (action: PlanUserAction) => Promise<void>;
  onRequestRevision: (
    action: PlanUserAction & { feedback: string },
  ) => Promise<void>;
  onDiscuss: (target: SessionPlanTarget) => void;
}

/** Key by exact proposal identity so old async completions cannot touch a new draft. */
export function OrchestrationPlanCard(props: OrchestrationPlanCardProps) {
  const { proposal } = props;
  return (
    <PlanCard
      key={`${proposal.sessionId}:${proposal.id}:${proposal.revision}:${proposal.state}`}
      {...props}
    />
  );
}

function PlanCard({
  proposal,
  onConfirm,
  onRequestRevision,
  onDiscuss,
  startStatus,
  planSupport,
  containerRef,
  tasks = [],
  stale = false,
  onRefresh,
  onInspect,
}: OrchestrationPlanCardProps) {
  const { t } = useTranslation("app");
  const titleId = useId();
  const feedbackId = useId();
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<"confirm" | "revision" | null>(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(!isSessionPlanConfirmed(proposal) && planSupport?.supported === true);
  const locked = useRef(false);
  const live = useRef(false);
  const requestIds = useRef<{
    confirm?: string;
    revision?: { feedback: string; id: string };
  }>({});
  const feedbackRef = useRef<HTMLTextAreaElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const [availableHeight, setAvailableHeight] = useState<number>();
  useLayoutEffect(() => {
    const card = cardRef.current;
    const overlay = card?.closest<HTMLElement>('[data-chat-input-overlay]');
    const container = containerRef?.current ?? (overlay?.offsetParent instanceof HTMLElement ? overlay.offsetParent : null);
    if (!card || !container || !overlay) return;
    // Reserve the measured original queue, attachments, toolbar and input.
    // Only this added card scrolls; the existing chat/Composer owners stay put.
    const measure = () => {
      const bounds = container.getBoundingClientRect();
      const room = Math.max(0, Math.min(bounds.bottom, window.innerHeight) - Math.max(bounds.top, 0));
      const otherContent = overlay.getBoundingClientRect().height - card.getBoundingClientRect().height;
      const height = Math.max(80, Math.floor(Math.min(640, window.innerHeight * 0.65, room - otherContent - 8)));
      setAvailableHeight(prior => prior === height ? prior : height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(overlay);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [containerRef]);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    if (editing) feedbackRef.current?.focus();
  }, [editing]);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [error]);
  const target: SessionPlanTarget = {
    sessionId: proposal.sessionId,
    proposalId: proposal.id,
    expectedRevision: proposal.revision,
  };
  const confirmed = isSessionPlanConfirmed(proposal);
  const execution = projectSessionPlanExecution(proposal, tasks, startStatus);
  const currentStart = startStatus?.proposalId === proposal.id && startStatus.revision === proposal.revision && startStatus.purpose !== 'revision' ? startStatus : undefined;
  const awaiting = proposal.state === "awaiting_confirmation";
  const supported = planSupport?.supported === true;
  const controlsDisabled = busy !== null || !awaiting || !supported;

  async function submit(kind: "confirm" | "revision") {
    if (
      locked.current ||
      !supported ||
      !awaiting ||
      (kind === "revision" && !feedback.trim()) ||
      (kind === "confirm" && editing && !!feedback.trim())
    )
      return;
    locked.current = true;
    setBusy(kind);
    setError(false);
    try {
      if (kind === "confirm") {
        const requestId = (requestIds.current.confirm ??= crypto.randomUUID());
        await onConfirm({ ...target, requestId });
      } else {
        const value = feedback.trim();
        if (requestIds.current.revision?.feedback !== value)
          requestIds.current.revision = {
            feedback: value,
            id: crypto.randomUUID(),
          };
        await onRequestRevision({
          ...target,
          requestId: requestIds.current.revision.id,
          feedback: value,
        });
      }
      // Keep the fence until the authoritative Session snapshot changes. A
      // transport acknowledgment alone must not display a confirmed plan.
    } catch {
      if (!live.current) return;
      locked.current = false;
      setBusy(null);
      setError(true);
    }
  }

  const status = stale
    ? t('orchestration.syncPending')
    : execution
    ? t(`orchestrationPlan.executionPhase.${execution.phase}`)
    : proposal.state === "confirmed"
      ? t("orchestrationPlan.unverified")
      : proposal.state === "revising"
        ? t("orchestrationPlan.revising")
        : t("orchestrationPlan.pending");
  return (
    <section
      ref={cardRef}
      style={availableHeight === undefined ? undefined : { maxHeight: availableHeight }}
      aria-labelledby={titleId}
      className="max-h-[min(40rem,65vh)] min-w-0 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--paper-elevated)] p-4 text-[var(--ink)]"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-sm font-semibold">
            {t(confirmed ? "orchestrationPlan.executionTitle" : "orchestrationPlan.title")}
          </h3>
          <p className="mt-1 break-words text-xs text-[var(--ink-muted)]">
            {t("orchestrationPlan.version", { version: proposal.revision })}
          </p>
        </div>
        <span
          role="status"
          aria-live="polite"
          className={`rounded-full px-2 py-1 text-xs ${!stale && execution?.phase === 'completed' ? "bg-[var(--success-bg)] text-[var(--success)]" : stale || execution && ['failed', 'rework', 'interrupted', 'unknown', 'blocked'].includes(execution.phase) ? "bg-[var(--paper-inset)] text-[var(--warning)]" : "bg-[var(--paper-inset)] text-[var(--ink-secondary)]"}`}
        >
          {status}
        </span>
      </header>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm font-medium [overflow-wrap:anywhere]">
        {proposal.content.objective}
      </p>
      {confirmed && execution ? (
        <p role={currentStart?.error && execution.phase !== 'completed' ? 'alert' : undefined} className="mt-2 text-xs text-[var(--ink-muted)]">
          {t(
            execution.phase === 'confirmed' && proposal.confirmation?.source === "user_message"
              ? "orchestrationPlan.confirmedInChat"
              : currentStart?.error && execution.phase !== 'completed' ? 'orchestrationPlan.startUncertain'
              : `orchestrationPlan.executionHint.${execution.phase}`,
          )}
        </p>
      ) : supported ? (
        <p className="mt-2 text-xs text-[var(--ink-muted)]">
          {t(
            proposal.state === "confirmed"
              ? "orchestrationPlan.unverifiedHint"
              : "orchestrationPlan.pendingHint",
          )}
        </p>
      ) : null}
      {!supported && !confirmed && (
        <p className="mt-3 whitespace-pre-wrap break-words text-xs text-[var(--warning)]">
          {t(planSupport?.supported === false ? 'orchestrationPlan.unsupported' : 'orchestrationPlan.supportUnverified')}
        </p>
      )}
      {stale && <p className="mt-2 text-xs text-[var(--warning)]">
        {t('orchestration.stale')} {onRefresh && <button type="button" onClick={onRefresh} className="compact-action rounded underline focus-visible:outline-2 focus-visible:outline-[var(--focus-border)]">{t('orchestration.retry')}</button>}
      </p>}
      {execution && <PlanExecutionProgress execution={execution} onInspect={onInspect} />}
      {!confirmed && startStatus?.purpose === 'revision' && startStatus.proposalId === proposal.id && startStatus.revision === proposal.revision && (
        <p role={startStatus.error ? 'alert' : 'status'} className="mt-3 rounded-lg bg-[var(--paper-inset)] p-3 text-xs text-[var(--ink-secondary)]">
          {t(startStatus.error ? 'orchestrationPlan.revisionBlocked' : 'orchestrationPlan.revisionQueued')}
        </p>
      )}
      <details
        className="mt-3"
        open={expanded}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary className="cursor-pointer rounded text-sm text-[var(--ink-secondary)] focus-visible:outline-2 focus-visible:outline-[var(--focus-border)]">
          {t("orchestrationPlan.details")}
        </summary>
        <div className="mt-3 max-h-[min(20rem,28vh)] space-y-4 overflow-y-auto pr-1 text-sm [overflow-wrap:anywhere]">
          {proposal.changes.length > 0 && (
            <div className="rounded-lg bg-[var(--paper-inset)] p-3">
              <h4 className="font-medium">{t("orchestrationPlan.changes")}</h4>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {proposal.changes.map((change, index) => (
                  <li key={index}>{change}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h4 className="font-medium">{t("orchestrationPlan.scope")}</h4>
            <p className="mt-1 whitespace-pre-wrap text-[var(--ink-secondary)]">
              {proposal.content.scope}
            </p>
          </div>
          <div>
            <h4 className="font-medium">{t("orchestrationPlan.steps")}</h4>
            <ol className="mt-2 list-decimal space-y-2 pl-5">
              {proposal.content.steps.map((step) => (
                <li key={step.id}>
                  <span className="whitespace-pre-wrap">{step.title}</span>
                  {step.assignee && (
                    <span className="ml-2 text-xs text-[var(--ink-muted)]">
                      {step.assignee}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h4 className="font-medium">{t("orchestrationPlan.acceptance")}</h4>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {proposal.content.acceptanceCriteria.map((criterion, index) => (
                <li key={index}>{criterion}</li>
              ))}
            </ul>
          </div>
        </div>
      </details>
      {proposal.state === "revising" && proposal.feedback && (
        <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-[var(--paper-inset)] p-3 text-sm">
          {t("orchestrationPlan.feedbackSent", { feedback: proposal.feedback })}
        </p>
      )}
      {awaiting && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={controlsDisabled || (editing && !!feedback.trim())}
              onClick={() => {
                void submit("confirm");
              }}
              className="min-h-9 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] focus-visible:outline-2 focus-visible:outline-[var(--focus-border)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "confirm"
                ? t("orchestrationPlan.submitting")
                : t("orchestrationPlan.confirm")}
            </button>
            <button
              type="button"
              disabled={controlsDisabled}
              aria-expanded={editing}
              aria-controls={feedbackId}
              onClick={() => setEditing((value) => !value)}
              className="min-h-9 rounded-lg border border-[var(--line)] px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-[var(--focus-border)] disabled:opacity-50"
            >
              {t(
                editing
                  ? "orchestrationPlan.cancelAdjustment"
                  : "orchestrationPlan.adjust",
              )}
            </button>
            <button
              type="button"
              disabled={controlsDisabled}
              onClick={() => onDiscuss(target)}
              className="min-h-9 rounded-lg px-3 py-2 text-sm text-[var(--ink-secondary)] focus-visible:outline-2 focus-visible:outline-[var(--focus-border)] disabled:opacity-50"
            >
              {t("orchestrationPlan.discuss")}
            </button>
          </div>
          {editing && feedback.trim() && (
            <p className="text-xs text-[var(--ink-muted)]">
              {t("orchestrationPlan.unsentFeedback")}
            </p>
          )}
          {editing && (
            <div id={feedbackId} className="space-y-2">
              <label
                className="block text-xs text-[var(--ink-secondary)]"
                htmlFor={`${feedbackId}-input`}
              >
                {t("orchestrationPlan.feedbackLabel")}
              </label>
              <textarea
                ref={feedbackRef}
                id={`${feedbackId}-input`}
                rows={3}
                maxLength={4000}
                value={feedback}
                disabled={busy !== null || !supported}
                onChange={(event) => setFeedback(event.target.value)}
                className="w-full resize-y rounded-lg border border-[var(--line)] bg-[var(--paper)] p-3 text-sm focus-visible:outline-2 focus-visible:outline-[var(--focus-border)]"
              />
              <button
                type="button"
                disabled={controlsDisabled || !feedback.trim()}
                onClick={() => {
                  void submit("revision");
                }}
                className="min-h-9 rounded-lg border border-[var(--line)] px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-[var(--focus-border)] disabled:opacity-50"
              >
                {busy === "revision"
                  ? t("orchestrationPlan.submitting")
                  : t("orchestrationPlan.sendFeedback")}
              </button>
            </div>
          )}
        </div>
      )}
      {error && (
        <p ref={errorRef} role="alert" className="mt-3 text-sm text-[var(--error)]">
          {t("orchestrationPlan.error")}
        </p>
      )}
    </section>
  );
}
