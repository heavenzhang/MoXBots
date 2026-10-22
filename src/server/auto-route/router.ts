// Auto-route service: the tier table from the effective provider catalog, the
// classifier singleton, and one `routeTurn()` used by turn admission and by
// `route explain`. Nothing here changes a Session; callers apply the result.

import {
  autoModelKey,
  decideAutoRoute,
  findAutoTierEntry,
  fitEffort,
  isAutoRoutingEnabled,
  isAutoPoolEnabled,
  pickAutoClassifier,
  type AutoModelRef,
  type AutoRouteDecision,
  type AutoRouteReason,
  type AutoTier,
  type AutoTierEntry,
} from '../../shared/autoRoute';
import type { AppConfig } from '../../shared/config-types';
import { modelFailoverMode, type ModelFailoverSettings } from '../../shared/modelFailover';
import { createConcreteProviderRoute } from '../../shared/providerRoute';
import { reasoningEffortChoices } from '../../shared/reasoningEffort';
import { canResumeAcrossBuiltinProviderHistory } from '../builtin-session/config';
import type { ProviderEnv } from '../provider-types';
import {
  loadConfig,
  materializeProviderRouteEnv,
  resolveSubscriptionAuthKind,
  type AdminAppConfig,
} from '../utils/admin-config';
import { createAutoRouteClassifier, type AutoRouteClassifier, type ClassifyOutcome } from './classifier';

import { buildAutoRouteCatalog, type AutoRouteCatalog, type AutoRouteCatalogEntry } from './catalog';
import { AutoRoutePoolUnavailableError } from './errors';
export { buildAutoRouteCatalog, type AutoRouteCatalog, type AutoRouteCatalogEntry } from './catalog';

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
  /** No conversation yet, so any provider history is acceptable. */
  freshHistory?: boolean;
  /** Extra per-turn requirement, e.g. image input. */
  accept?: (ref: AutoModelRef) => boolean;
  signal?: AbortSignal;
}

export interface RouteTurnResult {
  decision: AutoRouteDecision;
  effort?: string;
  classifier?: AutoModelRef;
  classify?: ClassifyOutcome;
  latencyMs: number;
  failover?: { mode: 'auto' | 'specified' | 'off'; backup?: AutoModelRef;
    unavailableReason?: 'off' | 'not-configured' | 'unavailable' | 'cross-tier' | 'no-candidate' };
}

/**
 * Classify a new turn and choose its model. Returns null when auto routing is
 * off or nothing is routable in legacy directory mode. An explicit pool with
 * no compatible candidates raises a recoverable error instead of bypassing it.
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
  const managedPool = catalog.settings.pool !== undefined;
  if (managedPool && !Object.values(catalog.table).some(rows => rows.length > 0)) throw new AutoRoutePoolUnavailableError();

  const envCache = new Map<string, ProviderEnv | 'subscription' | undefined>();
  const envFor = (ref: AutoModelRef) => {
    const key = autoModelKey(ref);
    if (!envCache.has(key)) envCache.set(key, resolveAutoRouteEnv(ref, config));
    return envCache.get(key);
  };
  // Switching across provider history identities starts a fresh SDK session
  // (the conversation would be lost), so auto routing never does it.
  const isUsable = (entry: AutoTierEntry) => {
    if (input.accept && !input.accept(entry)) return false;
    const env = envFor(entry);
    if (!env) return false;
    if (input.freshHistory) return true;
    // An existing conversation is checked even when the current model is
    // unknown (Session default): its env still fixes the history identity.
    return canResumeAcrossBuiltinProviderHistory({
      currentProviderEnv: input.currentEnv,
      currentModel: input.current?.model,
      nextProviderEnv: env === 'subscription' ? undefined : env,
      nextModel: entry.model,
    });
  };

  const currentEntry = findAutoTierEntry(catalog.table, input.current);
  const classifierRef = pickAutoClassifier(catalog.table, catalog.settings, input.current);
  let tier: AutoTier | undefined;
  let verdict: 'classified' | 'cached' | 'fallback-previous' | 'classifier-failed' = 'classifier-failed';
  let classify: ClassifyOutcome | undefined;
  if (classifierRef && catalog.entries.has(autoModelKey(classifierRef)) && isAutoPoolEnabled(catalog.settings, classifierRef)) {
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
    allowCrossTierBackup: (config as unknown as AppConfig).modelFailover?.allowCrossTier === true,
  });
  if (!decision) {
    if (managedPool) throw new AutoRoutePoolUnavailableError();
    return null;
  }
  if (managedPool && !currentEntry && decision.reason === 'classifier-failed') decision.reason = 'unavailable-fallback';
  if (modelFailoverMode((config as unknown as AppConfig).modelFailover as ModelFailoverSettings | undefined) === 'off') delete decision.backup;
  const target = catalog.entries.get(autoModelKey(decision.target));
  const settings = (config as unknown as AppConfig).modelFailover;
  const mode = modelFailoverMode(settings);
  const failover: NonNullable<RouteTurnResult['failover']> = { mode };
  if (mode === 'off') failover.unavailableReason = 'off';
  else if (mode === 'specified') {
    const ref = settings?.backup ? { providerId: settings.backup.providerId, model: settings.backup.modelId } : undefined;
    const entry = findAutoTierEntry(catalog.directoryTable ?? catalog.table, ref);
    if (!ref) failover.unavailableReason = 'not-configured';
    else if (!entry || !isUsable(entry) || autoModelKey(entry) === autoModelKey(decision.target)) failover.unavailableReason = 'unavailable';
    else if (settings?.allowCrossTier !== true && entry.tier !== decision.target.tier) failover.unavailableReason = 'cross-tier';
    else failover.backup = ref;
  } else if (decision.backup) failover.backup = { providerId: decision.backup.providerId, model: decision.backup.model };
  else failover.unavailableReason = 'no-candidate';
  return {
    failover,
    decision,
    effort: autoRouteEffort(target, decision.tier),
    ...(classifierRef && classify ? { classifier: classifierRef } : {}),
    ...(classify ? { classify } : {}),
    latencyMs: now() - started,
  };
}

export type { AutoRouteReason };
