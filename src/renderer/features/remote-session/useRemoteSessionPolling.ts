import { useEffect, useEffectEvent, useRef } from "react";

/** Timers belong to the mounted remote view. Transport admission remains in
 * remoteSessionRequest; this loop never retries a mutation or owns execution. */
export function useRemoteSessionPolling({ enabled, foreground, scopeKey, refresh, synchronize }: {
  enabled: boolean;
  foreground: boolean;
  scopeKey: string;
  refresh: number;
  synchronize: (cancelled: () => boolean) => Promise<void>;
}) {
  const poll = useEffectEvent(synchronize);
  const delay = useEffectEvent(() => foreground && document.visibilityState !== "hidden" ? 1500 : 5000);
  const wakeRef = useRef<(() => void) | null>(null);
  const previousForeground = useRef(foreground);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false, running = false, wakePending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cycle = async () => {
      if (cancelled) return;
      clearTimeout(timer);
      if (running) { wakePending = true; return; }
      running = true;
      try { await poll(() => cancelled); }
      finally {
        running = false;
        if (!cancelled) {
          timer = setTimeout(() => void cycle(), wakePending ? 0 : delay());
          wakePending = false;
        }
      }
    };
    const wake = () => { if (document.visibilityState !== "hidden") void cycle(); };
    wakeRef.current = wake;
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    void cycle();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (wakeRef.current === wake) wakeRef.current = null;
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [enabled, scopeKey, refresh]);
  useEffect(() => {
    if (foreground && !previousForeground.current) wakeRef.current?.();
    previousForeground.current = foreground;
  }, [foreground]);
}
