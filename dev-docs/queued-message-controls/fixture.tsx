import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import QueuedMessagesPanel from '@/components/QueuedMessageBubble';
import { ThemeRuntimeProvider } from '@/theme';
import { i18n } from '@/i18n';
import '@/index.css';

void i18n.changeLanguage('zh-CN');
const original = [{ queueId: 'q-compact', text: '/compact', timestamp: 1 }];
function Fixture() {
  const [messages, setMessages] = useState(original);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState('success');
  const [narrow, setNarrow] = useState(false);
  const [dark, setDark] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const [generation, setGeneration] = useState(0);
  const reset = () => { setMessages(original); setDraft(''); setGeneration(g => g + 1); setEvents([]); };
  const act = async (kind: string, id: string) => {
    setEvents(prev => [...prev, kind]);
    await new Promise(resolve => setTimeout(resolve, 600));
    if (mode === 'accepted') throw Object.assign(new Error('accepted'), { status: 409, errorCode: 'queue_already_accepted' });
    if (mode === 'network') throw new Error('network');
    const target = messages.find(message => message.queueId === id);
    setMessages(prev => prev.filter(message => message.queueId !== id));
    if (kind === 'edit') setDraft(target?.text ?? '');
    return true;
  };
  return <ThemeRuntimeProvider selection={{ themeId: 'myagents-default', appearanceMode: dark ? 'dark' : 'light' }}>
    <main className="min-h-screen bg-[var(--paper)] p-6 text-[var(--ink)]">
      <div className="mx-auto max-w-3xl space-y-4">
        <p>MOXBOTS-QUEUE-UI-001 · 隔离组件验收（合成消息，不连接日常会话）</p>
        <div className="flex flex-wrap gap-3 text-sm">
          <button onClick={reset}>重置</button>
          <button onClick={() => setNarrow(!narrow)}>切换窄栏</button>
          <button onClick={() => setDark(!dark)}>切换深浅色</button>
          <button onClick={() => void i18n.changeLanguage(i18n.language === 'zh-CN' ? 'en-US' : 'zh-CN')}>切换语言</button>
          <button onClick={() => setMessages([{ ...original[0], text: '核对这条长消息的完整内容、附件与实际业务结果。'.repeat(12) }, { queueId: 'q-2', text: '第二条待发送消息', timestamp: 2 }])}>加载长消息</button>
          <select aria-label="响应场景" value={mode} onChange={event => setMode(event.target.value)}>
            <option value="success">成功</option><option value="accepted">已接收，撤回被拒绝</option><option value="network">网络失败</option>
          </select>
        </div>
        <div className="mx-auto space-y-2 border border-[var(--line)] p-3" style={{ width: narrow ? 320 : '100%', maxWidth: '100%' }}>
          <div className="h-28 text-sm text-[var(--ink-muted)]">聊天内容区域</div>
          <div className="pointer-events-none mb-2 flex w-full max-w-3xl flex-wrap items-end justify-end gap-2 empty:hidden">
            <div className="pointer-events-auto mr-auto rounded-lg border border-[var(--line)] px-3 py-2 text-xs">任务进度 1 / 3</div>
            <QueuedMessagesPanel key={generation} messages={messages} onCancel={id => act('cancel', id)} onEdit={id => {
              if (draft) return Promise.reject(Object.assign(new Error('draft'), { errorCode: 'queue_draft_not_empty' }));
              return act('edit', id);
            }} onForceExecute={id => act('force', id)} />
          </div>
          <textarea aria-label="消息草稿" value={draft} onChange={event => setDraft(event.target.value)} className="min-h-28 w-full rounded-xl border border-[var(--line)] p-3" placeholder="输入消息…" />
        </div>
        <output aria-label="操作记录">{events.join(', ') || '尚未操作'}</output>
      </div>
    </main>
  </ThemeRuntimeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
