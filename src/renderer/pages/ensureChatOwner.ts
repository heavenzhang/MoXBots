import type { SessionMetadata } from "@/api/sessionClient";

export type ChatOwner = { sessionId: string; workspacePath?: string };
export type ChatOwnerMaterialization = {
  sessionId: string;
  metadata: SessionMetadata;
};
export type ChatOwnerFlight = {
  pendingSessionId: string;
  promise: Promise<ChatOwner>;
};

export async function ensureChatOwner(options: {
  expectedSessionId?: string | null;
  currentSessionId: { current: string | null };
  flight: { current: ChatOwnerFlight | null };
  adopted: { current: { pendingSessionId: string; owner: ChatOwner } | null };
  isPendingSessionId: (id: string) => boolean;
  workspacePath?: string;
  materialize: (pendingSessionId: string) => Promise<ChatOwnerMaterialization>;
  adopt: (sessionId: string) => Promise<boolean>;
  setSessionMeta: (metadata: SessionMetadata) => void;
}): Promise<ChatOwner> {
  const { expectedSessionId, currentSessionId, flight } = options;
  if (!expectedSessionId) throw new Error("Chat requires a session identity.");
  if (flight.current?.pendingSessionId === expectedSessionId)
    return flight.current.promise;
  if (currentSessionId.current !== expectedSessionId) {
    const priorAdoption = options.adopted.current;
    if (
      priorAdoption?.pendingSessionId === expectedSessionId &&
      currentSessionId.current === priorAdoption.owner.sessionId
    )
      return priorAdoption.owner;
    throw new Error(
      "The active chat changed before its first message could be sent.",
    );
  }
  if (!options.isPendingSessionId(expectedSessionId))
    return {
      sessionId: expectedSessionId,
      workspacePath: options.workspacePath,
    };
  if (!options.workspacePath)
    throw new Error("Cannot create a session owner without a workspace path.");

  const promise = (async () => {
    const result = await options.materialize(expectedSessionId);
    if (currentSessionId.current !== expectedSessionId)
      throw new Error(
        "The active chat changed before its session owner was adopted.",
      );
    if (!(await options.adopt(result.sessionId)))
      throw new Error(`Failed to adopt chat session ${result.sessionId}.`);
    options.setSessionMeta(result.metadata);
    const owner = {
      sessionId: result.sessionId,
      workspacePath: options.workspacePath,
    };
    options.adopted.current = { pendingSessionId: expectedSessionId, owner };
    return owner;
  })();
  flight.current = { pendingSessionId: expectedSessionId, promise };
  try {
    return await promise;
  } finally {
    if (flight.current?.promise === promise) flight.current = null;
  }
}
