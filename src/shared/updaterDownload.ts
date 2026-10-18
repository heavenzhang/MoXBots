export type UpdaterDownloadPhase =
  | "idle"
  | "checking"
  | "downloading"
  | "retrying"
  | "failed"
  | "ready";
export type UpdaterDownloadErrorCode =
  | "network"
  | "timeout"
  | "http"
  | "range"
  | "signature"
  | "disk"
  | "manifest"
  | null;

export interface UpdaterDownloadState {
  revision: number;
  phase: UpdaterDownloadPhase;
  version: string | null;
  downloaded: number;
  total: number | null;
  percent: number | null;
  bytesPerSecond: number | null;
  attempt: number;
  maxAttempts: number;
  retryAtMs: number | null;
  errorCode: UpdaterDownloadErrorCode;
  error: string | null;
  retryable: boolean;
}

export const IDLE_UPDATER_DOWNLOAD: UpdaterDownloadState = {
  revision: -1,
  phase: "idle",
  version: null,
  downloaded: 0,
  total: null,
  percent: null,
  bytesPerSecond: null,
  attempt: 0,
  maxAttempts: 0,
  retryAtMs: null,
  errorCode: null,
  error: null,
  retryable: false,
};

const phases = new Set<UpdaterDownloadPhase>([
  "idle",
  "checking",
  "downloading",
  "retrying",
  "failed",
  "ready",
]);
const errorCodes = new Set([
  "network",
  "timeout",
  "http",
  "range",
  "signature",
  "disk",
  "manifest",
]);

export function parseUpdaterDownloadState(
  value: unknown,
): UpdaterDownloadState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(state.revision) ||
    !phases.has(state.phase as UpdaterDownloadPhase)
  )
    return null;
  const numberOrNull = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    revision: state.revision as number,
    phase: state.phase as UpdaterDownloadPhase,
    version: typeof state.version === "string" ? state.version : null,
    downloaded: numberOrNull(state.downloaded) ?? 0,
    total: numberOrNull(state.total),
    percent: numberOrNull(state.percent),
    bytesPerSecond: numberOrNull(state.bytesPerSecond),
    attempt: numberOrNull(state.attempt) ?? 0,
    maxAttempts: numberOrNull(state.maxAttempts) ?? 0,
    retryAtMs: numberOrNull(state.retryAtMs),
    errorCode: errorCodes.has(String(state.errorCode))
      ? (state.errorCode as UpdaterDownloadErrorCode)
      : null,
    error: typeof state.error === "string" ? state.error : null,
    retryable: state.retryable === true,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0, bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
