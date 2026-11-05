import { useState } from "react";
import { createRoot } from "react-dom/client";
import { i18n } from "@/i18n";
import { ThemeRuntimeProvider } from "@/theme/ThemeRuntime";
import OwnedPasswordLoginDialog from "@/features/account/OwnedPasswordLoginDialog";
import "../host-onboarding-validation/fixture.css";

// Explicit, credential-free UI fixture. No Tauri bridge or real auth service.
const params = new URLSearchParams(location.search);
await i18n.changeLanguage(params.get("lang") || "zh-CN");
const mode = params.get("case") || "success";
let polls = 0;
function Preview() {
  const [open, setOpen] = useState(true);
  const [result, setResult] = useState("");
  return (
    <ThemeRuntimeProvider
      selection={{
        themeId: "default-black",
        appearanceMode: params.get("theme") === "dark" ? "dark" : "light",
      }}
      persistBootstrapSnapshot={false}
    >
      <main className="min-h-screen bg-[var(--paper)] p-6 text-[var(--ink)]">
        <p>MB-NATIVE-LOGIN-20261105 · 合成界面验收，不连接真实账号</p>
        <p role="status">{result}</p>
        <button
          onClick={() => {
            polls = 0;
            setOpen(true);
            setResult("");
          }}
          className="mt-4 rounded-lg border border-[var(--line)] px-4 py-2"
        >
          重新打开登录
        </button>
        {open && (
          <OwnedPasswordLoginDialog
            serviceUrl="https://cloud.example.test"
            onPasswordStart={async ({
              username,
              password,
              consentAccepted,
            }) => {
              await new Promise((resolve) => setTimeout(resolve, 600));
              if (!consentAccepted)
                throw {
                  code: "OWNED_NATIVE_CONSENT_REQUIRED",
                  retryable: false,
                };
              if (mode === "unavailable")
                throw {
                  code: "OWNED_PASSWORD_LOGIN_UNAVAILABLE",
                  retryable: false,
                };
              if (
                username !== "synthetic@example.test" ||
                password !== "synthetic-password"
              )
                throw { code: "OWNED_CREDENTIALS_INVALID", retryable: false };
              return {
                attemptId: "synthetic-attempt",
                authorizationUrl: "",
                phase: "receiving_grant",
                expiresAt: Math.floor(Date.now() / 1000) + 300,
              };
            }}
            onOwnedPoll={async () => {
              polls += 1;
              await new Promise((resolve) => setTimeout(resolve, 350));
              if (mode === "save" && polls === 1)
                throw {
                  code: "NETWORK_CREDENTIAL_STORE_UNAVAILABLE",
                  retryable: false,
                  details: { canRetry: true, phase: "saving_session" },
                };
              if (mode === "pending")
                return { status: "pending", phase: "saving_session" };
              setResult(
                "隔离模拟：已确认登录并显示账号 synthetic-principal（无真实认证/持久化）",
              );
              return "authenticated";
            }}
            onOwnedCancel={async () => {
              setResult("已取消本次模拟登录");
            }}
            onOwnedRetry={async () => {}}
            onCancel={() => setOpen(false)}
            onBrowserLogin={() => {
              setResult("已主动选择浏览器备用入口（夹具不打开外网）");
              setOpen(false);
            }}
          />
        )}
      </main>
    </ThemeRuntimeProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
