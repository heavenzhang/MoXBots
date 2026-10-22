// Shared catalog authority for admission, settings diagnostics and failover.
// Keep this module independent of the classifier transport and Session owner.
import { autoModelKey, buildAutoTierTable, inferAutoTier, isAutoPoolEnabled, isAutoTier, isNonChatModel, parseAutoModelKey, parseAutoRoutingSettings,
  type AutoRouteManagedModel, type AutoRoutingSettings, type AutoTierCandidate, type AutoTierTable } from '../../shared/autoRoute';
import type { AppConfig, ModelEntity, Provider } from '../../shared/config-types';
import { isRuntimeBackedProvider } from '../../shared/providerExecution';
import { getAllEffectiveProviders, getProviderSelectionError, loadConfig, type AdminAppConfig } from '../utils/admin-config';
import { lookupModelCapability, lookupProviderModelContextLength } from '../utils/model-capabilities';

/** One routable model and what it takes to run it. */
export interface AutoRouteCatalogEntry extends AutoTierCandidate {
  provider: Provider;
}

export interface AutoRouteCatalog {
  settings: AutoRoutingSettings;
  table: AutoTierTable;
  entries: Map<string, AutoRouteCatalogEntry>;
  /** Full eligible directory, independent of automatic-pool membership. Used
   * only to diagnose tiers and honor explicitly configured manual backup. */
  directoryTable?: AutoTierTable;
  models?: AutoRouteManagedModel[];
}

/**
 * Providers that can take an auto-routed turn: enabled, builtin-executable,
 * selectable (credential / verified subscription). Runtime-backed providers
 * (Codex subscription) run their own Runtime and never join a builtin Session.
 */
function providerUnavailableReason(provider: Provider, config: AdminAppConfig): AutoRouteManagedModel['unavailableReason'] {
  if (provider.enabled === false) return 'provider-disabled';
  if (provider.id.startsWith('cloud-session:') || isRuntimeBackedProvider(provider)) return 'runtime-unsupported';
  try {
    if (getProviderSelectionError(provider as unknown as Parameters<typeof getProviderSelectionError>[0], config) !== null) return 'provider-unavailable';
  } catch {
    // A Host worker owns only its bound Provider credential. Another configured
    // reference may be unavailable here; that candidate is ineligible, not an
    // error in the entire catalog. Actual route materialization stays strict.
    return 'provider-unavailable';
  }
  return undefined;
}

export function buildAutoRouteCatalog(config: AdminAppConfig = loadConfig()): AutoRouteCatalog {
  const settings = parseAutoRoutingSettings((config as unknown as AppConfig).autoRouting);
  const entries = new Map<string, AutoRouteCatalogEntry>();
  const models = new Map<string, AutoRouteManagedModel>();
  for (const provider of getAllEffectiveProviders(config) as unknown as Provider[]) {
    const providerReason = providerUnavailableReason(provider, config);
    for (const entity of (provider.models ?? []) as ModelEntity[]) {
      if (!entity?.model) continue;
      const capability = lookupModelCapability(entity.model);
      const candidate: AutoRouteCatalogEntry = {
        provider,
        providerId: provider.id,
        model: entity.model,
        modelName: entity.modelName,
        ...(isAutoTier(entity.tier) ? { catalogTier: entity.tier } : {}),
        ...(capability?.outputCostPerMillion !== undefined ? { outputCostPerMillion: capability.outputCostPerMillion } : {}),
        contextLength: entity.contextLength ?? lookupProviderModelContextLength(entity.model, provider.id),
      };
      const key = autoModelKey(candidate);
      const reason = providerReason ?? (isNonChatModel(entity.model) ? 'not-chat' : undefined);
      if (!reason) entries.set(key, candidate);
      const inPool = settings.pool === undefined ? !reason : Object.hasOwn(settings.pool, key);
      const inferred = inferAutoTier(candidate, { overrides: settings.tierOverrides });
      models.set(key, {
        providerId: provider.id, model: entity.model, modelName: entity.modelName, providerName: provider.name,
        tier: inferred.tier, source: inferred.source, inPool,
        enabled: inPool && isAutoPoolEnabled(settings, candidate), available: !reason,
        ...(reason ? { unavailableReason: reason } : {}),
      });
    }
  }
  const { pool: _pool, ...directorySettings } = settings;
  const directoryTable = buildAutoTierTable([...entries.values()], directorySettings);
  for (const entry of Object.values(directoryTable).flat()) {
    Object.assign(models.get(autoModelKey(entry))!, { tier: entry.tier, source: entry.source });
  }
  // A removed provider/model stays visible as an invalid saved member. Never
  // discard the user's explicit pool, even when the directory is unavailable.
  for (const key of Object.keys(settings.pool ?? {})) {
    if (models.has(key)) continue;
    const ref = parseAutoModelKey(key);
    if (!ref) continue;
    models.set(key, { ...ref, tier: settings.tierOverrides?.[key] ?? 'balanced', source: 'default',
      inPool: true, enabled: settings.pool![key].enabled, available: false, unavailableReason: 'model-unavailable' });
  }
  return { settings, table: buildAutoTierTable([...entries.values()], settings), entries, directoryTable, models: [...models.values()] };
}
