import type { RemoteMessage } from "../../../shared/remoteSession";
import type { Message, ContentBlock } from "@/types/chat";

const presentationCache = new WeakMap<
  RemoteMessage,
  { label: string; message: Message }
>();

/** Keep immutable unchanged rows stable even when a transport parses fresh JSON. */
export function reconcileRemoteMessages(
  next: readonly RemoteMessage[],
  previous: readonly RemoteMessage[],
): RemoteMessage[] {
  const known = new Map(previous.map((message) => [message.id, message]));
  return next.map((message) => {
    const existing = known.get(message.id);
    return existing && JSON.stringify(existing) === JSON.stringify(message)
      ? existing
      : message;
  });
}

/** Observation-only adapter: never accept local attachments, input, anchors or executable cards. */
export function presentRemoteTranscript(
  messages: readonly RemoteMessage[],
  truncatedLabel: string,
): Message[] {
  return messages.map((message) => {
    const cached = presentationCache.get(message);
    if (cached?.label === truncatedLabel) return cached.message;
    const content: ContentBlock[] = [];
    if (message.content) content.push({ type: "text", text: message.content });
    for (const tool of message.tools)
      content.push({
        id: `${message.id}:${tool.id}`,
        type: "tool_use",
        tool: {
          id: tool.id,
          streamIndex: 0,
          name: tool.name,
          input: {},
          result: tool.summary,
          presentation: { kind: "text", status: tool.status },
        },
      });
    const milliseconds = Date.parse(message.timestamp);
    const result: Message = {
      id: message.id,
      role: message.role,
      content: message.role === "user" ? message.content : content,
      timestamp: new Date(Number.isFinite(milliseconds) ? milliseconds : 0),
      timestampKnown: Number.isFinite(milliseconds),
      presentationNotice: message.truncated ? truncatedLabel : undefined,
    };
    presentationCache.set(message, { label: truncatedLabel, message: result });
    return result;
  });
}
