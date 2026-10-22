import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import {
  remoteSessionRequestSchema,
  remoteSessionResultSchema,
  isRemoteMutation,
  REMOTE_SESSION_BYTES,
  type RemoteSessionRequest,
  type RemoteSessionResult,
} from "@/../shared/remoteSession";
import type { HostLocator } from "./hostManagement";
import { sameOwnedHostScope, type OwnedHostScope } from "./ownedHostManagement";
import { currentNetworkSnapshot } from "@/features/agent-network/store";

export const remoteScopeSchema = z
  .object({
    serviceId: z.string().min(1).max(256),
    environment: z.string().min(1).max(256),
    principalId: z.string().min(1).max(256),
    networkId: z.string().min(1).max(256),
    deviceId: z.string().min(1).max(256),
    keyGeneration: z.number().int().positive(),
  })
  .strict();
const responseSchema = z
  .object({
    scope: remoteScopeSchema,
    result: z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("remote-session"),
        data: remoteSessionResultSchema,
      }).strict(),
      z.object({
        kind: z.literal("error"),
        code: z.string().regex(/^[A-Z0-9_]{1,128}$/),
      }).strict(),
    ]),
  })
  .strict();
export function remoteAccountMatches(locator: HostLocator): boolean {
  const snapshot = currentNetworkSnapshot(locator.connectionId);
  return (
    !!snapshot &&
    snapshot.principalId === locator.principalId &&
    snapshot.networkId === locator.networkId &&
    snapshot.authGeneration === locator.authGeneration &&
    snapshot.state !== "signedOut"
  );
}
export function remoteErrorCode(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_]{1,128}$/.test(error.code)
  )
    return error.code;
  return "REMOTE_SESSION_UNAVAILABLE";
}

type QueuedDispatch = {
  priority: number;
  order: number;
  signal: AbortSignal;
  validate: () => void;
  dispatch: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  onAbort: () => void;
};
type DispatchQueue = { active: boolean; pending: QueuedDispatch[] };
const dispatchQueues = new Map<string, DispatchQueue>();
let dispatchOrder = 0;

function requestPriority(request: RemoteSessionRequest): number {
  // Reads that refresh ordinary remote state yield to receipts and operations.
  return request.kind === "capabilities" || request.kind === "list" || request.kind === "get" ? 0 : 1;
}

function queuedDispatch<T>(
  locator: HostLocator,
  request: RemoteSessionRequest,
  signal: AbortSignal,
  validate: () => void,
  dispatch: () => Promise<T>,
): Promise<T> {
  let queue = dispatchQueues.get(locator.connectionId);
  if (!queue) {
    queue = { active: false, pending: [] };
    dispatchQueues.set(locator.connectionId, queue);
  }
  const state = queue;
  return new Promise<T>((resolve, reject) => {
    const task: QueuedDispatch = {
      priority: requestPriority(request),
      order: dispatchOrder++,
      signal,
      validate,
      dispatch,
      resolve: (value) => resolve(value as T),
      reject,
      onAbort: () => {
        remove();
        reject(new DOMException("Aborted", "AbortError"));
        pump();
      },
    };
    const remove = () => {
      const index = state.pending.indexOf(task);
      if (index >= 0) state.pending.splice(index, 1);
      signal.removeEventListener("abort", task.onAbort);
    };
    const pump = () => {
      if (state.active) return;
      while (state.pending.length) {
        state.pending.sort((a, b) => b.priority - a.priority || a.order - b.order);
        const next = state.pending.shift()!;
        next.signal.removeEventListener("abort", next.onAbort);
        try {
          next.validate();
        } catch (error) {
          next.reject(error);
          continue;
        }
        state.active = true;
        void next.dispatch().then(next.resolve, next.reject).finally(() => {
          state.active = false;
          pump();
          if (!state.active && !state.pending.length) dispatchQueues.delete(locator.connectionId);
        });
        return;
      }
      dispatchQueues.delete(locator.connectionId);
    };
    signal.addEventListener("abort", task.onAbort, { once: true });
    state.pending.push(task);
    pump();
  });
}

export async function remoteSessionRequest(
  locator: HostLocator,
  targetScope: OwnedHostScope | null,
  request: RemoteSessionRequest,
  signal: AbortSignal,
): Promise<{ scope: OwnedHostScope; data: RemoteSessionResult }> {
  locator = { ...locator };
  targetScope = targetScope ? remoteScopeSchema.parse(targetScope) : null;
  request = remoteSessionRequestSchema.parse(request);
  const fence = () => {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (!remoteAccountMatches(locator))
      throw { code: "REMOTE_SESSION_ACCOUNT_CHANGED" };
  };
  const validateDispatch = () => {
    fence();
    const snapshot = currentNetworkSnapshot(locator.connectionId);
    if (
      locator.connectionId === "official" ||
      (!targetScope && request.kind !== "capabilities")
    )
      throw { code: "REMOTE_SESSION_TARGET_REQUIRED" };
    if (snapshot?.state !== "ready") throw { code: "REMOTE_SESSION_OFFLINE" };
    if (
      targetScope &&
      (targetScope.principalId !== locator.principalId ||
        targetScope.networkId !== locator.networkId ||
        targetScope.deviceId !== locator.deviceId)
    )
      throw { code: "REMOTE_SESSION_TARGET_CHANGED" };
  };
  validateDispatch();
  let raw: unknown;
  try {
    raw = await queuedDispatch(locator, request, signal, validateDispatch, () =>
      invoke("cmd_agent_network_management", {
        request: {
          ...locator,
          targetScope,
          method: "session.remote",
          params: { remoteSession: request },
        },
      }),
    );
  } catch (error) {
    fence();
    throw {
      code: isRemoteMutation(request)
        ? "REMOTE_SESSION_UNCONFIRMED"
        : remoteErrorCode(error),
    };
  }
  fence();
  const invalid = () => ({
    code: isRemoteMutation(request)
      ? "REMOTE_SESSION_UNCONFIRMED"
      : "REMOTE_SESSION_RESPONSE_INVALID",
  });
  if (
    new TextEncoder().encode(JSON.stringify(raw)).length >
    REMOTE_SESSION_BYTES + 4096
  )
    throw invalid();
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) throw invalid();
  const { scope, result } = parsed.data;
  if (
    scope.principalId !== locator.principalId ||
    scope.networkId !== locator.networkId ||
    scope.deviceId !== locator.deviceId ||
    (targetScope && !sameOwnedHostScope(scope, targetScope))
  )
    throw invalid();
  // The encrypted management owner can fail before producing a Session
  // projection. Preserve that diagnostic only after validating its scope.
  // A failed write still requires receipt reconciliation, never replay.
  if (result.kind === "error")
    throw {
      code: isRemoteMutation(request)
        ? "REMOTE_SESSION_UNCONFIRMED"
        : result.code,
    };
  const { data } = result;
  if (data.kind === "error") throw { code: data.code };
  if (data.agentId !== request.agentId) throw invalid();
  const expected =
    request.kind === "get"
      ? "snapshot"
      : isRemoteMutation(request)
        ? "receipt"
        : request.kind;
  if (data.kind !== expected) throw invalid();
  if (
    "sessionId" in request &&
    data.kind === "snapshot" &&
    data.sessionId !== request.sessionId
  )
    throw invalid();
  if (
    "operationId" in request &&
    data.kind === "receipt" &&
    data.operationId !== request.operationId
  )
    throw invalid();
  if (
    "sessionId" in request &&
    data.kind === "receipt" &&
    data.sessionId !== null &&
    data.sessionId !== request.sessionId
  )
    throw invalid();
  return { scope, data };
}
