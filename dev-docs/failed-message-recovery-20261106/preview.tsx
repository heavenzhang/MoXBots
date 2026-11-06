// Synthetic local QA surface using the actual product row and resend policy.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Message from '../../src/renderer/components/Message';
import { ImagePreviewProvider } from '../../src/renderer/context/ImagePreviewContext';
import { ThemeRuntimeProvider } from '../../src/renderer/theme';
import { i18n } from '../../src/renderer/i18n';
import { projectErrorMessageResend } from '../../src/renderer/pages/errorMessageResend';
import type { Message as MessageType } from '../../src/renderer/types/chat';
import '../../src/renderer/index.css';
const seed: MessageType[] = [
  { id: 'canonical', role: 'assistant', content: '当前界面与交互已完成，业务接口仍待接入。', timestamp: new Date(0) },
  ...['failed-1', 'failed-2', 'uncertain'].map(id => ({ id, role: 'user' as const, content: '查看当前系统开发状态', timestamp: new Date(0),
    deliveryStatus: 'failed' as const, deliveryUnconfirmed: id === 'uncertain', metadata: { clientRequestId: id } })),
];
function Preview() {
  const [messages, setMessages] = useState(seed);
  const [actions, setActions] = useState<string[]>([]);
  const recover = (id: string) => {
    const selected = messages.find(row => row.id === id);
    if (!selected) return;
    if (selected.deliveryUnconfirmed) { setActions(prev => [...prev, `inspect:${id}`]); return; }
    if (!projectErrorMessageResend(selected, messages)) return;
    setActions(prev => [...prev, `resend:${id}`]);
    setMessages(rows => rows.map(row => row.id === id ? { ...row, deliveryStatus: 'sending' } : row));
    setTimeout(() => setMessages(rows => rows.map(row => row.id === id ? { ...row, deliveryStatus: undefined } : row)), 150);
  };
  return <ThemeRuntimeProvider selection={{ themeId: 'myagents-default', appearanceMode: 'dark' }}>
    <ImagePreviewProvider><main className="min-h-dvh bg-[var(--paper)] px-4 py-8 text-[var(--ink)]">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <h1 className="text-base text-[var(--ink-muted)]">失败消息恢复 · 隔离合成验收</h1>
        {messages.map(message => <div key={message.id} data-qa-message={message.id}>
          <Message message={message} onRecoverFailedSend={recover} onDismissFailedSend={id => {
            setActions(prev => [...prev, `dismiss:${id}`]);
            setMessages(rows => rows.filter(row => row.id !== id || row.deliveryUnconfirmed));
          }} />
        </div>)}
        <textarea aria-label="下一条草稿" defaultValue="保留我的下一条草稿" className="rounded-xl bg-[var(--paper-inset)] p-3" />
        <output aria-label="合成操作记录" className="text-xs text-[var(--ink-muted)]">{actions.join(',')}</output>
      </div>
    </main></ImagePreviewProvider>
  </ThemeRuntimeProvider>;
}
await i18n.changeLanguage('zh-CN');
createRoot(document.getElementById('root')!).render(<Preview />);
