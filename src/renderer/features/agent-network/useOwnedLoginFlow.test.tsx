import { StrictMode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useOwnedLoginFlow, type OwnedLoginActions } from "./useOwnedLoginFlow";
import type { OwnedLoginAttempt } from "@/api/agentNetwork";
const nativeEvents = vi.hoisted(() => new Map<string, () => void>());
vi.mock("@/utils/browserMock", () => ({ isTauriEnvironment: () => true }));
vi.mock("@/utils/tauriListen", () => ({
  listenWithCleanup: vi.fn(
    async (name: string, handler: () => void, signal: AbortSignal) => {
      nativeEvents.set(name, handler);
      signal.addEventListener("abort", () => nativeEvents.delete(name), {
        once: true,
      });
    },
  ),
}));
const attempt: OwnedLoginAttempt = {
  attemptId: "attempt-1",
  authorizationUrl: "https://cloud.test/authorize?state=synthetic",
  expiresAt: 1800000120,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function setup(overrides: Partial<OwnedLoginActions> = {}) {
  const actions = {
    onOwnedStart: vi.fn().mockResolvedValue(attempt),
    onOwnedOpen: vi.fn().mockResolvedValue(undefined),
    onOwnedPoll: vi.fn().mockResolvedValue("pending"),
    onOwnedCancel: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn(),
    ...overrides,
  };
  return { ...renderHook(() => useOwnedLoginFlow(actions)), actions };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1800000000000);
});
afterEach(() => {
  cleanup();
  nativeEvents.clear();
  vi.useRealTimers();
});
it("immediately verifies the current PKCE attempt on native browser return and closes only after authentication", async () => {
  const poll = vi.fn().mockResolvedValue("pending");
  const { result, actions } = setup({ onOwnedPoll: poll });
  await act(async () => {
    await result.current.start("https://cloud.test");
  });
  await act(async () => {
    nativeEvents.get("owned-login:browser-return")?.();
  });
  expect(actions.onOwnedPoll).toHaveBeenCalledExactlyOnceWith("attempt-1");
  expect(actions.onCancel).not.toHaveBeenCalled();
  poll.mockResolvedValueOnce("authenticated");
  await act(async () => {
    nativeEvents.get("owned-login:browser-return")?.();
  });
  expect(actions.onCancel).toHaveBeenCalledOnce();
});
it("ignores browser returns without a pending attempt and after cancellation, and removes its listener on unmount", async () => {
  const { result, actions, unmount } = setup();
  await act(async () => {
    nativeEvents.get("owned-login:browser-return")?.();
  });
  expect(actions.onOwnedPoll).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.start("https://cloud.test");
  });
  await act(async () => {
    await result.current.cancel();
  });
  await act(async () => {
    nativeEvents.get("owned-login:browser-return")?.();
  });
  expect(actions.onOwnedPoll).not.toHaveBeenCalled();
  unmount();
  expect(nativeEvents.has("owned-login:browser-return")).toBe(false);
});
const tick = async (ms = 2000) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
it("opens the browser once, polls automatically and closes on authenticated without manual checking", async () => {
  const poll = vi
    .fn()
    .mockResolvedValueOnce("pending")
    .mockResolvedValueOnce("authenticated");
  const { result, actions } = setup({ onOwnedPoll: poll });
  await act(async () => {
    await result.current.start("https://cloud.test");
  });
  expect(actions.onOwnedOpen).toHaveBeenCalledExactlyOnceWith("attempt-1");
  await tick();
  expect(poll).toHaveBeenCalledTimes(1);
  expect(actions.onCancel).not.toHaveBeenCalled();
  await tick();
  expect(actions.onCancel).toHaveBeenCalledOnce();
  await tick(10_000);
  expect(poll).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});
it("shares one flight among background, focus and manual checks and keeps cancellation available", async () => {
  const pending = deferred<"authenticated">();
  const poll = vi.fn().mockReturnValue(pending.promise);
  const { result, actions } = setup({ onOwnedPoll: poll });
  await act(async () => {
    await result.current.start("https://cloud.test");
  });
  await tick();
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    void result.current.check();
  });
  await tick(10_000);
  expect(poll).toHaveBeenCalledTimes(1);
  await act(async () => {
    await result.current.cancel();
  });
  expect(actions.onOwnedCancel).toHaveBeenCalledExactlyOnceWith("attempt-1");
  expect(actions.onCancel).toHaveBeenCalledOnce();
  await act(async () => {
    pending.resolve("authenticated");
  });
  expect(actions.onCancel).toHaveBeenCalledOnce();
  await tick();
  expect(poll).toHaveBeenCalledTimes(1);
});
it("confirms legacy pending at expiry, stops checking and permits a new attempt", async () => {
  const short = { ...attempt, expiresAt: 1800000003 };
  const { result, actions } = setup({
    onOwnedStart: vi
      .fn()
      .mockResolvedValueOnce(short)
      .mockResolvedValue(attempt),
  });
  await act(async () => {
    await result.current.start("https://cloud.test");
  });
  await tick(3000);
  expect(result.current.expired).toBe(true);
  await tick(10_000);
  expect(actions.onOwnedPoll).toHaveBeenCalledTimes(2);
  await act(async () => {
    await result.current.check();
  });
  expect(actions.onOwnedPoll).toHaveBeenCalledTimes(2);
  await act(async () => {
    await result.current.start("https://cloud.test");
  });
  expect(result.current.expired).toBe(false);
  expect(actions.onOwnedStart).toHaveBeenCalledTimes(2);
});
it("cleans up timers and ignores a late poll when the dialog unmounts", async () => {
  const pending = deferred<"authenticated">();
  const { result, actions, unmount } = setup({
    onOwnedPoll: vi.fn().mockReturnValue(pending.promise),
  });
  await act(async () => {
    await result.current.start("https://cloud.test");
  });
  await tick();
  unmount();
  await act(async () => {
    pending.resolve("authenticated");
  });
  await tick(10_000);
  expect(actions.onCancel).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it("detaches a start that completes after unmount without cancelling its native owner", async () => {
  const started = deferred<OwnedLoginAttempt>();
  const { result, actions, unmount } = setup({
    onOwnedStart: vi.fn().mockReturnValue(started.promise),
  });
  let promise!: Promise<void>;
  act(() => {
    promise = result.current.start("https://cloud.test");
  });
  unmount();
  await act(async () => {
    started.resolve(attempt);
    await promise;
  });
  expect(actions.onOwnedOpen).not.toHaveBeenCalled();
  expect(actions.onOwnedCancel).not.toHaveBeenCalled();
});
it("reopens a changed authorization once, then continues checking the original attempt owner", async () => {
  const next = {
    ...attempt,
    authorizationUrl: "https://cloud.test/restore?state=next",
  };
  const poll = vi
    .fn()
    .mockResolvedValueOnce(next)
    .mockResolvedValueOnce(next)
    .mockResolvedValue("authenticated");
  const { result, actions } = setup({ onOwnedPoll: poll });
  await act(async () => {
    await result.current.start("https://cloud.test");
  });
  await tick();
  expect(actions.onOwnedOpen).toHaveBeenCalledTimes(2);
  expect(result.current.attempt?.authorizationUrl).toBe(next.authorizationUrl);
  await tick();
  expect(actions.onOwnedOpen).toHaveBeenCalledTimes(2);
  await tick();
  expect(actions.onCancel).toHaveBeenCalledOnce();
});
it("keeps browser-open failures visible and still allows a manual recovery", async () => {
  const open = vi
    .fn()
    .mockRejectedValueOnce(Error("no browser"))
    .mockResolvedValue(undefined);
  const { result, actions } = setup({ onOwnedOpen: open });
  await act(async () => {
    await result.current.start("https://cloud.test");
  });
  expect(result.current.error).toContain("未能自动打开浏览器");
  await tick();
  expect(result.current.error).toContain("未能自动打开浏览器");
  await act(async () => {
    await result.current.reopen();
  });
  expect(result.current.error).toBeNull();
  expect(open).toHaveBeenCalledTimes(2);
  await act(async () => {
    await result.current.check();
  });
  expect(actions.onOwnedPoll).toHaveBeenCalledTimes(2);
});
it("backs off failed checks and recovers without asking the user to click check", async () => {
  const poll = vi
    .fn()
    .mockRejectedValueOnce(Error("offline"))
    .mockResolvedValueOnce("authenticated");
  const { result, actions } = setup({ onOwnedPoll: poll });
  await act(async () => {
    await result.current.start("https://cloud.test");
  });
  await tick();
  expect(result.current.error).toContain("将自动重试");
  await tick();
  expect(poll).toHaveBeenCalledTimes(1);
  await tick();
  expect(actions.onCancel).toHaveBeenCalledOnce();
});
it("pauses after an unconfirmed cancellation, prevents duplicate cancellation and permits retry", async () => {
  const pending = deferred<void>();
  const cancel = vi
    .fn()
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValue(undefined);
  const { result, actions } = setup({ onOwnedCancel: cancel });
  await act(async () => {
    await result.current.start("https://cloud.test");
  });
  let first!: Promise<void>;
  act(() => {
    first = result.current.cancel();
    void result.current.cancel();
  });
  expect(cancel).toHaveBeenCalledOnce();
  await act(async () => {
    pending.resolve();
    await first;
  });
  expect(actions.onCancel).toHaveBeenCalledOnce();
});
it("keeps automatic checking stopped when cancellation fails", async () => {
  const cancel = vi
    .fn()
    .mockRejectedValueOnce(Error("cancel unavailable"))
    .mockResolvedValue(undefined);
  const { result, actions } = setup({ onOwnedCancel: cancel });
  await act(async () => {
    await result.current.start("https://cloud.test");
  });
  await act(async () => {
    await result.current.cancel();
  });
  expect(result.current.stopped).toBe(true);
  await tick(10_000);
  expect(actions.onOwnedPoll).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.cancel();
  });
  expect(actions.onCancel).toHaveBeenCalledOnce();
});
it("does not expire a valid far-future deadline through timer integer overflow", async () => {
  const { result, actions } = setup({
    onOwnedStart: vi
      .fn()
      .mockResolvedValue({ ...attempt, expiresAt: 1900000000 }),
  });
  await act(async () => {
    await result.current.start("https://cloud.test");
  });
  await tick(1000);
  expect(result.current.expired).toBe(false);
  expect(actions.onOwnedPoll).not.toHaveBeenCalled();
});
it("waits for native observation before expiring an in-flight legacy pending response", async () => {
  const pending = deferred<"pending">();
  const poll = vi.fn().mockReturnValue(pending.promise);
  const { result } = setup({
    onOwnedStart: vi
      .fn()
      .mockResolvedValue({ ...attempt, expiresAt: 1800000003 }),
    onOwnedPoll: poll,
  });
  await act(async () => {
    await result.current.start("https://cloud.test");
  });
  await tick(3000);
  expect(result.current.expired).toBe(false);
  expect(result.current.checking).toBe(true);
  await act(async () => {
    pending.resolve("pending");
  });
  expect(result.current.expired).toBe(true);
  expect(result.current.checking).toBe(false);
  await tick(10_000);
  expect(poll).toHaveBeenCalledTimes(1);
});
it("uses committed latest callbacks without restarting the polling clock on parent rerenders", async () => {
  const initial = {
    onOwnedStart: vi.fn().mockResolvedValue(attempt),
    onOwnedOpen: vi.fn().mockResolvedValue(undefined),
    onOwnedPoll: vi.fn().mockResolvedValue("pending" as const),
    onOwnedCancel: vi.fn(),
    onCancel: vi.fn(),
  };
  const { result, rerender } = renderHook(
    ({ actions }) => useOwnedLoginFlow(actions),
    { initialProps: { actions: initial } },
  );
  await act(async () => {
    await result.current.start("https://cloud.test");
  });
  await tick(1000);
  const changed = {
    ...initial,
    onOwnedPoll: vi.fn().mockResolvedValue("authenticated" as const),
  };
  rerender({ actions: changed });
  await tick(1000);
  expect(changed.onOwnedPoll).toHaveBeenCalledOnce();
  expect(initial.onOwnedPoll).not.toHaveBeenCalled();
});

it("keeps one browser launch and one polling loop under StrictMode lifecycle replay", async () => {
  const actions = {
    onOwnedStart: vi.fn().mockResolvedValue(attempt),
    onOwnedOpen: vi.fn().mockResolvedValue(undefined),
    onOwnedPoll: vi.fn().mockResolvedValue("authenticated" as const),
    onOwnedCancel: vi.fn(),
    onCancel: vi.fn(),
  };
  const { result } = renderHook(() => useOwnedLoginFlow(actions), {
    wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
  });
  await act(async () => {
    await result.current.start("https://cloud.test");
  });
  await tick();
  expect(actions.onOwnedOpen).toHaveBeenCalledOnce();
  expect(actions.onOwnedPoll).toHaveBeenCalledOnce();
  expect(actions.onCancel).toHaveBeenCalledOnce();
});

it("retains an account mismatch and stops automatic and manual polling until cancellation", async () => {
  const poll = vi
    .fn()
    .mockRejectedValue(
      Object.assign(new Error("wrong account"), {
        code: "OWNED_ACCOUNT_MISMATCH",
      }),
    );
  const { result, actions } = setup({ onOwnedPoll: poll });
  await act(async () => {
    await result.current.start("https://cloud.test");
  });
  await tick();
  expect(result.current.error).toContain("账号与当前网络绑定不一致");
  expect(result.current.notice).toBeNull();
  expect(result.current.stopped).toBe(true);
  expect(result.current.checking).toBe(false);
  await act(async () => {
    vi.advanceTimersByTime(60_000);
    await result.current.check();
  });
  expect(poll).toHaveBeenCalledOnce();
  expect(result.current.error).toContain("账号与当前网络绑定不一致");
  expect(actions.onCancel).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.cancel();
  });
  expect(actions.onOwnedCancel).toHaveBeenCalledExactlyOnceWith("attempt-1");
  expect(actions.onCancel).toHaveBeenCalledOnce();
});

it("pauses actionable native save failures and retries the same attempt only on request", async () => {
  const failure = {
    code: "OWNED_CREDENTIAL_STORE_FAILED",
    retryable: false,
    details: { phase: "saving_session", canRetry: true },
  };
  const poll = vi
    .fn()
    .mockRejectedValueOnce(failure)
    .mockResolvedValue({ status: "pending", phase: "saving_session" });
  const retry = vi.fn().mockResolvedValue(undefined);
  const { result, actions } = setup({ onOwnedPoll: poll, onOwnedRetry: retry });
  await act(async () => {
    await result.current.start("https://cloud.test");
  });
  await tick();
  expect(result.current.canRetry).toBe(true);
  expect(result.current.nativePhase).toBe("saving_session");
  await tick(30_000);
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    await result.current.check();
  });
  expect(poll).toHaveBeenCalledTimes(1);
  expect(actions.onOwnedCancel).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.retry();
  });
  await tick(1);
  expect(retry).toHaveBeenCalledExactlyOnceWith("attempt-1");
  expect(result.current.canRetry).toBe(false);
  expect(result.current.nativePhase).toBe("saving_session");
  expect(actions.onOwnedStart).toHaveBeenCalledTimes(1);
});
it("stops polling terminal consumed results instead of waiting forever", async () => {
  const poll = vi
    .fn()
    .mockRejectedValue({
      code: "OWNED_LOGIN_RESTART_REQUIRED",
      retryable: false,
    });
  const { result } = setup({ onOwnedPoll: poll });
  await act(async () => {
    await result.current.start("https://cloud.test");
  });
  await tick();
  await tick(30_000);
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
  });
  expect(poll).toHaveBeenCalledTimes(1);
  expect(result.current.stopped).toBe(true);
  expect(result.current.canRetry).toBe(false);
});
it("observes native phases without treating status as a new authorization", async () => {
  const poll = vi
    .fn()
    .mockResolvedValue({ status: "pending", phase: "verifying_identity" });
  const { result, actions } = setup({ onOwnedPoll: poll });
  await act(async () => {
    await result.current.start("https://cloud.test");
  });
  await tick();
  expect(result.current.attempt?.attemptId).toBe("attempt-1");
  expect(result.current.nativePhase).toBe("verifying_identity");
  expect(actions.onOwnedOpen).toHaveBeenCalledTimes(1);
});

it("reattaches a received grant after browser expiry without reopening authorization", async () => {
  const staged = { ...attempt, expiresAt: 1799999999, phase: "saving_session" as const };
  const poll = vi.fn().mockResolvedValue("authenticated");
  const { result, actions } = setup({ onOwnedStart: vi.fn().mockResolvedValue(staged), onOwnedPoll: poll });
  await act(async () => { await result.current.start("https://cloud.test"); });
  expect(actions.onOwnedOpen).not.toHaveBeenCalled();
  expect(result.current.expired).toBe(false);
  expect(result.current.nativePhase).toBe("saving_session");
  await tick();
  expect(poll).toHaveBeenCalledExactlyOnceWith("attempt-1");
  expect(actions.onCancel).toHaveBeenCalledOnce();
});

it("offers restart when a retained grant expires before the user retries saving", async () => {
  const poll = vi.fn().mockRejectedValue({ code: "NETWORK_CREDENTIAL_STORE_UNAVAILABLE", retryable: false, details: { phase: "saving_session", canRetry: true } });
  const retry = vi.fn().mockRejectedValue({ code: "OWNED_LOGIN_EXPIRED", retryable: false });
  const { result } = setup({ onOwnedPoll: poll, onOwnedRetry: retry });
  await act(async () => { await result.current.start("https://cloud.test"); });
  await tick();
  expect(result.current.canRetry).toBe(true);
  await act(async () => { await result.current.retry(); });
  expect(result.current.stopped).toBe(true);
  expect(result.current.canRetry).toBe(false);
  await tick(10_000);
  expect(poll).toHaveBeenCalledTimes(1);
});

it("accepts a native commit observed after the browser deadline while the view was suspended", async () => {
  const poll = vi.fn().mockResolvedValue("authenticated");
  const { result, actions } = setup({ onOwnedStart: vi.fn().mockResolvedValue({ ...attempt, expiresAt: 1800000003 }), onOwnedPoll: poll });
  await act(async () => { await result.current.start("https://cloud.test"); });
  // Advancing the wall clock without executing timers models a suspended view.
  vi.setSystemTime(1800000010000);
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(poll).toHaveBeenCalledExactlyOnceWith("attempt-1");
  expect(actions.onCancel).toHaveBeenCalledOnce();
  expect(result.current.expired).toBe(false);
});
