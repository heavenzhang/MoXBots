import type { Snapshot } from './native';

export type WorkAction = 'compose' | 'requests' | 'query' | 'read';
export type WorkProgress = { title: string; detail: string; tone: 'neutral' | 'active' | 'attention' | 'error'; action: WorkAction; actionLabel: string };

/** Presentation only: an action selects an existing UI path, never execution authority. */
export function conversationWorkProgress(input: {
  snapshot: Snapshot | null; online: boolean; awaiting: boolean; reading: boolean;
  sending: boolean; receipt: 'processing' | 'unknown' | null;
}): WorkProgress {
  if (input.awaiting) return { title: input.reading ? '正在同步原会话' : '原会话待同步', detail: '读取成功前不会新建或发送，已有草稿保留。', tone: 'neutral', action: 'read', actionLabel: '重新同步' };
  if (input.sending) return { title: '正在提交本次操作', detail: '等待接收结果，原文会保留。', tone: 'active', action: 'compose', actionLabel: '正在提交' };
  if (input.receipt) return { title: input.receipt === 'processing' ? '消息接收确认中' : '消息接收状态待确认', detail: '只核对这一条提交，不会自动重新发送。', tone: 'attention', action: 'query', actionLabel: '查询接收状态' };
  if (!input.online) return { title: '设备离线', detail: '可先写下补充要求，连接恢复后再发送。', tone: 'neutral', action: 'compose', actionLabel: '继续写草稿' };
  const snapshot = input.snapshot;
  if (!snapshot) return { title: '准备开始工作', detail: '第一条消息发送后才会创建会话。', tone: 'neutral', action: 'compose', actionLabel: '写下要求' };
  if (snapshot.state === 'unavailable') return { title: '当前进展暂不可用', detail: '保留已有记录，重新同步后再核对下一步。', tone: 'error', action: 'read', actionLabel: '重新同步' };
  if (snapshot.state === 'waiting_user_action') {
    const count = snapshot.interactions.filter(item => item.actionable && item.generation === snapshot.generation && item.turnId === snapshot.turnId).length;
    return count
      ? { title: '需要你处理', detail: `${count} 项当前请求等待你核对，处理后沿原会话继续。`, tone: 'attention', action: 'requests', actionLabel: '查看当前请求' }
      : { title: '等待处理信息', detail: '当前没有可在手机提交的请求，请同步核对或在原设备处理。', tone: 'attention', action: 'read', actionLabel: '重新同步' };
  }
  if (snapshot.state === 'running') return { title: '正在推进这项工作', detail: '可以补充要求，消息和成果仍归属当前会话。', tone: 'active', action: 'compose', actionLabel: '补充要求' };
  if (snapshot.terminal === 'error' || snapshot.terminal === 'interrupted') return { title: '本轮执行中断', detail: '先核对已有回复和成果，再决定如何继续。', tone: 'error', action: 'compose', actionLabel: '补充说明' };
  if (snapshot.terminal === 'complete') return { title: '本轮已结束', detail: '本轮结束不代表任务已验收；可查看成果或继续修改。', tone: 'neutral', action: 'compose', actionLabel: '继续补充' };
  if (snapshot.terminal === 'stopped') return { title: '本轮已停止', detail: '已有会话和成果入口保留，可补充下一步要求。', tone: 'neutral', action: 'compose', actionLabel: '继续补充' };
  return { title: '可以继续这项工作', detail: '沿当前 Bot 和原会话补充下一步要求。', tone: 'neutral', action: 'compose', actionLabel: '继续补充' };
}

/** Show original excerpts, not an inferred task summary or another Session's history. */
export function conversationWorkExcerpts(snapshot: Snapshot | null) {
  if (!snapshot) return { request: null, reply: null, partial: false };
  const messages = snapshot.messages;
  const requestIndex = messages.findLastIndex(message => message.role === 'user');
  const request = requestIndex < 0 ? null : messages[requestIndex];
  const reply = messages.slice(Math.max(0, requestIndex + 1)).findLast(message => message.role === 'assistant' && message.content.trim()) ?? null;
  return { request, reply, partial: snapshot.hasMoreBefore };
}
