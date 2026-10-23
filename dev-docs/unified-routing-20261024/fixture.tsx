// Real SettingsPage; config persistence and route tiers below are synthetic browser-only transports.
import { parseAutoRoutingSettings, type AutoRoutingModifier } from '../../src/shared/autoRoute';
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ImagePreviewProvider } from '../../src/renderer/context/ImagePreviewContext';
import Settings from '../../src/renderer/pages/settings/SettingsPage';
import { ConfigDataContext, ConfigActionsContext, type ConfigActionsValue } from '../../src/renderer/config/ConfigProvider';
import { DEFAULT_CONFIG, type AppConfig, type Provider } from '../../src/renderer/config/types';
import { ToastProvider } from '../../src/renderer/components/Toast';
import { ThemeRuntimeProvider } from '../../src/renderer/theme';
import { i18n } from '../../src/renderer/i18n';
import '../../src/renderer/index.css';

const provider: Provider = {
  id: 'qa-provider', name: '验收模型服务', vendor: 'Test', cloudProvider: '模型官方', type: 'api',
  primaryModel: 'qa-fast', isBuiltin: false, config: { baseUrl: 'https://example.invalid' },
  models: ['fast', 'balanced', 'strong'].map(tier => ({ model: `qa-${tier}`, modelName: `验收 ${tier}`, modelSeries: 'test' })),
};
const providers = [provider];
const apiKeys: Record<string, string> = new URLSearchParams(location.search).has('missing-key') ? {} : { 'qa-provider': 'synthetic-not-a-real-key' };
const projects: never[] = [];
const verifyStatus = {};
const storageKey = 'unified-routing-qa';
const noop = async () => {};

function Fixture() {
  const [config, setConfig] = useState<AppConfig>(() => ({ ...DEFAULT_CONFIG,
    ...(JSON.parse(localStorage.getItem(storageKey) ?? '{}')),
  }));
  const actions = useMemo(() => new Proxy({
    updateConfig: async (patch: Partial<AppConfig>) => {
      if (patch.autoRouting && new URLSearchParams(location.search).has('fail-save')) throw new Error('Synthetic save failure');
      setConfig(current => {
        const next = { ...current, ...patch };
        localStorage.setItem(storageKey, JSON.stringify(next));
        return next;
      });
    },
    modifyAutoRoutingSettings: async (modify: AutoRoutingModifier) => {
      if (new URLSearchParams(location.search).has('fail-save')) throw new Error('Synthetic save failure');
      setConfig(current => {
        const next = { ...current, autoRouting: modify(parseAutoRoutingSettings(current.autoRouting)) };
        localStorage.setItem(storageKey, JSON.stringify(next));
        return next;
      });
    },
  }, { get: (target, key) => key in target ? target[key as keyof typeof target] : noop }) as ConfigActionsValue, []);
  return <ConfigDataContext.Provider value={{ config, projects, providers, apiKeys, providerVerifyStatus: verifyStatus,
    isLoading: false, error: null, managedCodexRuntimeUpdateInFlight: false }}>
    <ConfigActionsContext.Provider value={actions}>
      <ThemeRuntimeProvider selection={null} persistBootstrapSnapshot={false}>
        <ImagePreviewProvider><ToastProvider><Settings mode="settings" initialSection={new URLSearchParams(location.search).get('section') ?? 'providers'} isActive /></ToastProvider></ImagePreviewProvider>
      </ThemeRuntimeProvider>
    </ConfigActionsContext.Provider>
  </ConfigDataContext.Provider>;
}
await i18n.changeLanguage(new URLSearchParams(location.search).get('lang') ?? 'zh-CN');
createRoot(document.getElementById('root')!).render(<Fixture />);
