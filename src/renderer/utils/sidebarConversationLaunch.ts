/** UI handoff receipt; it does not assert first-message delivery. */
export type SidebarConversationLaunchResult =
  | { status: 'opened' }
  | { status: 'not-started' }
  | { status: 'uncertain'; tabId?: string };

/** App marks the boundary before metadata creation or Chat takes message ownership. */
export interface SidebarConversationLaunchAttempt {
  sideEffectsStarted: boolean;
  tabId: string;
}
