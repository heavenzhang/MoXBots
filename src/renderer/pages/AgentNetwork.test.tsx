import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NetworkConnection, NetworkDevice, NetworkSnapshot } from "@/api/agentNetwork";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  logout: vi.fn(),
  request: vi.fn(),
  devices: vi.fn(),
  agents: vi.fn(),
  login: vi.fn(),
  openExternal: vi.fn(),
  selected: "official",
  localDeviceId: undefined as string | undefined,
  ownedAccount: undefined as NetworkConnection["ownedAccount"],
  snapshot: {
    state: "ready",
    principalId: "account",
    networkId: "11111111-1111-4111-8111-111111111111",
    revision: 1,
    authGeneration: 1,
    error: null,
  } as NetworkSnapshot,
}));
vi.mock("@/api/spaceCloud", async (original) => ({
  ...(await original<typeof import("@/api/spaceCloud")>()),
  spaceGetSession: mocks.session,
  spaceLogout: mocks.logout,
}));
vi.mock("@/api/agentNetwork", async (original) => ({
  ...(await original<typeof import("@/api/agentNetwork")>()),
  networkRequest: mocks.request,
  allNetworkDevices: mocks.devices,
  allDeviceAgents: mocks.agents,
}));
vi.mock("@/hooks/useMyAgentsLogin", () => ({
  useMyAgentsLogin: () => ({
    authBusy: false,
    authFlow: null,
    startLogin: mocks.login,
  }),
}));
vi.mock("@/features/agent-network/store", async (original) => ({
  ...(await original<typeof import("@/features/agent-network/store")>()),
  useAgentNetworkSnapshot: () => mocks.snapshot,
  useAgentNetworkRegistry: () => ({
    selected: mocks.selected,
    selfhostEnabled: true,
    connections: [
      {
        id: mocks.selected,
        name: mocks.selected === "official" ? "MyAgents" : "Team A",
        official: mocks.selected === "official",
        url: null,
        removing: false,
        snapshot: mocks.snapshot,
        ownedAccount: mocks.ownedAccount,
        localDeviceId: mocks.localDeviceId,
      },
    ],
  }),
  currentNetworkGeneration: () => mocks.snapshot.authGeneration,
}));
vi.mock("@/identity/deviceIdentity", () => ({
  getDeviceId: () => "22222222-2222-4222-8222-222222222222",
  preloadDeviceId: async () => undefined,
}));
vi.mock("@/utils/openExternal", () => ({
  openExternal: mocks.openExternal,
}));
import AgentNetwork from "./AgentNetwork";
const device: NetworkDevice = {
  deviceId: "22222222-2222-4222-8222-222222222222",
  principalId: "account",
  networkId: "11111111-1111-4111-8111-111111111111",
  name: "Fixture Mac",
  platform: "darwin-aarch64",
  osVersion: "macOS 15",
  appVersion: "0.4.22",
  lastNetworkSeenAt: null,
  lastAccountSeenAt: "2026-10-01T00:00:00Z",
  rosterRevision: "1",
  catalogEpoch: null,
  catalogSeq: 0,
  catalogSyncedAt: null,
  joined: false,
  membershipRevision: 0,
  connectionState: "ready",
  onlineAgentCount: null,
};
const membership = {
  networkId: device.networkId,
  principalId: device.principalId,
  deviceId: device.deviceId,
  joined: true,
  membershipRevision: 1,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.selected = "official";
  mocks.localDeviceId = undefined;
  mocks.ownedAccount = undefined;
  mocks.snapshot = {
    state: "ready",
    principalId: "account",
    networkId: device.networkId,
    revision: 1,
    authGeneration: 1,
    error: null,
  };
  mocks.session.mockResolvedValue({
    state: "authenticated",
    session: { user: { id: "account" } },
  });
  mocks.devices.mockResolvedValue({ items: [device], complete: true });
  mocks.agents.mockResolvedValue({ items: [], complete: true });
  mocks.request.mockImplementation(async (request) =>
    request.kind === "network"
      ? {
          serviceId: "33333333-3333-4333-8333-333333333333",
          networkId: device.networkId,
          principalId: "account",
          environment: "development",
          name: "我的 Agent 网络",
          revision: 1,
          protocol: 1,
          capabilities: [],
        }
      : membership,
  );
});
describe("Agent network account and device management", () => {
  it("marks the connection-scoped owned identity as local instead of the installation ID", async () => {
    mocks.selected = "owned";
    mocks.ownedAccount = { state: "authenticated", principalId: "account", expiresAt: null };
    mocks.localDeviceId = "44444444-4444-4444-8444-444444444444";
    const scoped = { ...device, deviceId: mocks.localDeviceId, name: "Account-scoped Mac", joined: true };
    mocks.devices.mockResolvedValue({ items: [device, scoped], complete: true });
    render(<AgentNetwork />);
    const scopedTitle = await screen.findByRole("heading", { name: "Account-scoped Mac" });
    expect(within(scopedTitle.closest("article")!).getByText("本机")).toBeInTheDocument();
    expect(within(screen.getByRole("heading", { name: device.name }).closest("article")!).queryByText("本机")).not.toBeInTheDocument();
  });

  it("does not guess the installation ID for an owned connection missing its identity projection", async () => {
    mocks.selected = "owned";
    mocks.ownedAccount = { state: "authenticated", principalId: "account", expiresAt: null };
    mocks.devices.mockResolvedValue({ items: [{ ...device, joined: true }], complete: true });
    render(<AgentNetwork />);
    await screen.findByRole("heading", { name: device.name });
    expect(screen.queryByText("本机")).not.toBeInTheDocument();
  });
  it("opens Add Host from the network page and closes without sending mutations", async () => {
    render(<AgentNetwork />);
    fireEvent.click(await screen.findByRole("button", { name: "+ 添加 Host" }));
    const dialog = screen.getByRole("dialog", { name: "添加 Host" });
    expect(within(dialog).getByRole("radio", { name: /桌面电脑/ })).toBeChecked();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "添加 Host" })).not.toBeInTheDocument();
    expect(mocks.request.mock.calls.every(([request]) => request.kind === "network")).toBe(true);
  });

  it.each([false, true])(
    "renames an offline remote device from its card, joined=%s",
    async (joined) => {
      const remote = {
        ...device,
        deviceId: "44444444-4444-4444-8444-444444444444",
        name: "Fixture PC",
        joined,
        connectionState: "offline" as const,
      };
      mocks.devices.mockResolvedValue({
        items: [device, remote],
        complete: true,
      });
      const baseRequest = mocks.request.getMockImplementation()!;
      mocks.request.mockImplementation(async (request) => {
        if (request.kind !== "renameDevice") return baseRequest(request);
        mocks.devices.mockResolvedValue({
          items: [device, { ...remote, name: request.name }],
          complete: true,
        });
        return {
          networkId: remote.networkId,
          principalId: remote.principalId,
          deviceId: remote.deviceId,
          name: request.name,
        };
      });
      render(<AgentNetwork />);
      const open = await screen.findByRole("button", {
        name: "查看 Fixture PC 的设备详情",
      });
      fireEvent.click(within(open.closest("article")!).getByTitle("更多操作"));
      fireEvent.click(
        await screen.findByRole("button", { name: "设备重命名" }),
      );
      const input = screen.getByRole("textbox", { name: "设备名称" });
      expect(input).toHaveValue("Fixture PC");
      fireEvent.change(input, { target: { value: "  家里 Windows  " } });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await screen.findByRole("button", {
        name: "查看 家里 Windows 的设备详情",
      });
      expect(mocks.request).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "renameDevice",
          deviceId: remote.deviceId,
          expectedName: "Fixture PC",
          name: "家里 Windows",
        }),
        "official",
      );
      expect(
        screen.queryByRole("dialog", { name: "设备重命名" }),
      ).not.toBeInTheDocument();
    },
  );
  it("renames from device details and leaves details open with the updated title", async () => {
    mocks.devices.mockResolvedValue({
      items: [{ ...device, joined: true }],
      complete: true,
    });
    const baseRequest = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation(async (request) => {
      if (request.kind !== "renameDevice") return baseRequest(request);
      mocks.devices.mockResolvedValue({
        items: [{ ...device, joined: true, name: request.name }],
        complete: true,
      });
      return {
        networkId: device.networkId,
        principalId: device.principalId,
        deviceId: device.deviceId,
        name: request.name,
      };
    });
    render(<AgentNetwork />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "查看 Fixture Mac 的设备详情",
      }),
    );
    fireEvent.click(within(screen.getByRole("dialog")).getByTitle("更多操作"));
    fireEvent.click(await screen.findByRole("button", { name: "设备重命名" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "办公室 Mac" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await screen.findByRole("dialog", { name: "办公室 Mac" });
  });
  it("keeps the draft on CAS conflict and uses the returned current name for an explicit retry", async () => {
    const baseRequest = mocks.request.getMockImplementation()!;
    let conflict = true;
    mocks.request.mockImplementation(async (request) => {
      if (request.kind !== "renameDevice") return baseRequest(request);
      if (conflict) {
        conflict = false;
        throw {
          code: "REVISION_CONFLICT",
          details: {
            networkId: device.networkId,
            principalId: device.principalId,
            deviceId: device.deviceId,
            name: "另一台设备修改的名字",
          },
        };
      }
      return {
        networkId: device.networkId,
        principalId: device.principalId,
        deviceId: device.deviceId,
        name: request.name,
      };
    });
    render(<AgentNetwork />);
    const open = await screen.findByRole("button", {
      name: "查看 Fixture Mac 的设备详情",
    });
    fireEvent.click(within(open.closest("article")!).getByTitle("更多操作"));
    fireEvent.click(await screen.findByRole("button", { name: "设备重命名" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "我的设备名称" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "设置已在其他客户端改变",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "当前名称：另一台设备修改的名字",
    );
    expect(input).toHaveValue("我的设备名称");
    expect(
      mocks.request.mock.calls.filter(
        ([request]) => request.kind === "renameDevice",
      ),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "renameDevice",
          expectedName: "另一台设备修改的名字",
          name: "我的设备名称",
        }),
        "official",
      ),
    );
  });
  it("discards a pending rename when the account changes", async () => {
    let finish!: (value: unknown) => void;
    const baseRequest = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation(async (request) =>
      request.kind === "renameDevice"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : baseRequest(request),
    );
    const view = render(<AgentNetwork />);
    fireEvent.click(await screen.findByTitle("更多操作"));
    fireEvent.click(await screen.findByRole("button", { name: "设备重命名" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "旧账号的昵称" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    mocks.snapshot = {
      ...mocks.snapshot,
      state: "signedOut",
      authGeneration: 2,
      revision: 2,
      principalId: null,
      networkId: null,
    };
    mocks.session.mockResolvedValue(null);
    view.rerender(<AgentNetwork />);
    await screen.findByRole("button", { name: "继续使用 Google" });
    await act(async () => {
      finish({
        networkId: device.networkId,
        principalId: device.principalId,
        deviceId: device.deviceId,
        name: "旧账号的昵称",
      });
    });
    expect(screen.queryByText("旧账号的昵称")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("opens the published blog from the unjoined-device banner", async () => {
    render(<AgentNetwork />);
    const banner = await screen.findByRole("button", {
      name: "了解 Agent 组网（在浏览器中打开）",
    });
    expect(screen.getByText("让设备加入网络")).toBeInTheDocument();
    fireEvent.click(banner);
    expect(mocks.openExternal).toHaveBeenCalledWith(
      "https://myagents.io/blog/private-agent-network",
    );
  });
  it("hides both onboarding elements after joining, even with no open Agents", async () => {
    render(<AgentNetwork />);
    expect(
      await screen.findByRole("button", { name: /了解 Agent 组网/ }),
    ).toBeInTheDocument();
    mocks.devices.mockResolvedValue({
      items: [{ ...device, joined: true, catalogSyncedAt: 1 }],
      complete: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "加入网络" }));
    await screen.findByText("网络中的设备");
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "关闭" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /了解 Agent 组网/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("让设备加入网络")).not.toBeInTheDocument();
    expect(screen.queryByText("开放 Agent 工作区")).not.toBeInTheDocument();
  });
  it("hides onboarding when a partial roster has not established local membership", async () => {
    mocks.devices.mockResolvedValue({
      items: [
        {
          ...device,
          deviceId: "44444444-4444-4444-8444-444444444444",
          name: "Fixture PC",
        },
      ],
      complete: false,
    });
    render(<AgentNetwork />);
    await screen.findByRole("button", { name: "查看 Fixture PC 的设备详情" });
    expect(
      screen.queryByRole("button", { name: /了解 Agent 组网/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("让设备加入网络")).not.toBeInTheDocument();
  });
  it("reports a connection failure with automatic recovery and no save claim", async () => {
    mocks.snapshot = {
      ...mocks.snapshot,
      state: "disconnected",
      error: { code: "NETWORK_TRANSPORT_FAILED", retryable: false },
    };
    render(<AgentNetwork />);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "网络连接失败，正在自动重连",
    );
    expect(screen.queryByText(/尚未确认保存结果/)).not.toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /了解 Agent 组网/ }),
    ).not.toBeInTheDocument();
  });
  it("distinguishes a connection timeout from sign-in and peer offline status", async () => {
    mocks.selected = "owned";
    mocks.ownedAccount = { state: "authenticated", principalId: "account", expiresAt: null };
    mocks.snapshot = { ...mocks.snapshot, state: "disconnected", error: { code: "NETWORK_CONNECTION_TIMEOUT", retryable: true } };
    render(<AgentNetwork />);
    expect(await screen.findByRole("status")).toHaveTextContent("连接 Agent 网络超时，正在自动重试。设备状态暂时无法确认。");
    fireEvent.click(screen.getByRole("button", { name: "选择网络" }));
    expect(await screen.findByRole("menuitemradio")).toHaveTextContent("连接超时");
    expect(screen.queryByText("离线")).not.toBeInTheDocument();
    expect(screen.queryByText("需要登录")).not.toBeInTheDocument();
    expect(mocks.devices).not.toHaveBeenCalled();
  });

  it("keeps the Owned Host management hint consistent with unknown device presence during a network outage", async () => {
    mocks.selected = "owned";
    mocks.ownedAccount = { state: "authenticated", principalId: "account", expiresAt: null };
    mocks.devices.mockResolvedValue({ items: [{ ...device, joined: true, connectionState: "offline" }], complete: true });
    const view = render(<AgentNetwork />);
    await screen.findByRole("heading", { name: device.name });
    mocks.snapshot = { ...mocks.snapshot, state: "disconnected", revision: 2, error: { code: "NETWORK_CONNECTION_TIMEOUT", retryable: true } };
    view.rerender(<AgentNetwork />);
    fireEvent.click(screen.getByRole("button", { name: "查看 Fixture Mac 的设备详情" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("macOS · 设备状态未知（网络未连接）")).toBeInTheDocument();
    expect(within(dialog).getByText("设备状态未知（网络未连接）")).toBeInTheDocument();
    expect(within(dialog).queryByText("设备离线，恢复在线后可管理。")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "刷新" })).toBeDisabled();
  });

  it.each(["offline", "ready", "syncing"] as const)(
    "marks cached %s presence unknown in cards and details during an outage, then restores confirmed status",
    async (connectionState) => {
      mocks.devices.mockResolvedValue({ items: [{ ...device, joined: true, connectionState }], complete: true });
      const view = render(<AgentNetwork />);
      const heading = await screen.findByRole("heading", { name: device.name });
      const card = heading.closest("article")!;
      const expected = connectionState === "offline" ? "离线" : connectionState === "ready" ? "在线" : "同步中";
      expect(within(card).getByText(`macOS · ${expected}`)).toBeInTheDocument();
      mocks.snapshot = { ...mocks.snapshot, state: "disconnected", revision: 2, error: { code: "NETWORK_CONNECTION_TIMEOUT", retryable: true } };
      view.rerender(<AgentNetwork />);
      expect(within(card).getByText("macOS · 设备状态未知（网络未连接）")).toBeInTheDocument();
      expect(within(card).queryByText(`macOS · ${expected}`)).not.toBeInTheDocument();
      fireEvent.click(within(card).getByRole("button", { name: "查看 Fixture Mac 的设备详情" }));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("macOS · 设备状态未知（网络未连接）")).toBeInTheDocument();
      mocks.snapshot = { ...mocks.snapshot, state: "ready", revision: 3, error: null };
      view.rerender(<AgentNetwork />);
      await waitFor(() => expect(within(dialog).getByText(`macOS · ${expected}`)).toBeInTheDocument());
      expect(within(card).getByText(`macOS · ${expected}`)).toBeInTheDocument();
    },
  );

  it.each([
    [
      "NETWORK_CREDENTIAL_STORE_AUTHORIZATION_REQUIRED",
      "系统凭据需要授权。后台恢复已停止，不会自动重复请求密码。",
    ],
    [
      "NETWORK_CREDENTIAL_STORE_UNAVAILABLE",
      "系统凭据库暂不可用。后台恢复已停止，请检查系统凭据库状态。",
    ],
    [
      "NETWORK_CREDENTIAL_STORE_INVALID",
      "本机保存的会话无法验证。为保护身份，连接已停止，记录未被自动覆盖。",
    ],
    [
      "OWNED_SESSION_RECORD_MISSING",
      "未找到此连接对应的本机登录会话。连接已停止，需要显式登录后才能恢复。",
    ],
    ...["OWNED_SESSION_INVALID", "SPACE_REAUTH_REQUIRED", "ACCOUNT_BINDING_CHANGED", "OWNED_ACCOUNT_REVOKED"].map((code) => [code, "此网络的登录已失效，请重新登录后恢复连接。"]),
    ...["KEY_GENERATION_CONFLICT", "NETWORK_CREDENTIAL_GENERATION_CONFLICT"].map((code) => [code, "此设备的网络身份发生冲突，无法自动恢复。请核对登录账号与设备身份；现有连接和凭据已保留。"]),
  ])(
    "shows %s only as a stopped Owned-connection status",
    async (code, message) => {
      mocks.selected = "owned-restore";
      mocks.snapshot = {
        ...mocks.snapshot,
        connectionId: "owned-restore",
        state: "disconnected",
        error: { code, retryable: false },
      };
      render(<AgentNetwork />);
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.queryByText(/正在自动重连/)).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );
  it("uses registry sign-in authority when the snapshot still reports a transport failure, and clears it after recovery", async () => {
    mocks.selected = "owned-restore";
    mocks.snapshot = { ...mocks.snapshot, connectionId: "owned-restore", state: "disconnected", error: { code: "NETWORK_TRANSPORT_FAILED", retryable: true } };
    mocks.ownedAccount = { state: "signInRequired", principalId: "account", expiresAt: 100 };
    const view = render(<AgentNetwork />);
    expect(await screen.findByRole("status")).toHaveTextContent("此网络的登录已失效，请重新登录后恢复连接。");
    expect(screen.queryByText(/正在自动重连/)).not.toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.logout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "选择网络" }));
    expect(screen.getByRole("menuitemradio")).toHaveTextContent("需要登录");
    expect(screen.queryByText("离线")).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    mocks.ownedAccount = { ...mocks.ownedAccount, state: "authenticated" };
    mocks.snapshot = { ...mocks.snapshot, state: "ready", error: null, revision: 2 };
    view.rerender(<AgentNetwork />);
    await screen.findByRole("button", { name: "查看 Fixture Mac 的设备详情" });
    expect(screen.queryByText(/此网络的登录已失效/)).not.toBeInTheDocument();
  });
  it("does not project Owned credential-store errors onto the official connection", async () => {
    mocks.snapshot = {
      ...mocks.snapshot,
      connectionId: "official",
      state: "disconnected",
      error: {
        code: "NETWORK_CREDENTIAL_STORE_AUTHORIZATION_REQUIRED",
        retryable: false,
      },
    };
    render(<AgentNetwork />);
    expect(
      await screen.findByText(/网络连接失败，正在自动重连/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/系统凭据需要授权/)).not.toBeInTheDocument();
  });
  it("offers read retry without claiming an uncertain save", async () => {
    mocks.devices.mockRejectedValueOnce({ code: "NETWORK_TRANSPORT_FAILED" });
    render(<AgentNetwork />);
    expect(await screen.findByRole("alert")).not.toHaveTextContent("保存结果");
    expect(
      screen.queryByRole("button", { name: /了解 Agent 组网/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(
      await screen.findByRole("button", {
        name: "查看 Fixture Mac 的设备详情",
      }),
    ).toBeInTheDocument();
  });
  it("keeps a real membership write uncertain when its transport result is lost", async () => {
    render(<AgentNetwork />);
    await screen.findByRole("button", { name: "加入网络" });
    mocks.request.mockRejectedValueOnce({ code: "NETWORK_TRANSPORT_FAILED" });
    fireEvent.click(screen.getByRole("button", { name: "加入网络" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "尚未确认保存结果",
    );
  });
  it("reports a details read failure without a save claim", async () => {
    mocks.agents.mockRejectedValueOnce({ code: "NETWORK_REQUEST_UNCONFIRMED" });
    render(<AgentNetwork />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "查看 Fixture Mac 的设备详情",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("alert")).not.toHaveTextContent(
      "保存结果",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "重试" }));
    await waitFor(() => expect(mocks.agents).toHaveBeenCalledTimes(2));
  });
  it("uses the shared account login screen without querying network metadata while signed out", async () => {
    mocks.snapshot = { ...mocks.snapshot, state: "signedOut" };
    mocks.session.mockResolvedValue(null);
    render(<AgentNetwork />);
    const login = await screen.findByRole("button", {
      name: "继续使用 Google",
    });
    expect(login).toHaveClass("h-10");
    fireEvent.click(login);
    expect(mocks.login).toHaveBeenCalledOnce();
    expect(mocks.devices).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("groups an unjoined device apart and keeps membership separate from the whole-card details action", async () => {
    render(<AgentNetwork />);
    const details = await screen.findByRole("button", {
      name: "查看 Fixture Mac 的设备详情",
    });
    expect(screen.getByText("同账号下未加入的设备")).toBeInTheDocument();
    expect(screen.queryByText("网络中的设备")).not.toBeInTheDocument();
    expect(screen.getByText("macOS · 未加入网络")).toBeInTheDocument();
    fireEvent.click(details);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("darwin-aarch64")).toBeInTheDocument();
    expect(mocks.request).toHaveBeenCalledTimes(1); // Read network only; opening details cannot join.
    fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }));
    fireEvent.click(screen.getByRole("button", { name: "加入网络" }));
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "membership",
          joined: true,
          expectedMembershipRevision: 0,
        }),
        "official",
      ),
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
  it("opens the explanation by click and dismisses it by Escape or outside click", async () => {
    render(<AgentNetwork />);
    const button = await screen.findByRole("button", { name: "网络说明" });
    const hint =
      "设备之间的 Agent 通信内容都在设备端加密，MyAgents 服务器只转发密文。";
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(await screen.findByText(hint)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    fireEvent.click(button);
    await screen.findByText(hint);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    expect(screen.queryByText("我的设备")).not.toBeInTheDocument();
  });
  it("shows actual network last-seen and joins an unjoined device inside details", async () => {
    const seen = Date.UTC(2026, 8, 29, 10);
    mocks.devices.mockResolvedValue({
      items: [
        { ...device, lastNetworkSeenAt: seen, connectionState: "offline" },
      ],
      complete: true,
    });
    render(<AgentNetwork />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "查看 Fixture Mac 的设备详情",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("macOS · 未加入网络")).toBeInTheDocument();
    expect(
      within(dialog).getByText(new Date(seen).toLocaleString()),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "加入网络" }));
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "membership", joined: true }),
        "official",
      ),
    );
  });
  it("confirms leave and fences a late result when the account changes", async () => {
    mocks.devices.mockResolvedValue({
      items: [
        { ...device, joined: true, onlineAgentCount: 2, catalogSyncedAt: 1 },
      ],
      complete: true,
    });
    let finish!: (value: unknown) => void;
    mocks.request.mockImplementation(async (request) =>
      request.kind === "network"
        ? {
            serviceId: "33333333-3333-4333-8333-333333333333",
            networkId: device.networkId,
            principalId: "account",
            environment: "development",
            name: "我的 Agent 网络",
            revision: 1,
            protocol: 1,
            capabilities: [],
          }
        : new Promise((resolve) => {
            finish = resolve;
          }),
    );
    const view = render(<AgentNetwork />);
    fireEvent.click(await screen.findByTitle("更多操作"));
    fireEvent.click(await screen.findByRole("button", { name: "退出网络" }));
    const confirmation = (
      await screen.findByText("退出网络？")
    ).closest<HTMLElement>(".glass-panel")!;
    expect(confirmation).toHaveTextContent("重新加入后，需要重新开启");
    expect(
      mocks.request.mock.calls.filter(
        ([request]) => request.kind === "membership",
      ),
    ).toHaveLength(0);
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "退出网络" }),
    );
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    mocks.snapshot = {
      ...mocks.snapshot,
      state: "signedOut",
      authGeneration: 2,
      revision: 2,
      principalId: null,
      networkId: null,
    };
    mocks.session.mockResolvedValue(null);
    view.rerender(<AgentNetwork />);
    await screen.findByRole("button", { name: "继续使用 Google" });
    await act(async () => {
      finish({ ...membership, joined: false });
    });
    expect(screen.queryByText("Fixture Mac")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("shows each joined device's open Agents and guides first use from facts already read", async () => {
    const remote = {
      ...device,
      deviceId: "44444444-4444-4444-8444-444444444444",
      name: "Fixture PC",
      platform: "windows-x86_64",
      joined: true,
      catalogSyncedAt: 1,
    };
    const agent = (name: string, enabled: boolean, index: number) => ({
      principalId: "account",
      networkId: device.networkId,
      deviceId: remote.deviceId,
      mountId: `55555555-5555-4555-8555-55555555555${index}`,
      localAgentId: `agent-${index}`,
      localWorkspaceId: `workspace-${index}`,
      name,
      path: `C:\\Users\\fixture\\${name}`,
      lifecycle: "active" as const,
      catalogRevision: 1,
      enabled,
      enableRevision: 1,
      description: null,
      descriptionRevision: 1,
      icon: index === 1 ? "not-a-glyph" : null,
    });
    mocks.devices.mockResolvedValue({
      items: [device, remote],
      complete: true,
    });
    mocks.agents.mockImplementation(async (deviceId: string) =>
      deviceId === remote.deviceId
        ? {
            items: [agent("Builder", true, 1), agent("Docs", false, 2)],
            complete: true,
          }
        : { items: [], complete: true },
    );
    render(<AgentNetwork />);
    const card = (
      await screen.findByRole("button", { name: "查看 Fixture PC 的设备详情" })
    ).closest("article")!;
    expect(await within(card).findByText("Builder")).toBeInTheDocument();
    expect(within(card).queryByText("Docs")).not.toBeInTheDocument();
    expect(within(card).getByText("已开放 1 / 2 个 Agent")).toBeInTheDocument();
    // An unknown remote icon falls back to the neutral glyph, never raw text.
    expect(within(card).queryByText("not-a-glyph")).not.toBeInTheDocument();
    // This device has not joined, so the guide points at step one.
    expect(
      screen.getByRole("button", { name: /了解 Agent 组网/ }),
    ).toBeInTheDocument();
    const guide = screen.getByRole("list");
    expect(
      within(guide).getByText("让设备加入网络").closest("li"),
    ).toHaveAttribute("aria-current", "step");
    // Leaving is reachable from the details header and still asks first.
    fireEvent.click(
      within(card).getByRole("button", { name: "查看 Fixture PC 的设备详情" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("~\\Builder")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByTitle("更多操作"));
    fireEvent.click(await screen.findByRole("button", { name: "退出网络" }));
    expect(await screen.findByText("退出网络？")).toBeInTheDocument();
    expect(
      mocks.request.mock.calls.filter(
        ([request]) => request.kind === "membership",
      ),
    ).toHaveLength(0);
  });
  it("hides the guide once this device is in and an Agent is open", async () => {
    mocks.devices.mockResolvedValue({
      items: [{ ...device, joined: true, catalogSyncedAt: 1 }],
      complete: true,
    });
    mocks.agents.mockResolvedValue({
      items: [
        {
          principalId: "account",
          networkId: device.networkId,
          deviceId: device.deviceId,
          mountId: "66666666-6666-4666-8666-666666666666",
          localAgentId: "agent",
          localWorkspaceId: "workspace",
          name: "Mino",
          path: "/Users/fixture/mino",
          lifecycle: "active",
          catalogRevision: 1,
          enabled: true,
          enableRevision: 1,
          description: "Daily helper",
          descriptionRevision: 1,
        },
      ],
      complete: true,
    });
    render(<AgentNetwork />);
    expect(await screen.findByText("Mino")).toBeInTheDocument();
    expect(screen.getByText("本机")).toBeInTheDocument();
    expect(screen.queryByText("让设备加入网络")).not.toBeInTheDocument();
    expect(screen.queryByText("开放 Agent 工作区")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /了解 Agent 组网/ }),
    ).not.toBeInTheDocument();
  });
});

it("reads the selected self-hosted network without an official account or changing connection scope", async () => {
  mocks.selected = "self-a";
  mocks.session.mockRejectedValue(new Error("official signed out"));
  render(<AgentNetwork />);
  await screen.findByRole("button", { name: "查看 Fixture Mac 的设备详情" });
  expect(mocks.session).not.toHaveBeenCalled();
  expect(mocks.devices).toHaveBeenCalledWith("self-a");
  expect(mocks.request).toHaveBeenCalledWith({ kind: "network" }, "self-a");
  expect(screen.getByRole("button", { name: "选择网络" })).toHaveTextContent(
    "Team A",
  );
});

it("pending removal explains stopped connection rather than automatic reconnect", async () => {
  mocks.selected = "selfhost";
  mocks.snapshot = {
    ...mocks.snapshot,
    state: "disconnected",
    error: { code: "NETWORK_REMOVAL_UNCONFIRMED", retryable: false },
  };
  render(<AgentNetwork />);
  expect(await screen.findByRole("status")).toHaveTextContent(
    "暂未确认服务端撤销",
  );
  expect(
    screen.queryByText("网络连接失败，正在自动重连…"),
  ).not.toBeInTheDocument();
});

describe("Network header across asynchronous boundaries", () => {
  function expectHeader(devices: string, agents: string) {
    const header = screen
      .getByRole("button", { name: "选择网络" })
      .closest("header");
    expect(header).not.toBeNull();
    const region = within(header!);
    expect(
      region.getByRole("button", { name: "网络说明" }),
    ).toBeInTheDocument();
    expect(
      region.getByText("台设备在网络中").previousElementSibling,
    ).toHaveTextContent(devices);
    expect(
      region.getByText("个 Agent 可协作").previousElementSibling,
    ).toHaveTextContent(agents);
  }

  it("retains header controls and unknown statistics while authenticating", async () => {
    let finish!: (value: unknown) => void;
    mocks.session.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<AgentNetwork />);
    expectHeader("—", "—");
    const selector = screen.getByRole("button", { name: "选择网络" });
    const info = screen.getByRole("button", { name: "网络说明" });
    await act(async () => {
      finish({ state: "authenticated", session: { user: { id: "account" } } });
    });
    await screen.findByRole("button", { name: "查看 Fixture Mac 的设备详情" });
    expectHeader("0", "0");
    expect(screen.getByRole("button", { name: "选择网络" })).toBe(selector);
    expect(screen.getByRole("button", { name: "网络说明" })).toBe(info);
  });

  it("clears previous statistics immediately on network switch, then shows confirmed empty counts", async () => {
    mocks.devices.mockResolvedValue({
      items: [{ ...device, joined: true }],
      complete: true,
    });
    const view = render(<AgentNetwork />);
    await screen.findByRole("button", { name: "查看 Fixture Mac 的设备详情" });
    await waitFor(() => expectHeader("1", "0"));
    let finish!: (value: unknown) => void;
    mocks.devices.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mocks.selected = "self-a";
    view.rerender(<AgentNetwork />);
    expectHeader("—", "—");
    expect(screen.queryByText("Fixture Mac")).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.devices).toHaveBeenCalledWith("self-a"));
    expectHeader("—", "—");
    await act(async () => {
      finish({ items: [], complete: true });
    });
    await screen.findByText("登录的设备会自动显示在这里");
    expectHeader("0", "0");
  });

  it("retains the same header in signed-out and account-error states", async () => {
    mocks.session.mockResolvedValue(null);
    const view = render(<AgentNetwork />);
    await screen.findByRole("button", { name: "继续使用 Google" });
    expectHeader("—", "—");
    mocks.session.mockRejectedValue(new Error("account unavailable"));
    mocks.snapshot = { ...mocks.snapshot, authGeneration: 2 };
    view.rerender(<AgentNetwork />);
    await screen.findByRole("alert");
    expectHeader("—", "—");
  });
});
