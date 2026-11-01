/** Exact owner keys retained when a birth acknowledgement is uncertain. */
export interface SidebarBirthReceipt {
  pendingSessionId: string;
  preparedSessionId?: string;
  ownerSessionId: string;
}
/** UI handoff receipt; it does not assert first-message delivery. */
export type SidebarConversationLaunchResult =
  | { status: 'opened' }
  | { status: 'not-started' }
  | { status: 'uncertain'; tabId?: string; birthReceipt?: SidebarBirthReceipt };

/** App marks the boundary before metadata creation or Chat takes message ownership. */
export interface SidebarConversationLaunchAttempt {
  sideEffectsStarted: boolean;
  tabId: string;
  birthReceipt?: SidebarBirthReceipt;
}
