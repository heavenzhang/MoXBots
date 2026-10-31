import type { Target } from './native';
import type { RecentSessionItem, SessionListItem } from './sessionPresentation';

/** Bound device work and publish each successful Bot independently of failed/slow peers. */
export async function readRecentSessions(targets: readonly Target[], read: (target: Target) => Promise<readonly SessionListItem[]>,
  isCurrent: () => boolean, publish: (rows: RecentSessionItem[], failed: number) => void, previous: readonly RecentSessionItem[] = []): Promise<void> {
  const queue = targets.filter((target) => target.online);
  const byTarget = new Map(targets.map((target) => [target.identityKey, previous.filter((row) => row.target.identityKey === target.identityKey).map((row) => ({ ...row, target }))]));
  let cursor = 0;
  let failed = targets.length - queue.length;
  const worker = async () => {
    while (isCurrent() && cursor < queue.length) {
      const target = queue[cursor++];
      try {
        const sessions = await read(target);
        if (!isCurrent()) return;
        byTarget.set(target.identityKey, sessions.map((row) => ({ ...row, target })));
      } catch {
        if (!isCurrent()) return;
        failed += 1;
        byTarget.set(target.identityKey, (byTarget.get(target.identityKey) ?? []).map((row) => ({ ...row, target: { ...target, online: false } })));
      }
      publish([...byTarget.values()].flat(), failed);
    }
  };
  if (isCurrent()) publish([...byTarget.values()].flat(), failed);
  await Promise.all(Array.from({ length: Math.min(2, queue.length) }, worker));
}
