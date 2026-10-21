// Process-local 请外援 availability, read by the system prompt. Leaf module:
// `agent-session.ts` imports only this, so it never pulls the tier table (and
// with it title-generator → agent-session) into the prompt path.

let routeAssistAvailable = false;

/** Called by the Session owner (Query replacement) from the effective config. */
export function setRouteAssistAvailable(available: boolean): void {
  routeAssistAvailable = available;
}

/** True when the current Session can ask another tier model for help. */
export function getRouteAssistEnabled(): boolean {
  return routeAssistAvailable;
}
