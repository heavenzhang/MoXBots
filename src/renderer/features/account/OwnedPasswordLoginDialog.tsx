import { useRef, useState } from "react";
import { FloatingFocusManager, useFloating } from "@floating-ui/react";
import { useTranslation } from "react-i18next";
import OverlayBackdrop from "@/components/OverlayBackdrop";
import { CloseIcon, LoaderIcon, UserIcon } from "@/components/icons";
import { useCloseLayer } from "@/hooks/useCloseLayer";
import { isImeComposingEvent } from "@/utils/imeKeyboard";
import {
  useOwnedLoginFlow,
  type OwnedLoginActions,
} from "@/features/agent-network/useOwnedLoginFlow";
import type { OwnedLoginAttempt } from "@/api/agentNetwork";

export interface OwnedPasswordCredentials {
  username: string;
  password: string;
  consentAccepted: boolean;
}

/** Native form only; the Rust login owner verifies and persists the session. */
export default function OwnedPasswordLoginDialog({
  serviceUrl,
  onPasswordStart,
  onBrowserLogin,
  ...actions
}: Omit<
  OwnedLoginActions,
  "onOwnedStart" | "onOwnedOpen" | "authorizationMode"
> & {
  serviceUrl: string;
  onPasswordStart: (
    credentials: OwnedPasswordCredentials,
  ) => Promise<OwnedLoginAttempt>;
  onBrowserLogin: () => void;
}) {
  const { t } = useTranslation("app");
  const { t: common } = useTranslation("common");
  const [username, setUsername] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [consent, setConsent] = useState(false);
  const usernameInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const flight = useRef(false);
  const { refs, context } = useFloating({ open: true });
  const login = useOwnedLoginFlow({
    ...actions,
    authorizationMode: "password",
    onOwnedStart: async () => {
      throw new Error("PASSWORD_INPUT_REQUIRED");
    },
    onOwnedOpen: async () => {
      throw new Error("NATIVE_LOGIN_NO_BROWSER");
    },
  });
  const clearSecret = () => {
    if (passwordInput.current) passwordInput.current.value = "";
    setHasPassword(false);
    setConsent(false);
  };
  const close = () => {
    if (login.busy || flight.current) return;
    clearSecret();
    void login.cancel();
  };
  useCloseLayer(() => {
    close();
    return true;
  }, 260);
  const pending =
    Boolean(login.attempt) &&
    (!login.stopped || login.canRetry) &&
    !login.expired;
  const disabled = login.busy || pending;
  const submit = async () => {
    if (flight.current || disabled || !username.trim() || !consent) return;
    let password = passwordInput.current?.value ?? "";
    if (!password) return;
    flight.current = true;
    clearSecret();
    try {
      await login.start(serviceUrl, undefined, () =>
        onPasswordStart({
          username: username.trim(),
          password,
          consentAccepted: true,
        }),
      );
    } finally {
      password = "";
      flight.current = false;
    }
  };
  const canSubmit =
    !disabled && Boolean(username.trim()) && hasPassword && consent;
  return (
    <OverlayBackdrop
      portal
      className="z-[260] px-4 py-4"
      onClose={login.busy ? undefined : close}
    >
      <FloatingFocusManager context={context} initialFocus={usernameInput}>
        <section
          ref={refs.setFloating}
          role="dialog"
          aria-modal="true"
          aria-labelledby="owned-password-title"
          className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-xl border border-[var(--line)] bg-[var(--paper-elevated)] p-5 shadow-xl"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !isImeComposingEvent(event)) {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2
              id="owned-password-title"
              className="flex items-center gap-2 text-lg font-semibold"
            >
              <UserIcon className="h-5 w-5 text-[var(--accent)]" />
              {t("ownedAccountEntry.loginTitle")}
            </h2>
            <button
              type="button"
              onClick={close}
              disabled={login.busy}
              aria-label={common("actions.close")}
              className="rounded-lg p-2 text-[var(--ink-muted)] hover:bg-[var(--hover-bg)] disabled:opacity-50"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-1 text-sm text-[var(--ink-secondary)]">
            {t("ownedNativeLogin.hint")}
          </p>
          <p className="mb-5 break-all text-xs text-[var(--ink-muted)]">
            {t("ownedNativeLogin.service", { service: serviceUrl })}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label
              htmlFor="owned-login-username"
              className="mb-2 block text-sm font-medium"
            >
              {t("ownedNativeLogin.username")}
            </label>
            <input
              ref={usernameInput}
              id="owned-login-username"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={256}
              required
              value={username}
              disabled={disabled}
              onChange={(event) => setUsername(event.target.value)}
              className="mb-4 w-full rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-60"
            />
            <label
              htmlFor="owned-login-password"
              className="mb-2 block text-sm font-medium"
            >
              {t("ownedNativeLogin.password")}
            </label>
            <input
              ref={passwordInput}
              id="owned-login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={1024}
              required
              disabled={disabled}
              onChange={(event) =>
                setHasPassword(event.target.value.length > 0)
              }
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-60"
            />
            <p className="mt-2 text-xs text-[var(--ink-muted)]">
              {t("ownedNativeLogin.passwordHint")}
            </p>
            <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm leading-relaxed">
              <input
                type="checkbox"
                checked={consent}
                disabled={disabled}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
              />
              <span>{t("ownedNativeLogin.consent")}</span>
            </label>
            {login.error && (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-[var(--error-bg)] p-3 text-sm text-[var(--error)]"
              >
                {login.error}
              </p>
            )}
            {login.notice && (
              <p
                role="status"
                aria-live="polite"
                className="mt-4 text-sm text-[var(--ink-secondary)]"
              >
                {login.notice}
              </p>
            )}
            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--button-primary-bg)] px-4 py-2 text-sm font-medium text-[var(--button-primary-text)] hover:bg-[var(--button-primary-bg-hover)] disabled:opacity-50"
            >
              {(login.busy || pending) && (
                <LoaderIcon className="h-4 w-4 animate-spin" />
              )}
              {login.busy || pending
                ? t("ownedNativeLogin.checking")
                : t("ownedNativeLogin.submit")}
            </button>
          </form>
          {login.canRetry && (
            <button
              type="button"
              onClick={() => void login.retry()}
              disabled={login.checking}
              className="mt-3 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
            >
              {t("agentNetwork.ownedLogin.retrySave")}
            </button>
          )}
          {login.attempt && (
            <button
              type="button"
              onClick={close}
              disabled={login.busy}
              className="mt-3 w-full rounded-lg px-3 py-2 text-sm text-[var(--ink-muted)] hover:bg-[var(--hover-bg)]"
            >
              {t("ownedNativeLogin.cancel")}
            </button>
          )}
          {!login.attempt && (
            <button
              type="button"
              disabled={login.busy}
              onClick={() => {
                clearSecret();
                onBrowserLogin();
              }}
              className="mt-4 w-full rounded-lg px-2 py-2 text-sm text-[var(--ink-muted)] underline underline-offset-4 hover:text-[var(--ink)] disabled:opacity-50"
            >
              {t("ownedNativeLogin.browserFallback")}
            </button>
          )}
        </section>
      </FloatingFocusManager>
    </OverlayBackdrop>
  );
}
