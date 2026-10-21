import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { JoinNetworkDialog } from "./JoinNetworkDialog";
const attempt = {
  attemptId: "attempt-ui",
  authorizationUrl: "https://cloud.test/authorize?state=synthetic-only",
  expiresAt: 1900000000,
};
it("automatically opens the browser and closes after focus detects a completed login", async () => {
  const poll = vi.fn().mockResolvedValue("authenticated");
  const open = vi.fn().mockResolvedValue(undefined);
  const cancel = vi.fn();
  function Harness() {
    const [shown, setShown] = useState(true);
    return shown ? (
      <JoinNetworkDialog
        accountOnly
        initialUrl="https://cloud.test"
        onConfirm={vi.fn()}
        onOwnedStart={async () => attempt}
        onOwnedOpen={open}
        onOwnedPoll={poll}
        onOwnedCancel={cancel}
        onCancel={() => setShown(false)}
      />
    ) : (
      <p>登录完成</p>
    );
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "在浏览器中继续" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "打开浏览器" })).toBeEnabled(),
  );
  expect(open).toHaveBeenCalledExactlyOnceWith("attempt-ui");
  expect(screen.queryByLabelText("服务 URL")).not.toBeInTheDocument();
  expect(screen.queryByText("高级连接选项")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "检查登录状态" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(attempt.authorizationUrl)).not.toBeInTheDocument();
  fireEvent(window, new Event("focus"));
  expect(await screen.findByText("登录完成")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(cancel).not.toHaveBeenCalled();
});
it("keeps the full authorization link in collapsed advanced information and manual checking available", async () => {
  const poll = vi.fn().mockResolvedValue("pending");
  const open = vi.fn().mockResolvedValue(undefined);
  render(
    <JoinNetworkDialog
      initialUrl="https://cloud.test"
      onConfirm={vi.fn()}
      onOwnedStart={async () => attempt}
      onOwnedOpen={open}
      onOwnedPoll={poll}
      onOwnedCancel={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "在浏览器中继续" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "打开浏览器" })).toBeEnabled(),
  );
  expect(screen.getByText(attempt.authorizationUrl)).not.toBeVisible();
  fireEvent.click(screen.getByText("高级连接选项"));
  expect(screen.getByText(attempt.authorizationUrl)).toBeVisible();
  fireEvent.click(await manualLoginCheck());
  await waitFor(() =>
    expect(poll).toHaveBeenCalledExactlyOnceWith("attempt-ui"),
  );
});

async function manualLoginCheck() {
  const button = screen.getByRole("button", { name: "检查登录状态" });
  if (!button.closest("details")?.open)
    fireEvent.click(screen.getByText("高级连接选项"));
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

it("stops waiting after identity mismatch, keeps manual checking disabled and permits cancellation", async () => {
  const cancel = vi.fn().mockResolvedValue(undefined);
  render(
    <JoinNetworkDialog
      accountOnly
      initialUrl="https://cloud.test"
      onConfirm={vi.fn()}
      onOwnedStart={async () => attempt}
      onOwnedOpen={async () => {}}
      onOwnedPoll={async () => {
        throw { code: "OWNED_ACCOUNT_MISMATCH" };
      }}
      onOwnedCancel={cancel}
      onCancel={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "在浏览器中继续" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "打开浏览器" })).toBeEnabled(),
  );
  fireEvent(window, new Event("focus"));
  expect(await screen.findByText("登录未完成")).toBeVisible();
  expect(screen.queryByText("等待浏览器登录")).not.toBeInTheDocument();
  expect(screen.queryByText("正在等待浏览器返回…")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "浏览器授权的账号与当前网络绑定不一致",
  );
  expect(
    screen.queryByRole("button", { name: "检查登录状态" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "取消登录" }));
  await waitFor(() =>
    expect(cancel).toHaveBeenCalledExactlyOnceWith("attempt-ui"),
  );
});
