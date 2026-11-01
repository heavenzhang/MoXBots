// Real AutoRoutingSettings with synthetic models and in-memory config persistence.
import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';

import type { AppConfig } from '../../src/shared/config-types';
import { AUTO_TIERS, type AutoRouteManagedModel } from '../../src/shared/autoRoute';
import { i18n } from '../../src/renderer/i18n';
import '../../src/renderer/index.css';
import { AutoRoutingSettings, type AutoRouteTiersView } from '../../src/renderer/pages/settings/AutoRoutingSettings';

const models: AutoRouteManagedModel[] = Array.from({ length: 23 }, (_, index) => {
  const inPool = index < 17;
  return {
    providerId: `provider-${index % 3}`,
    providerName: `验收供应商 ${index % 3 + 1}`,
    model: `${inPool ? 'candidate' : 'directory'}-${index + 1}`,
    modelName: inPool ? `验收模型 ${String(index + 1).padStart(2, '0')}` : `验收目录 ${index + 1}`,
    tier: AUTO_TIERS[index % AUTO_TIERS.length],
    source: 'catalog',
    inPool,
    enabled: inPool,
    available: true,
  };
});
const view: AutoRouteTiersView = {
  enabled: true,
  classifier: { providerId: 'provider-0', model: 'candidate-1', chosenBy: 'auto' },
  tiers: Object.fromEntries(AUTO_TIERS.map(tier => [tier, models.filter(model => model.inPool && model.tier === tier)])) as AutoRouteTiersView['tiers'],
  models,
};

function Fixture() {
  const [value, setValue] = useState<unknown>({});
  const loadTiers = useCallback(async () => view, []);
  const updateConfig = useCallback(async (patch: Partial<AppConfig>) => { setValue(patch.autoRouting); }, []);
  return <div className="flex h-screen">
    <main id="settings-scroll" className="h-full flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <AutoRoutingSettings value={value} updateConfig={updateConfig} loadTiers={loadTiers} />
      </div>
    </main>
  </div>;
}

await i18n.changeLanguage('zh-CN');
createRoot(document.getElementById('root')!).render(<Fixture />);
