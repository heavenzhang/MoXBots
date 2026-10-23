import { useCallback, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveSystemStatus } from '@/utils/systemStatus';

/** A projection of Session recovery, kept visible above the existing Stop owner. */
export function ModelRecoveryNotice({ status, active }: { status?: string | null; active: boolean }) {
  const { t } = useTranslation('chat');
  const waiting = status?.startsWith('model_recovery:') === true;
  const subscribe = useCallback((onChange: () => void) => {
    if (!waiting || !active) return () => {};
    const timer = setInterval(onChange, 1000);
    return () => clearInterval(timer);
  }, [waiting, active]);
  useSyncExternalStore(subscribe, () => active ? Math.floor(Date.now() / 1000) : 0);
  if (!waiting && status !== 'model_recovery_paused') return null;
  return <div
    data-model-recovery-notice=""
    role="status"
    aria-live="off"
    className="border-b border-[var(--line)] px-3 py-2 text-xs leading-relaxed text-[var(--ink-secondary)]"
  >{resolveSystemStatus(status!, t)}</div>;
}
