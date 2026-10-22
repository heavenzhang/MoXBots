import type { SessionMetadata, SessionStats } from '../types/session';

export type ClientSessionStats = Omit<SessionStats, 'messageCount'> & {
  turnCount: number;
};

export type ClientSessionMetadata<T extends { stats?: SessionStats }> = Omit<T, 'stats' | 'taskOrchestration'> & {
  stats?: ClientSessionStats;
};

/** Keep the legacy storage key on disk while exposing the real turn semantics. */
export function toClientSessionMetadata<T extends Pick<SessionMetadata, 'stats'> & {
  providerEnvJson?: string;
  taskOrchestration?: SessionMetadata['taskOrchestration'];
}>(meta: T): ClientSessionMetadata<T> {
  // The active Session's dedicated snapshot/event owns this potentially large
  // ledger. Generic history/list metadata must not invalidate on every attempt.
  const { stats, providerEnvJson, taskOrchestration: _taskOrchestration, ...rest } = meta;
  return {
    ...rest,
    ...(providerEnvJson !== undefined ? { providerEnvJson: '[redacted]' } : {}),
    ...(stats ? {
      stats: {
        turnCount: stats.messageCount,
        totalInputTokens: stats.totalInputTokens,
        totalOutputTokens: stats.totalOutputTokens,
        totalCacheReadTokens: stats.totalCacheReadTokens,
        totalCacheCreationTokens: stats.totalCacheCreationTokens,
      },
    } : {}),
  } as ClientSessionMetadata<T>;
}
