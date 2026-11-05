import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import OwnedPasswordLoginDialog from "./OwnedPasswordLoginDialog";

const attempt = {
  attemptId: "native-1",
  authorizationUrl: "",
  phase: "receiving_grant" as const,
  expiresAt: 1_900_000_000,
};
function setup(overrides: Record<string, unknown> = {}) {
  const actions = {
    onPasswordStart: vi.fn().mockResolvedValue(attempt),
    onOwnedPoll: vi
      .fn()
      .mockResolvedValue({ status: "pending", phase: "saving_session" }),
    onOwnedCancel: vi.fn().mockResolvedValue(undefined),
    onOwnedRetry: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn(),
    onBrowserLogin: vi.fn(),
    ...overrides,
  };
  const view = render(
    <OwnedPasswordLoginDialog
      serviceUrl="https://cloud.example.test"
      {...actions}
    />,
  );
  return { ...view, actions };
}
function enter() {
  fireEvent.change(screen.getByLabelText("账号或邮箱"), {
    target: { value: "synthetic@example.test" },
  });
  fireEvent.change(screen.getByLabelText("密码"), {
    target: { value: "synthetic-password" },
  });
}
it("requires explicit consent, clears the password immediately and admits one request while pending", async () => {
  let resolve!: (value: typeof attempt) => void;
  const start = vi.fn().mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const { actions } = setup({ onPasswordStart: start });
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  enter();
  expect(screen.getByRole("button", { name: "同意并登录" })).toBeDisabled();
  expect(start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox"));
  const form = screen.getByLabelText("密码").closest("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(start).toHaveBeenCalledExactlyOnceWith({
    username: "synthetic@example.test",
    password: "synthetic-password",
    consentAccepted: true,
  });
  expect(screen.getByLabelText("密码")).toHaveValue("");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(
    screen.getByRole("button", { name: "正在验证并保存登录…" }),
  ).toBeDisabled();
  await act(async () => {
    resolve(attempt);
  });
  await waitFor(() =>
    expect(actions.onOwnedPoll).toHaveBeenCalledWith("native-1"),
  );
  expect(actions.onBrowserLogin).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "取消本次登录" }));
  await waitFor(() =>
    expect(actions.onOwnedCancel).toHaveBeenCalledExactlyOnceWith("native-1"),
  );
});
it("shows a fixed authentication error without reflecting raw provider messages or passwords", async () => {
  const { actions } = setup({
    onPasswordStart: vi
      .fn()
      .mockRejectedValue({
        code: "OWNED_CREDENTIALS_INVALID",
        message: "sensitive-provider-description",
        retryable: false,
      }),
  });
  enter();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "同意并登录" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "账号或密码不正确，请重新输入。",
  );
  expect(document.body).not.toHaveTextContent("sensitive-provider-description");
  expect(screen.getByLabelText("密码")).toHaveValue("");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(actions.onBrowserLogin).not.toHaveBeenCalled();
});
it("only invokes browser fallback after an explicit click and closes only after confirmed native authentication", async () => {
  const { actions, unmount } = setup({
    onOwnedPoll: vi.fn().mockResolvedValue("authenticated"),
  });
  expect(actions.onBrowserLogin).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "使用浏览器登录（备用）" }),
  );
  expect(actions.onBrowserLogin).toHaveBeenCalledOnce();
  unmount();
  const native = setup({
    onOwnedPoll: vi.fn().mockResolvedValue("authenticated"),
  });
  enter();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "同意并登录" }));
  await waitFor(() => expect(native.actions.onCancel).toHaveBeenCalledOnce());
  expect(native.actions.onOwnedCancel).not.toHaveBeenCalled();
  expect(native.actions.onBrowserLogin).not.toHaveBeenCalled();
});
it("retries session saving without sending the password again", async () => {
  const poll = vi
    .fn()
    .mockRejectedValueOnce({
      code: "NETWORK_CREDENTIAL_STORE_UNAVAILABLE",
      retryable: false,
      details: { canRetry: true, phase: "saving_session" },
    })
    .mockResolvedValue("authenticated");
  const { actions } = setup({ onOwnedPoll: poll });
  enter();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "同意并登录" }));
  const retry = await screen.findByRole("button", { name: "重试保存登录状态" });
  expect(screen.getByLabelText("密码")).toBeDisabled();
  fireEvent.click(retry);
  await waitFor(() => expect(actions.onCancel).toHaveBeenCalledOnce());
  expect(actions.onOwnedRetry).toHaveBeenCalledExactlyOnceWith("native-1");
  expect(actions.onPasswordStart).toHaveBeenCalledOnce();
});
