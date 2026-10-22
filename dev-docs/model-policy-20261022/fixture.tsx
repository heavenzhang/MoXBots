// Actual production component + shared candidate projection, synthetic browser
// persistence only. Not an authenticated native/Provider acceptance harness.
import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AutoRoutingSettings, type AutoRouteTiersView } from '../../src/renderer/pages/settings/AutoRoutingSettings';
import { ThemeRuntimeProvider } from '../../src/renderer/theme';
import { autoModelKey, buildAutoTierTable, isAutoRoutingEnabled, parseAutoRoutingSettings, pickAutoClassifier,
  type AutoRouteManagedModel, type AutoRoutingModifier, type AutoRoutingSettings as Settings, type AutoTier } from '../../src/shared/autoRoute';
import { i18n } from '../../src/renderer/i18n';
import '../../src/renderer/index.css';

const storageKey = 'model-policy-qa-v1';
const query = new URLSearchParams(location.search);
let failLoad = query.has('fail-load');
let failSave = query.has('fail-save');
let saveDelay = 0;
const items = (['fast', 'balanced', 'strong'] as AutoTier[]).flatMap((tier, ti) =>
  Array.from({ length: [3, 7, 13][ti] }, (_, index): AutoRouteManagedModel => ({
    providerId: index % 2 ? 'qa-provider-b' : 'qa-provider-a', model: `qa-${tier}-${index + 1}`,
    modelName: index === 1 ? `同名模型 · ${tier}` : index === 2 ? `用于检查长名称的合成模型 Long Model Name ${tier} with a deliberately descriptive suffix` : `合成模型 ${tier} ${index + 1}`,
    providerName: index % 2 ? '合成供应商 B' : '合成供应商 A', tier, source: 'catalog',
    inPool: true, enabled: true, available: true,
  })));
items.push({ providerId: 'qa-disabled', providerName: '合成停用服务', model: 'qa-unavailable', modelName: '待修复的合成模型',
  tier: 'balanced', source: 'default', inPool: false, enabled: false, available: false, unavailableReason: 'provider-disabled' });
items.push({ providerId: 'qa-provider-a', providerName: '合成供应商 A', model: 'qa-embedding', modelName: '合成向量模型',
  tier: 'fast', source: 'default', inPool: false, enabled: false, available: false, unavailableReason: 'not-chat' });

const read = (): Settings => parseAutoRoutingSettings(JSON.parse(localStorage.getItem(storageKey) ?? '{}'));
function projection(settings: Settings): AutoRouteTiersView {
  const candidates = items.filter(row => row.available).map(row => ({ ...row, catalogTier: row.tier }));
  const table = buildAutoTierTable(candidates, settings);
  const classifier = pickAutoClassifier(table, settings, undefined);
  const directory = buildAutoTierTable(candidates, { ...settings, pool: undefined });
  const models = items.map(row => {
    const key = autoModelKey(row);
    const effective = Object.values(directory).flat().find(item => autoModelKey(item) === key);
    const inPool = settings.pool === undefined ? row.available : Object.hasOwn(settings.pool, key);
    return { ...row, tier: effective?.tier ?? settings.tierOverrides?.[key] ?? row.tier,
      source: effective?.source ?? row.source, inPool,
      enabled: inPool && (settings.pool === undefined || settings.pool[key]?.enabled === true) };
  });
  for (const key of Object.keys(settings.pool ?? {})) {
    if (models.some(row => autoModelKey(row) === key)) continue;
    const slash = key.indexOf('/');
    models.push({ providerId: key.slice(0, slash), model: key.slice(slash + 1), tier: 'balanced', source: 'default',
      inPool: true, enabled: settings.pool![key].enabled, available: false, unavailableReason: 'model-unavailable' });
  }
  return { enabled: isAutoRoutingEnabled(settings), tiers: table, models,
    classifier: classifier ? { ...classifier, chosenBy: settings.classifier ? 'user' : 'auto',
      available: models.some(row => autoModelKey(row) === autoModelKey(classifier) && row.inPool && row.enabled && row.available) } : null };
}

declare global { interface Window { __modelPolicyQa: {
  read: () => Settings; failSave: (value: boolean) => void; failLoad: (value: boolean) => void;
  delay: (value: number) => void; patch: (value: Partial<Settings>) => void;
}; } }
function Fixture() {
  const [value, setValue] = useState<Settings>(() => {
    if (query.has('empty')) localStorage.setItem(storageKey, JSON.stringify({ pool: {} }));
    return read();
  });
  const [destination, setDestination] = useState('');
  const modify = useCallback(async (transform: AutoRoutingModifier) => {
    if (saveDelay) await new Promise(resolve => setTimeout(resolve, saveDelay));
    if (failSave) throw new Error('Synthetic write failure');
    const latest = read(); const next = transform(latest);
    localStorage.setItem(storageKey, JSON.stringify(next)); setValue(next);
  }, []);
  const load = useCallback(async () => {
    if (failLoad) throw new Error('Synthetic directory failure');
    return projection(read());
  }, []);
  window.__modelPolicyQa = { read, failSave: value => { failSave = value; }, failLoad: value => { failLoad = value; },
    delay: value => { saveDelay = value; }, patch: patch => { const next = { ...read(), ...patch }; localStorage.setItem(storageKey, JSON.stringify(next)); setValue(next); } };
  return <ThemeRuntimeProvider selection={null} persistBootstrapSnapshot={false}>
    <main className="mx-auto max-w-5xl px-3 py-6 sm:px-8">
      <p className="mb-3 text-xs text-[var(--ink-muted)]">隔离合成验收 · 实际生产组件 · 不调用模型、不读取日常配置</p>
      <h1 className="text-lg font-semibold text-[var(--ink)]">模型策略</h1>
      <p className="mb-5 mt-2 text-sm text-[var(--ink-muted)]">选择参与自动选模的模型，维护档位与使用顺序。</p>
      <AutoRoutingSettings value={value} modifySettings={modify} updateConfig={async patch => modify(() => parseAutoRoutingSettings(patch.autoRouting))}
        loadTiers={load} providerNames={{ 'qa-provider-a': '合成供应商 A', 'qa-provider-b': '合成供应商 B' }}
        specifiedBackup={query.has('specified') ? { providerId: 'qa-provider-a', model: 'qa-balanced-1' } : undefined}
        onOpenProviders={providerId => setDestination(providerId ?? '模型供应商')} />
      {destination && <p role="status" className="mt-3 text-sm text-[var(--ink)]">供应商管理跳转：{destination}（合成夹具）</p>}
      <details id="model-failover-settings" className="mt-6 border-t border-[var(--line)] pt-4"><summary className="cursor-pointer text-sm text-[var(--ink)]">故障接管</summary><p className="py-3 text-sm text-[var(--ink-muted)]">指定备用独立于自动候选池（合成夹具）。</p></details>
    </main>
  </ThemeRuntimeProvider>;
}
await i18n.changeLanguage(query.get('lang') ?? 'zh-CN');
createRoot(document.getElementById('root')!).render(<Fixture />);
