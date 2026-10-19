// Synthetic component acceptance only; no real Session or Sidecar calls.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TabContext, type TabContextValue } from '../../src/renderer/context/TabContext';
import { ThemeRuntimeProvider } from '../../src/renderer/theme';
import { i18n } from '../../src/renderer/i18n';
import './preview.css';
import BackgroundTaskDialog from '../../src/renderer/components/agent-status/BackgroundTaskDialog';
import type { BackgroundTaskDetail } from '../../src/shared/types/background-task';

const identity = { taskId: 'synthetic-shell', runId: 'run-1', queryId: 'preview-query' };
let allowed = false;
let reject = false;
const detail = (): BackgroundTaskDetail => ({ taskId: identity.taskId, toolUseId: 'synthetic-tool', runId: identity.runId,
  continuation: { identity, acknowledged: allowed }, taskType: 'local_bash', status: 'running',
  description: '隔离测试服务 · 合成数据', command: 'test-server --loopback-only', output: 'Synthetic server ready. No business data.',
  outputState: 'ready', truncated: false, totalBytes: 48, updatedAt: Date.now() });
function Preview() {
  const [open, setOpen] = useState(true);
  const tab = { tabId: 'synthetic-tab', sessionId: 'synthetic-session', apiGet: async () => ({ success: true, task: detail() }),
    apiPost: async (_url: string, body: { allow: boolean }) => {
      if (!reject) allowed = body.allow;
      return { allow: body.allow, acknowledged: reject ? [] : [identity], rejected: reject ? [{ taskId: identity.taskId, reason: 'changed' }] : [] };
    }, messages: [], sessionState: 'idle' } as unknown as TabContextValue;
  return <ThemeRuntimeProvider selection={{ themeId: 'myagents-default', appearanceMode: 'light' }}><TabContext.Provider value={tab}>
    <main className="min-h-dvh bg-[var(--paper)] p-5 text-[var(--ink)]">
      <h1>后台接续 · 真实组件合成验收</h1><p>不连接真实任务，不调用模型或业务接口。</p>
      <button onClick={() => setOpen(true)}>打开任务详情</button>
      <button onClick={() => { reject = !reject; }}>切换模拟拒绝</button>
      {open && <BackgroundTaskDialog subagent={{ id: 'synthetic-tool', mode: 'background', agentType: 'local_bash', description: '合成服务', status: 'running', startedAt: Date.now(), inputTokens: 0, outputTokens: 0, toolCount: 0 }} sessionId="synthetic-session" messages={[]} onClose={() => setOpen(false)} onJumpToTool={() => {}} />}
    </main>
  </TabContext.Provider></ThemeRuntimeProvider>;
}
await i18n.changeLanguage('zh-CN');
createRoot(document.getElementById('root')!).render(<Preview />);
