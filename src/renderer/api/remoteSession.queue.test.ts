import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  snapshots: new Map<string, { state: string; principalId: string; networkId: string; authGeneration: number }>(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@/features/agent-network/store", () => ({
  currentNetworkSnapshot: (connectionId: string) => mocks.snapshots.get(connectionId),
}));
import { remoteSessionRequest } from "./remoteSession";

const scope = { serviceId: "s", environment: "e", principalId: "p", networkId: "n", deviceId: "d", keyGeneration: 2 };
const locator = (connectionId = "owned:test") => ({ connectionId, principalId: "p", networkId: "n", deviceId: "d", authGeneration: 4 });
const capsRequest = { kind: "capabilities" as const, agentId: "agent" };
const readRequest = { kind: "list" as const, agentId: "agent", limit: 5 };
const receiptRequest = { kind: "receipt" as const, agentId: "agent", operationId: "11111111-1111-4111-8111-111111111111" };
const response = (data: unknown) => ({ scope, result: { kind: "remote-session", data } });
const caps = { kind: "capabilities", agentId: "agent", version: 1, runtime: "builtin", maxActiveSessions: 1, liveUpdates: "snapshot" };
const receipt = { kind: "receipt", agentId: "agent", operationId: receiptRequest.operationId, sessionId: null, status: "not-found", code: null };
const list = { kind: "list", agentId: "agent", items: [], hasMore: false, nextBefore: null };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.snapshots.clear();
  mocks.snapshots.set("owned:test", { state: "ready", principalId: "p", networkId: "n", authGeneration: 4 });
  mocks.snapshots.set("owned:other", { state: "ready", principalId: "p", networkId: "n", authGeneration: 4 });
});

it("serializes per connection and dispatches a receipt before queued snapshot reads", async () => {
  const first = deferred<unknown>();
  mocks.invoke.mockReturnValueOnce(first.promise).mockResolvedValueOnce(response(receipt)).mockResolvedValueOnce(response(list));
  const inFlight = remoteSessionRequest(locator(), null, capsRequest, new AbortController().signal);
  const snapshot = remoteSessionRequest(locator(), scope, readRequest, new AbortController().signal);
  const priority = remoteSessionRequest(locator(), scope, receiptRequest, new AbortController().signal);
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
  first.resolve(response(caps));
  await Promise.all([inFlight, priority, snapshot]);
  expect(mocks.invoke).toHaveBeenCalledTimes(3);
  expect(mocks.invoke.mock.calls.map(([_, args]) => args.request.params.remoteSession.kind)).toEqual(["capabilities", "receipt", "list"]);
});

it("removes an aborted queued read and rechecks account generation before dispatch", async () => {
  const first = deferred<unknown>();
  mocks.invoke.mockReturnValueOnce(first.promise).mockResolvedValueOnce(response(receipt));
  const active = remoteSessionRequest(locator(), null, capsRequest, new AbortController().signal);
  const activeSettled = expect(active).rejects.toMatchObject({ code: "REMOTE_SESSION_ACCOUNT_CHANGED" });
  const aborter = new AbortController();
  const cancelled = remoteSessionRequest(locator(), scope, readRequest, aborter.signal);
  const priority = remoteSessionRequest(locator(), scope, receiptRequest, new AbortController().signal);
  aborter.abort();
  await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
  mocks.snapshots.get("owned:test")!.authGeneration = 5;
  first.resolve(response(caps));
  await activeSettled;
  await expect(priority).rejects.toMatchObject({ code: "REMOTE_SESSION_ACCOUNT_CHANGED" });
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
});

it("allows separate connection actors to dispatch independently", async () => {
  const left = deferred<unknown>();
  mocks.invoke.mockReturnValueOnce(left.promise).mockResolvedValueOnce(response(caps));
  const a = remoteSessionRequest(locator(), null, capsRequest, new AbortController().signal);
  const b = remoteSessionRequest(locator("owned:other"), null, capsRequest, new AbortController().signal);
  expect(mocks.invoke).toHaveBeenCalledTimes(2);
  left.resolve(response(caps));
  await Promise.all([a, b]);
});

it("does not replay a write aborted after invoke has started", async () => {
  const sent = deferred<unknown>();
  const operationId = "22222222-2222-4222-8222-222222222222";
  mocks.invoke.mockReturnValueOnce(sent.promise);
  const controller = new AbortController();
  const pending = remoteSessionRequest(locator(), scope,
    { kind: "start", agentId: "agent", operationId, text: "task" }, controller.signal,
  );
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
  controller.abort();
  sent.resolve(response({ kind: "receipt", agentId: "agent", operationId, sessionId: "session", status: "accepted", code: null }));
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
});
