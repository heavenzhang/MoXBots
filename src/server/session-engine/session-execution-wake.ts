/** Event seam only: the original Runtime/ledger owner wakes its persisted pending
 * continuation. No timer, queue, worker, or durable execution state lives here. */
const owners = new Map<string, () => Promise<void>>();
export function registerSessionExecutionWake(
  sessionId: string,
  wake: () => Promise<void>,
): void {
  owners.set(sessionId, wake);
}
export function revokeSessionExecutionWake(sessionId: string): void {
  owners.delete(sessionId);
}
export function wakeSessionExecution(sessionId: string): void {
  void owners
    .get(sessionId)?.()
    .catch((error) =>
      console.warn(
        "[session-execution] runtime wake unavailable:",
        error instanceof Error ? error.message : "unknown",
      ),
    );
}
