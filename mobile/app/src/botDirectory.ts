import type { Snapshot, Target } from './native';
import type { SessionListItem } from './sessionPresentation';

export type BotSession = SessionListItem & { target: Target; state?: Snapshot['state']; terminal?: Snapshot['terminal']; observedAt?: number };
export type BotDirectoryPage = { target: Target; sessions: BotSession[]; error: string | null; hasMore: boolean; loadedAt: number };
export const botKey = (target: Pick<Target, 'targetId' | 'identityKey' | 'agentId'>) => JSON.stringify([target.targetId, target.identityKey, target.agentId]);
export const botSessionKey = (row: Pick<BotSession, 'target' | 'sessionId'>) => JSON.stringify([botKey(row.target), row.sessionId]);
export function recentBotSessions(pages: readonly BotDirectoryPage[]): BotSession[] {
  return pages.flatMap(page => page.sessions.map(row => ({ ...row, target: page.target })))
    .sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) || botSessionKey(a).localeCompare(botSessionKey(b)));
}
export function applyBotSnapshot(rows: readonly BotSession[], target: Target, snapshot: Snapshot, now = Date.now()): BotSession[] {
  if (snapshot.agentId !== target.agentId) return [...rows];
  return rows.map(row => botKey(row.target) === botKey(target) && row.sessionId === snapshot.sessionId
    ? { ...row, title: snapshot.title, state: snapshot.state, terminal: snapshot.terminal, observedAt: now,
      preview: snapshot.messages.at(-1)?.content.slice(0, 180) || row.preview } : row);
}
export function botSessionStatus(row: BotSession): { label: string; tone: 'neutral' | 'active' | 'attention' | 'error'; detail: string } {
  if (!row.target.online) return { label: '设备离线', tone: 'neutral', detail: '恢复连接后可继续；已有会话仍保留' };
  if (row.state === 'waiting_user_action') return { label: '需要你', tone: 'attention', detail: '打开会话，核对当前请求后处理' };
  if (row.state === 'running') return { label: '进行中', tone: 'active', detail: '可以继续补充要求' };
  if (row.terminal === 'error' || row.terminal === 'interrupted') return { label: '执行中断', tone: 'error', detail: '查看已完成部分和当前状态' };
  if (row.terminal === 'stopped') return { label: '已停止', tone: 'neutral', detail: '打开原会话继续沟通' };
  if (row.terminal === 'complete') return { label: '本轮已结束', tone: 'neutral', detail: '查看结果或继续修改' };
  return { label: '继续会话', tone: 'neutral', detail: '打开后同步最新进展' };
}

/** A read-only catalog index; it never changes the active execution owner or retries mutations. */
export async function readBotDirectory<T>(targets: readonly T[], read: (target: T) => Promise<void>, isCurrent: () => boolean, concurrency = 3): Promise<void> {
  let cursor = 0;
  const worker = async () => { while (isCurrent()) { const index = cursor++; if (index >= targets.length) return; await read(targets[index]); } };
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
}
