import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NetworkDevice, NetworkSnapshot } from "@/api/agentNetwork";
const mocks = vi.hoisted(() => ({
  devices: vi.fn(),
  callable: vi.fn(),
  installer: vi.fn(),
  copy: vi.fn(),
  generation: 1,
}));
vi.mock("@/api/agentNetwork", () => ({
  allNetworkDevices: mocks.devices,
  allCallableAgents: mocks.callable,
  hostInstallerInfo: mocks.installer,
}));
vi.mock("@/utils/clipboard", () => ({ copyPlainText: mocks.copy }));
vi.mock("./store", () => ({
  currentNetworkGeneration: () => mocks.generation,
}));
import {
  LinuxHostInstall,
  HOST_POLL_INTERVAL,
  HOST_POLL_TIMEOUT,
} from "./LinuxHostInstall";
const snapshot: NetworkSnapshot = {
  state: "ready",
  networkId: "network",
  principalId: "account",
  revision: 1,
  authGeneration: 1,
  error: null,
};
const remote = {
  deviceId: "remote",
  networkId: "network",
  principalId: "account",
  name: "Server",
  joined: true,
  connectionState: "ready",
} as NetworkDevice;
const props = {
  connectionId: "owned",
  snapshot,
  networkName: "Team",
  localDeviceId: "local",
  onBack: vi.fn(),
  onClose: vi.fn(),
  onManage: vi.fn(),
};
const directory = (items: NetworkDevice[], complete = true) => ({
  items,
  complete,
});
async function copy() {
  fireEvent.click(await screen.findByRole("button", { name: "复制命令" }));
  await screen.findByText("在终端完成安装和浏览器授权");
}
async function tick(ms = HOST_POLL_INTERVAL) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.generation = 1;
  mocks.installer.mockResolvedValue({
    status: "available",
    command: "verified install command",
  });
  mocks.copy.mockResolvedValue(undefined);
  mocks.devices.mockResolvedValue(directory([]));
  mocks.callable.mockResolvedValue({ items: [], complete: true });
});
afterEach(() => {
  vi.useRealTimers();
});
describe("Linux Host installation", () => {
  it("renders loading, unavailable and retry without constructing an installer command", async () => {
    let resolve!: (value: unknown) => void;
    mocks.installer.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<LinuxHostInstall {...props} />);
    expect(
      screen.getByText("正在读取此网络的安装发布信息…"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "复制命令" }),
    ).not.toBeInTheDocument();
    await act(async () => resolve({ status: "unavailable" }));
    expect(screen.getByText(/此网络尚未发布可验证/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(
      await screen.findByRole("button", { name: "复制命令" }),
    ).toBeEnabled();
    expect(mocks.installer).toHaveBeenCalledWith("owned", 1);
  });
  it("recovers installer read errors and does not poll before a successful copy", async () => {
    mocks.installer.mockRejectedValueOnce(new Error("offline"));
    render(<LinuxHostInstall {...props} />);
    await screen.findByText(
      "无法读取安装信息，请检查网络连接和 HTTPS 证书是否受系统信任后重试。",
    );
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await screen.findByRole("button", { name: "复制命令" });
    expect(mocks.devices).not.toHaveBeenCalled();
    mocks.copy.mockRejectedValue(new Error("clipboard denied"));
    fireEvent.click(screen.getByRole("button", { name: "复制命令" }));
    await screen.findByText("复制未完成，尚未开始连接检查。请重试复制命令。");
    expect(mocks.devices).toHaveBeenCalledOnce();
    expect(mocks.callable).not.toHaveBeenCalled();
    expect(
      screen.queryByText("在终端完成安装和浏览器授权"),
    ).not.toBeInTheDocument();
  });
  it("selects a unique newly online remote Host and separates execution evidence", async () => {
    mocks.devices
      .mockResolvedValueOnce(directory([]))
      .mockResolvedValue(directory([remote]));
    mocks.callable.mockResolvedValue({
      items: [{ deviceId: "remote", source: { networkId: "network" } }],
      complete: true,
    });
    render(<LinuxHostInstall {...props} />);
    await copy();
    expect(
      await screen.findByText("目标 Host 已加入网络并在线。"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 个可调用，执行待验证")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完成引导" })).toBeEnabled();
    fireEvent.click(
      screen.getByRole("button", { name: "打开设备并配置 Agent" }),
    );
    expect(props.onManage).toHaveBeenCalledWith(remote);
    expect(mocks.copy).toHaveBeenCalledWith("verified install command");
  });
  it("does not attribute existing online or local devices to the installation; explicit ID selection works", async () => {
    const local = { ...remote, name: "Local", deviceId: "local" };
    mocks.devices.mockResolvedValue(directory([remote, local]));
    render(<LinuxHostInstall {...props} />);
    await copy();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "选择要检查的目标设备" }),
      ).toBeEnabled(),
    );
    expect(screen.getByRole("button", { name: "完成引导" })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "选择要检查的目标设备" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Server · remote" }),
    );
    expect(screen.getByRole("button", { name: "完成引导" })).toBeEnabled();
  });
  it("accepts a uniquely offline-to-ready remote Host", async () => {
    mocks.devices
      .mockResolvedValueOnce(
        directory([{ ...remote, connectionState: "offline" }]),
      )
      .mockResolvedValue(directory([remote]));
    render(<LinuxHostInstall {...props} />);
    await copy();
    expect(
      await screen.findByText("目标 Host 已加入网络并在线。"),
    ).toBeInTheDocument();
  });
  it("requires explicit selection after an incomplete baseline", async () => {
    mocks.devices
      .mockResolvedValueOnce(directory([], false))
      .mockResolvedValue(directory([remote]));
    render(<LinuxHostInstall {...props} />);
    await copy();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "选择要检查的目标设备" }),
      ).toBeEnabled(),
    );
    expect(screen.getByRole("button", { name: "完成引导" })).toBeDisabled();
  });
  it("rejects a foreign account device directory", async () => {
    mocks.devices
      .mockResolvedValueOnce(directory([]))
      .mockResolvedValue(directory([{ ...remote, principalId: "foreign" }]));
    render(<LinuxHostInstall {...props} />);
    await copy();
    await screen.findByText(/连接目录读取失败/);
    expect(screen.getByRole("button", { name: "完成引导" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "选择要检查的目标设备" }),
    ).toBeDisabled();
  });
  it("does not auto-select ambiguous newly online devices or this local device", async () => {
    const local = { ...remote, deviceId: "local" };
    mocks.devices
      .mockResolvedValueOnce(directory([]))
      .mockResolvedValue(directory([local]));
    const view = render(<LinuxHostInstall {...props} />);
    await copy();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "选择要检查的目标设备" }),
      ).toBeEnabled(),
    );
    expect(screen.getByRole("button", { name: "完成引导" })).toBeDisabled();
    view.unmount();
    mocks.devices
      .mockResolvedValueOnce(directory([]))
      .mockResolvedValue(directory([remote, { ...remote, deviceId: "other" }]));
    render(<LinuxHostInstall {...props} />);
    await copy();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "选择要检查的目标设备" }),
      ).toBeEnabled(),
    );
    expect(screen.getByRole("button", { name: "完成引导" })).toBeDisabled();
  });
  it("keeps online Host evidence but rejects callable entries from another network", async () => {
    mocks.devices
      .mockResolvedValueOnce(directory([]))
      .mockResolvedValue(directory([remote]));
    mocks.callable.mockResolvedValue({
      items: [{ deviceId: "remote", source: { networkId: "foreign-network" } }],
      complete: true,
    });
    render(<LinuxHostInstall {...props} />);
    await copy();
    await screen.findByText("目标 Host 已加入网络并在线。");
    expect(screen.getByText("查询失败，请刷新重试")).toBeInTheDocument();
    expect(
      screen.queryByText("1 个可调用，执行待验证"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完成引导" })).toBeEnabled();
  });
  it("polls every five seconds, stops at five minutes, and supports a bounded retry", async () => {
    vi.useFakeTimers();
    render(<LinuxHostInstall {...props} />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "复制命令" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.callable).toHaveBeenCalledOnce();
    await tick(HOST_POLL_INTERVAL - 1);
    expect(mocks.callable).toHaveBeenCalledOnce();
    await tick(1);
    expect(mocks.callable).toHaveBeenCalledTimes(2);
    await tick(HOST_POLL_TIMEOUT - HOST_POLL_INTERVAL);
    expect(screen.getByText(/等待已超过 5 分钟/)).toBeInTheDocument();
    const count = mocks.callable.mock.calls.length;
    await tick(HOST_POLL_INTERVAL * 2);
    expect(mocks.callable).toHaveBeenCalledTimes(count);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.callable).toHaveBeenCalledTimes(count + 1);
  });
  it("times out an unresolved read and ignores its late success", async () => {
    vi.useFakeTimers();
    let resolve!: (value: unknown) => void;
    mocks.devices.mockResolvedValueOnce(directory([])).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<LinuxHostInstall {...props} />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "复制命令" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await tick(HOST_POLL_TIMEOUT);
    expect(screen.getByText(/等待已超过 5 分钟/)).toBeInTheDocument();
    expect(mocks.devices).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "重试" })).toBeDisabled();
    await act(async () => resolve(directory([remote])));
    expect(screen.getByRole("button", { name: "完成引导" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "重试" })).toBeEnabled();
  });
  it("invalidates generation changes before accepting late polling or completing", async () => {
    let resolve!: (value: unknown) => void;
    mocks.devices.mockResolvedValueOnce(directory([])).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<LinuxHostInstall {...props} />);
    await copy();
    mocks.generation++;
    await act(async () => resolve(directory([remote])));
    expect(screen.getByText(/网络或账号已变化/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完成引导" })).toBeDisabled();
  });
});
