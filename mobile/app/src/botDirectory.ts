import type { Snapshot, Target } from './native';
import type { SessionListItem } from './sessionPresentation';

export type BotSession = SessionListItem & { target: Target; state?: Snapshot['state']; terminal?: Snapshot['terminal']; observedAt?: number; statusReadFailed?: boolean };
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
  if (row.state === 'unavailable') return { label: '进展暂不可用', tone: 'error', detail: '打开原会话重新同步，不会自动执行' };
  if (row.state === 'waiting_user_action') return { label: '需要你', tone: 'attention', detail: '打开会话，核对当前请求后处理' };
  if (row.state === 'running') return { label: '进行中', tone: 'active', detail: '可以继续补充要求' };
  if (row.terminal === 'error' || row.terminal === 'interrupted') return { label: '执行中断', tone: 'error', detail: '查看已完成部分和当前状态' };
  if (row.terminal === 'stopped') return { label: '已停止', tone: 'neutral', detail: '打开原会话继续沟通' };
  if (row.terminal === 'complete') return { label: '本轮已结束', tone: 'neutral', detail: '本轮结束不代表任务已验收；可查看成果或继续修改' };
  if (row.state === undefined) return { label: row.statusReadFailed ? '状态同步未成功' : '状态待同步', tone: 'neutral', detail: '会话仍保留，打开后核对最新进展' };
  return { label: '可以继续', tone: 'neutral', detail: '打开原会话，补充下一步要求' };
}

/** A read-only catalog index; it never changes the active execution owner or retries mutations. */
export async function readBotDirectory<T>(targets: readonly T[], read: (target: T) => Promise<void>, isCurrent: () => boolean, concurrency = 3): Promise<void> {
  let cursor = 0;
  const worker = async () => { while (isCurrent()) { const index = cursor++; if (index >= targets.length) return; await read(targets[index]); } };
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
}

/** A directory card opens the original Session; it never resumes or retries a mutation. */
export function botSessionAction(row: BotSession): string {
  if (!row.target.online) return '查看已有记录';
  if (row.state === 'waiting_user_action') return '查看请求';
  if (row.state === 'running') return '查看进展';
  if (row.state === 'unavailable') return '核对状态';
  if (row.terminal === 'error' || row.terminal === 'interrupted') return '核对状态';
  return '打开原会话';
}

/** Counts describe observed states only; an unread Session is never an empty inbox. */
export function botStatusCoverage(rows: readonly BotSession[]) {
  const online = rows.filter(row => row.target.online);
  const known = online.filter(row => row.state !== undefined).length;
  return { total: rows.length, known, unread: online.length - known, failed: online.filter(row => row.statusReadFailed).length, offline: rows.length - online.length };
}

/** Explicit batches retain the existing twelve-Session / three-reader budget. */
export function nextBotStatusBatch(rows: readonly BotSession[]): BotSession[] {
  const candidates = rows.filter(row => row.target.online && (row.state === undefined || row.statusReadFailed));
  return [...candidates.filter(row => !row.statusReadFailed), ...candidates.filter(row => row.statusReadFailed)].slice(0, 12);
}
