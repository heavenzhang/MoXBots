import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  networkErrorKey,
  type OwnedLoginPhase,
  type OwnedLoginAttempt,
} from "@/api/agentNetwork";
import { listenWithCleanup } from "@/utils/tauriListen";
import { isTauriEnvironment } from "@/utils/browserMock";

type Phase =
  | "idle"
  | "starting"
  | "opening"
  | "waiting"
  | "checking"
  | "cancelling"
  | "expired"
  | "stopped"
  | "paused";
export type OwnedLoginObservation =
  | "pending"
  | "authenticated"
  | OwnedLoginAttempt
  | { status: "pending"; phase?: OwnedLoginPhase };
export interface OwnedLoginActions {
  onOwnedStart: (issuer: string, ca?: string) => Promise<OwnedLoginAttempt>;
  onOwnedOpen: (id: string) => Promise<void>;
  onOwnedPoll: (id: string) => Promise<OwnedLoginObservation>;
  onOwnedRetry?: (id: string) => Promise<void>;
  onOwnedCancel: (id: string) => Promise<void>;
  onCancel: () => void;
}
const POLL_DELAY = 2000;

/** Presentation lifecycle only. The existing Rust owner validates and saves login. */
export function useOwnedLoginFlow(actions: OwnedLoginActions) {
  const { t } = useTranslation("app");
  const [attempt, setAttempt] = useState<OwnedLoginAttempt | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [nativePhase, setNativePhase] = useState<OwnedLoginPhase>(
    "awaiting_authorization",
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ ...actions, t });
  const alive = useRef(false);
  const epoch = useRef(0);
  const current = useRef<OwnedLoginAttempt | null>(null);
  const flight = useRef(false);
  const cancelled = useRef(false);
  const paused = useRef(false);
  const nativePhaseRef = useRef<OwnedLoginPhase>("awaiting_authorization");
  const showNativePhase = (next: OwnedLoginPhase) => {
    nativePhaseRef.current = next;
    setNativePhase(next);
  };
  const cancelling = useRef(false);
  const failures = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkRef = useRef<() => Promise<void>>(async () => {});
  const clearTimers = () => {
    if (timer.current) clearTimeout(timer.current);
    if (expiry.current) clearTimeout(expiry.current);
    timer.current = expiry.current = null;
  };
  const isCurrent = (generation: number) =>
    alive.current && epoch.current === generation && !cancelled.current;
  const failureText = (failure: unknown) =>
    failure instanceof Error
      ? failure.message
      : latest.current.t(`agentNetwork.errors.${networkErrorKey(failure)}`);
  const hasReceivedGrant = () =>
    ["verifying_identity", "saving_session"].includes(nativePhaseRef.current);
  const expired = () =>
    !current.current ||
    (!hasReceivedGrant() && current.current.expiresAt * 1000 <= Date.now());
  const markExpired = () => {
    paused.current = true;
    clearTimers();
    setPhase("expired");
    setError(null);
    setBrowserError(null);
    setNotice(latest.current.t("agentNetwork.ownedLogin.expired"));
  };
  const armExpiry = () => {
    if (expiry.current) clearTimeout(expiry.current);
    if (hasReceivedGrant() || expired()) {
      expiry.current = null;
      return;
    }
    const generation = epoch.current;
    expiry.current = setTimeout(
      () => {
        if (isCurrent(generation)) {
          // The native owner may already have committed while the view slept.
          // Observe it before declaring browser expiry.
          if (expired()) void checkRef.current();
          else armExpiry();
        }
      },
      Math.min(
        2_147_000_000,
        Math.max(0, (current.current?.expiresAt ?? 0) * 1000 - Date.now()),
      ),
    );
  };
  const schedule = (delay = POLL_DELAY) => {
    if (timer.current) clearTimeout(timer.current);
    if (
      !alive.current ||
      cancelled.current ||
      paused.current ||
      !current.current
    )
      return;
    timer.current = setTimeout(() => {
      void checkRef.current();
    }, delay);
  };
  const open = async (generation = epoch.current) => {
    const active = current.current;
    if (!active || !isCurrent(generation)) return;
    setPhase("opening");
    try {
      await latest.current.onOwnedOpen(active.attemptId);
      if (isCurrent(generation)) {
        setBrowserError(null);
        setNotice(latest.current.t("agentNetwork.ownedLogin.browserOpened"));
      }
    } catch (failure) {
      if (isCurrent(generation))
        setBrowserError(
          latest.current.t("agentNetwork.ownedLogin.browserFailed", {
            message: failureText(failure),
          }),
        );
    }
  };
  async function check() {
    if (
      flight.current ||
      cancelled.current ||
      paused.current ||
      !current.current
    )
      return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    flight.current = true;
    const generation = epoch.current;
    const active = current.current;
    setPhase("checking");
    setPolling(true);
    try {
      const result = await latest.current.onOwnedPoll(active.attemptId);
      if (!isCurrent(generation)) return;
      failures.current = 0;
      setError(null);
      if (result === "authenticated") {
        current.current = null;
        clearTimers();
        setAttempt(null);
        setPhase("idle");
        latest.current.onCancel();
        return;
      }
      if (typeof result === "object" && "status" in result) {
        const nextPhase = result.phase ?? "awaiting_authorization";
        showNativePhase(nextPhase);
        armExpiry();
        setNotice(
          latest.current.t(`agentNetwork.ownedLogin.phases.${nextPhase}`),
        );
      } else if (typeof result === "object") {
        // The Rust owner may require confirmation of an existing device identity.
        // It supplies the next authorization; never create a separate login here.
        const changed =
          result.authorizationUrl !== active.authorizationUrl ||
          result.attemptId !== active.attemptId;
        current.current = result;
        setAttempt(result);
        showNativePhase(result.phase ?? "awaiting_authorization");
        armExpiry();
        if (changed) await open(generation);
        if (isCurrent(generation))
          setNotice(
            latest.current.t("agentNetwork.ownedLogin.restoreIdentity"),
          );
      } else if (expired()) {
        // Compatibility with older native replies that have no explicit phase.
        markExpired();
      } else setNotice(latest.current.t("agentNetwork.ownedLogin.pending"));
    } catch (failure) {
      if (isCurrent(generation)) {
        const issue =
          failure && typeof failure === "object"
            ? (failure as {
                code?: string;
                retryable?: boolean;
                details?: { canRetry?: boolean; phase?: OwnedLoginPhase };
              })
            : undefined;
        if (issue?.code === "OWNED_LOGIN_EXPIRED") {
          markExpired();
          return;
        }
        if (
          issue?.code === "OWNED_ACCOUNT_MISMATCH" ||
          issue?.retryable === false
        ) {
          clearTimers();
          paused.current = true;
          flight.current = false;
          setPolling(false);
          setPhase(
            issue.details?.canRetry === true && latest.current.onOwnedRetry
              ? "paused"
              : "stopped",
          );
          if (issue.details?.phase) showNativePhase(issue.details.phase);
          setNotice(null);
          setError(
            issue.code === "OWNED_ACCOUNT_MISMATCH"
              ? latest.current.t(
                  "agentNetwork.ownedLogin.accountMismatchStopped",
                )
              : failureText(failure),
          );
          return;
        }
        failures.current += 1;
        setError(
          latest.current.t("agentNetwork.ownedLogin.checkFailed", {
            message: failureText(failure),
          }),
        );
      }
    } finally {
      if (isCurrent(generation)) {
        flight.current = false;
        setPolling(false);
        if (current.current && !paused.current) {
          if (!expired()) setPhase("waiting");
          schedule(
            Math.min(15_000, POLL_DELAY * 2 ** Math.min(failures.current, 3)),
          );
        }
      }
    }
  }
  async function start(issuer: string, ca?: string) {
    if (flight.current || !issuer.trim()) return;
    const generation = ++epoch.current;
    cancelled.current = false;
    paused.current = false;
    showNativePhase("awaiting_authorization");
    failures.current = 0;
    flight.current = true;
    clearTimers();
    current.current = null;
    setAttempt(null);
    setPhase("starting");
    setError(null);
    setBrowserError(null);
    setNotice(null);
    try {
      const started = await latest.current.onOwnedStart(
        issuer.trim(),
        ca?.trim() || undefined,
      );
      if (!isCurrent(generation)) {
        // Native owns an accepted attempt even when the view disappears.
        // Only an explicit cancellation or a live scope replacement revokes it.
        if (cancelled.current || alive.current)
          await latest.current.onOwnedCancel(started.attemptId).catch(() => {});
        return;
      }
      current.current = started;
      setAttempt(started);
      showNativePhase(started.phase ?? "awaiting_authorization");
      armExpiry();
      if (hasReceivedGrant()) {
        setNotice(latest.current.t(`agentNetwork.ownedLogin.phases.${nativePhaseRef.current}`));
      } else await open(generation);
    } catch (failure) {
      if (isCurrent(generation)) {
        setError(failureText(failure));
        setPhase("idle");
      }
    } finally {
      if (isCurrent(generation)) {
        flight.current = false;
        if (current.current) {
          if (!expired()) setPhase("waiting");
          schedule();
        }
      }
    }
  }
  async function reopen() {
    if (flight.current || cancelled.current || !current.current || expired())
      return;
    flight.current = true;
    const generation = epoch.current;
    setError(null);
    try {
      await open(generation);
    } finally {
      if (isCurrent(generation)) {
        flight.current = false;
        if (!expired()) setPhase("waiting");
        schedule();
      }
    }
  }
  async function retry() {
    if (
      flight.current ||
      !paused.current ||
      !current.current ||
      !latest.current.onOwnedRetry
    )
      return;
    const generation = epoch.current;
    flight.current = true;
    setPolling(true);
    try {
      await latest.current.onOwnedRetry(current.current.attemptId);
      if (!isCurrent(generation)) return;
      paused.current = false;
      setError(null);
      setPhase("waiting");
      armExpiry();
      schedule(0);
    } catch (failure) {
      if (isCurrent(generation)) {
        setError(failureText(failure));
        const issue = failure as { retryable?: boolean; details?: { canRetry?: boolean } } | null;
        if (issue?.retryable === false && issue.details?.canRetry !== true)
          setPhase("stopped");
      }
    } finally {
      if (isCurrent(generation)) {
        flight.current = false;
        setPolling(false);
      }
    }
  }
  async function cancel() {
    if (cancelling.current) return;
    cancelling.current = true;
    // Cancel stays available while a background poll is in flight. The callback
    // invalidates the existing login owner's generation before awaiting native IO.
    cancelled.current = true;
    ++epoch.current;
    clearTimers();
    setPhase("cancelling");
    setPolling(false);
    setError(null);
    setBrowserError(null);
    setNotice(null);
    try {
      if (current.current)
        await latest.current.onOwnedCancel(current.current.attemptId);
      if (alive.current) latest.current.onCancel();
    } catch (failure) {
      if (alive.current) {
        setError(
          latest.current.t("agentNetwork.ownedLogin.cancelFailed", {
            message: failureText(failure),
          }),
        );
        setPhase("stopped");
      }
    } finally {
      // The old observation belongs to the retired epoch; its finally cannot
      // release this flag after cancellation. A failed cancel must allow restart.
      flight.current = false;
      cancelling.current = false;
    }
  }
  useLayoutEffect(() => {
    latest.current = { ...actions, t };
    checkRef.current = check;
  });
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      epoch.current += 1;
      clearTimers();
    };
  }, []);
  useEffect(() => {
    const focus = () => {
      if (current.current && !cancelled.current && !paused.current)
        void checkRef.current();
    };
    window.addEventListener("focus", focus);
    const abort = new AbortController();
    if (isTauriEnvironment())
      void listenWithCleanup("owned-login:browser-return", focus, abort.signal);
    return () => {
      abort.abort();
      window.removeEventListener("focus", focus);
    };
  }, []);
  return {
    attempt,
    phase,
    nativePhase,
    retry,
    canRetry: phase === "paused",
    error: browserError ?? error,
    notice,
    start,
    reopen,
    check,
    cancel,
    busy: phase === "starting" || phase === "opening" || phase === "cancelling",
    checking: polling,
    expired: phase === "expired",
    stopped: phase === "stopped" || phase === "paused",
  };
}
