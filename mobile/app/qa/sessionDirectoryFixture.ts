/** Synthetic UI-only rows. Never imported by the native transport. */
export function directoryLayoutRows(now = new Date()) {
  const at = (days: number, hour: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, hour, 20).toISOString();
  return [
    { sessionId: 'qa-session-1', title: '产品方案讨论', preview: '先把会话展示和继续对话这条主线做好。', updatedAt: now.toISOString(), runtime: 'codex' },
    { sessionId: 'qa-session-2', title: '审阅接口更新', preview: '已整理出需要检查的变更，可以继续讨论返回结果。', updatedAt: at(0, 8), runtime: 'codex' },
    { sessionId: 'qa-session-3', title: '检查长代码、宽表格和很长的会话标题在窄屏上的展示', preview: '历史内容应保持可读，向上翻阅时不被新内容拉回底部。', updatedAt: at(1, 16), runtime: 'codex' },
    { sessionId: 'qa-session-4', title: '整理发布记录', preview: '按当前真实结果区分已完成、待验证和下一步。', updatedAt: at(1, 9), runtime: 'codex' },
    { sessionId: 'qa-session-5', title: '检查附件与成果预览', preview: '从原会话查看成果，返回后保留消息草稿。', updatedAt: at(3, 14), runtime: 'codex' },
    { sessionId: 'qa-session-6', title: '复盘本周进展', preview: '把尚未解决的问题和已有证据放在一起检查。', updatedAt: at(8, 10), runtime: 'codex' },
  ];
}
