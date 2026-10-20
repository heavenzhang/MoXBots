import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ExecutionQuality from '@/components/ExecutionQuality';
import { i18n } from '@/i18n';
import type { Message } from '@/types/chat';
import type { StreamRecoveryEvidence } from '../../src/shared/streamRecovery';
import '@/index.css';

void i18n.changeLanguage('zh-CN');
function Preview() {
  const [status, setStatus] = useState<StreamRecoveryEvidence['status']>('waiting');
  const [legacy, setLegacy] = useState(false);
  const message: Message = { id: 'fixture-stream', role: 'assistant', timestamp: new Date(1_800_000_000_000),
    content: '已保留此前执行进度。', usage: { inputTokens: 1200, outputTokens: 180, model: 'fixture-model' },
    ...(!legacy ? { streamRecovery: { version: 1 as const, interruptions: 2, continuations: status === 'waiting' ? 1 : 2,
      protectedActions: 3, status, startedAt: 1_800_000_000_000, updatedAt: 1_800_000_045_000 } } : {}) };
  return <main className="min-h-screen bg-[var(--paper)] p-4 text-[var(--ink)]">
    <div className="mx-auto max-w-2xl">
      <p className="mb-4 text-sm">合成恢复证据 · 实际质量参考组件</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {(['waiting', 'resuming', 'completed', 'stopped', 'blocked'] as const).map(value => <button className="rounded border px-2 py-1" key={value} onClick={() => setStatus(value)}>{value}</button>)}
        <button className="rounded border px-2 py-1" onClick={() => setLegacy(!legacy)}>legacy</button>
        <button className="rounded border px-2 py-1" onClick={() => void i18n.changeLanguage(i18n.language === 'zh-CN' ? 'en-US' : 'zh-CN')}>中 / EN</button>
      </div>
      <p className="mb-4">{message.content as string}</p>
      <ExecutionQuality message={message} live={status === 'waiting' || status === 'resuming'} />
    </div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
