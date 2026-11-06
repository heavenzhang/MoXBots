// Production result component with synthetic ledger; no session or business writes.
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TabContext, type TabContextValue } from '../../src/renderer/context/TabContext';
import { ThemeRuntimeProvider } from '../../src/renderer/theme';
import { i18n } from '../../src/renderer/i18n';
import '../../src/renderer/index.css';
import { SessionTaskOrchestrationProvider } from '../../src/renderer/components/agent-status/useSessionTaskOrchestration';
import { SessionTaskActionsContext } from '../../src/renderer/components/agent-status/SessionTaskActionsContext';
import SessionTaskResults from '../../src/renderer/components/agent-status/SessionTaskResults';
import { emptyTaskLedger, materializeExecutionTodos, mergeTaskObservations, type SessionTaskLedger } from '../../src/shared/sessionTaskOrchestration';
function fixture(scene: string): SessionTaskLedger {
  const initial = emptyTaskLedger();
  initial.executionAdmission = { requestId: 'fixture', queueId: 'queue', taskPlanId: 'layout' };
  materializeExecutionTodos(initial, 'layout', ['检查页面', '调整布局', '核对结果', '记录证据']);
  const ledger = mergeTaskObservations(initial, [], initial.plan!.map(todo => ({ ...todo, status: 'completed' })), 'queue');
  if (scene === 'accepted') ledger.reviews = ledger.tasks.map(task => ({ taskId: task.id, attemptId: 'main', decision: 'accept', evidence: '合成已核对记录' }));
  if (scene === 'child') return { revision: 1, tasks: [{ id: 'child', title: '核对页面异常与成果', blockedBy: [] }], bindings: { tool: 'child' }, currentTools: { child: 'tool' }, attempts: [{ id: 'attempt', toolUseId: 'tool', title: '核对页面异常与成果', executionVerified: true, lifecycle: { status: 'failed', result: '页面核对失败：测试样本尚未准备完整。' } }], reviews: [] };
  return ledger;
}
function Preview() {
  const [scene, setScene] = useState('main');
  const [dark, setDark] = useState(false);
  const [inspected, setInspected] = useState('');
  const tab = useMemo(() => ({ tabId: 'preview', sessionId: scene, sessionState: 'idle', isLoading: false, isSessionLoading: false, messages: [], queuedMessages: [], streamingMessage: null, agentPlanTodos: [], apiGet: async () => ({ success: true, sessionId: scene, ledger: fixture(scene) }) }) as unknown as TabContextValue, [scene]);
  return <ThemeRuntimeProvider selection={{ themeId: 'myagents-default', appearanceMode: dark ? 'dark' : 'light' }}>
    <main className="min-h-dvh bg-[var(--paper)] p-6 text-[var(--ink)]">
      <nav className="mb-6 flex flex-wrap gap-4 text-xs" aria-label="验证场景">
        <button onClick={() => setScene('main')}>四项待核验</button><button onClick={() => setScene('accepted')}>已完成历史</button><button onClick={() => setScene('child')}>异常成果</button><button onClick={() => setDark(!dark)}>切换明暗</button>
      </nav>
      <article className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-lg font-medium">页面整理</h1>
        <p className="leading-7">页面调整已整理，下面可以继续补充要求。</p>
        <TabContext.Provider value={tab}><SessionTaskOrchestrationProvider key={scene}><SessionTaskActionsContext.Provider value={{ onInspect: setInspected }}><div data-testid="results"><SessionTaskResults /></div></SessionTaskActionsContext.Provider></SessionTaskOrchestrationProvider></TabContext.Provider>
        {inspected && <p role="status">已打开成果详情：{inspected}</p>}
        <textarea aria-label="消息输入" placeholder="继续说你的想法…" className="mt-8 min-h-24 w-full rounded-xl border border-[var(--line)] bg-[var(--paper-elevated)] p-4" />
      </article>
    </main>
  </ThemeRuntimeProvider>;
}
await i18n.changeLanguage('zh-CN');
createRoot(document.getElementById('root')!).render(<Preview />);
