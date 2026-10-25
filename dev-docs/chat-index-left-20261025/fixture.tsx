// Offline QA: actual MessageList, QueryNavigator, scroll model/controller and theme.
import React, { useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import '@/i18n';
import '@/index.css';
import MessageList from '@/components/MessageList';
import QueryNavigator from '@/components/chat/QueryNavigator';
import { ImagePreviewProvider } from '@/context/ImagePreviewContext';
import { ThemeRuntimeProvider } from '@/theme/ThemeRuntime';
import { useChatScrollModel } from '@/hooks/useChatScrollModel';
import { useChatScrollController } from '@/hooks/useChatScrollController';
import type { Message } from '@/types/chat';

const messages: Message[] = Array.from({ length: 80 }, (_, i) => [
  { id: `q${i + 1}`, role: 'user' as const, content: `问题 ${i + 1}：核对本轮工作进度与交付结果`, timestamp: new Date(0) },
  { id: `a${i + 1}`, role: 'assistant' as const, content: `已核对第 ${i + 1} 轮记录。\n\n${'正文保持可滚动，索引定位沿用原有虚拟列表。'.repeat(16)}`, timestamp: new Date(0) },
]).flat();

function Fixture() {
  const rootRef = useRef<HTMLDivElement>(null);
  const model = useChatScrollModel({ historyMessages: messages, streamingMessage: null, sessionId: 'offline-index-qa' });
  const ctrl = useChatScrollController({ messages: model.data, isActive: true, sessionId: 'offline-index-qa', rootRef });
  useLayoutEffect(() => {
    Object.assign(window, { indexAudit: {
      snapshot: () => ({
        top: ctrl.scrollerRef.current?.scrollTop,
        height: ctrl.scrollerRef.current?.scrollHeight,
        viewport: ctrl.scrollerRef.current?.clientHeight,
        follow: ctrl.followEnabledRef.current,
      }),
    } });
  });
  return <div ref={rootRef} style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--paper-elevated)', color: 'var(--ink)' }}>
    <header style={{ padding: '18px 32px', borderBottom: '1px solid var(--line)' }}>长会话索引验收 · 合成数据</header>
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <QueryNavigator messages={model.data} scrollContainerRef={ctrl.scrollerRef as React.RefObject<HTMLDivElement | null>}
        pauseAutoScroll={ctrl.pauseAutoScroll} onNavigateToQuery={id => ctrl.scrollToMessage(id, { behavior: 'smooth', align: 'start' })} />
      <MessageList messages={model.data} streamingMessage={null} isLoading={false} sessionState="idle" isStreaming={false}
        sessionId="offline-index-qa" isActive firstItemIndex={0} heightEstimateSeed={model.heightEstimateSeed} layoutByMessageId={model.layoutByMessageId}
        virtuosoRef={ctrl.virtuosoRef} onScrollerRef={ctrl.attachScroller} followEnabledRef={ctrl.followEnabledRef}
        scrollToBottom={ctrl.scrollToBottom} handleAtBottomChange={ctrl.handleAtBottomChange} onRowLayoutChanged={ctrl.onRowLayoutChanged}
        onViewportAdmissionChanged={ctrl.onViewportAdmissionChanged} onItemsRendered={ctrl.onItemsRendered} isViewportRecoveryFenced={ctrl.isViewportRecoveryFenced} />
    </div>
    <footer style={{ padding: '16px 32px', borderTop: '1px solid var(--line)' }}><textarea aria-label="消息草稿" placeholder="输入消息…" style={{ width: '100%', resize: 'none', background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 16, padding: 12 }} /></footer>
  </div>;
}

createRoot(document.getElementById('root')!).render(
  <ThemeRuntimeProvider selection={{ themeId: 'sage', appearanceMode: 'dark' }} persistBootstrapSnapshot={false}>
    <ImagePreviewProvider><Fixture /></ImagePreviewProvider>
  </ThemeRuntimeProvider>,
);
