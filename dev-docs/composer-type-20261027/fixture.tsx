// Offline UI acceptance: real production composers, synthetic draft and send callback only.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/i18n';
import '@/index.css';
import SimpleChatInput from '@/components/SimpleChatInput';
import { TextChatComposer } from '@/components/chat-input/TextChatComposer';
import { ToastProvider } from '@/components/Toast';
import { ImagePreviewProvider } from '@/context/ImagePreviewContext';
import { ThemeRuntimeProvider } from '@/theme/ThemeRuntime';

const suggestion = '可以，先把这份原型细化成可开发的 PRD，重点写清“租约上传—条款提取—履约跟踪—回款管理”的页面、字段、状态和跳转关系。';
function Fixture() {
  const [sent, setSent] = useState(0);
  const [remote, setRemote] = useState('');
  return <main style={{ maxWidth: 1000, margin: '0 auto', padding: 20, color: 'var(--ink)' }}>
    <h1 className="mb-6 text-lg">输入区字号验收 · 合成数据</h1>
    <section data-testid="main-composer">
      <SimpleChatInput isLoading={false} providerAvailable runtime="builtin" sessionId="offline-type-qa"
        selectedModel="Kimi K3.1 Pro" nextPromptSuggestion={{ key: 'qa', sessionId: 'offline-type-qa', text: suggestion }}
        onSend={() => setSent(value => value + 1)} />
    </section>
    <p className="my-6 text-xs" data-testid="send-count">已发送 {sent}</p>
    <section data-testid="text-composer">
      <TextChatComposer id="text-only" value={remote} onChange={setRemote} onSend={() => { setSent(value => value + 1); setRemote(''); }}
        disabled={false} label="文本会话" placeholder="输入消息…" sendLabel="发送文本会话" status="文本会话 · 合成数据" />
    </section>
  </main>;
}
const appearanceMode = new URLSearchParams(location.search).get('appearance') === 'light' ? 'light' : 'dark';
createRoot(document.getElementById('root')!).render(
  <ThemeRuntimeProvider selection={{ themeId: 'sage', appearanceMode }} persistBootstrapSnapshot={false}>
    <ToastProvider><ImagePreviewProvider><Fixture /></ImagePreviewProvider></ToastProvider>
  </ThemeRuntimeProvider>,
);
