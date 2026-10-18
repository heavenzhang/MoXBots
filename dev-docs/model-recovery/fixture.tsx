import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { VirtuosoHandle } from 'react-virtuoso';
import MessageList from '@/components/MessageList';
import GoalStatusBar from '@/components/goal/GoalStatusBar';
import { ThemeRuntimeProvider } from '@/theme';
import { ImagePreviewProvider } from '@/context/ImagePreviewContext';
import { ToastProvider } from '@/components/Toast';
import { i18n } from '@/i18n';
import type { SessionGoal } from '@/types/sessionGoal';
import type { Message as MessageType } from '@/types/chat';
import '@/index.css';

void i18n.changeLanguage('zh-CN');

type RecoveryState = 'waiting' | 'paused' | 'success';
const startedAt = Date.parse('2026-10-19T01:00:00Z');
const conversation: readonly MessageType[] = [
  {
    id: 'fixture-user', role: 'user', timestamp: new Date(startedAt),
    content: '请完成这项工作，并保留已经确认的进度。',
  },
  {
    id: 'fixture-assistant', role: 'assistant', timestamp: new Date(startedAt + 1000),
    content: '我已完成前置检查，正在等待模型服务恢复后继续。',
  },
];

function Fixture() {
  const [dark, setDark] = useState(true);
  const [isGoal, setIsGoal] = useState(false);
  const [state, setState] = useState<RecoveryState>('waiting');
  const [nextRetryAt, setNextRetryAt] = useState(() => Date.now() + 18_000);
  const [attempt, setAttempt] = useState(2);
  const [goalStatus, setGoalStatus] = useState<'active' | 'paused' | 'canceled'>('active');
  const [pauseCalls, setPauseCalls] = useState(0);
  const [cancelCalls, setCancelCalls] = useState(0);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const followEnabledRef = useRef<boolean | 'force'>(true);
  const goal: SessionGoal = {
    id: 'fixture-goal', workspacePath: '/synthetic/workspace', sessionId: 'fixture-session',
    objective: '完成合成的模型恢复回放', status: goalStatus,
    endConditions: { aiCanExit: false }, notifyEnabled: false, permissionMode: 'default',
    turnCount: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    totalDurationMs: 24_000, totalTokens: 1800, revision: 3, controlRevision: 1,
    isExecuting: state === 'waiting' && goalStatus === 'active', executionNumber: 3,
  };
  const systemStatus = state === 'waiting'
    ? `model_recovery:${nextRetryAt}:${attempt}`
    : state === 'paused' ? 'model_recovery_paused' : null;

  const advance = () => {
    setNextRetryAt(Date.now() + 18_000);
    setAttempt(value => value + 1);
    setState('waiting');
    setGoalStatus('active');
  };

  return <ThemeRuntimeProvider selection={{ themeId: 'myagents-default', appearanceMode: dark ? 'dark' : 'light' }}>
    <ToastProvider><ImagePreviewProvider>
      <main className="h-screen overflow-y-auto bg-[var(--paper)] text-[var(--ink)]">
        <div className="mx-auto max-w-3xl px-3 py-5">
          <p className="mb-3 text-xs text-[var(--ink-secondary)]">MOXBOTS-MODEL-RECOVERY-001 · 合成 UI 回放 · 使用生产 MessageList、GoalStatusBar 与原状态行</p>
          <div className="mb-4 flex flex-wrap gap-2">
            <button className="rounded border border-[var(--line)] px-2 py-1 text-sm" onClick={() => setDark(value => !value)}>切换明暗</button>
            <button className="rounded border border-[var(--line)] px-2 py-1 text-sm" onClick={() => setIsGoal(value => !value)}>切换普通会话 / Goal</button>
            <button className="rounded border border-[var(--line)] px-2 py-1 text-sm" onClick={() => { setState('waiting'); setNextRetryAt(Date.now() + 18_000); }}>等待中</button>
            <button className="rounded border border-[var(--line)] px-2 py-1 text-sm" onClick={() => setState('paused')}>暂停</button>
            <button className="rounded border border-[var(--line)] px-2 py-1 text-sm" onClick={() => setState('success')}>恢复完成</button>
            <button className="rounded border border-[var(--line)] px-2 py-1 text-sm" onClick={advance}>下一轮等待</button>
          </div>
          <p className="mb-2 text-xs text-[var(--ink-muted)]">以下为本地合成状态，不连接恢复后端。等待倒计时来自生产 MessageList 的既有 status row tick。</p>
          {isGoal && <GoalStatusBar
            goal={goal}
            isExecuting={goal.isExecuting}
            onPause={() => { setPauseCalls(value => value + 1); setGoalStatus('paused'); setState('paused'); }}
            onResume={() => { setGoalStatus('active'); advance(); }}
            onCancel={() => { setCancelCalls(value => value + 1); setGoalStatus('canceled'); setState('paused'); }}
          />}
          <section className="flex min-h-[280px] flex-col overflow-hidden rounded-b-lg border border-[var(--line)] bg-[var(--paper-elevated)]" style={{ height: 'min(65vh, 560px)' }} aria-label="合成对话输出">
            <div className="flex min-h-0 flex-1 flex-col" style={{ height: '100%' }}>
              <MessageList
                messages={conversation}
                streamingMessage={null}
                isLoading={state === 'waiting'}
                isStreaming={false}
                isActive
                sessionId="fixture-session"
                systemStatus={systemStatus}
                sessionState={state === 'waiting' ? 'running' : 'idle'}
                virtuosoRef={virtuosoRef}
                followEnabledRef={followEnabledRef}
                scrollToBottom={() => undefined}
                handleAtBottomChange={() => undefined}
              />
            </div>
          </section>
          <div className="mt-2 text-xs text-[var(--ink-muted)]" aria-live="polite">
            Goal 原回调计数：Pause {pauseCalls} · Cancel {cancelCalls}
          </div>
        </div>
      </main>
    </ImagePreviewProvider></ToastProvider>
  </ThemeRuntimeProvider>;
}

createRoot(document.getElementById('root')!).render(<Fixture />);
