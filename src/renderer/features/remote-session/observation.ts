import type { NetworkSnapshot } from "@/api/agentNetwork";
import type { RemoteSnapshot } from "../../../shared/remoteSession";
import { remoteAccountState } from "./accountFence";
import type { RemoteSessionObservation, RemoteSessionTab } from "./tabContract";

/** Revision includes metadata and paging; only visible content/interaction
 * changes should mark a background conversation unread. */
export function remoteActivityKey(snapshot: RemoteSnapshot): string {
  return JSON.stringify([snapshot.messages, snapshot.interactions]);
}

export function applyRemoteObservation(
  tab: RemoteSessionTab,
  current: NetworkSnapshot | null | undefined,
  authGeneration: number,
  observation: RemoteSessionObservation,
): RemoteSessionTab {
  if (!current || remoteAccountState(tab.locator, current) !== "match" ||
      current.authGeneration !== authGeneration) return tab;
  return {
    ...tab,
    title: observation.title || tab.title,
    observation: { ...observation, authGeneration },
  };
}

export function currentRemoteObservation(tab: RemoteSessionTab, current: NetworkSnapshot | null | undefined) {
  return current && remoteAccountState(tab.locator, current) === "match" &&
    current.authGeneration === tab.observation?.authGeneration ? tab.observation : undefined;
}
