// Offline regression surface: real composer, synthetic delayed send receipts.
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/i18n';
import '@/index.css';
import SimpleChatInput, { type SimpleChatInputHandle } from '@/components/SimpleChatInput';
import { ToastProvider } from '@/components/Toast';
import { ImagePreviewProvider } from '@/context/ImagePreviewContext';
import { ConfigDataContext } from '@/config/ConfigProvider';
import { DEFAULT_CONFIG } from '@/config/types';
import { ThemeRuntimeProvider } from '@/theme/ThemeRuntime';

function Fixture() {
  const composer = useRef<SimpleChatInputHandle>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [session, setSession] = useState('synthetic-session-a');
  const resolveRef = useRef<((accepted: boolean) => void) | null>(null);
  Object.assign(window, { composerAudit: {
    accept: () => resolveRef.current?.(true),
    reject: () => resolveRef.current?.(false),
    changeScope: () => setSession(value => `${value}-next`),
    addImage: () => composer.current?.setImages([{ id: 'synthetic-image', file: new File(['png'], 'synthetic.png', { type: 'image/png' }), preview: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPZkAAAAASUVORK5CYII=' }]),
  } });
  return <main style={{ maxWidth: 960, margin: 'auto', padding: 24, color: 'var(--ink)' }}>
    <h1>发送草稿回归 · 合成数据</h1>
    <section aria-label="已上屏消息" style={{ minHeight: 180, padding: '16px 0' }}>
      {messages.map((text, index) => <p key={index} data-testid="sent-message">{text}</p>)}
    </section>
    <p role="status">{pending ? '模拟发送回执等待中' : '模拟发送已结束'}</p>
    <SimpleChatInput ref={composer} runtime="codex" sessionId={session} isLoading={pending} providerAvailable
      onSend={async text => {
        setMessages(previous => [...previous, text]); setPending(true);
        const accepted = await new Promise<boolean>(resolve => { resolveRef.current = resolve; });
        setPending(false); return accepted;
      }} />
  </main>;
}

createRoot(document.getElementById('root')!).render(
  <ThemeRuntimeProvider selection={{ themeId: 'sage', appearanceMode: 'dark' }} persistBootstrapSnapshot={false}>
    <ConfigDataContext.Provider value={{ config: { ...DEFAULT_CONFIG, chatSendShortcut: 'enter' }, projects: [], providers: [], apiKeys: {}, providerVerifyStatus: {}, isLoading: false, error: null, managedCodexRuntimeUpdateInFlight: false }}>
      <ToastProvider><ImagePreviewProvider><Fixture /></ImagePreviewProvider></ToastProvider>
    </ConfigDataContext.Provider>
  </ThemeRuntimeProvider>,
);
