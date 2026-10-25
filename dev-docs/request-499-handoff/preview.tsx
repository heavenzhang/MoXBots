// Isolated synthetic acceptance surface; imports the actual production component.
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TabContext, type TabContextValue } from '../../src/renderer/context/TabContext';
import { ThemeRuntimeProvider } from '../../src/renderer/theme';
import { i18n } from '../../src/renderer/i18n';
import '../../src/renderer/index.css';
import ExecutionStatusBar from '../../src/renderer/components/agent-status/ExecutionStatusBar';
import { emptyTaskLedger } from '../../src/shared/sessionTaskOrchestration';
const ledger = { ...emptyTaskLedger(), revision: 1, plan: [
  { key: 'fix', content: '修复排队请求的恢复交接', status: 'completed' as const },
  { key: 'verify', content: '验证停止与继续执行', activeForm: '正在验证停止与继续执行', status: 'in_progress' as const },
  { key: 'deliver', content: '提交、构建并更换本地客户端', status: 'pending' as const },
] };
function Preview() {
  const [running, setRunning] = useState(true);
  const apiGet = useRef(async () => ({ success: true, sessionId: 'isolated-499-preview', ledger })).current;
  const tab = { tabId: 'isolated-499-tab', sessionId: 'isolated-499-preview', messages: [],
    agentPlanTodos: ledger.plan, sessionState: running ? 'running' : 'idle', isLoading: running,
    isSessionLoading: false, apiGet, hasMoreBefore: false, streamingMessage: null } as unknown as TabContextValue;
  return <ThemeRuntimeProvider selection={{ themeId: 'myagents-default', appearanceMode: 'dark' }}>
    <TabContext.Provider value={tab}><main className="min-h-dvh bg-[var(--paper)] p-6 text-[var(--ink)]">
      <h1 className="text-lg font-semibold">恢复交接与任务状态</h1>
      <p className="my-3 text-sm text-[var(--ink-muted)]">隔离合成验收 · 实际产品组件 · 不访问真实会话</p>
      <div className="mb-6 flex gap-4"><button onClick={() => setRunning(false)}>模拟执行停止</button>
        <button onClick={() => setRunning(true)}>模拟新请求开始</button></div>
      <ExecutionStatusBar activity={{ containerRef: { current: null }, onJumpToTool: () => {}, onSelectSubagent: () => {} }} />
    </main></TabContext.Provider></ThemeRuntimeProvider>;
}
await i18n.changeLanguage('zh-CN');
createRoot(document.getElementById('root')!).render(<Preview />);
