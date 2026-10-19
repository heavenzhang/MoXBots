import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import GoalStatusBar from '@/components/goal/GoalStatusBar';
import { ThemeRuntimeProvider } from '@/theme';
import { i18n } from '@/i18n';
import type { SessionGoal } from '@/types/sessionGoal';
import '@/index.css';
void i18n.changeLanguage('zh-CN');
const sample: SessionGoal = {
  id: 'fixture', sessionId: 'fixture', workspacePath: '/synthetic', objective: '完成四个阶段，保留已经确认的进度',
  status: 'paused', terminalReason: '响应超时（10 分钟无活动），目标需恢复，进度已保留。请核对执行结果后继续。',
  endConditions: { aiCanExit: true }, notifyEnabled: true, permissionMode: '', turnCount: 3,
  createdAt: '2026-10-20', updatedAt: '2026-10-20', totalDurationMs: 125000, totalTokens: 12345,
  revision: 1, controlRevision: 1,
};
function Preview() {
  const [goal, setGoal] = useState(sample);
  const [receipt, setReceipt] = useState('');
  return <ThemeRuntimeProvider selection={{ themeId: 'myagents-default', appearanceMode: 'light' }}>
    <main className="min-h-screen bg-[var(--paper)] p-4 text-[var(--ink)]">
      <p className="mb-8 text-sm">合成组件验收，不连接真实任务</p>
      <GoalStatusBar goal={goal} onResume={() => { setGoal({ ...goal, status: 'active', terminalReason: undefined }); setReceipt('resume:1'); }} onCancel={() => setReceipt('cancel:1')} />
      <output>{receipt}</output>
    </main>
  </ThemeRuntimeProvider>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
