/** Real binding components with synthetic data; no account connection or messages. */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import '../i18n';
import { ThemeRuntimeProvider } from '../theme';
import { ToastProvider } from '../components/Toast';
import { BotImBindingsView } from '../components/ImSettings/BotImBindings';
import BotPlatformRegistry from '../components/ImSettings/BotPlatformRegistry';
import type { AgentConfig } from '../../shared/types/agent';
import type { Project } from '../config/types';
import type { AgentStatusMap } from '../hooks/useAgentStatuses';

const agents: AgentConfig[] = [
  { id: 'sales', name: '销售助理', icon: 'bot:spark', enabled: false, permissionMode: 'auto', channels: [
    { id: 'lark', type: 'openclaw:openclaw-lark', name: '销售机器人', enabled: true, allowedUsers: ['demo-1'] },
    { id: 'wecom', type: 'openclaw:wecom-openclaw-plugin', name: '客户服务', enabled: true, allowedUsers: ['demo-2'] },
    { id: 'weixin', type: 'openclaw:openclaw-weixin', enabled: false },
  ] },
  { id: 'research', name: '资料助手', icon: 'bot:moss', enabled: false, permissionMode: 'auto', channels: [] },
];
const projects: Project[] = agents.map(agent => ({
  id: `p-${agent.id}`, agentId: agent.id, name: agent.name, path: `/demo/${agent.id}`,
  providerId: null, permissionMode: null,
}));
const statuses: AgentStatusMap = { sales: {
  agentId: 'sales', agentName: '销售助理', enabled: false,
  channels: [{ channelId: 'lark', channelType: 'openclaw:openclaw-lark', status: 'online', uptimeSeconds: 10,
    activeSessions: [], restartCount: 0, bufferedMessages: 0 }],
} };
function Fixture() {
  const [light, setLight] = useState(true);
  const [selection, setSelection] = useState('尚未选择 Bot');
  return <ThemeRuntimeProvider selection={{ themeId: 'sage', appearanceMode: light ? 'light' : 'dark' }} persistBootstrapSnapshot={false}>
    <ToastProvider>
      <main className="min-h-dvh bg-[var(--paper)] p-4 text-[var(--ink)] sm:p-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6 flex flex-wrap gap-4 text-xs">
            <span>IM 绑定 · 真实组件 / 合成数据</span>
            <button onClick={() => setLight(value => !value)}>切换主题</button>
            <output>{selection}</output>
          </div>
          <BotImBindingsView config={{ agents }} projects={projects} statuses={statuses} onChanged={async () => {}} />
          <BotPlatformRegistry agents={agents} projects={projects} onAddToWorkspace={(platform, project) => setSelection(`${platform} → ${project.agentId}`)} />
        </div>
      </main>
    </ToastProvider>
  </ThemeRuntimeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
