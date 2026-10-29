// Real production components; all tasks, outputs and action receipts are synthetic.
import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TabContext, type TabContextValue } from '../../src/renderer/context/TabContext';
import { ThemeRuntimeProvider } from '../../src/renderer/theme';
import { i18n } from '../../src/renderer/i18n';
import '../../src/renderer/index.css';
import { SessionTaskOrchestrationProvider } from '../../src/renderer/components/agent-status/useSessionTaskOrchestration';
import { SessionTaskActionsContext, resolveTaskActionTargets, type TaskReviewTarget } from '../../src/renderer/components/agent-status/SessionTaskActionsContext';
import SessionTaskResults from '../../src/renderer/components/agent-status/SessionTaskResults';
import ExecutionStatusBar from '../../src/renderer/components/agent-status/ExecutionStatusBar';
import SubagentInspector from '../../src/renderer/components/agent-status/SubagentInspector';
import { collectTaskAttempts, emptyTaskLedger, mergeTaskObservations, projectSessionTasks, type SessionTaskLedger } from '../../src/shared/sessionTaskOrchestration';
import type { Message, ToolUseSimple } from '../../src/renderer/types/chat';

const startedAt = Date.now() - 62000;
const titles = ['探索 AI 后台服务实现', '探索 AI 管理前端页面', '探索同步规范与相关缺陷'];
const hookError = 'PreToolUse:Agent hook error: 当前处于 Plan（规划）模式，禁止执行写操作或有副作用的工具（本次被拦截：Agent）。请先完成调研与规划，再提交方案供用户审批。';
type Scenario = 'mixed' | 'failed' | 'accepted' | 'unknown' | 'retry' | 'empty';
function sample(scenario: Scenario): { messages: Message[]; ledger: SessionTaskLedger } {
  if (scenario === 'empty') return { messages: [], ledger: emptyTaskLedger() };
  const tools: ToolUseSimple[] = titles.map((title, index) => {
    if (scenario === 'unknown') return { id: `tool-${index}`, name: 'Agent', streamIndex: index,
      input: { description: title, prompt: '等待确认后台执行结果。' }, result: JSON.stringify({ status: 'async_launched', agentId: `unknown-${index}` }) };
    const status = scenario === 'failed' || scenario === 'mixed' && index === 0 ? 'failed'
      : scenario === 'retry' && index === 0 || scenario === 'mixed' && index === 1 ? 'running' : 'completed';
    return { id: `tool-${index}`, name: 'Agent', input: { description: title, prompt: '检查当前实现与相关调用，返回发现和验证依据。' }, streamIndex: index,
      ...(status === 'failed' ? { result: hookError } : { subagentLifecycle: {
        status, startedAt, ...(status === 'running' ? {} : { finishedAt: startedAt + 41000 }), model: index === 1 ? 'gpt-6.1-sol' : 'claude-sonnet-5',
        description: title, result: status === 'completed' ? '已核对保存接口与页面状态更新，定位到需要主 Agent 复核的同步差异。' : undefined,
        ...(scenario === 'retry' ? { activation: { id: 'new-attempt', ordinal: 2, state: status } } : {}),
      } }),
    };
  });
  const messages: Message[] = [{ id: 'user', role: 'user', timestamp: new Date(startedAt), content: '检查 AI 配置保存后页面不同步的问题，并验证修复效果。' },
    { id: 'assistant', role: 'assistant', timestamp: new Date(startedAt), content: tools.map((tool, index) => ({ id: `block-${index}`, type: 'tool_use', tool })) }];
  let ledger = mergeTaskObservations(emptyTaskLedger(), collectTaskAttempts(messages, 'assistant'));
  ledger.plan = ['准备私有 Admin 验收环境', '构建修复版本并启动私有实例', '验证登录、Token 和 AI 接口', '验证 Chromium 页面交互', '记录验证结果并交付主干'].map((content, index) => ({ key: `main-${index}`, content, status: 'pending' }));
  if (scenario === 'accepted') ledger.reviews = ledger.attempts.map(attempt => ({ taskId: `agent:${attempt.toolUseId}`, attemptId: attempt.id, decision: 'accept', evidence: '已核对本次结果与验证记录（合成验收）。' }));
  if (scenario === 'unknown') ledger.attempts = ledger.attempts.map(attempt => ({ ...attempt, executionVerified: false }));
  if (scenario === 'retry') {
    ledger = { ...ledger, attempts: [...ledger.attempts, { id: 'tool-0:old', toolUseId: 'tool-0', title: titles[0], executionVerified: true, lifecycle: { status: 'failed', startedAt: startedAt - 50000, result: hookError, activation: { id: 'old', ordinal: 1, state: 'failed' } } }] };
  }
  return { messages, ledger };
}
function Preview() {
  const [scenario, setScenario] = useState<Scenario>('mixed');
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [receipt, setReceipt] = useState('');
  const [dark, setDark] = useState(true);
  const [reviewFailure, setReviewFailure] = useState(false);
  const [language, setLanguage] = useState('zh-CN');
  const containerRef = useRef<HTMLDivElement>(null);
  const data = useMemo(() => sample(scenario), [scenario]);
  const sessionId = scenario === 'empty' ? 'empty-session' : 'fixture-session';
  const tab = useMemo(() => ({ tabId: 'multiagent-fixture', sessionId, messages: data.messages, streamingMessage: data.messages[1] ?? null,
    sessionState: 'idle', isSessionLoading: false, isLoading: false, queuedMessages: [], hasMoreBefore: false, agentPlanTodos: [],
    apiGet: async () => ({ success: true, sessionId, ledger: data.ledger }), apiPost: async () => ({ success: false }),
  }) as unknown as TabContextValue, [data, sessionId]);
  const actions = useMemo(() => ({ disabled: false, onInspect: setSelected,
    onReview: async (targets: readonly TaskReviewTarget[]) => { if (!resolveTaskActionTargets(projectSessionTasks(data.ledger), targets, sessionId)) return false; setReceipt(`验收请求：${targets.length} 项；${reviewFailure ? '模拟接纳失败' : '模拟进入原会话队列，尚未验收通过'}`); return !reviewFailure; },
    onComposeRework: (targets: readonly TaskReviewTarget[]) => { if (!resolveTaskActionTargets(projectSessionTasks(data.ledger), targets, sessionId, 'feedback')) return; setDraft(existing => `${existing ? `${existing}\n\n` : ''}请主 Agent 核对以下任务的执行情况并处理问题：\n${targets.map(target => target.taskId).join('\n')}\n补充意见：`); },
  }), [reviewFailure, data, sessionId]);
  return <ThemeRuntimeProvider selection={{ themeId: 'proof', appearanceMode: dark ? 'dark' : 'light' }} persistBootstrapSnapshot={false}>
    <TabContext.Provider value={tab}><SessionTaskOrchestrationProvider><SessionTaskActionsContext.Provider value={actions}>
      <div style={{ height: '100dvh', minHeight: 0 }} className="flex min-w-0 flex-col bg-[var(--paper)] text-[var(--ink)]">
        <div className="shrink-0 border-b border-[var(--line)] p-3 text-xs"><p className="mb-2 text-[var(--ink-muted)]">本地组件验收 · 合成数据 · 不操作真实会话 / 不调用模型</p><div className="flex flex-wrap gap-2">
          {(['mixed', 'failed', 'accepted', 'unknown', 'retry', 'empty'] as Scenario[]).map((value, index) => <button type="button" key={value} className="compact-action rounded border border-[var(--line)] px-2" onClick={() => { setScenario(value); setSelected(null); setReceipt(''); }}>{['混合状态', '全部启动失败', '全部验收通过', '状态未知', '新尝试运行', '切换空会话'][index]}</button>)}
          <button type="button" className="compact-action px-2" onClick={() => setDark(!dark)}>切换明暗</button>
          <button type="button" className="compact-action px-2" onClick={() => setReviewFailure(!reviewFailure)}>验收接纳{reviewFailure ? '失败' : '成功'}</button>
          <button type="button" className="compact-action px-2" onClick={async () => { const next = language === 'zh-CN' ? 'en-US' : 'zh-CN'; setLanguage(next); await i18n.changeLanguage(next); }}>中文 / English</button>
        </div></div>
        <div ref={containerRef} className="relative flex min-h-0 min-w-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col"><header className="shrink-0 border-b border-[var(--line-subtle)] px-5 py-4 text-sm font-medium">销售业绩提升 / AI 配置保存后不同步</header>
            <div className="min-h-0 flex-1 overflow-y-auto px-4"><div className="mx-auto max-w-3xl py-5"><p className="mb-5 ml-auto max-w-lg rounded-xl bg-[var(--paper-inset)] p-3 text-sm leading-6">检查 AI 配置保存后页面不同步的问题，并验证修复效果。</p><p className="mb-5 text-sm leading-6">我将分别检查后台服务、前端页面和同步规范，并汇总结果进行核验。</p><SessionTaskResults /><p role="status" className="mt-3 text-xs text-[var(--ink-muted)]">{receipt}</p></div></div>
            <footer className="mx-auto w-full max-w-3xl shrink-0 p-4"><ExecutionStatusBar activity={{ containerRef, onSelectSubagent: setSelected, onJumpToTool: id => setReceipt(`定位：${id}`) }} /><div className="rounded-xl border border-[var(--line)] bg-[var(--paper-elevated)] p-3"><textarea className="w-full resize-none bg-transparent text-sm focus-visible:outline-2 focus-visible:outline-[var(--focus-border)]" rows={2} aria-label="消息输入" placeholder="输入消息…" value={draft} onChange={event => setDraft(event.target.value)} /><p className="text-xs text-[var(--ink-muted)]">完全自主 · 工具</p></div></footer>
          </main>
          {selected && scenario !== 'empty' && <SubagentInspector key={selected} toolId={selected} overlay={window.innerWidth < 1100} onClose={() => setSelected(null)} onJumpToTool={id => setReceipt(`定位：${id}`)} />}
        </div>
      </div>
    </SessionTaskActionsContext.Provider></SessionTaskOrchestrationProvider></TabContext.Provider>
  </ThemeRuntimeProvider>;
}
await i18n.changeLanguage('zh-CN');
createRoot(document.getElementById('root')!).render(<Preview />);
