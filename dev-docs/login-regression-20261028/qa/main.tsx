import React from 'react';
import { createRoot } from 'react-dom/client';
import { i18n } from '@/i18n';
import '@/theme/themes/default-black.css';
import './qa.css';
import { JoinNetworkDialog } from '@/features/agent-network/JoinNetworkDialog';

const scenario = new URLSearchParams(location.search).get('scenario');
await i18n.changeLanguage('zh-CN');
function Fixture() {
  const [visible, show] = React.useState(true);
  const starts = React.useRef(0);
  const polls = React.useRef(0);
  return <main style={{ minHeight: '100dvh', padding: 24, color: 'var(--ink)', background: 'var(--paper)' }}>
    <h1>登录流程合成验收</h1>
    <p>使用实际登录组件和本地合成回调，不打开真实授权页。</p>
    {visible ? <JoinNetworkDialog accountOnly initialUrl="https://fixture.invalid" title="登录 MoXBots"
      onConfirm={async () => {}}
      onOwnedStart={async () => {
        starts.current++;
        if (scenario === 'timeout' && starts.current === 1)
          throw { code: 'NETWORK_CONNECTION_TIMEOUT', retryable: true };
        return { attemptId: 'synthetic-attempt', authorizationUrl: 'https://fixture.invalid/authorize', expiresAt: Date.now() / 1000 + 120 };
      }}
      onOwnedOpen={async () => {}}
      onOwnedPoll={async () => ++polls.current < 2 ? 'pending' : 'authenticated'}
      onOwnedCancel={async () => {}}
      onCancel={() => show(false)}
    /> : <p role="status">弹窗已关闭</p>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
