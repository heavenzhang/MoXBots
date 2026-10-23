// Synthetic Session transport only. ExecutionStatusBar, its hook, and plan UI are production code.
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TabContext, type TabContextValue } from '../../src/renderer/context/TabContext';
import { ThemeRuntimeProvider } from '../../src/renderer/theme';
import { i18n } from '../../src/renderer/i18n';
import '../../src/renderer/index.css';
import ExecutionStatusBar from '../../src/renderer/components/agent-status/ExecutionStatusBar';
import { emptyTaskLedger, projectSessionTasks, type SessionTaskLedger, type SessionTaskSnapshot, type TaskPhase } from '../../src/shared/sessionTaskOrchestration';
import { confirmSessionPlan, createSessionPlan, reviseSessionPlan, type SessionPlanProposal } from '../../src/shared/sessionPlanConfirmation';

const SESSION = 'plan-lifecycle-review-session';
const CONTENT = {
  objective: '完成一个真实可核验的导出权限修复，并由主 Agent 检查后验收。',
  scope: '仅处理导出授权与结果核对；不扩大到无关模块。',
  steps: [
    { id: 'inspect', title: '核查当前导出权限与复现路径', assignee: '主 Agent' },
    { id: 'repair', title: '实现修复并记录必要回归结果', assignee: '实现 Agent', blockedBy: ['inspect'] },
    { id: 'accept', title: '独立核对结果并提交验收证据', assignee: '主 Agent', blockedBy: ['repair'] },
  ],
  acceptanceCriteria: ['越权请求被拒绝，合法请求行为正确', '主 Agent 检查真实结果并留下验收证据'],
};
const initial = createSessionPlan({ id: 'plan-review-1', sessionId: SESSION }, CONTENT);
const now = () => new Date().toISOString();
let ledgerRevision = 0;

function makeLedger(name: string, planStart?: SessionTaskLedger['planStart']): SessionTaskLedger & { proposal?: SessionPlanProposal } {
  let proposal = initial;
  if (name !== '待确认') proposal = confirmSessionPlan(initial, { sessionId: SESSION, proposalId: initial.id, expectedRevision: initial.revision }, { source: 'button', evidenceId: 'synthetic-confirm', confirmedAt: now() });
  if (name === '旧版本迟到结果') {
    proposal = reviseSessionPlan(proposal, { sessionId: SESSION, proposalId: proposal.id, expectedRevision: proposal.revision }, { ...CONTENT, objective: '第 2 版：按修订后的范围执行并验收。' }, ['缩小范围']);
    proposal = confirmSessionPlan(proposal, { sessionId: SESSION, proposalId: proposal.id, expectedRevision: proposal.revision }, { source: 'button', evidenceId: 'synthetic-confirm-v2', confirmedAt: now() });
  }
  const ledger: SessionTaskLedger & { proposal?: SessionPlanProposal } = { ...emptyTaskLedger(), revision: ++ledgerRevision, proposal, planStart, tasks: [], bindings: {}, currentTools: {}, attempts: [], reviews: [] };
  const phases: TaskPhase[] = name === '全部验收完成' ? ['completed', 'completed', 'completed']
    : name === '执行中' ? ['completed', 'running', 'pending']
    : name === '回传待验收' ? ['completed', 'awaiting_review', 'pending']
    : name === '失败' ? ['completed', 'failed', 'pending']
    : name === '返工' ? ['completed', 'rework', 'pending']
    : name === '中断' ? ['completed', 'interrupted', 'pending']
    : name === '阻塞' ? ['pending', 'blocked', 'pending']
    : name === '全部步骤受阻' ? ['blocked', 'blocked', 'blocked']
    : name === '未知' || name === '断线恢复' ? ['completed', 'unknown', 'pending']
    : name === '旧版本迟到结果' ? ['completed', 'completed', 'completed'] : ['pending', 'pending', 'pending'];
  CONTENT.steps.forEach((step, index) => {
    const selected = name === '待确认' ? undefined : phases[index];
    const task = { id: step.id, title: step.title, blockedBy: step.blockedBy ?? [], proposalId: initial.id, proposalRevision: initial.revision };
    const taskBackedScenes = ['执行中', '回传待验收', '失败', '返工', '中断', '阻塞', '全部步骤受阻', '未知', '断线恢复', '全部验收完成', '旧版本迟到结果'];
    if (taskBackedScenes.includes(name)) ledger.tasks.push(task);
    if (!selected || selected === 'pending') return;
    if (selected === 'blocked') { ledger.pendingTaskIds = [...(ledger.pendingTaskIds ?? []), step.id]; return; }
    const toolUseId = `tool-${step.id}`;
    const attemptId = `${toolUseId}:run-1`;
    const lifecycleStatus = selected === 'unknown' ? 'completed' : selected === 'awaiting_review' || selected === 'rework' || selected === 'completed' ? 'completed' : selected;
    ledger.attempts.push({ id: attemptId, toolUseId, agentId: index === 1 ? '实现 Agent' : undefined, title: step.title,
      lifecycle: { status: lifecycleStatus as 'running' | 'completed' | 'failed' | 'interrupted', startedAt: Date.now() - 10000, result: `合成证据：${step.title} 已返回结果。` },
      executionVerified: selected === 'unknown' ? false : true, taskIdHint: step.id });
    ledger.bindings[toolUseId] = step.id;
    ledger.currentTools![step.id] = toolUseId;
    if (selected === 'completed') ledger.reviews.push({ taskId: step.id, attemptId, decision: 'accept', evidence: `验收证据：核对 ${step.title}，结果符合标准。` });
    if (selected === 'rework') ledger.reviews.push({ taskId: step.id, attemptId, decision: 'reject', evidence: `返工意见：补充 ${step.title} 的可复现证据。` });
  });
  return ledger;
}

function Preview() {
  const [dark, setDark] = useState(false);
  const [scenario, setScenarioState] = useState('待确认');
  const [support, setSupport] = useState(true);
  const [offline, setOffline] = useState(false);
  const [ledger, setLedger] = useState(makeLedger('待确认'));
  const [inspectedTool, setInspectedTool] = useState('');
  const stateRef = useRef({ ledger, offline, support });
  stateRef.current = { ledger, offline, support };
  const apiGet = useRef(async () => {
    if (stateRef.current.offline) throw new Error('SYNTHETIC_OFFLINE');
    return { success: true, sessionId: SESSION, ledger: stateRef.current.ledger, tasks: projectSessionTasks(stateRef.current.ledger, []), planSupport: { supported: stateRef.current.support, runtime: 'fixture' } } satisfies SessionTaskSnapshot & { success: boolean };
  }).current;
  const apiPost = useRef(async (_path: string, body: { kind: string; requestId: string }) => {
    if (stateRef.current.offline) throw new Error('SYNTHETIC_OFFLINE');
    const old = stateRef.current.ledger;
    const proposal = old.proposal!;
    const next = { ...old, revision: ledgerRevision = Math.max(ledgerRevision, old.revision) + 1, proposal: body.kind === 'confirm' ? confirmSessionPlan(proposal,
      { sessionId: SESSION, proposalId: proposal.id, expectedRevision: proposal.revision }, { source: 'button', evidenceId: body.requestId, confirmedAt: now() }) : proposal };
    setLedger(next);
    return { success: true, sessionId: SESSION, ledger: next, tasks: projectSessionTasks(next, []), planSupport: { supported: true, runtime: 'fixture' } };
  }).current;
  const setScenario = (name: string, planStart?: SessionTaskLedger['planStart']) => {
    const next = makeLedger(name, planStart);
    setScenarioState(name); setLedger(next); setOffline(false);
    window.dispatchEvent(new CustomEvent('session-task-orchestration', { detail: { sessionId: SESSION, ledger: next } }));
  };
  const tab = { tabId: 'plan-review-tab', sessionId: SESSION, agentDir: '/synthetic', messages: [], historyMessages: [], streamingMessage: null,
    hasMoreBefore: false, isLoading: false, isSessionLoading: false, sessionState: 'idle', sessionRuntime: null, sessionRuntimeSource: null,
    sessionRuntimeSessionId: SESSION, agentPlanTodos: null, queuedMessages: [], apiGet, apiPost } as unknown as TabContextValue;
  const scenes = ['待确认', '方案已确认', '启动 pending', '启动 claimed', '启动 dispatched', '执行中', '回传待验收', '失败', '返工', '中断', '阻塞', '全部步骤受阻', '未知', '全部验收完成', '旧版本迟到结果', '断线恢复'];
  const startState: Record<string, NonNullable<SessionTaskLedger['planStart']>['state']> = { '启动 pending': 'pending', '启动 claimed': 'claimed', '启动 dispatched': 'dispatched' };
  return <ThemeRuntimeProvider selection={{ themeId: 'myagents-default', appearanceMode: dark ? 'dark' : 'light' }}><TabContext.Provider value={tab}>
    <main className="flex h-dvh min-w-0 flex-col bg-[var(--paper)] text-[var(--ink)]">
      <header className="shrink-0 border-b border-[var(--line)] p-3"><h1 className="text-sm font-semibold">PLAN-LIFECYCLE-20261023 · 真实 renderer 组件合成审阅</h1>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">合成 Session 快照；不连接 SDK、native、Provider 或生产服务。</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">{scenes.map(scene => <button key={scene} type="button" onClick={() => setScenario(scene, startState[scene] ? {
          proposalId: initial.id, revision: initial.revision, requestId: `start-${startState[scene]}`, queueId: `queue-${startState[scene]}`, state: startState[scene],
        } : undefined)} className={`rounded border border-[var(--line)] px-2 py-1 ${scenario === scene ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--paper-elevated)]'}`}>{scene}</button>)}
          <button type="button" onClick={() => setDark(value => !value)} className="rounded border border-[var(--line)] px-2 py-1">切换主题</button>
          <button type="button" onClick={() => { setSupport(value => !value); setTimeout(() => window.dispatchEvent(new CustomEvent('background-task-status', { detail: { sessionId: SESSION } })), 0); }} className="rounded border border-[var(--line)] px-2 py-1">切换方案能力</button>
          <button type="button" onClick={() => { setOffline(value => !value); if (!offline) setScenarioState('断线恢复'); }} className="rounded border border-[var(--line)] px-2 py-1">{offline ? '恢复快照' : '断开快照'}</button></div>
        <p data-current-scenario className="mt-2 text-xs text-[var(--ink-muted)]">当前合成场景：{scenario}</p></header>
      <section className="min-h-0 flex-1 overflow-y-auto p-3"><p className="mb-3 text-sm">计划阶段必须和执行阶段分开；只有逐项验收后才能显示全部完成。</p>
        <output hidden data-ledger-phases={projectSessionTasks(ledger, []).map(task => `${task.id}:${task.phase}`).join(',')} />
        <ExecutionStatusBar activity={{ containerRef: { current: null }, onJumpToTool: () => {}, onSelectSubagent: (toolUseId: string) => setInspectedTool(toolUseId) }} />
        <output aria-label="合成工具记录路由" data-inspected-tool-id={inspectedTool}>{inspectedTool || '尚未选择执行记录'} · 仅验证回调路由，不含真实 Inspector</output>
      </section>
    </main>
  </TabContext.Provider></ThemeRuntimeProvider>;
}

await i18n.changeLanguage('zh-CN');
createRoot(document.getElementById('root')!).render(<Preview />);
