import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoaderIcon, RefreshIcon } from "@/components/icons";
import {
  formatBytes,
  type UpdaterDownloadState,
} from "../../shared/updaterDownload";

export function UpdateDownloadStatus({
  state,
  checking,
  onRetry,
}: {
  state: UpdaterDownloadState;
  checking: boolean;
  onRetry?: () => Promise<unknown>;
}) {
  const { t } = useTranslation("settings");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state.phase !== "retrying" || state.retryAtMs == null) return;
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [state.phase, state.retryAtMs]);
  if ((state.phase === "idle" || state.phase === "ready") && !checking)
    return null;
  const progress =
    state.total != null && state.total > 0 && state.percent != null;
  const errorLabel = state.errorCode
    ? t(`about.downloadErrors.${state.errorCode}`)
    : t("about.downloadErrors.unknown");

  return (
    <div
      className="mt-3 w-full space-y-2 rounded-xl border border-[var(--line)] bg-[var(--paper-inset)] p-3 text-left"
      aria-live="polite"
    >
      {(checking ||
        state.phase === "checking" ||
        state.phase === "downloading" ||
        state.phase === "retrying") && (
        <div className="flex min-w-0 items-center gap-2 text-sm text-[var(--ink-secondary)]">
          <LoaderIcon className="h-4 w-4 shrink-0 animate-spin text-[var(--accent)]" />
          <span className="min-w-0 break-words">
            {state.phase === "retrying"
              ? t("about.downloadRetrying", {
                  attempt: state.attempt,
                  maxAttempts: state.maxAttempts,
                  delay:
                    state.retryAtMs == null
                      ? ""
                      : ` (${Math.max(0, Math.ceil((state.retryAtMs - now) / 1000))}s)`,
                })
              : state.phase === "checking" || checking
                ? t("about.downloadChecking")
                : t("about.downloadingVersion", {
                    version: state.version ?? "",
                    progress: progress
                      ? `${state.percent}%`
                      : formatBytes(state.downloaded),
                  })}
          </span>
        </div>
      )}
      {(state.phase === "downloading" || state.phase === "retrying") && (
        <div className="space-y-1 pl-6 text-xs text-[var(--ink-muted)]">
          <div>
            {state.total != null
              ? `${formatBytes(state.downloaded)} / ${formatBytes(state.total)}`
              : t("about.downloadedBytes", {
                  bytes: formatBytes(state.downloaded),
                })}
            {state.bytesPerSecond != null
              ? ` · ${formatBytes(state.bytesPerSecond)}/s`
              : ""}
          </div>
          {progress && (
            <div
              role="progressbar"
              aria-label={t("about.downloadProgress")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={state.percent ?? undefined}
              className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--paper)]"
            >
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                style={{
                  width: `${Math.max(0, Math.min(100, state.percent!))}%`,
                }}
              />
            </div>
          )}
        </div>
      )}
      {state.phase === "failed" && (
        <div className="space-y-2 text-sm text-[var(--error)]">
          <div className="font-medium">
            {t("about.downloadFailed", { reason: errorLabel })}
          </div>
          {state.error && (
            <div className="break-words text-xs text-[var(--ink-secondary)]">
              {state.error}
            </div>
          )}
          {state.downloaded > 0 && (
            <div className="text-xs text-[var(--ink-muted)]">
              {state.total != null
                ? `${formatBytes(state.downloaded)} / ${formatBytes(state.total)}`
                : t("about.downloadedBytes", {
                    bytes: formatBytes(state.downloaded),
                  })}
            </div>
          )}
          {state.total != null && state.total > 0 && state.percent != null && (
            <div
              role="progressbar"
              aria-label={t("about.downloadProgress")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={state.percent ?? undefined}
              className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--paper)]"
            >
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{
                  width: `${Math.max(0, Math.min(100, state.percent))}%`,
                }}
              />
            </div>
          )}
          {state.retryable && onRetry && (
            <button
              type="button"
              onClick={() => void onRetry()}
              disabled={checking}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] disabled:cursor-wait disabled:opacity-50"
            >
              <RefreshIcon className="h-3.5 w-3.5" />
              {t("about.retryDownload")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
