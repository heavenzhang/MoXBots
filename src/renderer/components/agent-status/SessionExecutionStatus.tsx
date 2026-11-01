import { useTranslation } from "react-i18next";
import { EXECUTION_LIMITS, type SessionExecution } from "../../../shared/sessionExecution";
import type {
  SessionExecutionRecoveryProjection,
  SessionTaskLedger,
} from "../../../shared/sessionTaskOrchestration";

type Admission = SessionTaskLedger["executionAdmission"];
export type SessionExecutionStatusProps = {
  execution?: SessionExecution;
  recovery?: SessionExecutionRecoveryProjection;
  admission?: Admission;
  unknown?: boolean;
};

const phaseKeys: Record<SessionExecution["phase"], string> = {
  running: "running",
  awaiting_review: "awaitingReview",
  rework: "rework",
  paused: "paused",
  incomplete: "incomplete",
  completed: "completed",
};
const reasonKeys: Record<string, string> = {
  stopped: "stopped",
  assessment_required: "assessmentRequired",
  acceptance_evidence_incomplete: "evidenceIncomplete",
  deadline_exceeded: "deadlineExceeded",
  turn_limit_reached: "turnLimitReached",
  no_progress_limit_reached: "noProgressLimitReached",
  rework_limit_reached: "reworkLimitReached",
  turn_error: "turnError",
  user_stopped: "userStopped",
  new_user_input: "newUserInput",
  TOOL_OUTCOME_UNKNOWN: "toolOutcomeUnknown",
  WAITING_FOR_USER: "waitingForUser",
  BACKGROUND_WORK_ACTIVE: "backgroundWorkActive",
  EXECUTION_DISPATCH_OUTCOME_UNKNOWN: "executionDispatchOutcomeUnknown",
  EXECUTION_TURN_OUTCOME_UNKNOWN: "executionTurnOutcomeUnknown",
  evidence_limit_reached: "evidenceLimitReached",
  continuation_admission_busy: "continuationAdmissionBusy",
  continuation_not_admitted: "continuationNotAdmitted",
  continuation_cancelled_before_dispatch: "continuationCancelledBeforeDispatch",
  admission_cancelled: "admissionCancelled",
  dispatch_unconfirmed: "dispatchUnconfirmed",
};

/** Read-only presentation of the current request; never adopts an older execution. */
export function useSessionExecutionPresentation({
  execution,
  recovery,
  admission,
  unknown = false,
}: SessionExecutionStatusProps) {
  const { t } = useTranslation("app");
  const currentExecution =
    execution && (!admission || admission.requestId === execution.requestId)
      ? execution
      : undefined;
  if (!currentExecution && !admission?.error) return null;

  const root = "executionStatus.execution";
  const status =
    !currentExecution && admission?.error
      ? t(`${root}.unconfirmedShort`)
      : unknown
        ? t(`${root}.unknownShort`)
        : undefined;
  const isCurrent = Boolean(currentExecution && !unknown);
  const matchingRecovery =
    isCurrent &&
    currentExecution &&
    recovery?.turnId === currentExecution.currentQueueId &&
    (currentExecution.phase === "running" ||
      currentExecution.phase === "rework")
      ? recovery
      : undefined;
  const recoveryText = matchingRecovery
    ? t(`${root}.recovery.${matchingRecovery.status}`, {
        attempt: matchingRecovery.attempt,
      })
    : undefined;
  const recoveryStatus = matchingRecovery
    ? t(`${root}.recovery.${matchingRecovery.status}Status`)
    : undefined;
  const primaryStatus =
    status ??
    recoveryStatus ??
    (currentExecution ? t(`${root}.${phaseKeys[currentExecution.phase]}`) : "");
  const provenChecks =
    isCurrent && currentExecution?.phase === "completed"
      ? new Set(
          currentExecution.assessment?.checks.map((check) => check.criterion) ??
            [],
        ).size
      : 0;
  const summary = currentExecution?.intent.objective ?? t(`${root}.request`);
  const reasonText =
    currentExecution?.phase === 'incomplete' && currentExecution.reason === 'turn_error'
      && (currentExecution.reviewReceiptFailures ?? 0) >= EXECUTION_LIMITS.maxReviewReceiptFailures
      ? t(`${root}.reasons.reviewReceiptUnconfirmed`)
      : currentExecution?.assessment?.summary ??
    (currentExecution?.reason
      ? t(
          `${root}.reasons.${reasonKeys[currentExecution.reason] ?? "unconfirmed"}`,
        )
      : undefined);

  return {
    currentExecution,
    primaryStatus,
    summary,
    reasonText,
    recoveryText,
    provenChecks,
    attention: Boolean(
      status ||
        matchingRecovery ||
        currentExecution?.phase === "incomplete" ||
        currentExecution?.phase === "rework",
    ),
  };
}

/** Details are mounted inside ExecutionStatusBar's sole disclosure region. */
export default function SessionExecutionDetails(
  props: SessionExecutionStatusProps,
) {
  const { t } = useTranslation("app");
  const presentation = useSessionExecutionPresentation(props);
  if (!presentation) return null;
  const { currentExecution, summary, reasonText, recoveryText, provenChecks } =
    presentation;
  const { unknown, admission } = props;
  const root = "executionStatus.execution";
  return (
    <div className="space-y-2 p-3 text-xs leading-5">
      <div className="break-words font-medium [overflow-wrap:anywhere]">
        {summary}
      </div>
      {!unknown && currentExecution && (
        <>
          {reasonText && (
            <p className="break-words text-[var(--ink-secondary)] [overflow-wrap:anywhere]">
              {reasonText}
            </p>
          )}
          {recoveryText && (
            <p className="break-words text-[var(--ink-secondary)] [overflow-wrap:anywhere]">
              {recoveryText}
            </p>
          )}
          <div className="text-[var(--ink-secondary)]">
            {t(`${root}.turnCount`, { count: currentExecution.turns })}
          </div>
          <div>
            <div className="font-medium">
              {t(`${root}.acceptance`, { defaultValue: "验收条件" })}
            </div>
            <ul className="mt-1 list-inside list-disc space-y-1 text-[var(--ink-secondary)]">
              {currentExecution.intent.acceptanceCriteria.map(
                (criterion, index) => (
                  <li
                    key={`${index}-${criterion}`}
                    className="break-words [overflow-wrap:anywhere]"
                  >
                    {criterion}
                    {currentExecution.phase === "completed" &&
                    currentExecution.assessment?.checks.some(
                      (check) => check.criterion === index,
                    )
                      ? ` · ${t(`${root}.proven`)}`
                      : ""}
                  </li>
                ),
              )}
            </ul>
            <div className="mt-1 text-[var(--ink-secondary)]">
              {t(`${root}.coverage`, {
                covered: provenChecks,
                total: currentExecution.intent.acceptanceCriteria.length,
              })}
            </div>
          </div>
        </>
      )}
      {unknown && currentExecution && (
        <p className="text-[var(--ink-secondary)]">
          {t(`${root}.unknownHint`)}
        </p>
      )}
      {admission?.error && (
        <p className="text-[var(--ink-secondary)]">
          {t(`${root}.admissionHint`)}
          {admission.failureReason && ` ${t(`${root}.admissionFailure.${admission.failureReason}`)}`}
        </p>
      )}
    </div>
  );
}
