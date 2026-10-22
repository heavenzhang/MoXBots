import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registry: { connections: [] as Array<Record<string, unknown>> },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      const labels: Record<string, string> = {
        "remoteSession.sidebar.title": "远程会话",
        "remoteSession.sidebar.unread": "有新消息",
        "remoteSession.sidebar.close": "从列表关闭，远端继续执行",
        "remoteSession.sidebar.closeSession": `关闭远程会话：${values?.title ?? ""}`,
        "remoteSession.connectionPending": "正在恢复网络身份",
        "remoteSession.remote": "远程会话",
        "remoteSession.states.loading": "正在读取远端…",
        "remoteSession.states.running": "执行中",
        "remoteSession.states.idle": "空闲",
        "remoteSession.states.offline": "离线",
        "remoteSession.states.unavailable": "不可用",
        "remoteSession.openSession": "打开会话",
      };
      return labels[key] ?? key;
    },
  }),
}));

vi.mock("@/features/agent-network/store", () => ({
  useAgentNetworkRegistry: () => mocks.registry,
}));

import { RemoteSessionSidebar } from "./RemoteSessionSidebar";
import type { RemoteSessionTab } from "./tabContract";

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  state: "ready",
  principalId: "principal-1",
  networkId: "network-1",
  authGeneration: 7,
  revision: 3,
  ...overrides,
});

const connection = (snap: ReturnType<typeof snapshot> = snapshot()) => ({
  id: "connection-1",
  removing: false,
  snapshot: snap,
});

function makeTab(overrides: Partial<RemoteSessionTab> = {}): RemoteSessionTab {
  return {
    id: "tab-1",
    view: "remote-session",
    title: "Stored title",
    locator: {
      connectionId: "connection-1",
      principalId: "principal-1",
      networkId: "network-1",
      deviceId: "device-1",
      authGeneration: 7,
    },
    agentId: "agent-1",
    agentName: "Agent One",
    deviceName: "Host One",
    sessionId: "session-1",
    targetScope: null,
    ...overrides,
  };
}

describe("RemoteSessionSidebar", () => {
  beforeEach(() => {
    mocks.registry = { connections: [connection()] };
  });

  it("selects the existing tab and shows its verified source, active state and unread marker", () => {
    const onSelect = vi.fn();
    const tab = makeTab({
      observation: {
        title: "Observed session",
        state: "running",
        sync: "current",
        lastSyncedAt: 100,
        hasUnread: true,
        authGeneration: 7,
      },
    });
    render(<RemoteSessionSidebar tabs={[tab]} activeTabId={tab.id} onSelect={onSelect} />);

    const row = screen.getByRole("button", { name: /Observed session/ });
    expect(row).toHaveAttribute("aria-current", "page");
    expect(row).toHaveAccessibleName(/Agent One · Host One/);
    expect(row).toHaveAccessibleName(/执行中/);
    expect(row).toHaveAccessibleName(/有新消息/);
    expect(within(row).getByLabelText("有新消息")).toBeInTheDocument();

    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("tab-1");
  });

  it("only invokes the local close callback and never exposes a stop action", () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    render(<RemoteSessionSidebar tabs={[makeTab()]} onClose={onClose} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "关闭远程会话：Stored title" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith("tab-1");
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /停止|Stop/ })).not.toBeInTheDocument();
  });

  it("keeps identity-pending rows generic and excludes a principal or network mismatch", () => {
    const pending = makeTab({ title: "Private old title" });
    mocks.registry = { connections: [connection(snapshot({ principalId: null, networkId: null }))] };
    const view = render(<RemoteSessionSidebar tabs={[pending]} />);
    expect(screen.getByRole("button", { name: /正在恢复网络身份/ })).toBeInTheDocument();
    expect(screen.queryByText("Private old title")).not.toBeInTheDocument();

    mocks.registry = { connections: [connection(snapshot({ principalId: "other-principal" }))] };
    view.rerender(<RemoteSessionSidebar tabs={[pending]} />);
    expect(screen.queryByRole("region", { name: "远程会话" })).not.toBeInTheDocument();

    mocks.registry = { connections: [connection(snapshot({ networkId: "other-network" }))] };
    view.rerender(<RemoteSessionSidebar tabs={[pending]} />);
    expect(screen.queryByRole("region", { name: "远程会话" })).not.toBeInTheDocument();
  });

  it("does not show an old generation's observation or title after authentication changes", () => {
    mocks.registry = { connections: [connection(snapshot({ authGeneration: 8 }))] };
    const oldTab = makeTab({
      title: "Old account title",
      observation: {
        title: "Old observed title",
        state: "running",
        sync: "current",
        lastSyncedAt: 100,
        hasUnread: true,
        authGeneration: 7,
      },
    });
    render(<RemoteSessionSidebar tabs={[oldTab]} />);

    const row = screen.getByRole("button", { name: /正在恢复网络身份/ });
    expect(row).toHaveAccessibleName(/正在恢复网络身份/);
    expect(row).not.toHaveAccessibleName(/Old account title|Old observed title|有新消息/);
    expect(row).toHaveAccessibleName(/正在读取远端/);
  });

  it("prefers the current generation when an old duplicate appears first", () => {
    const onSelect = vi.fn();
    const oldTab = makeTab({
      id: "old-generation-tab",
      title: "Old generation title",
      locator: { ...makeTab().locator, authGeneration: 6 },
      observation: {
        title: "Old observed title",
        state: "running",
        sync: "current",
        lastSyncedAt: 100,
        hasUnread: true,
        authGeneration: 6,
      },
    });
    const currentTab = makeTab({ id: "current-generation-tab", title: "Current generation title" });
    render(<RemoteSessionSidebar tabs={[oldTab, currentTab]} onSelect={onSelect} />);

    const row = screen.getByRole("button", { name: /Current generation title/ });
    expect(row).toHaveAccessibleName(/Agent One · Host One/);
    expect(row).not.toHaveAccessibleName(/Old generation title|Old observed title|有新消息/);
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("current-generation-tab");
    expect(screen.queryByText("Old generation title")).not.toBeInTheDocument();
    expect(screen.queryByText("Old observed title")).not.toBeInTheDocument();
  });

  it("deduplicates tabs with the same remote identity while retaining distinct sessions", () => {
    const duplicate = makeTab({ id: "tab-duplicate", title: "Duplicate" });
    const anotherSession = makeTab({
      id: "tab-2",
      title: "Second session",
      sessionId: "session-2",
    });
    render(<RemoteSessionSidebar tabs={[makeTab(), duplicate, anotherSession]} />);

    expect(screen.getByText("远程会话").parentElement).toHaveTextContent("2");
    expect(screen.getAllByRole("button", { name: /Agent One · Host One/ })).toHaveLength(2);
    expect(screen.queryByText("Duplicate")).not.toBeInTheDocument();
    expect(screen.getByText("Second session")).toBeInTheDocument();
  });

  it("collapses and expands the projected rows", () => {
    render(<RemoteSessionSidebar tabs={[makeTab()]} />);
    const toggle = screen.getByRole("button", { name: /远程会话/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Stored title")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Stored title")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Stored title")).toBeInTheDocument();
  });
});
