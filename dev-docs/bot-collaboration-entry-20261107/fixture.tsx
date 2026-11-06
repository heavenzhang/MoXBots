import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import CollaborationDetails from '@/features/project-spaces/CollaborationDetails';
import ProjectConversationDialog from '@/features/project-spaces/ProjectConversationDialog';
import { ThemeRuntimeProvider } from '@/theme';
import { i18n } from '@/i18n';
import { FileActionContext } from '@/context/fileActionState';
import type { FileActionContextValue } from '@/context/fileActionState';
import type { Message } from '@/types/chat';
import type { AgentConfig } from '../../src/shared/types/agent';
import '@/index.css';
import { snapshot, at } from './state';
void i18n.changeLanguage('zh-CN');
const agents = snapshot.collaboration!.members.map(bot => ({ ...bot, enabled: true, permissionMode: 'plan', channels: [] })) as AgentConfig[];
const workspaces = agents.map(bot => ({ id: bot.id, name: bot.name, path: `/fixture/${bot.id}`, agentId: bot.id, providerId: null, permissionMode: null }));
const spaces = [{ id: 'product', name: '产品方案', description: snapshot.description, instructions: '', memberBotIds: agents.map(bot => bot.id), materials: [], resources: [], revision: 1, createdAt: at, updatedAt: at }];
const messages: Message[] = [{ id: 'report', role: 'assistant', timestamp: new Date(at), content: '初稿已整理：[产品方案](reports/产品方案.md)。等待审阅，尚未验收。' }];
function Fixture() {
 const [dark, setDark] = useState(false); const [width, setWidth] = useState('100%'); const [newOpen, setNewOpen] = useState(false); const [result, setResult] = useState('');
 const fileActions = { workspacePath: snapshot.workspacePath, openFileTarget: (target: { path: string }) => setResult(`文件操作请求：${target.path}`) } as FileActionContextValue;
 return <ThemeRuntimeProvider selection={{ themeId: 'myagents-default', appearanceMode: dark ? 'dark' : 'light' }}><FileActionContext.Provider value={fileActions}>
 <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)]"><div className="flex flex-wrap gap-4 border-b border-[var(--line-subtle)] p-3 text-xs"><span>BC-02 · 生产组件 / 合成数据</span><button onClick={() => setDark(!dark)}>切换明暗</button><button onClick={() => setWidth(width === '390px' ? '100%' : '390px')}>390 / 全宽</button><button onClick={() => setNewOpen(true)}>新建协作</button></div>
 <main style={{ width }} className="mx-auto max-w-full"><header className="flex min-h-14 items-center justify-between gap-2 border-b border-[var(--line-subtle)] p-3"><div className="min-w-0"><h1 className="truncate text-sm font-medium">完成桌面端产品方案</h1><p className="text-xs text-[var(--ink-muted)]">产品负责人</p></div><CollaborationDetails snapshot={snapshot} sessionId="root" messages={messages} isActive hasMoreBefore onLoadOlder={async () => { setResult("已请求加载旧记录（合成数据）"); }} onNavigate={id => setResult(`定位原消息：${id}`)} onOpenConversation={session => setResult(`打开原会话：${session.id} · ${session.agentDir}`)} /></header><div className="mx-auto max-w-2xl px-6 py-12"><p className="mb-8 rounded-xl bg-[var(--paper-inset)] p-4 text-sm">帮我和内容助手、审阅助手一起完成桌面端产品方案。</p><p className="text-sm leading-7">我负责推进。先确认范围，再请内容助手整理初稿，审阅后向你汇报。</p><p className="mt-5 text-xs text-[var(--ink-muted)]">成员进展和文件记录可从右上角协作详情查看。</p><p role="status" className="mt-8 break-all text-sm">{result}</p></div><textarea aria-label="继续对话" placeholder="继续和负责 Bot 讨论…" className="mx-auto block w-[90%] resize-none rounded-2xl border border-[var(--line-subtle)] bg-[var(--paper-elevated)] p-4 text-sm" /></main>
 <ProjectConversationDialog open={newOpen} spaces={spaces} agents={agents} workspaces={workspaces} request={{ id: 1, projectId: 'product', botId: 'lead' }} onOpen={async (target, message) => { setResult(JSON.stringify({ target, message })); return { status: 'opened' }; }} onClose={() => setNewOpen(false)} onCreateBot={() => {}} onCreateProject={() => {}} onViewAttempt={() => {}} />
 </div></FileActionContext.Provider></ThemeRuntimeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
