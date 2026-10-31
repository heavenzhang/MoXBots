// Production components, synthetic ledger only; no provider or real session access.
import { useContext, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeRuntimeProvider } from '../../src/renderer/theme';
import { TabContext } from '../../src/renderer/context/TabContext';
import { i18n } from '../../src/renderer/i18n';
import { SessionTaskOrchestrationProvider } from '../../src/renderer/components/agent-status/useSessionTaskOrchestration';
import { SessionTaskActionsContext } from '../../src/renderer/components/agent-status/SessionTaskActionsContext';
import SessionTaskResults from '../../src/renderer/components/agent-status/SessionTaskResults';
import ExecutionStatusBar from '../../src/renderer/components/agent-status/ExecutionStatusBar';
import { emptyTaskLedger, materializeExecutionTodos, mergeTaskObservations } from '../../src/shared/sessionTaskOrchestration';
import './preview.css';

const titles = ['定位并检查现有 HTML 原型及相关文件', '确认需要完善的结构、视觉层级和交互点', '修改 HTML、CSS 和 JavaScript，形成自包含页面', '将完整代码保存为可在浏览器直接打开的 HTML 文件', '在浏览器中打开并验证页面显示与交互，修复发现的问题'];
const initial = emptyTaskLedger();
initial.executionAdmission = { requestId: 'human', queueId: 'queue', taskPlanId: 'preview' };
materializeExecutionTodos(initial, 'preview', titles);
const completed = mergeTaskObservations(initial, [], initial.plan!.map(todo => ({ ...todo, status: 'completed' })), 'queue');
completed.reviews = completed.tasks.map(task => ({ taskId: task.id, attemptId: 'main', decision: 'accept', evidence: '页面与交互已核对' }));
const noop = () => undefined;
const actions = { disabled: false, onInspect: noop, onReview: async () => true, onComposeRework: noop };

function Preview() {
  const defaults = useContext(TabContext);
  const [dark, setDark] = useState(true);
  const [narrow, setNarrow] = useState(false);
  const [done, setDone] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const ledger = done ? completed : initial;
  const sessionId = done ? 'preview-completed' : 'preview-running';
  return <ThemeRuntimeProvider selection={{ themeId: 'proof', appearanceMode: dark ? 'dark' : 'light' }} persistBootstrapSnapshot={false}>
    <nav className="flex flex-wrap gap-3 p-4 text-sm">
      <button onClick={() => setDark(v => !v)}>切换明暗</button>
      <button onClick={() => setNarrow(v => !v)}>切换窄窗</button>
      <button onClick={() => setDone(v => !v)}>切换已完成</button>
      <span className="text-[var(--ink-muted)]">实际任务组件 · 合成状态验收</span>
    </nav>
    <TabContext.Provider value={{ ...defaults, tabId: 'preview', sessionId, sessionState: done ? 'idle' : 'running', isLoading: !done,
      apiGet: async <T,>() => ({ success: true, sessionId, ledger }) as T,
    }}><SessionTaskOrchestrationProvider><SessionTaskActionsContext.Provider value={actions}>
      <main ref={containerRef} style={{ width: narrow ? 390 : 768, maxWidth: '100%', margin: '32px auto' }}>
        <div className="px-4">
          <p className="mb-6 text-sm">正在核对现有页面结构，随后调整任务区域的布局与间距。</p>
          {!done && <p className="text-xs text-[var(--ink-muted)]">◌ 正在分析问题 · 本轮已用 1分钟42秒</p>}
          <SessionTaskResults />
        </div>
        <div className="px-4 pb-4 pt-4" data-preview-composer>
          <ExecutionStatusBar key={sessionId} activity={{ containerRef, onJumpToTool: noop, onSelectSubagent: noop }} />
          <div className="rounded-xl border border-[var(--line-subtle)] bg-[var(--paper-elevated)] p-3">
            <textarea aria-label="预览输入框" placeholder="补充说明…" className="min-h-12 w-full resize-none bg-transparent text-sm outline-none" />
            <div className="text-xs text-[var(--ink-muted)]">MoXBots</div>
          </div>
        </div>
      </main>
    </SessionTaskActionsContext.Provider></SessionTaskOrchestrationProvider></TabContext.Provider>
  </ThemeRuntimeProvider>;
}
void i18n.changeLanguage('zh-CN').then(() => createRoot(document.getElementById('root')!).render(<Preview />));
