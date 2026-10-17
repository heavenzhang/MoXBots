export type NotificationOpenIntent = Readonly<{ eventId: string; revision: number }>;
const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A push is only a hint. Ignore links, session IDs, approval actions and text. */
export function notificationEventId(response: unknown, defaultAction: string): string | null {
  if (!response || typeof response !== 'object') return null;
  const candidate = response as { actionIdentifier?: unknown; notification?: { request?: { content?: { data?: unknown } } } };
  if (candidate.actionIdentifier !== defaultAction) return null;
  const data = candidate.notification?.request?.content?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const eventId = (data as { eventId?: unknown }).eventId;
  return typeof eventId === 'string' && canonicalUuid.test(eventId) ? eventId : null;
}

/** One latest explicit tap, fenced by reference; no persistent action/receipt ledger. */
export class NotificationOpenQueue {
  private pending: NotificationOpenIntent | null = null;
  private revision = 0;
  private completed: string[] = [];
  private listeners = new Set<() => void>();

  receive(eventId: string, explicitTap = false): boolean {
    if (!canonicalUuid.test(eventId) || (!explicitTap && this.completed.includes(eventId)) || this.pending?.eventId === eventId) return false;
    this.pending = Object.freeze({ eventId, revision: ++this.revision });
    for (const listener of this.listeners) listener();
    return true;
  }
  peek(): NotificationOpenIntent | null { return this.pending; }
  isCurrent(intent: NotificationOpenIntent): boolean { return this.pending === intent; }
  complete(intent: NotificationOpenIntent): boolean {
    if (!this.isCurrent(intent)) return false;
    this.completed = this.completed.filter((eventId) => eventId !== intent.eventId);
    this.completed.push(intent.eventId);
    if (this.completed.length > 16) this.completed.shift();
    this.pending = null;
    return true;
  }
  dismiss(intent: NotificationOpenIntent): void { this.complete(intent); }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
}

export const notificationOpens = new NotificationOpenQueue();

/** A delayed token refresh must never reverse a newer explicit disable. */
export class NotificationPreferenceFence {
  private revision = 0;
  private blocked = false;
  beginChange(): number { this.blocked = true; return ++this.revision; }
  isChangeCurrent(revision: number): boolean { return this.revision === revision; }
  confirmEnabled(revision: number): void { if (this.isChangeCurrent(revision)) this.blocked = false; }
  captureAutoRefresh(): number | null { return this.blocked ? null : this.revision; }
  isAutoRefreshCurrent(revision: number | null): boolean { return revision !== null && !this.blocked && this.revision === revision; }
}

export function notificationSnapshotMatches(
  expected: { agentId: string; sessionId: string },
  actual: { kind: string; agentId?: string; sessionId?: string },
): boolean {
  return actual.kind === 'snapshot' && actual.agentId === expected.agentId && actual.sessionId === expected.sessionId;
}
