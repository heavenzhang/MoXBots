import type { Account } from './native';

type LogoutReply = Account | { kind: 'error'; code: string };

/** One synchronous owner for login mutations and their asynchronous projections.
 * Cancellation quarantines reads until logout explicitly confirms signed-out. */
export function createLoginAttemptGate() {
  let epoch = 0;
  let action: 'start' | 'cancel' | null = null;
  let pending = false;
  let cancelling = false;
  return {
    capture: () => epoch,
    owns: (captured: number) => captured === epoch,
    isCurrent: (captured: number) => captured === epoch && !cancelling,
    canRead: () => action === null && !cancelling,
    beginStart(): number | null {
      if (action || pending || cancelling) return null;
      action = 'start';
      return ++epoch;
    },
    beginCancel(): number | null {
      if (action) return null;
      action = 'cancel';
      cancelling = true;
      return ++epoch;
    },
    observe(captured: number, state: Account['state']): boolean {
      if (captured !== epoch || cancelling) return false;
      pending = state === 'authenticating';
      return true;
    },
    confirmCancel(captured: number): boolean {
      if (captured !== epoch || action !== 'cancel') return false;
      pending = false;
      cancelling = false;
      return true;
    },
    finish(captured: number): void { if (captured === epoch) action = null; },
    invalidate(): void { epoch += 1; action = null; },
  };
}

export function loginNeedsPolling(state: Account['state']): boolean {
  return state === 'authenticating';
}

export function loginPollNeedsStatus(code: string): boolean {
  return code === 'OWNED_LOGIN_EXPIRED' || code === 'OWNED_LOGIN_REQUIRED';
}

/** Preserve current account-load failures while dropping exceptions from a superseded refresh. */
export function currentAccountLoadError(error: unknown, isCurrent: () => boolean): { error: unknown } | null {
  return isCurrent() ? { error } : null;
}

export function accountIdentityChanged(previous: Account | null, next: Account): boolean {
  return previous?.state === 'signed-in'
    && (next.state !== 'signed-in' || previous.principalId !== next.principalId);
}

/** Continue the UI logout path only after the native owner confirms signed-out. */
export async function logoutAndConfirm(
  requestLogout: () => Promise<LogoutReply>,
  onConfirmed: () => void,
): Promise<'confirmed' | 'not-confirmed'> {
  const reply = await requestLogout();
  if (reply.kind === 'error') throw new Error(reply.code);
  if (reply.kind !== 'account') throw new Error('ACCOUNT_LOGOUT_REPLY_INVALID');
  if (reply.state !== 'signed-out') return 'not-confirmed';
  onConfirmed();
  return 'confirmed';
}

export function returnFromAccountRoute(canGoBack: () => boolean, goBack: () => void, goHome: () => void): void {
  if (canGoBack()) goBack();
  else goHome();
}

/** Pop an account route back to the already-mounted chat owner after confirmed logout. */
export function dismissToExistingRoot(dismissToRoot: () => void): void {
  dismissToRoot();
}
