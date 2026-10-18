import {
  TargetIcon,
  PlayIcon,
  PauseIcon,
  SlidersIcon,
  CloseIcon,
  ChevronDownIcon,
} from "@/components/icons";
import { useTranslation } from "react-i18next";

import Tip from "@/components/Tip";

import type { SessionGoal } from "@/types/sessionGoal";
import { formatDuration, formatTokens } from "@/utils/formatTokens";

interface GoalDraftStatusBarProps {
  mode: "draft";
  onSettings?: () => void;
  onCancel?: () => void;
}

interface GoalRuntimeStatusBarProps {
  mode?: "runtime";
  goal: SessionGoal;
  isExecuting?: boolean;
  executionNumber?: number;
  onEdit?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onDismiss?: () => void;
}

type GoalStatusBarProps = GoalDraftStatusBarProps | GoalRuntimeStatusBarProps;

function GoalDraftStatusBar({ onSettings, onCancel }: GoalDraftStatusBarProps) {
  const { t } = useTranslation("task");

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-t-lg border border-b-0 border-[var(--line)] bg-[var(--paper-elevated)] px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <TargetIcon className="h-4 w-4 shrink-0 text-[var(--accent)]" />
        <span className="shrink-0 text-sm font-medium text-[var(--accent)]">
          {t("cron.statusBar.goalDraftTitle")}
        </span>
        <span className="min-w-0 basis-full text-xs text-[var(--ink-secondary)] sm:basis-auto">
          {t("cron.statusBar.goalObjectiveFallback")}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {onSettings && (
          <Tip label={t("cron.statusBar.settingsTitle")}>
            <button
              type="button"
              onClick={onSettings}
              className="compact-action rounded-md text-[var(--ink-muted)] transition-colors hover:bg-[var(--paper-hover)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-border)]"
              aria-label={t("cron.statusBar.settingsTitle")}
            >
              <SlidersIcon className="h-4 w-4" />
            </button>
          </Tip>
        )}
        {onCancel && (
          <Tip label={t("cron.statusBar.cancelGoalDraftTitle")}>
            <button
              type="button"
              onClick={onCancel}
              className="compact-action rounded-md text-[var(--ink-muted)] transition-colors hover:bg-[var(--paper-hover)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-border)]"
              aria-label={t("cron.statusBar.cancelGoalDraftTitle")}
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </Tip>
        )}
      </div>
    </div>
  );
}

function GoalRuntimeStatusBar({
  goal,
  isExecuting = false,
  executionNumber,
  onEdit,
  onPause,
  onResume,
  onCancel,
  onDismiss,
}: GoalRuntimeStatusBarProps) {
  const { t } = useTranslation("task");
  const terminal =
    goal.status === "complete" ||
    goal.status === "blocked" ||
    goal.status === "canceled";
  const color =
    goal.status === "complete"
      ? "var(--success)"
      : goal.status === "blocked"
        ? "var(--warning)"
        : goal.status === "paused" || goal.status === "canceled"
          ? "var(--ink-muted)"
          : "var(--accent)";
  const title =
    goal.status === "complete"
      ? t("cron.statusBar.goalCompleteTitle")
      : goal.status === "blocked"
        ? t("cron.statusBar.goalBlockedTitle")
        : goal.status === "canceled"
          ? t("cron.statusBar.goalCanceledTitle")
          : goal.status === "paused"
            ? t("cron.statusBar.goalPausedTitle")
            : isExecuting
              ? t("cron.statusBar.loopExecutingTitle")
              : t("cron.statusBar.loopRunningTitle");
  const round = executionNumber ?? goal.turnCount + 1;
  const terminalSummary = t("cron.statusBar.goalTerminalSummary", {
    duration: formatDuration(goal.totalDurationMs),
    tokens: formatTokens(goal.totalTokens),
  });
  const detail =
    terminal && isExecuting
      ? t("cron.statusBar.goalFinalizingDetail")
      : terminal
        ? [
            goal.status === "complete" ? null : goal.terminalReason?.trim(),
            terminalSummary,
          ]
            .filter(Boolean)
            .join(" · ") ||
          goal.terminalReason?.trim() ||
          t("cron.statusBar.roundRunning", {
            count: Math.max(1, goal.turnCount),
          })
        : goal.status === "paused"
          ? t("cron.statusBar.goalPausedDetail")
          : isExecuting
            ? t("cron.statusBar.roundExecuting", { count: round })
            : t("cron.statusBar.roundRunning", {
                count: Math.max(1, goal.turnCount),
              });

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-t-lg border border-b-0 border-[var(--line)] bg-[var(--paper-elevated)] px-3 py-2">
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span
            className="inline-flex items-center gap-1.5 font-medium"
            style={{ color }}
          >
            <TargetIcon aria-hidden className="size-3.5 shrink-0" />
            {title}
          </span>
          <span className="text-[var(--ink-secondary)]">{detail}</span>
        </div>
        <details className="group mt-1">
          <summary className="flex max-h-[min(128px,20vh)] cursor-pointer list-none items-start overflow-y-auto overscroll-contain gap-1 rounded-sm text-sm leading-5 text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--focus-border)] [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] line-clamp-2 group-open:line-clamp-none">
              {goal.objective}
            </span>
            <ChevronDownIcon
              aria-hidden
              className="mt-0.5 size-3.5 shrink-0 text-[var(--ink-muted)] group-open:rotate-180"
            />
          </summary>
        </details>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1 self-start">
        {!terminal && onEdit && (
          <Tip label={t("cron.statusBar.goalEditTitle")}>
            <button
              type="button"
              onClick={onEdit}
              aria-label={t("cron.statusBar.goalEditTitle")}
              className="compact-action rounded-md text-[var(--ink-muted)] transition-colors hover:bg-[var(--paper-hover)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-border)]"
            >
              <SlidersIcon aria-hidden className="size-4" />
            </button>
          </Tip>
        )}
        {goal.status === "active" && onPause && (
          <button
            type="button"
            onClick={onPause}
            className="compact-action gap-1 rounded-md px-2 text-sm font-medium text-[var(--ink-secondary)] transition-colors hover:bg-[var(--paper-hover)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-border)]"
            aria-label={t("cron.statusBar.pauseGoalButton")}
          >
            <PauseIcon aria-hidden className="h-3.5 w-3.5" />
            {t("cron.statusBar.pauseGoalButton")}
          </button>
        )}
        {goal.status === "paused" && onResume && (
          <button
            type="button"
            onClick={onResume}
            className="compact-action gap-1 rounded-md px-2 text-sm font-medium transition-colors hover:bg-[var(--paper-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-border)]"
            style={{ color }}
            aria-label={t("cron.statusBar.resumeGoalButton")}
          >
            <PlayIcon className="h-3.5 w-3.5" />
            {t("cron.statusBar.resumeGoalButton")}
          </button>
        )}
        {!terminal && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="compact-action gap-1 rounded-md px-2 text-sm text-[var(--ink-secondary)] transition-colors hover:bg-[var(--paper-hover)] hover:text-[var(--error)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-border)]"
            aria-label={t("cron.statusBar.cancelGoalButton")}
          >
            <CloseIcon className="h-3.5 w-3.5" />
            {t("cron.statusBar.cancelGoalButton")}
          </button>
        )}
        {terminal && onDismiss && (
          <Tip label={t("cron.statusBar.dismissGoalTitle")}>
            <button
              type="button"
              onClick={onDismiss}
              className="compact-action rounded-md text-[var(--ink-muted)] transition-colors hover:bg-[var(--paper-hover)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-border)]"
              aria-label={t("cron.statusBar.dismissGoalTitle")}
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </Tip>
        )}
      </div>
    </div>
  );
}

export default function GoalStatusBar(props: GoalStatusBarProps) {
  return props.mode === "draft" ? (
    <GoalDraftStatusBar {...props} />
  ) : (
    <GoalRuntimeStatusBar {...props} />
  );
}
