import { useEffect, useEffectEvent, useRef } from "react";

export type RemotePollingActivity = "running" | "idle" | "error";

/** Timers belong to the mounted remote view. Transport admission remains in
 * remoteSessionRequest; this loop never retries a mutation or owns execution. */
export function useRemoteSessionPolling({ enabled, foreground, scopeKey, refresh, synchronize }: {
  enabled: boolean;
  foreground: boolean;
  scopeKey: string;
  refresh: number;
  synchronize: (cancelled: () => boolean) => Promise<RemotePollingActivity | void>;
}) {
  const poll = useEffectEvent(synchronize);
  const delay = useEffectEvent((activity: RemotePollingActivity, failures: number) => {
    const visible = foreground && document.visibilityState !== "hidden";
    if (activity === "error") return Math.max(visible ? 1500 : 5000, Math.min(15000, 1500 * 2 ** Math.min(failures - 1, 4)));
    return visible ? (activity === "running" ? 300 : 1500) : 5000;
  });
  const wakeRef = useRef<(() => void) | null>(null);
  const previousForeground = useRef(foreground);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false, running = false, wakePending = false;
    let activity: RemotePollingActivity = "idle", failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cycle = async () => {
      if (cancelled) return;
      clearTimeout(timer);
      if (running) { wakePending = true; return; }
      running = true;
      try {
        const result = await poll(() => cancelled);
        // A busy local editor may skip this read. Keep the last actual result.
        if (result) {
          activity = result;
          failures = result === "error" ? failures + 1 : 0;
        }
      } catch {
        activity = "error";
        failures++;
      }
      finally {
        running = false;
        if (!cancelled) {
          timer = setTimeout(() => void cycle(), wakePending ? 0 : delay(activity, failures));
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
