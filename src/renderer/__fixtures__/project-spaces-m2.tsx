/** Local interactive prototype. Synthetic state only; no backend/model calls. */
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import '../i18n';
import { ThemeRuntimeProvider } from '../theme';
import { MyAgentsLogotype } from '../components/brand/MyAgentsLogotype';
import WorkspaceIcon from '../components/launcher/WorkspaceIcon';
import { FolderIcon, PlusIcon } from '../components/icons';
import ProjectSpaceView from '../features/project-spaces/ProjectSpaceView';
import ProjectSpaceEditor from '../features/project-spaces/ProjectSpaceEditor';
import ProjectConversationDialog, { type ProjectConversationRequest } from '../features/project-spaces/ProjectConversationDialog';
import ProjectContextBadge from '../features/project-spaces/ProjectContextBadge';
import { applyProjectSpaceMutation, compileProjectSpaceSessionSnapshot, type ProjectSpace } from '../../shared/projectSpaces';
import type { AgentConfig } from '../../shared/types/agent';
import type { Project } from '../config/types';
import type { SessionMetadata } from '../api/sessionClient';
const at = '2026-11-02T00:00:00.000Z';
const bots: AgentConfig[] = [{ id: 'mino', name: 'Mino', icon: 'bot:spark', enabled: true, permissionMode: 'plan', channels: [] }, { id: 'analyst', name: '业务分析', icon: 'bot:mox', enabled: true, permissionMode: 'plan', channels: [] }, { id: 'writer', name: '内容伙伴', icon: 'bot:moss', enabled: true, permissionMode: 'plan', channels: [] }];
const workspaces: Project[] = bots.map(bot => ({ id: `w-${bot.id}`, name: bot.name, path: `/demo/bots/${bot.id}`, agentId: bot.id, providerId: null, permissionMode: null }));
const initial: ProjectSpace[] = [
  { id: 'product', name: 'MoXBots 产品迭代', description: '把 Bot、项目和会话的关系做清楚，让每一次合作都有明确的目标与背景。', instructions: '先明确问题与完成标准，再推进实现。每个阶段保留可核对的结果。', memberBotIds: ['mino', 'analyst', 'writer'], materials: [{ id: 'brief', title: '本轮产品目标', content: '保留现有界面风格。一个 Bot 可以参与不同项目，每段对话都应知道自己服务哪个项目。' }, { id: 'principles', title: '体验原则', content: '重要操作有清晰反馈；失败时保留输入。项目资料变化不改写已有对话。' }], resources: [{ id: 'source', label: '产品资料目录', path: '/demo/projects/MoXBots' }], revision: 1, createdAt: at, updatedAt: at },
  { id: 'business', name: '公司经营分析', description: '将经营资料和分析讨论集中在一个项目，形成连续、可核对的分析过程。', instructions: '使用本项目口径，区分实际数据、假设与待确认项。', memberBotIds: ['analyst'], materials: [{ id: 'business-brief', title: '经营分析说明', content: '此处是本地原型中的合成资料。不要引用产品迭代项目的资料作为本项目依据。' }], resources: [], revision: 1, createdAt: at, updatedAt: at },
];
function exampleSession(id: string, title: string, botId: string, preview: string, capturedAt: string): SessionMetadata {
  const snapshot = compileProjectSpaceSessionSnapshot({ selection: { projectId: 'product', botId, projectRevision: 1 }, projectSpaces: initial, bots, workspaces, workspacePath: workspaces.find(item => item.agentId === botId)!.path, capturedAt });
  return { id, agentDir: snapshot.workspacePath, title, lastMessagePreview: preview, createdAt: capturedAt, lastActiveAt: capturedAt, projectSpace: snapshot };
}
const sampleSessions = [exampleSession('s1', '项目首页应该承接哪些工作', 'mino', '先把成员、资料与项目对话组织清楚。', '2026-11-02T00:00:00.000Z'), exampleSession('s2', '梳理 Bot 与项目之间的关系', 'analyst', '同一 Bot 参与不同项目，身份保持一致。', '2026-11-01T12:00:00.000Z'), exampleSession('s3', '整理第一轮界面文案', 'writer', '文案应说明本次合作的项目和资料范围。', '2026-11-01T10:00:00.000Z')];
function Fixture() {
  const [spaces, setSpaces] = useState(initial); const [selectedId, setSelectedId] = useState('product');
  const [sessions, setSessions] = useState(sampleSessions); const [opened, setOpened] = useState<SessionMetadata | null>(null);
  const [light, setLight] = useState(false); const [saveFailure, setSaveFailure] = useState(false); const [readFailure, setReadFailure] = useState(false);
  const [launchMode, setLaunchMode] = useState<'ok' | 'not-started' | 'uncertain'>('ok'); const [calls, setCalls] = useState(0);
  const [newProject, setNewProject] = useState(false); const [dialogOpen, setDialogOpen] = useState(false); const [request, setRequest] = useState<ProjectConversationRequest | null>(null); const count = useRef(0);
  const project = spaces.find(item => item.id === selectedId)!;
  function newConversation(botId?: string) { setRequest({ id: ++count.current, projectId: project.id, botId }); setDialogOpen(true); }
  function mutate(command: Parameters<typeof applyProjectSpaceMutation>[1]) {
    if (saveFailure) { setSaveFailure(false); throw new Error('Synthetic save failure'); }
    const next = applyProjectSpaceMutation(spaces, command, bots); setSpaces(next); return next.find(item => item.id === command.id)!;
  }
  return <ThemeRuntimeProvider selection={{ themeId: 'sage', appearanceMode: light ? 'light' : 'dark' }} persistBootstrapSnapshot={false}>
    <div className="flex h-dvh min-w-0 flex-col bg-[var(--paper)] text-[var(--ink)]">
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-3 border-b border-[var(--line-subtle)] px-4 py-2 text-xs text-[var(--ink-muted)]"><strong>M2 实际组件 · 本地合成数据</strong><button onClick={() => setLight(value => !value)}>切换深浅主题</button><label><input type="checkbox" checked={saveFailure} onChange={e => setSaveFailure(e.target.checked)} /> 下次保存失败</label><label><input type="checkbox" checked={readFailure} onChange={e => setReadFailure(e.target.checked)} /> 读取失败</label><button onClick={() => setLaunchMode(value => value === 'ok' ? 'not-started' : value === 'not-started' ? 'uncertain' : 'ok')}>启动结果：{launchMode}</button><span>启动请求：{calls}</span></div>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--line-subtle)] bg-[var(--paper-elevated)] px-3 py-5 max-sm:w-[76px]">
          <div className="mb-8 px-3 max-sm:px-0"><div className="max-sm:hidden"><MyAgentsLogotype variant="display" className="text-lg" /></div><span className="hidden text-center text-sm font-semibold max-sm:block">MoX</span></div>
          <button aria-label="新建" className="mb-5 flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--line-subtle)] text-sm" onClick={() => { setDialogOpen(true); }}><PlusIcon className="h-4 w-4" /><span className="max-sm:hidden">新建</span></button>
          <p className="mb-3 px-3 text-xs text-[var(--ink-muted)] max-sm:hidden">项目</p>
          {spaces.map(item => <button aria-label={item.name} key={item.id} className={`mb-1 flex min-w-0 items-center gap-3 rounded-lg px-3 py-3 text-left text-sm ${selectedId === item.id && !opened ? 'bg-[var(--paper-inset)] text-[var(--ink)]' : 'text-[var(--ink-secondary)] hover:bg-[var(--hover-bg)]'}`} title={item.name} onClick={() => { setSelectedId(item.id); setOpened(null); }}><FolderIcon className="h-4 w-4 shrink-0 text-[var(--accent)]" /><span className="truncate max-sm:hidden">{item.name}</span></button>)}
          <button aria-label="新建项目" className="mt-2 flex items-center gap-2 px-3 py-2 text-xs text-[var(--ink-muted)]" onClick={() => setNewProject(true)}><PlusIcon className="h-3.5 w-3.5" /><span className="max-sm:hidden">新建项目</span></button>
          <div className="mt-auto space-y-3 px-3 pt-5 max-sm:px-1"><p className="text-xs text-[var(--ink-muted)] max-sm:hidden">我的 Bots</p><div className="flex flex-wrap gap-2">{bots.map(bot => <WorkspaceIcon key={bot.id} icon={bot.icon} size={30} />)}</div></div>
        </aside>
        <main className="min-w-0 flex-1">
          {opened ? <div className="flex h-full flex-col"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line-subtle)] px-6 py-4"><button className="text-xs text-[var(--ink-muted)]" onClick={() => setOpened(null)}>返回项目</button>{opened.projectSpace && <ProjectContextBadge snapshot={opened.projectSpace} onOpenProject={id => { setSelectedId(id); setOpened(null); }} />}</header><div className="mx-auto w-full max-w-[760px] flex-1 overflow-y-auto p-6 sm:p-10"><h1 className="mb-8 text-xl font-medium">{opened.title}</h1><div className="ml-auto max-w-[90%] rounded-2xl bg-[var(--paper-elevated)] px-5 py-4 text-sm leading-7">{opened.lastMessagePreview || '这是一段项目对话的本地交互示例。'}</div><p className="mt-8 text-xs leading-6 text-[var(--ink-muted)]">此页用于核对会话的项目背景展示，不调用模型、不创建真实会话。</p></div></div> : <ProjectSpaceView key={project.id} onReload={async () => project} project={project} bots={bots} sessions={sessions} readError={readFailure ? 'Synthetic read error' : null} onRefresh={() => setReadFailure(false)} onSave={async (draft, revision) => mutate({ kind: 'update', id: project.id, expectedRevision: revision, draft, at: new Date().toISOString() })} onArchive={async (archived, revision) => mutate({ kind: 'archive', id: project.id, expectedRevision: revision, archived, at: new Date().toISOString() })} onNewConversation={newConversation} onOpenConversation={session => setOpened(session)} onBack={() => setSelectedId('product')} onCreateBot={() => { setDialogOpen(true); setRequest(null); }} />}
        </main>
      </div>
      <ProjectConversationDialog open={dialogOpen} request={request} spaces={spaces} agents={bots} workspaces={workspaces} onClose={() => setDialogOpen(false)} onCreateBot={() => { setDialogOpen(false); setOpened({ id: 'bot-entry', agentDir: '', title: '新建 Bot 入口', createdAt: at, lastActiveAt: at, lastMessagePreview: '正式页面复用现有 Bot 创建面板，本地项目原型不写入真实 Bot 配置。' }); }} onCreateProject={() => { setDialogOpen(false); setNewProject(true); }} onViewAttempt={tabId => { const item = sessions.find(item => item.id === tabId); if (item) setOpened(item); }} onOpen={async (target, message) => {
        setCalls(value => value + 1);
        if (launchMode === 'not-started') { setLaunchMode('ok'); return { status: 'not-started' }; }
        const snapshot = target.kind === 'project' ? compileProjectSpaceSessionSnapshot({ selection: target.selection, projectSpaces: spaces, bots, workspaces, workspacePath: workspaces.find(item => item.agentId === target.selection.botId)!.path, capturedAt: new Date().toISOString() }) : undefined;
        const item: SessionMetadata = { id: `demo-${++count.current}`, agentDir: snapshot?.workspacePath ?? workspaces.find(item => item.agentId === (target.kind === 'workspace' ? target.botId : ''))!.path, title: message?.text || '新的项目对话', lastMessagePreview: message?.text, createdAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(), projectSpace: snapshot };
        setSessions(previous => [item, ...previous]);
        if (launchMode === 'uncertain') { setLaunchMode('ok'); return { status: 'uncertain', tabId: item.id }; }
        setOpened(item); return { status: 'opened' };
      }} />
      {newProject && <ProjectSpaceEditor bots={bots} onClose={() => setNewProject(false)} onSave={async draft => { const saved = mutate({ kind: 'create', id: `project-${++count.current}`, draft, at: new Date().toISOString() }); setSelectedId(saved.id); setOpened(null); return saved; }} />}
    </div>
  </ThemeRuntimeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
