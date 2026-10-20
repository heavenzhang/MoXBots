import type { Snapshot } from './native';
import type { ViewOwner } from './operationPolicy';

type Page = Pick<Snapshot, 'agentId' | 'sessionId' | 'messages' | 'hasMoreBefore' | 'nextBefore'>;
/** Reading projection only. Never supplies generation, approvals or send authority. */
export type TranscriptHistory = Page & { expanded: boolean };

export function sessionSnapshotReady(owner: ViewOwner, snapshot: Pick<Snapshot, 'agentId' | 'sessionId'> | null): boolean {
  if (owner.screen !== 'chat' || !owner.targetId || !owner.agentId) return false;
  return owner.sessionId === null ? snapshot === null
    : snapshot?.agentId === owner.agentId && snapshot.sessionId === owner.sessionId;
}

export function latestTranscript(page: Page): TranscriptHistory {
  return { agentId: page.agentId, sessionId: page.sessionId, messages: page.messages,
    hasMoreBefore: page.hasMoreBefore, nextBefore: page.nextBefore, expanded: false };
}

export function refreshTranscript(prior: TranscriptHistory | null, page: Page): TranscriptHistory {
  if (!prior?.expanded || prior.agentId !== page.agentId || prior.sessionId !== page.sessionId) return latestTranscript(page);
  const anchor = page.messages[0]?.id;
  const overlap = anchor ? prior.messages.findIndex(message => message.id === anchor) : -1;
  // A replaced/disjoint history cannot be stitched into an apparently continuous transcript.
  if (overlap < 0) return latestTranscript(page);
  return { ...prior, messages: [...prior.messages.slice(0, overlap), ...page.messages] };
}

export function prependTranscript(prior: TranscriptHistory, page: Page, before: string): TranscriptHistory {
  if (prior.agentId !== page.agentId || prior.sessionId !== page.sessionId || prior.messages[0]?.id !== before
    || prior.nextBefore !== before || !page.messages.length
    || page.hasMoreBefore && (!page.nextBefore || page.nextBefore !== page.messages[0]?.id || page.nextBefore === before)) {
    throw new Error('SESSION_HISTORY_PAGE_INVALID');
  }
  const ids = new Set(prior.messages.map(message => message.id));
  for (const message of page.messages) {
    if (ids.has(message.id)) throw new Error('SESSION_HISTORY_PAGE_INVALID');
    ids.add(message.id);
  }
  return { ...prior, messages: [...page.messages, ...prior.messages], hasMoreBefore: page.hasMoreBefore,
    nextBefore: page.nextBefore, expanded: true };
}
