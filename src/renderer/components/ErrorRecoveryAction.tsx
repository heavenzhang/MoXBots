import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ErrorRecovery } from '../pages/errorMessageResend';

/** Error recovery is an explicit click; rendering, hydration and errors never
 * dispatch work. Keep the pending scope local to this Session. */
export function ErrorRecoveryAction({ sessionId, recovery, disabled, onRecover, onUnavailable }: {
  sessionId: string;
  recovery: ErrorRecovery | null;
  disabled: boolean;
  onRecover: (recovery: ErrorRecovery) => Promise<void>;
  onUnavailable: () => void;
}) {
  const { t } = useTranslation('chat');
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  if (!recovery) return null;
  return <button type="button" disabled={disabled || pending}
    title={t(`shell.agentError.${recovery.kind}Hint`)}
    className="shrink-0 rounded-md px-2 py-0.5 text-sm font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent-warm-subtle)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[var(--focus-border)]"
    onClick={() => {
      if (disabled || inFlight.current) return;
      inFlight.current = true;
      setPending(true);
      void onRecover(recovery).catch(onUnavailable).finally(() => {
        inFlight.current = false;
        setPending(false);
      });
    }} data-session-id={sessionId}>
    {t(`shell.agentError.${pending ? 'recovering' : recovery.kind}`)}
  </button>;
}
