// Development-only, read-only layout fixture. Not native/data acceptance.
import { createRoot } from 'react-dom/client';
import { DEFAULT_CONFIG } from '../../src/renderer/config/types';
import { ConfigDataContext, ConfigActionsContext, type ConfigDataValue, type ConfigActionsValue } from '../../src/renderer/config/ConfigProvider';
import { ToastProvider } from '../../src/renderer/components/Toast';
import { ConfiguredThemeRuntime } from '../../src/renderer/theme';
import { i18n } from '../../src/renderer/i18n';
import BotCarePanel from '../../src/renderer/components/bot-care/BotCarePanel';
import '../../src/renderer/index.css';

if (!import.meta.env.DEV) throw new Error('Layout fixture is development-only');
await i18n.changeLanguage('zh-CN');
const entries = [
  { id: 'care-layout-a', name: '文案 Bot · 布局验证', icon: 'bot:mox' },
  { id: 'care-layout-b', name: '研究 Bot · 布局验证', icon: 'bot:moss' },
];
const data: ConfigDataValue = {
  config: { ...DEFAULT_CONFIG, appearanceMode: new URLSearchParams(location.search).get('appearance') === 'light' ? 'light' : 'dark', agents: entries.map(item => ({ ...item, enabled: false, providerId: '', model: '', permissionMode: 'plan', channels: [] })) },
  projects: entries.map(item => ({ id: `project-${item.id}`, agentId: item.id, name: item.name, path: `/layout-fixture/${item.id}`, icon: item.icon, lastOpened: '', providerId: null, permissionMode: null })),
  providers: [], apiKeys: {}, providerVerifyStatus: {}, isLoading: false, error: null, managedCodexRuntimeUpdateInFlight: false,
};
const actions = { refreshConfig: async () => {}, reload: async () => {} } as ConfigActionsValue;
createRoot(document.getElementById('root')!).render(
  <ConfigDataContext.Provider value={data}><ConfigActionsContext.Provider value={actions}>
    <ConfiguredThemeRuntime /><ToastProvider>
      <BotCarePanel onClose={() => {}} onCreateBot={() => {}} onStartWork={() => {}} />
      <p style={{ position: 'fixed', bottom: 0, left: 0, zIndex: 9999, background: 'var(--paper)', color: 'var(--ink-muted)', fontSize: 12 }}>布局验证 · 模拟名册 · 浏览器文件服务不可用 · 非客户端验收</p>
    </ToastProvider>
  </ConfigActionsContext.Provider></ConfigDataContext.Provider>,
);
