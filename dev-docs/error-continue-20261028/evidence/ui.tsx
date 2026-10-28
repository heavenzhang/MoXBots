import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { i18n } from '../../../src/renderer/i18n';
import '../../../src/renderer/index.css';
import '../../../src/renderer/theme/themes/default-black.css';
import { ErrorRecoveryAction } from '../../../src/renderer/components/ErrorRecoveryAction';
import { projectErrorRecovery, type ErrorRecovery } from '../../../src/renderer/pages/errorMessageResend';
import { SESSION_CONTINUATION_PROMPT } from '../../../src/shared/sessionContinuation';
import type { Message } from '../../../src/renderer/types/chat';

void i18n.changeLanguage('zh-CN');
const original: Message = { id: 'u1', role: 'user', content: '完成示例任务的三个步骤', timestamp: new Date(0) };
const receipts: { kind: string; text?: string; turnId?: string }[] = [];
function Fixture() {
  const [mode, setMode] = useState('partial');
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const user: Message = { ...original, ...(mode === 'failed' || mode === 'unknown' ? { deliveryStatus: 'failed', deliveryUnconfirmed: mode === 'unknown' } : {}) };
  const messages: Message[] = [user, ...(mode === 'partial' || mode === 'failure' || mode === 'complete'
    ? [{ id: 'a1', role: 'assistant' as const, content: '步骤 1 已完成，结果已保存。步骤 2 尚未完成。', timestamp: new Date(0), turnId: 't1', transcriptState: mode === 'complete' ? 'complete' as const : 'interrupted' as const }] : [])];
  const recovery = projectErrorRecovery(messages, 'u1', { turnId: 't1', rootUserMessageId: 'u1', status: 'error' });
  const recover = async (action: ErrorRecovery) => {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (mode === 'failure') throw new Error('synthetic offline');
    receipts.push(action.kind === 'continue' ? { kind: action.kind, text: SESSION_CONTINUATION_PROMPT, turnId: action.turnId }
      : action.kind === 'resend' ? { kind: action.kind, text: action.message.content as string } : { kind: action.kind });
    setCount(receipts.length);
  };
  return <main style={{ fontFamily: 'var(--font-body)', color: 'var(--ink)', background: 'var(--paper)', minHeight: '100vh', padding: 20 }}>
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>错误恢复 · 隔离验收</h1>
      <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        {['partial', 'failed', 'unknown', 'failure', 'complete'].map(value => <button key={value} data-mode={value} onClick={() => { setMode(value); setBusy(false); }} style={{ border: '1px solid var(--line)', padding: '6px 12px', borderRadius: 6 }}>{value}</button>)}
        <button data-testid="busy" onClick={() => setBusy(value => !value)}>切换忙碌</button>
      </nav>
      <div className="border-b border-[var(--line)] bg-[var(--paper-inset)] px-4 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span style={{ flex: '1 1 240px', overflowWrap: 'anywhere' }}><strong>AI 调用失败：</strong>（502）供应商网关错误，连接已中断。</span>
          <ErrorRecoveryAction key={mode} sessionId="synthetic-session" recovery={recovery} disabled={busy}
            onRecover={recover} onUnavailable={() => { receipts.push({ kind: 'unavailable' }); setCount(receipts.length); }} />
        </div>
      </div>
      <div style={{ padding: '24px 0', lineHeight: 1.8 }}>{messages.map(message => <p key={message.id}>{String(message.content)}</p>)}</div>
      <textarea aria-label="draft" defaultValue="保留这份尚未发送的草稿" style={{ width: '100%', padding: 12, border: '1px solid var(--line)', borderRadius: 10 }} />
      <output data-testid="receipts" data-count={count} style={{ display: 'block', marginTop: 20, overflowWrap: 'anywhere' }}>{JSON.stringify(receipts)}</output>
    </div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
