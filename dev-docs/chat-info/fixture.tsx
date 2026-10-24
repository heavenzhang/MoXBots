import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { VirtuosoHandle } from 'react-virtuoso';
import MessageList from '@/components/MessageList';
import { ThemeRuntimeProvider } from '@/theme';
import { ToastProvider } from '@/components/Toast';
import { ImagePreviewProvider } from '@/context/ImagePreviewContext';
import { FileActionProvider } from '@/context/FileActionContext';
import { i18n } from '@/i18n';
import type { ContentBlock, Message } from '@/types/chat';
import '@/index.css';

void i18n.changeLanguage('zh-CN');
const noop = () => {};
const start = Date.parse('2026-10-20T14:00:00Z');
const tool = (id: string, name: string, input: Record<string, unknown>, result: string | undefined, extra = {}): ContentBlock => ({
  type: 'tool_use', id, tool: { id, name, input, parsedInput: input, inputJson: JSON.stringify(input), result,
    isLoading: result === undefined, streamIndex: 0, ...extra },
});
const filePath = 'reports/01-验收报告-会话恢复与权限隔离.md';
const blocks: ContentBlock[] = [
  { type: 'text', text: '已找到恢复状态没有及时更新的问题，接下来核对权限边界并验证修复。这里只使用合成事件验证界面。' },
  tool('read-one', 'Read', { file_path: '/fixture/SessionRecovery.ts' }, 'export function recover() {}'),
  tool('read-two', 'Read', { file_path: '/fixture/PermissionGuard.ts' }, 'export function checkPermission() {}'),
  { type: 'text', text: '关键进展：两个相关文件已经返回，修复记录和检查输出可展开核对。' },
  tool('write-report', 'Write', { file_path: filePath, content: '# 界面验收成果\n\n这是来自受控文件传输的预览正文。' }, 'File written successfully'),
  tool('write-second', 'Write', { file_path: 'reports/very-long-secondary-result-name-for-layout-validation.md', content: '# 验证清单' }, 'File written successfully'),
  tool('write-third', 'Write', { file_path: 'reports/第三份结果.md', content: '# 第三份结果' }, 'File written successfully'),
  tool('verify-one', 'Bash', { command: 'npm test', description: '检查会话恢复与权限边界' }, 'Tests 24 passed', { resultMeta: { exitCode: 0 } }),
  tool('verify-two', 'Bash', { command: 'npm run typecheck' }, 'Typecheck finished', { resultMeta: { exitCode: 0 } }),
  { type: 'text', text: '本地检查已返回，尚未发布。可直接打开下方文件，或展开过程记录查看依据。' },
];
function Fixture() {
  const [state, setState] = useState('read');
  const [dark, setDark] = useState(false);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const follow = useRef<boolean | 'force'>(true);
  const active = state === 'read' ? tool('active-read', 'Read', { file_path: '/fixture/CurrentCheck.ts' }, undefined)
    : state === 'command' ? tool('active-shell', 'Bash', { command: 'npm test', description: '验证修复、权限隔离与失败回滚，保留原始业务数据' }, undefined)
    : state === 'wait' ? tool('active-wait', 'TaskOutput', { description: '独立审阅：会话恢复与权限边界' }, undefined)
    : state === 'failed' ? tool('failed-check', 'Bash', { command: 'npm test' }, 'AssertionError: fixture failure', { isFailed: true, resultMeta: { exitCode: 1 } }) : null;
  const history: Message[] = [
    { id: 'user', role: 'user', timestamp: new Date(start), content: '请核对会话恢复和权限隔离，给出验证记录。' },
    { id: 'progress', role: 'assistant', timestamp: new Date(start), content: blocks },
  ];
  const live: Message | null = state === 'done' || state === 'idle' ? null : {
    id: 'current', role: 'assistant', timestamp: new Date(start), content: active ? [active] : [],
  };
  return <ThemeRuntimeProvider selection={{ themeId: 'myagents-default', appearanceMode: dark ? 'dark' : 'light' }}>
    <ToastProvider><ImagePreviewProvider><FileActionProvider workspacePath="/fixture">
      <div className="flex h-screen min-w-0 flex-col bg-[var(--paper)] text-[var(--ink)]">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--line-subtle)] px-3 py-2 text-xs">
          <span>CHAT-INFO · 合成数据 / 生产组件</span>
          <select aria-label="验收状态" value={state} onChange={e => setState(e.target.value)} className="rounded bg-[var(--paper-inset)] p-1">
            {['read','command','wait','model','permission','question','plan','compacting','recovery','stopping','failed','done','idle'].map(value => <option key={value}>{value}</option>)}
          </select>
          <button onClick={() => setDark(!dark)}>切换明暗</button>
          <button onClick={() => void i18n.changeLanguage(i18n.language === 'zh-CN' ? 'en-US' : 'zh-CN')}>中 / EN</button>
        </header>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-qa-chat>
          <MessageList messages={history} streamingMessage={live} isLoading={Boolean(live)} isStreaming={Boolean(live)}
            sessionId="chat-info-fixture" sessionState={state === 'stopping' ? 'stopping' : live ? 'running' : 'idle'}
            firstItemIndex={1_000_000}
            virtuosoRef={virtuosoRef} followEnabledRef={follow} scrollToBottom={() => virtuosoRef.current?.scrollToIndex({ index: 'LAST' })}
            handleAtBottomChange={noop} getQueryElapsedSeconds={() => 38} bottomSpacerPx={0}
            systemStatus={state === 'compacting' ? 'compacting' : state === 'recovery' ? `model_recovery:${Date.now() + 15000}:2` : null}
            pendingPermission={state === 'permission' ? { requestId: 'qa-permission', toolName: 'Bash', input: JSON.stringify({ command: 'npm test', description: '执行受控检查' }) } : null}
            onPermissionDecision={() => setState('read')}
            pendingAskUserQuestion={state === 'question' ? { requestId: 'qa-question', questions: [{ header: '范围', question: '请确认验收范围', multiSelect: false, options: [{ label: '当前任务', description: '本次界面' }, { label: '全部', description: '后续另行处理' }] }] } : null}
            onAskUserQuestionSubmit={() => setState('read')} onAskUserQuestionCancel={() => setState('read')}
            pendingExitPlanMode={state === 'plan' ? { requestId: 'qa-plan', plan: '先完成界面验收，再交由现有会话统一发布。' } : null}
            onExitPlanModeApprove={() => setState('read')} onExitPlanModeReject={() => setState('model')}
          />
        </div>
        <div className="shrink-0 border-t border-[var(--line-subtle)] px-3 py-2">
          <textarea aria-label="验收草稿" placeholder="保留对话输入空间" className="mx-auto block h-12 w-full max-w-3xl resize-none rounded-xl border border-[var(--line-subtle)] bg-[var(--paper)] px-3 py-2 text-sm" />
        </div>
      </div>
    </FileActionProvider></ImagePreviewProvider></ToastProvider>
  </ThemeRuntimeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
