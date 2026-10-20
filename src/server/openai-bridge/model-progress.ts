/**
 * Compose token-owned Query liveness with ModelFailover's attempt-local lease.
 * Only progress accepted by the current live attempt may reach the Query owner.
 */
export function composeAcceptedAttemptModelProgress(
  onAttemptProgress: (() => boolean) | undefined,
  onQueryProgress: (() => void) | undefined,
): () => void {
  return () => {
    if (onAttemptProgress?.() !== true) return;
    onQueryProgress?.();
  };
}
