// Auto-route service: the tier table from the effective provider catalog, the
// classifier singleton, and one `routeTurn()` used by turn admission and by
// `route explain`. Nothing here changes a Session; callers apply the result.

import {
  autoModelKey,
  buildAutoTierTable,
  decideAutoRoute,
  findAutoTierEntry,
  fitEffort,
  isAutoRoutingEnabled,
  isNonChatModel,
  isAutoTier,
  parseAutoRoutingSettings,
  pickAutoClassifier,
  type AutoModelRef,
  type AutoRouteDecision,
  type AutoRouteReason,
  type AutoRoutingSettings,
  type AutoTier,
  type AutoTierCandidate,
  type AutoTierEntry,
  type AutoTierTable,
} from '../../shared/autoRoute';
import type { AppConfig, ModelEntity, Provider } from '../../shared/config-types';
import { isRuntimeBackedProvider } from '../../shared/providerExecution';
import { createConcreteProviderRoute } from '../../shared/providerRoute';
import { reasoningEffortChoices } from '../../shared/reasoningEffort';
import { canResumeAcrossBuiltinProviderHistory } from '../builtin-session/config';
import type { ProviderEnv } from '../provider-types';
import {
  getAllEffectiveProviders,
  getProviderSelectionError,
  loadConfig,
  materializeProviderRouteEnv,
  resolveSubscriptionAuthKind,
  type AdminAppConfig,
} from '../utils/admin-config';
import { lookupModelCapability, lookupProviderModelContextLength } from '../utils/model-capabilities';
import { createAutoRouteClassifier, type AutoRouteClassifier, type ClassifyOutcome } from './classifier';

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

/** Provider env the Session would run this model with; 'subscription' for SDK-native. */
export function resolveAutoRouteEnv(
  ref: AutoModelRef,
  config?: AdminAppConfig,
): ProviderEnv | 'subscription' | undefined {
  const route = createConcreteProviderRoute(ref.providerId, ref.model);
  if (route.kind === 'subscription' && resolveSubscriptionAuthKind(ref.providerId, config) === 'sdk-native') {
    return 'subscription';
  }
  return materializeProviderRouteEnv(route, config);
}

export function autoRouteEffort(entry: AutoRouteCatalogEntry | undefined, tier: AutoTier): string | undefined {
  if (!entry) return undefined;
  return fitEffort(tier, reasoningEffortChoices(
    'builtin', entry.provider.apiProtocol, entry.provider.id, entry.model, entry.provider.config?.baseUrl,
  ));
}

let sharedClassifier: AutoRouteClassifier | undefined;

/** Process-wide classifier with the real transport, created on first use. */
export async function getAutoRouteClassifier(): Promise<AutoRouteClassifier> {
  if (sharedClassifier) return sharedClassifier;
  const [{ createClassifierTransport }, proxy, port, agentSession, titles] = await Promise.all([
    import('./transport'),
    import('../proxy-state'),
    import('../session-core/sidecar-port'),
    import('../agent-session'),
    import('../title-generator'),
  ]);
  sharedClassifier ??= createAutoRouteClassifier(createClassifierTransport({
    resolveEnv: (providerId, model) => resolveAutoRouteEnv({ providerId, model }),
    getProxyForProviderUrl: proxy.getProxyForProviderUrl,
    getSidecarPort: port.getSidecarPort,
    startOneShotBridge: (env, model, description) => agentSession.startOneShotBridge(env, model, description),
    generateUtilityText: (task, model, env) => titles.generateUtilityText(task, model, env),
  }));
  return sharedClassifier;
}

export interface RouteTurnInput {
  text: string;
  previousUser?: string;
  previousReply?: string;
  previousTier?: AutoTier;
  /** The Session's current model and env; candidates must share its provider history. */
  current?: AutoModelRef;
  currentEnv?: ProviderEnv;
  lastTurnAt?: number;
  contextUsed?: number;
  signal?: AbortSignal;
}

export interface RouteTurnResult {
  decision: AutoRouteDecision;
  effort?: string;
  classifier?: AutoModelRef;
  classify?: ClassifyOutcome;
  latencyMs: number;
}

/**
 * Classify a new turn and choose its model. Returns null when auto routing is
 * off or nothing is routable; the turn then runs on the current model.
 */
export async function routeTurn(
  input: RouteTurnInput,
  deps: {
    catalog?: AutoRouteCatalog;
    classifier?: AutoRouteClassifier;
    now?: () => number;
    config?: AdminAppConfig;
  } = {},
): Promise<RouteTurnResult | null> {
  const now = deps.now ?? Date.now;
  const started = now();
  const config = deps.config ?? loadConfig();
  const catalog = deps.catalog ?? buildAutoRouteCatalog(config);
  if (!isAutoRoutingEnabled(catalog.settings)) return null;

  const envCache = new Map<string, ProviderEnv | 'subscription' | undefined>();
  const envFor = (ref: AutoModelRef) => {
    const key = autoModelKey(ref);
    if (!envCache.has(key)) envCache.set(key, resolveAutoRouteEnv(ref, config));
    return envCache.get(key);
  };
  // Switching across provider history identities starts a fresh SDK session
  // (the conversation would be lost), so auto routing never does it.
  const isUsable = (entry: AutoTierEntry) => {
    const env = envFor(entry);
    if (!env) return false;
    if (!input.current) return true;
    return canResumeAcrossBuiltinProviderHistory({
      currentProviderEnv: input.currentEnv,
      currentModel: input.current.model,
      nextProviderEnv: env === 'subscription' ? undefined : env,
      nextModel: entry.model,
    });
  };

  const currentEntry = findAutoTierEntry(catalog.table, input.current);
  const classifierRef = pickAutoClassifier(catalog.table, catalog.settings, input.current);
  let tier: AutoTier | undefined;
  let verdict: 'classified' | 'cached' | 'fallback-previous' | 'classifier-failed' = 'classifier-failed';
  let classify: ClassifyOutcome | undefined;
  if (classifierRef) {
    const engine = deps.classifier ?? await getAutoRouteClassifier();
    classify = await engine.classify(classifierRef, {
      text: input.text,
      previousUser: input.previousUser,
      previousReply: input.previousReply,
      previousTier: input.previousTier,
    }, input.signal);
    if (classify.ok) {
      tier = classify.tier;
      verdict = classify.cached ? 'cached' : 'classified';
    }
  }
  if (!tier) {
    // Magpie `Fallback: previous`: a failed judgement keeps the last tier.
    tier = input.previousTier ?? currentEntry?.tier;
    verdict = input.previousTier || currentEntry ? 'fallback-previous' : 'classifier-failed';
  }

  const decision = decideAutoRoute({
    table: catalog.table,
    tier,
    verdict,
    current: input.current,
    lastTurnAt: input.lastTurnAt,
    now: now(),
    contextUsed: input.contextUsed,
    isUsable,
  });
  if (!decision) return null;
  const target = catalog.entries.get(autoModelKey(decision.target));
  return {
    decision,
    effort: autoRouteEffort(target, decision.tier),
    ...(classifierRef ? { classifier: classifierRef } : {}),
    ...(classify ? { classify } : {}),
    latencyMs: now() - started,
  };
}

export type { AutoRouteReason };
