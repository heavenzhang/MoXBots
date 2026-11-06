export interface InitialMessageAutoSendGate {
  hasInitialMessage: boolean;
  alreadyConsumed: boolean;
  hasSessionId: boolean;
  isConnected: boolean;
  isSessionLoading: boolean;
  isActive: boolean;
  runtimeReady?: boolean;
}

/**
 * Launcher handoff is already an explicit user send. Once the target Chat tab
 * has a session, SSE connection and restored send state, it must submit even
 * if the user switched away during startup. SSE can connect before the empty
 * persisted session has finished restoring; consuming the handoff then loses
 * its only send attempt because TabProvider correctly rejects writes.
 */
export function shouldAutoSendInitialMessage(args: InitialMessageAutoSendGate): boolean {
  if (!args.hasInitialMessage) return false;
  if (args.alreadyConsumed) return false;
  if (!args.hasSessionId) return false;
  if (!args.isConnected) return false;
  if (args.isSessionLoading) return false;
  if (args.runtimeReady === false) return false;
  return true;
}
