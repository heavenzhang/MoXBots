import React from 'react';
import { createRoot } from 'react-dom/client';
import { i18n } from '@/i18n';
import '@/theme/themes/default-black.css';
import './qa.css';
import { JoinNetworkDialog } from '@/features/agent-network/JoinNetworkDialog';

const params = new URLSearchParams(location.search);
const scenario = params.get('scenario') ?? 'serial-success';
const locale = params.get('locale') ?? 'zh-CN';
await i18n.changeLanguage(locale);
const q = window.qa = {
  trace: [] as Array<Record<string, unknown>>,
  shown: true,
  openCount: 0,
  pollCount: 0,
  cancelCount: 0,
  closeCount: 0,
  lateResolve: null as null | ((value: 'authenticated' | 'pending') => void),
  startCount: 0,
};
function LoginFixture() {
  const [shown, setShown] = React.useState(true);
  const [finished, setFinished] = React.useState(false);
  const [attemptNo, setAttemptNo] = React.useState(0);
  return <main style={{ minHeight: '100dvh', padding: 24, color: 'var(--ink)', background: 'var(--paper)' }}>
    <h1 style={{ fontSize: 18 }}>Synthetic login lifecycle</h1>
    <p>All login callbacks are local fixture functions. No authorization URL is opened.</p>
    <pre data-testid="login-trace" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(q.trace, null, 2)}</pre>
    {shown && <JoinNetworkDialog accountOnly initialUrl="https://cloud.test" title="登录 MoXBots"
      onConfirm={async () => {}}
      onOwnedStart={async () => {
        q.startCount++;
        q.trace.push({ event: 'start', attemptId: 'synthetic-attempt-' + q.startCount });
        setAttemptNo(q.startCount);
        return { attemptId: 'synthetic-attempt-' + q.startCount,
          authorizationUrl: 'https://cloud.test/authorize?state=synthetic-only',
          expiresAt: Date.now() / 1000 + (scenario === 'expiry' ? 3 : 120) };
      }}
      onOwnedOpen={async (attemptId) => {
        q.openCount++;
        q.trace.push({ event: 'open', attemptId, ordinal: q.openCount });
        if (scenario === 'open-failure' && q.openCount === 1) throw new Error('Synthetic browser launch failed');
      }}
      onOwnedPoll={async (attemptId) => {
        q.pollCount++;
        q.trace.push({ event: 'poll', attemptId, ordinal: q.pollCount });
        if (scenario === 'cancel-late') return new Promise(resolve => { q.lateResolve = resolve; });
        if (scenario === 'serial-success' && q.pollCount === 1) return 'pending';
        if (scenario === 'serial-success' && q.pollCount >= 2) return 'authenticated';
        return 'pending';
      }}
      onOwnedCancel={async (attemptId) => {
        q.cancelCount++;
        q.trace.push({ event: 'cancel', attemptId });
      }}
      onCancel={() => {
        q.closeCount++;
        q.trace.push({ event: 'dialog-close', ordinal: q.closeCount });
        setShown(false);
        setFinished(true);
      }} />}
    {finished && <p role="status">Synthetic login complete or cancelled.</p>}
    <output data-testid="attempt-number">{attemptNo}</output>
  </main>;
}
createRoot(document.getElementById('root')!).render(<LoginFixture />);
