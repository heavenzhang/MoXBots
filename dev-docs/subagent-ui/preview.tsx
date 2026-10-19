// Synthetic component acceptance surface. Not a production Vite entry point.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TabContext, type TabContextValue } from '../../src/renderer/context/TabContext';
import { ThemeRuntimeProvider } from '../../src/renderer/theme';
import { i18n } from '../../src/renderer/i18n';
import '../../src/renderer/index.css';
import SubagentActivityPanel from '../../src/renderer/components/agent-status/SubagentActivityPanel';
import SubagentInspector from '../../src/renderer/components/agent-status/SubagentInspector';
import type { Message } from '../../src/renderer/types/chat';

const start = Date.now() - 85000;
function fixture(running: boolean): Message[] {
 const agent = (id: string, description: string, active: boolean) => ({ id, name: 'Agent', streamIndex: 0, input: {},
  inputJson: JSON.stringify({ description, prompt: '只读审阅主体隔离，返回具体文件、行号与风险；不修改、不部署。', model: 'sonnet' }),
  result: JSON.stringify({ status: 'async_launched', resolvedModel: active ? 'gpt-6.1-sol' : 'claude-sonnet-5', agentId: id }),
  subagentLifecycle: { status: active ? 'running' : 'completed', model: active ? 'gpt-6.1-sol' : 'claude-sonnet-5', startedAt: start,
   lastActivityAt: Date.now(), ...(active ? {} : { finishedAt: start + 62000, result: '## 审阅结果\n\n1. 方案删除缺少主体一致性校验。\n2. 详情查询未限制主体范围。\n\n需要主 Agent 复核调用方与权限边界。' }) },
  subagentCalls: [{ id: id + '-read', name: 'Read', input: {}, result: '已核对工资与社保服务的主体参数传递。' }],
 });
 return [{ id: 'user', role: 'user', content: '继续核查工资与社保的主体隔离', timestamp: new Date(start) },
  { id: 'reply', role: 'assistant', timestamp: new Date(start), content: [
   { id: 'b1', type: 'tool_use', tool: agent('salary', '工资链路审阅', running) },
   { id: 'b2', type: 'tool_use', tool: agent('insurance', '社保链路审阅', false) },
  ] } as Message];
}
function Preview() {
 const [selected, setSelected] = useState<string | null>(null), [running, setRunning] = useState(true), [overlay, setOverlay] = useState(false), [session, setSession] = useState('fixture'), [dark, setDark] = useState(false);
 const messages = session === 'fixture' ? fixture(running) : [];
 const tab = { tabId: 'subagent-preview-tab', sessionId: session, messages, streamingMessage: running ? messages[1] : null, sessionState: running ? 'running' : 'idle', isSessionLoading: false, hasMoreBefore: false } as TabContextValue;
 return <ThemeRuntimeProvider selection={{ themeId: 'myagents-default', appearanceMode: dark ? 'dark' : 'light' }}><TabContext.Provider value={tab}>
  <div className="flex h-dvh min-w-0 bg-[var(--paper)] text-[var(--ink)]">
   <nav className="hidden w-52 shrink-0 border-r border-[var(--line)] bg-[var(--paper-inset)] p-5 md:block"><h1 className="text-xl font-semibold">MoXBots</h1><p className="mt-7 text-sm text-[var(--ink-muted)]">销售业绩提升</p><p className="mt-4 rounded-lg bg-[var(--accent)]/10 p-3 text-sm">HRM 薪资主体改造</p></nav>
   <div className="relative flex min-w-0 flex-1"><main className="flex min-w-0 flex-1 flex-col"><header className="border-b border-[var(--line)] p-5"><h2 className="font-semibold">HRM 薪资多主体改造</h2><p className="mt-2 text-xs text-[var(--ink-muted)]">组件实测 · 合成数据 · 不操作真实任务</p></header>
    <div className="min-h-0 flex-1 overflow-y-auto p-5"><p className="mb-5 ml-auto max-w-md rounded-xl bg-[var(--paper-inset)] p-4">继续核查工资与社保的主体隔离</p><p className="leading-relaxed">我将工资链路与社保链路分别交给两个子 Agent 审阅，同时核对核心调用和测试结果。</p><div className="mt-6 flex flex-wrap gap-2 text-xs"><button className="rounded-lg border border-[var(--line)] p-2" onClick={() => setRunning(!running)}>模拟完成 / 恢复</button><button className="rounded-lg border border-[var(--line)] p-2" onClick={() => setSession(session === 'fixture' ? 'empty' : 'fixture')}>切换空会话</button><button className="rounded-lg border border-[var(--line)] p-2" onClick={() => setOverlay(!overlay)}>切换窄栏模式</button><button className="rounded-lg border border-[var(--line)] p-2" onClick={() => setDark(!dark)}>切换明暗主题</button></div><p id="located" className="mt-4 text-xs text-[var(--ink-muted)]" /></div>
    <div className="p-4"><SubagentActivityPanel onSelect={setSelected} /><div className="mt-3 rounded-2xl border border-[var(--line)] bg-[var(--paper-elevated)] p-4"><textarea aria-label="消息输入" placeholder="输入消息…" className="w-full resize-none bg-transparent text-sm outline-none" /><p className="text-xs text-[var(--ink-muted)]">完全自主 · 工具</p></div></div>
   </main>{selected && session === 'fixture' && <SubagentInspector key={selected} toolId={selected} overlay={overlay} onClose={() => setSelected(null)} onJumpToTool={id => { document.getElementById('located')!.textContent = '已定位：' + id; }} />}</div>
  </div></TabContext.Provider></ThemeRuntimeProvider>;
}
await i18n.changeLanguage('zh-CN');
createRoot(document.getElementById('root')!).render(<Preview />);
