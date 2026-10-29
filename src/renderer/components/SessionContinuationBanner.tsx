import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlayIcon } from './icons';

export interface ContinuationRequest { requestId: string; turnId: string }

/** An explicit, non-persisted user intent. Mount/restore alone never executes. */
export function SessionContinuationBanner({
  sessionId, turnId, ready, blocked, request, onConsumed, onContinue, onUnavailable, hidden = false,
}: {
  sessionId: string;
  turnId?: string;
  ready: boolean;
  blocked: boolean;
  hidden?: boolean;
  request?: ContinuationRequest;
  onConsumed?: () => void;
  onContinue: (turnId: string) => Promise<boolean>;
  onUnavailable: () => void;
}) {
  const { t } = useTranslation('chat');
  const [pending, setPending] = useState(false);
  const owner = useRef(sessionId);
  owner.current = sessionId;
  const inFlight = useRef<string | null>(null);
  const accepted = useRef<string | null>(null);
  const handledRequest = useRef<string | null>(null);

  const run = useCallback(async (expected: string) => {
    if (!ready || blocked || !turnId || turnId !== expected || inFlight.current || accepted.current === `${sessionId}:${turnId}`) return;
    const key = `${sessionId}:${turnId}`;
    inFlight.current = key;
    setPending(true);
    try {
      if (await onContinue(turnId)) accepted.current = key;
    } finally {
      if (inFlight.current === key) inFlight.current = null;
      if (owner.current === sessionId) setPending(false);
    }
  }, [ready, blocked, turnId, sessionId, onContinue]);

  useEffect(() => {
    if (!request || !ready || handledRequest.current === request.requestId) return;
    handledRequest.current = request.requestId;
    onConsumed?.();
    if (blocked || !turnId || request.turnId !== turnId) {
      onUnavailable();
      return;
    }
    void run(request.turnId).catch(onUnavailable);
  }, [request, ready, blocked, turnId, run, onConsumed, onUnavailable]);

  // A saved unfinished turn cannot describe current work until hydration and
  // live admission are ready. Busy work owns its existing progress UI.
  if (hidden || !turnId || !ready || blocked || accepted.current === `${sessionId}:${turnId}`) return null;
  return (
    <div className="relative z-10 flex-shrink-0 border-b border-[var(--line)] bg-[var(--paper-inset)] px-4 py-2 text-sm">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-[var(--ink-secondary)]">
          <span className="font-medium text-[var(--ink)]">{t('shell.continuation.title')}</span>
          <span className="ml-2">{t('shell.continuation.detail')}</span>
        </div>
        <button type="button" disabled={!ready || blocked || pending}
          onClick={() => { void run(turnId).catch(onUnavailable); }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 font-medium text-[var(--accent)] hover:bg-[var(--paper-hover)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[var(--focus-border)]"
          aria-label={t('shell.continuation.continue')}>
          <PlayIcon aria-hidden className="h-3.5 w-3.5" />
          {t(pending ? 'shell.continuation.pending' : 'shell.continuation.continue')}
        </button>
      </div>
    </div>
  );
}
