// Real production presentation components with synthetic state only. No API,
// provider, credentials, installed application or business Session is used.
import React, { useContext, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { VirtuosoHandle } from 'react-virtuoso';
import { ThemeRuntimeProvider } from '../../src/renderer/theme';
import { ImagePreviewProvider } from '../../src/renderer/context/ImagePreviewContext';
import { i18n } from '../../src/renderer/i18n';
import MessageList from '../../src/renderer/components/MessageList';
import TabActivityIndicator from '../../src/renderer/components/TabActivityIndicator';
import SubagentInspector from '../../src/renderer/components/agent-status/SubagentInspector';
import { TabContext } from '../../src/renderer/context/TabContext';
import { useQueryElapsedClock } from '../../src/renderer/hooks/useQueryElapsedClock';
import type { Message } from '../../src/renderer/types/chat';
import './preview.css';

type Phase = 'background' | 'review' | 'native' | 'restored' | 'complete';
const messages: Message[] = [
  { id: 'synthetic-user', role: 'user', content: '请调研实现方案，并完成修改和验证。', timestamp: new Date(0) },
  { id: 'synthetic-assistant', role: 'assistant', content: '已登记子任务及验收要求。调研仍在后台进行，结果返回后继续核验和实施。', timestamp: new Date(0) },
];
const recoveredMessage: Message = {
  id: 'synthetic-recovered', role: 'assistant', timestamp: new Date(0), content: [
    { id: 'recovered-text', type: 'text', text: '已恢复执行过程。调研完成，实施尚未验收；上一轮中断后，先核查未确认的操作结果。' },
    { id: 'recovered-tool', type: 'tool_use', tool: {
      id: 'synthetic-child', name: 'Agent', input: { description: '调研现有模块', prompt: '只读调研现有模块，返回发现和证据。' },
      subagentLifecycle: { status: 'completed', startedAt: 1000, finishedAt: 2000, result: '调研记录已返回：已定位现有统计接口，等待主 Agent 核验。' },
      subagentCalls: [{ id: 'synthetic-read', name: 'Read', input: {}, result: '已读取现有接口定义；尚未执行写入。' }],
    } },
  ],
};

function Preview() {
  const contextDefaults = useContext(TabContext);
  const [phase, setPhase] = useState<Phase>('background');
  const [dark, setDark] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const follow = useRef<boolean | 'force'>(true);
  const isLoading = phase === 'review';
  const hasBackgroundWork = phase === 'background';
  const hasNativeWork = phase === 'native';
  const sessionIsRunning = isLoading || hasBackgroundWork || hasNativeWork;
  const { getElapsedSeconds } = useQueryElapsedClock(sessionIsRunning, false, 'synthetic-session');
  const restored = phase === 'restored';
  const liveMessage = restored ? recoveredMessage : null;
  const visibleMessages = liveMessage ? [...messages, liveMessage] : messages;
  return <ThemeRuntimeProvider selection={{ themeId: 'proof', appearanceMode: dark ? 'dark' : 'light' }} persistBootstrapSnapshot={false}><ImagePreviewProvider><TabContext.Provider value={{ ...contextDefaults, tabId: 'synthetic-tab', sessionId: 'synthetic-session', messages: visibleMessages, historyMessages: messages, streamingMessage: liveMessage, isLoading }}>
    <div style={{ width: narrow ? 390 : '100%', maxWidth: '100vw', height: '100vh', margin: 'auto', color: 'var(--ink)', background: 'var(--paper)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: 16, borderBottom: '1px solid var(--line)', fontSize: 12 }}>
        <p>隔离组件验收 · 合成状态 · 非已安装客户端</p>
        <nav aria-label="验收操作" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
          <button onClick={() => setPhase('background')}>后台执行</button>
          <button onClick={() => setPhase('review')}>子任务返回，主线程核验</button>
          <button onClick={() => setPhase('native')}>原生接续执行</button>
          <button onClick={() => { setPhase('restored'); setDetailsOpen(true); }}>恢复未完成过程</button>
          <button onClick={() => setPhase('complete')}>完成验收</button>
          <button onClick={() => setDark(value => !value)}>切换明暗</button>
          <button onClick={() => setNarrow(value => !value)}>切换窄窗</button>
        </nav>
      </header>
      <div style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: narrow ? 'column' : 'row' }}>
        <aside aria-label="会话列表" style={{ padding: 20, width: narrow ? '100%' : 240, borderRight: '1px solid var(--line)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <TabActivityIndicator isGenerating={sessionIsRunning} />
            <span>调研与实现</span>
          </div>
        </aside>
        <main style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 20px', fontSize: 13 }}>
            {phase === 'background' ? '子 Agent：执行中 · 主 Agent：等待结果' : phase === 'review' ? '主 Agent：核验中' : phase === 'native' ? '主 Agent：继续执行' : restored ? '执行中断 · 已恢复过程 · 业务任务尚未完成' : '合成验收状态：已完成'}
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <MessageList messages={visibleMessages} streamingMessage={liveMessage} isLoading={isLoading}
              firstItemIndex={1_000_000}
              hasBackgroundWork={hasBackgroundWork} sessionState={isLoading ? 'running' : 'idle'}
              hasNativeWork={hasNativeWork}
              getQueryElapsedSeconds={getElapsedSeconds} sessionId="synthetic-session"
              virtuosoRef={virtuosoRef} followEnabledRef={follow} scrollToBottom={() => undefined}
              handleAtBottomChange={() => undefined} />
          </div>
        </main>
        {restored && detailsOpen && <SubagentInspector toolId="synthetic-child" overlay={narrow} onClose={() => setDetailsOpen(false)} onJumpToTool={() => setDetailsOpen(false)} />}
      </div>
    </div>
  </TabContext.Provider></ImagePreviewProvider></ThemeRuntimeProvider>;
}

void i18n.changeLanguage('zh-CN').then(() => createRoot(document.getElementById('root')!).render(<Preview />));
