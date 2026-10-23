import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { VirtuosoHandle } from 'react-virtuoso';
import MessageList from '@/components/MessageList';
import SimpleChatInput from '@/components/SimpleChatInput';
import { ConfigDataContext } from '@/config/ConfigProvider';
import { DEFAULT_CONFIG } from '@/config/types';
import { ThemeRuntimeProvider } from '@/theme';
import { ToastProvider } from '@/components/Toast';
import { ImagePreviewProvider } from '@/context/ImagePreviewContext';
import { i18n } from '@/i18n';
import type { Message } from '@/types/chat';
import '@/index.css';

void i18n.changeLanguage('zh-CN');
const messages: Message[] = Array.from({ length: 32 }, (_, i) => ({
  id: `fixture-${i}`, role: i % 2 ? 'assistant' : 'user', timestamp: new Date(),
  content: i === 31 ? '本轮未切换备用模型：未开启跨档接管。' : `合成历史记录 ${i + 1}：用于验证向上滚动后的恢复状态可见性。`,
}));
function Fixture() {
  const [state, setState] = useState<'waiting' | 'paused' | 'completed'>('waiting');
  const [next, setNext] = useState(() => Date.now() + 45_000);
  const [dark, setDark] = useState(true);
  const [narrow, setNarrow] = useState(false);
  const [stops, setStops] = useState(0);
  const [sends, setSends] = useState(0);
  const [height, setHeight] = useState(180);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const followEnabledRef = useRef<boolean | 'force'>(true);
  const systemStatus = state === 'waiting' ? `model_recovery:${next}:3`
    : state === 'paused' ? 'model_recovery_paused' : null;
  const buttonClass = 'rounded border border-[var(--line)] px-2 py-1 text-xs';
  return <ThemeRuntimeProvider selection={{ themeId: 'myagents-default', appearanceMode: dark ? 'dark' : 'light' }}>
    <ConfigDataContext.Provider value={{ config: DEFAULT_CONFIG, projects: [], providers: [], apiKeys: {}, providerVerifyStatus: {}, isLoading: false, error: null, managedCodexRuntimeUpdateInFlight: false }}>
      <ToastProvider><ImagePreviewProvider>
        <main className="flex h-screen flex-col bg-[var(--paper)] text-[var(--ink)]" style={{ maxWidth: narrow ? 380 : undefined, margin: 'auto' }}>
          <header className="shrink-0 space-y-2 border-b border-[var(--line)] p-3">
            <p className="text-xs">MB-SESSION-OUTPUT-20261024-02 · 本地合成验收 · 无模型或业务调用</p>
            <div className="flex flex-wrap gap-2">
              <button className={buttonClass} onClick={() => { setNext(Date.now() + 45_000); setState('waiting'); }}>重新等待</button>
              <button className={buttonClass} onClick={() => { setNext(Date.now() - 1); setState('waiting'); }}>到达重试时间</button>
              <button className={buttonClass} onClick={() => setState('completed')}>恢复完成</button>
              <button className={buttonClass} onClick={() => setDark(value => !value)}>明暗</button>
              <button className={buttonClass} onClick={() => setNarrow(value => !value)}>窄屏</button>
              <button className={buttonClass} onClick={() => { followEnabledRef.current = false; virtuosoRef.current?.scrollToIndex({ index: 0 }); }}>查看最早记录</button>
            </div>
            <p className="text-xs" role="status">状态 {state} · Stop {stops} · Send {sends}</p>
          </header>
          <section className="relative flex min-h-0 flex-1 flex-col" aria-label="验收会话">
            <MessageList messages={messages} streamingMessage={null} isLoading={state === 'waiting'} isStreaming={false}
              isActive sessionId="fixture-stall" systemStatus={systemStatus} sessionState={state === 'waiting' ? 'running' : 'idle'}
              virtuosoRef={virtuosoRef} followEnabledRef={followEnabledRef} firstItemIndex={0} bottomSpacerPx={height}
              scrollToBottom={() => undefined} handleAtBottomChange={() => undefined} />
            <SimpleChatInput runtime="builtin" providerAvailable isLoading={state === 'waiting'}
              sessionId="fixture-stall" value="保留的输入" systemStatus={systemStatus}
              onOverlayHeightChange={setHeight} onStop={() => { setStops(value => value + 1); setState('paused'); }}
              onSend={() => { setSends(value => value + 1); setState('completed'); return true; }} />
          </section>
        </main>
      </ImagePreviewProvider></ToastProvider>
    </ConfigDataContext.Provider>
  </ThemeRuntimeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
