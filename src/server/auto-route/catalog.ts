// Shared catalog authority for admission, settings diagnostics and failover.
// Keep this module independent of the classifier transport and Session owner.
import { autoModelKey, buildAutoTierTable, isAutoTier, isNonChatModel, parseAutoRoutingSettings,
  type AutoRoutingSettings, type AutoTierCandidate, type AutoTierTable } from '../../shared/autoRoute';
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
}

/**
 * Providers that can take an auto-routed turn: enabled, builtin-executable,
 * selectable (credential / verified subscription). Runtime-backed providers
 * (Codex subscription) run their own Runtime and never join a builtin Session.
 */
function routableProviders(config: AdminAppConfig): Provider[] {
  return (getAllEffectiveProviders(config) as unknown as Provider[]).filter(provider =>
    provider.enabled !== false
    && !provider.id.startsWith('cloud-session:')
    && !isRuntimeBackedProvider(provider)
    && getProviderSelectionError(provider as unknown as Parameters<typeof getProviderSelectionError>[0], config) === null);
}

export function buildAutoRouteCatalog(config: AdminAppConfig = loadConfig()): AutoRouteCatalog {
  const settings = parseAutoRoutingSettings((config as unknown as AppConfig).autoRouting);
  const entries = new Map<string, AutoRouteCatalogEntry>();
  for (const provider of routableProviders(config)) {
    for (const entity of (provider.models ?? []) as ModelEntity[]) {
      if (!entity?.model || isNonChatModel(entity.model)) continue;
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
      entries.set(autoModelKey(candidate), candidate);
    }
  }
  return { settings, table: buildAutoTierTable([...entries.values()], settings), entries };
}
