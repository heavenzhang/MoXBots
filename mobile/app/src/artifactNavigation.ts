import type { Target } from './native';

/** Navigation-only hint kept in memory while the existing chat owner is covered by Artifacts. */
export type ArtifactChatReturn = {
  principalId: string;
  identityKey: string;
  agentId: string;
  sessionId: string;
};

let pendingReturn: ArtifactChatReturn | null = null;

export function rememberArtifactChatReturn(value: ArtifactChatReturn | null): void {
  pendingReturn = value;
}

export function peekArtifactChatReturn(): ArtifactChatReturn | null {
  return pendingReturn;
}

export function clearArtifactChatReturn(expected: ArtifactChatReturn | null): void {
  if (expected && pendingReturn === expected) pendingReturn = null;
}

/** URL/session hints never authorize access: restore only through a fresh signed-in account and target catalog. */
export function resolveArtifactReturnTarget(
  intent: ArtifactChatReturn | null,
  principalId: string | null,
  targets: readonly Target[],
): Target | null {
  if (!intent || !principalId || principalId !== intent.principalId || !intent.sessionId) return null;
  return targets.find((target) => target.identityKey === intent.identityKey
    && target.agentId === intent.agentId
    && target.online
    && target.targetId.length > 0) ?? null;
}

export function artifactReturnSnapshotMatches(
  intent: ArtifactChatReturn,
  value: { kind: string; agentId?: string; sessionId?: string },
): boolean {
  return value.kind === 'snapshot'
    && value.agentId === intent.agentId
    && value.sessionId === intent.sessionId;
}
