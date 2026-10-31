import type { Target } from './native';

export type SessionListItem = {
  sessionId: string;
  title: string;
  preview: string;
  updatedAt: string;
  runtime: string;
};

export type RecentSessionItem = SessionListItem & { target: Target };

/** Preserve origin and stable ties; unknown dates belong after timestamped sessions. */
export function recentSessionRows(rows: readonly RecentSessionItem[], search: string): RecentSessionItem[] {
  const query = search.trim().toLocaleLowerCase();
  const timestamp = (value: string) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
  };
  return rows.filter((row) => !query || `${row.title}\n${row.preview}\n${row.target.name}\n${row.target.deviceName}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => {
      const aTime = timestamp(a.updatedAt);
      const bTime = timestamp(b.updatedAt);
      return aTime === bTime ? 0 : aTime > bTime ? -1 : 1;
    });
}

export function conversationStatus(state: string | undefined, online: boolean | undefined): string {
  if (online === false) return '离线';
  if (state === 'running') return '正在执行';
  if (state === 'waiting_user_action') return '等待确认';
  if (state === 'unavailable') return '暂不可用';
  if (state === 'idle') return '可继续';
  return online ? '在线' : '未连接';
}

export function filterSessionRows(rows: readonly SessionListItem[], search: string): SessionListItem[] {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return [...rows];
  return rows.filter((row) => `${row.title}\n${row.preview}`.toLocaleLowerCase().includes(query));
}

export function sessionDateGroup(updatedAt: string, now = new Date()): string {
  const date = new Date(updatedAt);
  if (!Number.isFinite(date.getTime())) return '会话';
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  if (date.getTime() >= start) return '今天';
  if (date.getTime() >= yesterday) return '昨天';
  return date.getFullYear() === now.getFullYear() ? `${date.getMonth() + 1}月` : `${date.getFullYear()}年`;
}

export function sessionUpdatedLabel(updatedAt: string, now = new Date()): string {
  const date = new Date(updatedAt);
  if (!Number.isFinite(date.getTime())) return '';
  const age = now.getTime() - date.getTime();
  if (age >= 0 && age < 60_000) return '刚刚';
  if (age >= 0 && age < 3_600_000) return `${Math.floor(age / 60_000)}分钟前`;
  return sessionDateGroup(updatedAt, now) === '今天'
    ? `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
    : `${date.getMonth() + 1}月${date.getDate()}日`;
}
