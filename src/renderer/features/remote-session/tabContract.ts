import type { TabBase } from "@/tab-workspace/contracts";
import type { HostLocator } from "@/api/hostManagement";
import type { OwnedHostScope } from "@/api/ownedHostManagement";
import type { RemoteSnapshot } from "../../../shared/remoteSession";

/** Ephemeral UI observation. The target Session remains authoritative and
 * the persistence codec deliberately excludes this projection. */
export interface RemoteSessionObservation {
  title: string;
  state: RemoteSnapshot["state"] | NonNullable<RemoteSnapshot["terminal"]> | "draft";
  sync: "loading" | "current" | "offline" | "error";
  lastSyncedAt: number | null;
  hasUnread: boolean;
}
export interface RemoteSessionOpenIntent {
  title: string;
  locator: HostLocator;
  agentId: string;
  agentName: string;
  deviceName: string;
  sessionId?: string;
  targetScope?: OwnedHostScope | null;
}
export interface RemoteSessionTab extends TabBase<"remote-session"> {
  locator: HostLocator;
  agentId: string;
  agentName: string;
  deviceName: string;
  sessionId: string | null;
  targetScope: OwnedHostScope | null;
  observation?: RemoteSessionObservation & { authGeneration: number };
}
export interface RemoteSessionBinding {
  onOpenNetwork?: () => void;
  onObservation?: (tabId: string, authGeneration: number, observation: RemoteSessionObservation) => void;
  onTarget?: (tabId: string, scope: OwnedHostScope) => void;
  onOpen: (intent: RemoteSessionOpenIntent) => void;
  onBound: (
    tabId: string,
    sessionId: string,
    scope: OwnedHostScope,
    title: string,
  ) => void;
}
export function remoteTabIdentity(
  tab: Pick<RemoteSessionTab, "locator" | "agentId" | "sessionId">,
): string {
  const l = tab.locator;
  return JSON.stringify([
    "remote-session",
    l.connectionId,
    l.principalId,
    l.networkId,
    l.deviceId,
    tab.agentId,
    tab.sessionId,
  ]);
}
