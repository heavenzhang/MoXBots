import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon, ChevronRightIcon, CloseIcon, MonitorIcon, PlusIcon } from "@/components/icons";
import Tip from "@/components/Tip";
import { useAgentNetworkRegistry } from "@/features/agent-network/store";
import { remoteAccountState } from "./accountFence";
import { currentRemoteObservation } from "./observation";
import { remoteTabIdentity, type RemoteSessionTab } from "./tabContract";

/** Navigation-only projection of App's existing remote Tabs. No second list
 * store, Session owner, or remote mutation belongs to the sidebar. */
export function RemoteSessionSidebar({ tabs, activeTabId, onSelect, onClose, onOpen }: {
  tabs: readonly RemoteSessionTab[];
  activeTabId?: string;
  onSelect?: (tabId: string) => void;
  onClose?: (tabId: string) => void;
  onOpen?: () => void;
}) {
  const { t } = useTranslation("app");
  const registry = useAgentNetworkRegistry();
  const [expanded, setExpanded] = useState(true);
  const chosen = new Map<string, RemoteSessionTab>();
  const rank = (tab: RemoteSessionTab) => {
    const current = registry.connections.find(item => item.id === tab.locator.connectionId)?.snapshot;
    return (current?.authGeneration === tab.locator.authGeneration ? 2 : 0) + (activeTabId === tab.id ? 1 : 0);
  };
  for (const tab of tabs) {
    const identity = remoteTabIdentity(tab), previous = chosen.get(identity);
    if (!previous || rank(tab) > rank(previous)) chosen.set(identity, tab);
  }
  const rows = [...chosen.values()].flatMap(tab => {
    const connection = registry.connections.find(item => item.id === tab.locator.connectionId);
    const current = connection?.snapshot;
    const account = remoteAccountState(tab.locator, current);
    if (account === "mismatch") return [];
    const observation = currentRemoteObservation(tab, current);
    // A previous account/generation's title must not survive identity hydration.
    const verified = account === "match" && current?.authGeneration === tab.locator.authGeneration;
    const title = observation?.title || (verified ? tab.title || tab.agentName : t("remoteSession.remote"));
    const state = account === "pending" ? "loading" : current?.state !== "ready" || connection?.removing
      ? "offline" : observation?.sync === "error" ? "unavailable" : observation?.state ?? "loading";
    return [{ tab, title, state, observation, verified }];
  });
  if (!rows.length) return null;
  return (
    <section className="shrink-0 px-2 pb-3" aria-label={t("remoteSession.sidebar.title")} data-remote-session-sidebar>
      <div className="flex h-8 items-center gap-1 pl-3 pr-2 text-xs text-[var(--ink-muted)]">
        <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 text-left font-semibold focus-visible:outline-2 focus-visible:outline-[var(--focus-border)]">
          {expanded ? <ChevronDownIcon className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
          {t("remoteSession.sidebar.title")}
          <span className="ml-1 rounded bg-[var(--paper-inset)] px-1.5 font-normal">{rows.length}</span>
        </button>
        {onOpen && <Tip label={t("remoteSession.openSession")} position="bottom" align="end">
          <button type="button" aria-label={t("remoteSession.openSession")} onClick={onOpen}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--paper-inset)]">
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        </Tip>}
      </div>
      {expanded && <ul className="space-y-1">
        {rows.map(({ tab, title, state, observation, verified }) => (
          <li key={tab.id} className={`group relative rounded-xl ${activeTabId === tab.id ? "bg-[var(--paper-inset)]" : "hover:bg-[var(--hover-bg)]"}`}>
            <button type="button" disabled={!onSelect} onClick={() => onSelect?.(tab.id)}
              aria-current={activeTabId === tab.id ? "page" : undefined}
              aria-label={`${title} · ${verified ? `${tab.agentName} · ${tab.deviceName}` : t("remoteSession.connectionPending")} · ${t(`remoteSession.states.${state}`)}${observation?.hasUnread ? ` · ${t("remoteSession.sidebar.unread")}` : ""}`}
              className="block w-full min-w-0 rounded-xl px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-[var(--focus-border)]">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate pr-5 font-medium">{title}</span>
                {observation?.hasUnread && <span aria-label={t("remoteSession.sidebar.unread")} className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />}
              </span>
              <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-[var(--ink-muted)]">
                <MonitorIcon className="h-3 w-3 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{verified ? `${tab.agentName} · ${tab.deviceName}` : t("remoteSession.connectionPending")}</span>
                <span className={`shrink-0 ${state === "waiting_user_action" ? "text-[var(--warning)]" : state === "running" ? "text-[var(--accent)]" : ""}`}>
                  {t(`remoteSession.states.${state}`)}
                </span>
              </span>
            </button>
            {onClose && <div className="absolute right-1.5 top-1.5"><Tip label={t("remoteSession.sidebar.close")} position="bottom" align="end">
              <button type="button" aria-label={t("remoteSession.sidebar.closeSession", { title })} onClick={() => onClose(tab.id)}
                className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--global-sidebar-bg)] text-[var(--ink-muted)] opacity-0 hover:text-[var(--ink)] focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100">
                <CloseIcon className="h-3 w-3" />
              </button>
            </Tip></div>}
          </li>
        ))}
      </ul>}
    </section>
  );
}
