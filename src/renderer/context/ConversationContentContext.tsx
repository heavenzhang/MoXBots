import { createContext, useContext } from "react";

/** Presentation trust only. This never selects a Session or grants execution authority. */
export const ConversationContentContext = createContext<"local" | "remote">(
  "local",
);
export function useRemoteConversationContent(): boolean {
  return useContext(ConversationContentContext) === "remote";
}
