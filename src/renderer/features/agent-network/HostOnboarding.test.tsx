import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CallableAgent,
  NetworkDevice,
  NetworkSnapshot,
} from "@/api/agentNetwork";
const mocks = vi.hoisted(() => ({
  devices: vi.fn(),
  installer: vi.fn(),
  callable: vi.fn(),
  open: vi.fn(),
  copy: vi.fn(),
  generation: 1,
}));
vi.mock("@/api/agentNetwork", () => ({
  allNetworkDevices: mocks.devices,
  hostInstallerInfo: mocks.installer,
  allCallableAgents: mocks.callable,
}));
vi.mock("@/utils/openExternal", () => ({ openExternal: mocks.open }));
vi.mock("@/utils/clipboard", () => ({ copyPlainText: mocks.copy }));
vi.mock("./store", () => ({
  currentNetworkGeneration: () => mocks.generation,
}));
import { HostOnboarding } from "./HostOnboarding";
const snapshot: NetworkSnapshot = {
  state: "ready",
  networkId: "network",
  principalId: "account",
  revision: 1,
  authGeneration: 1,
  error: null,
};
const device = {
  deviceId: "remote",
  networkId: "network",
  principalId: "account",
  name: "Linux-Host",
  joined: true,
  connectionState: "ready",
} as NetworkDevice;
const agent = {
  deviceId: "remote",
  mountId: "mount",
  source: { networkId: "network" },
} as CallableAgent;
const props = {
  connectionId: "owned",
  snapshot,
  networkName: "Team Network",
  serviceUrl: "https://network.example",
  official: false,
  localDeviceId: "local",
  onClose: vi.fn(),
  onManage: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.generation = 1;
  mocks.installer.mockResolvedValue({
    status: "available",
    command: "curl https://network.example/install.sh | sh",
  });
  mocks.devices.mockResolvedValue({ items: [device], complete: true });
  mocks.callable.mockResolvedValue({ items: [], complete: true });
});
function next() {
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
}
async function reachCheck() {
  next();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "我已在目标设备完成安装" }),
  );
  next();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "我已在目标设备登录并加入网络" }),
  );
  next();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "刷新连接检查" })).toBeEnabled(),
  );
  if (
    screen
      .getByRole("button", { name: "选择要检查的目标设备" })
      .hasAttribute("disabled")
  )
    return;
  fireEvent.click(screen.getByRole("button", { name: "选择要检查的目标设备" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Linux-Host · remote" }),
  );
}
describe("Host onboarding", () => {
  it("requires explicit installation/login acknowledgements and never autoselects existing devices", async () => {
    render(<HostOnboarding {...props} />);
    next();
    expect(screen.getByRole("button", { name: "下一步" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    next();
    expect(screen.getByRole("button", { name: "下一步" })).toBeDisabled();
    expect(screen.getByText("Team Network")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    next();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "刷新连接检查" }),
      ).toBeEnabled(),
    );
    expect(screen.getByText("请选择设备（名称与 ID）")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完成引导" })).toBeDisabled();
  });
  it("distinguishes an online empty Host from callable Agents and opens its management", async () => {
    render(<HostOnboarding {...props} />);
    await reachCheck();
    expect(screen.getByText("已在线")).toBeInTheDocument();
    expect(screen.getByText("尚无可调用 Agent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完成引导" })).toBeEnabled();
    fireEvent.click(
      screen.getByRole("button", { name: "打开设备并配置 Agent" }),
    );
    expect(props.onManage).toHaveBeenCalledWith(device);
  });
  it("does not claim actual execution when callable directory contains the target", async () => {
    mocks.callable.mockResolvedValue({ items: [agent], complete: true });
    render(<HostOnboarding {...props} />);
    await reachCheck();
    expect(screen.getByText("1 个可调用，执行待验证")).toBeInTheDocument();
    expect(mocks.callable).toHaveBeenCalledWith("network", "owned");
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it.each(["offline", "syncing"] as const)(
    "does not allow finish for %s even with stale callable entries",
    async (connectionState) => {
      mocks.devices.mockResolvedValue({
        items: [{ ...device, connectionState }],
        complete: true,
      });
      mocks.callable.mockResolvedValue({ items: [agent], complete: true });
      render(<HostOnboarding {...props} />);
      await reachCheck();
      expect(screen.getByRole("button", { name: "完成引导" })).toBeDisabled();
      expect(
        screen.queryByText("1 个可调用，执行待验证"),
      ).not.toBeInTheDocument();
    },
  );
  it("preserves online evidence independently when callable fails, and refresh recovers", async () => {
    mocks.callable.mockRejectedValue(new Error("offline"));
    render(<HostOnboarding {...props} />);
    await reachCheck();
    expect(screen.getByText("已在线")).toBeInTheDocument();
    expect(screen.getAllByText("查询失败，请刷新重试").length).toBeGreaterThan(
      0,
    );
    mocks.callable.mockResolvedValue({ items: [agent], complete: true });
    fireEvent.click(screen.getByRole("button", { name: "刷新连接检查" }));
    await screen.findByText("1 个可调用，执行待验证");
  });
  it("keeps a partial callable directory unknown instead of claiming no Agents", async () => {
    mocks.callable.mockResolvedValue({ items: [], complete: false });
    render(<HostOnboarding {...props} />);
    await reachCheck();
    expect(screen.queryByText("尚无可调用 Agent")).not.toBeInTheDocument();
    expect(
      screen.getAllByText("目录不完整，请刷新；不能确认未列出的设备或 Agent。")
        .length,
    ).toBeGreaterThan(0);
  });
  it("rejects device responses for another account", async () => {
    mocks.devices.mockResolvedValue({
      items: [{ ...device, principalId: "someone-else" }],
      complete: true,
    });
    render(<HostOnboarding {...props} />);
    await reachCheck();
    expect(screen.getByRole("button", { name: "完成引导" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Linux-Host · remote" }),
    ).not.toBeInTheDocument();
  });
  it("invalidates previous success on disconnection and ignores late old responses", async () => {
    const view = render(<HostOnboarding {...props} />);
    await reachCheck();
    expect(screen.getByText("已在线")).toBeInTheDocument();
    let resolve!: (value: unknown) => void;
    mocks.devices.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "刷新连接检查" }));
    view.rerender(
      <HostOnboarding
        {...props}
        snapshot={{ ...snapshot, state: "disconnected", revision: 2 }}
      />,
    );
    await act(async () => resolve({ items: [device], complete: true }));
    expect(screen.queryByText("已在线")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完成引导" })).toBeDisabled();
  });
  it("opens a separate Linux command flow without installation acknowledgements", async () => {
    render(<HostOnboarding {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: /Linux 服务器/ }));
    next();
    await screen.findByRole("button", { name: "复制命令" });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText("1. 复制安装命令")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(
      screen.queryByRole("button", { name: "下一步" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "上一步" }));
    expect(screen.getByRole("radio", { name: /Linux 服务器/ })).toBeChecked();
  });
  it("keeps the parent Escape close behavior for Linux", async () => {
    render(<HostOnboarding {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: /Linux 服务器/ }));
    next();
    await screen.findByRole("button", { name: "复制命令" });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledOnce();
  });
  it("discards a late installer response after switching accounts", async () => {
    let resolve!: (value: unknown) => void;
    mocks.installer.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const view = render(<HostOnboarding {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: /Linux 服务器/ }));
    next();
    expect(
      screen.getByText("正在读取此网络的安装发布信息…"),
    ).toBeInTheDocument();
    mocks.installer.mockResolvedValue({ status: "unavailable" });
    mocks.generation = 2;
    view.rerender(
      <HostOnboarding
        {...props}
        snapshot={{
          ...snapshot,
          principalId: "next-account",
          authGeneration: 2,
          revision: 2,
        }}
      />,
    );
    await screen.findByText(/此网络尚未发布可验证/);
    await act(async () =>
      resolve({ status: "available", command: "old-account-command" }),
    );
    expect(screen.queryByText("old-account-command")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "复制命令" }),
    ).not.toBeInTheDocument();
  });
  it("resets Linux waiting state on scope change and rejects late device success", async () => {
    let resolve!: (value: unknown) => void;
    mocks.devices
      .mockResolvedValueOnce({ items: [], complete: true })
      .mockReturnValue(
        new Promise((r) => {
          resolve = r;
        }),
      );
    const view = render(<HostOnboarding {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: /Linux 服务器/ }));
    next();
    fireEvent.click(await screen.findByRole("button", { name: "复制命令" }));
    await screen.findByText("在终端完成安装和浏览器授权");
    view.rerender(
      <HostOnboarding
        {...props}
        snapshot={{ ...snapshot, networkId: "next-network", revision: 2 }}
      />,
    );
    await screen.findByRole("button", { name: "复制命令" });
    await act(async () => resolve({ items: [device], complete: true }));
    expect(screen.queryByText("已在线")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "完成引导" }),
    ).not.toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
  });
  it("preserves Linux enrollment across a same-account ready directory revision", async () => {
    let resolve!: (value: unknown) => void;
    mocks.devices
      .mockResolvedValueOnce({ items: [], complete: true })
      .mockReturnValue(
        new Promise((r) => {
          resolve = r;
        }),
      );
    const view = render(<HostOnboarding {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: /Linux 服务器/ }));
    next();
    fireEvent.click(await screen.findByRole("button", { name: "复制命令" }));
    await screen.findByText("在终端完成安装和浏览器授权");
    view.rerender(
      <HostOnboarding {...props} snapshot={{ ...snapshot, revision: 2 }} />,
    );
    expect(screen.getByText("在终端完成安装和浏览器授权")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "复制命令" }),
    ).not.toBeInTheDocument();
    await act(async () => resolve({ items: [device], complete: true }));
    expect(
      screen.getByText("目标 Host 已加入网络并在线。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完成引导" })).toBeEnabled();
    expect(mocks.installer).toHaveBeenCalledOnce();
    expect(mocks.copy).toHaveBeenCalledOnce();
  });
});
