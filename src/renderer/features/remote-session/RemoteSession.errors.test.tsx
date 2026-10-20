import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  snapshot: { state: "ready", principalId: "p", networkId: "n", authGeneration: 4 },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/features/agent-network/store", () => ({
  currentNetworkSnapshot: () => mocks.snapshot,
  useAgentNetworkRegistry: () => ({ connections: [{ id: "owned:test", snapshot: mocks.snapshot }] }),
}));
vi.mock("@/components/Markdown", () => ({ default: ({ children }: { children: string }) => <p>{children}</p> }));
vi.mock("react-virtuoso", () => import("../../../test/ConversationVirtuoso"));
vi.mock("@/config/useConfigData", () => ({useConfigData: () => ({config: {}})}));
vi.mock("@/context/ImagePreviewContext", () => ({useImagePreview: () => ({openPreview: vi.fn()})}));
import RemoteSession from "./RemoteSession";
const scope = { serviceId: "s", environment: "e", principalId: "p", networkId: "n", deviceId: "d", keyGeneration: 2 };
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });
it.each([
  ["HOST_MANAGEMENT_TARGET_BUSY", "remoteSession.channelBusy"],
  ["HOST_MANAGEMENT_BUSY", "remoteSession.requestBusy"],
  ["REMOTE_SESSION_BUSY", "remoteSession.busy"],
])("distinguishes transport contention %s from remote execution", async (code, copy) => {
  mocks.invoke.mockRejectedValue({ code });
  render(<RemoteSession isActive tab={{
    id: "remote-busy-test", view: "remote-session", title: "Test Agent",
    locator: { connectionId: "owned:test", principalId: "p", networkId: "n", deviceId: "d", authGeneration: 4 },
    agentId: "agent", agentName: "Test Agent", deviceName: "Test Host", sessionId: null, targetScope: null,
  }} binding={{ onOpen: vi.fn(), onBound: vi.fn() }} />);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(copy));
  expect(screen.getByRole("alert")).toHaveTextContent(code);
  expect(mocks.invoke.mock.calls.every(([, {request}]) => request.params.remoteSession.kind === "capabilities")).toBe(true);
});
it("shows the real management failure and refreshes through the actual API into history", async () => {
  mocks.invoke.mockResolvedValue({ scope, result: { kind: "error", code: "TARGET_OWNER_UNAVAILABLE" } });
  render(<RemoteSession isActive tab={{
    id: "remote-error-test", view: "remote-session", title: "Test Agent",
    locator: { connectionId: "owned:test", principalId: "p", networkId: "n", deviceId: "d", authGeneration: 4 },
    agentId: "agent", agentName: "Test Agent", deviceName: "Test Host", sessionId: null, targetScope: null,
  }} binding={{ onOpen: vi.fn(), onBound: vi.fn() }} />);
  await waitFor(() => expect(screen.getByText(/TARGET_OWNER_UNAVAILABLE/)).toBeInTheDocument());
  expect(screen.queryByText(/REMOTE_SESSION_RESPONSE_INVALID/)).not.toBeInTheDocument();
  mocks.invoke.mockImplementation(async (_command, { request }) => ({ scope, result: { kind: "remote-session", data:
    request.params.remoteSession.kind === "capabilities"
      ? { kind: "capabilities", version: 1, agentId: "agent", runtime: "builtin", maxActiveSessions: 100, liveUpdates: "snapshot" }
      : { kind: "list", agentId: "agent", items: [{ sessionId: "test-session", title: "Recovered history", updatedAt: "2026-10-19T10:00:00Z", preview: "Saved result", runtime: "builtin" }], hasMore: false, nextBefore: null },
  } }));
  fireEvent.click(screen.getByRole("button", { name: "remoteSession.refresh" }));
  await waitFor(() => expect(screen.getByText("Recovered history")).toBeInTheDocument());
  expect(screen.queryByText(/TARGET_OWNER_UNAVAILABLE/)).not.toBeInTheDocument();
  expect(mocks.invoke.mock.calls.every(([, {request}]) => ["capabilities", "list"].includes(request.params.remoteSession.kind))).toBe(true);
});
