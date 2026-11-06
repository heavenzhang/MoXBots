/** Actual product controls with synthetic responses; no model or user data. */
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import '../i18n';
import { ThemeRuntimeProvider } from '../theme';
import WorkspaceIcon from '../components/launcher/WorkspaceIcon';
import BotGroupEditor from '../features/bot-groups/BotGroupEditor';
import BotGroupRecipient, { type BotGroupRecipientValue } from '../features/bot-groups/BotGroupRecipient';
import { BotGroupSaveError } from '../features/bot-groups/botGroupClient';
import { groupFixture, groupProject } from '../../test/fixtures/botGroup';

function Fixture() {
  const [light, setLight] = useState(false), [open, setOpen] = useState(false);
  const [group, setGroup] = useState(() => groupFixture({ receipts: [], members: groupFixture().members.map((member, i) => ({ ...member, icon: i ? 'bot:moss' : 'bot:spark' })) }));
  const [recipient, setRecipient] = useState<BotGroupRecipientValue>();
  const [mode, setMode] = useState('ok'); const [calls, setCalls] = useState(0);
  const [saved, setSaved] = useState(false); const pending = useRef(group);
  const opener = useRef<HTMLButtonElement>(null);
  const button = 'rounded-lg border border-[var(--line-subtle)] px-3 py-2 text-sm';
  return <ThemeRuntimeProvider selection={{ themeId: 'sage', appearanceMode: light ? 'light' : 'dark' }} persistBootstrapSnapshot={false}>
    <main className="min-h-screen bg-[var(--paper)] p-5 text-[var(--ink)]">
      <div className="mx-auto max-w-[680px] space-y-6">
        <p className="text-xs text-[var(--ink-muted)]">本地合成数据 · 真实组件界面验证 · 不发送消息</p>
        <div className="flex flex-wrap gap-2"><button className={button} onClick={() => setLight(value => !value)}>切换深浅主题</button>
          <button className={button} aria-pressed={mode === 'uncertain'} onClick={() => setMode('uncertain')}>模拟保存后响应丢失</button>
          <button className={button} aria-pressed={mode === 'conflict'} onClick={() => setMode('conflict')}>模拟另一处修改</button>
        </div>
        <section className="space-y-5 rounded-2xl border border-[var(--line-subtle)] bg-[var(--paper-elevated)] p-5">
          <p className="text-xs text-[var(--ink-secondary)]">项目 · {groupProject.name}</p>
          <h1 className="break-words text-xl font-medium">{group.title}</h1>
          <div className="flex gap-3">{group.members.filter(member => member.active).map(member => <span key={member.botId} className="flex items-center gap-2 text-sm"><WorkspaceIcon icon={member.icon} size={32} />{member.name}</span>)}</div>
          <button ref={opener} className={button} onClick={() => { pending.current = group; setSaved(false); setOpen(true); }}>管理群成员</button>
          <BotGroupRecipient group={group} value={recipient} onChange={setRecipient} />
          <button className={button} onClick={() => setGroup(value => ({ ...value, revision: value.revision + 1 }))}>模拟成员版本变化</button>
          <p className="text-xs text-[var(--ink-muted)]" data-testid="calls">配置请求：{calls}</p>
          {saved && <p role="status">群组配置已核对</p>}
        </section>
      </div>
      {open && <BotGroupEditor returnFocusRef={opener} sessionId="s1" rootBotId="root" project={groupProject} group={group}
        choices={group.members.map(member => ({ id: member.botId, name: member.name, icon: member.icon, workspacePath: member.workspacePath, unavailable: false }))}
        onClose={() => setOpen(false)} onSaved={value => { setGroup(value); setOpen(false); setSaved(true); }}
        onSave={async command => {
          setCalls(value => value + 1);
          if (mode === 'conflict') {
            pending.current = { ...group, title: '另一处编辑后的群组', revision: group.revision + 1 };
            setMode('ok'); throw new BotGroupSaveError('rejected', 'BOT_GROUP_REVISION_CONFLICT');
          }
          const next = { ...pending.current, title: command.title, revision: command.expectedRevision + 1,
            receipts: [...pending.current.receipts, { requestId: command.requestId, digest: 'b'.repeat(64), revision: command.expectedRevision + 1 }] };
          pending.current = next;
          if (mode === 'uncertain') { setMode('ok'); throw new Error('Synthetic response loss'); }
          return next;
        }} onReload={async () => ({ project: groupProject, group: pending.current })} />}
    </main>
  </ThemeRuntimeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
