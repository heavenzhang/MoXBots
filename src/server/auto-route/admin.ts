// `route tiers` / `route explain`: read-only views of auto routing. Neither
// changes a Session's model; explain runs the real classifier once.

import { AUTO_TIERS, autoModelKey, isAutoRoutingEnabled, pickAutoClassifier, type AutoModelRef } from '../../shared/autoRoute';
import { loadConfig } from '../utils/admin-config';
import { buildAutoRouteCatalog, resolveAutoRouteEnv, routeTurn } from './router';

const MAX_PROMPT_CHARS = 64 * 1024;

type AdminResult = { success: boolean; data?: unknown; error?: string };

function currentRef(sessionMeta: { providerId?: string | null; model?: string | null } | null | undefined): AutoModelRef | undefined {
  return sessionMeta?.providerId && sessionMeta.model
    ? { providerId: sessionMeta.providerId, model: sessionMeta.model }
    : undefined;
}

export function handleRouteTiers(sessionMeta?: { providerId?: string | null; model?: string | null } | null): AdminResult {
  const catalog = buildAutoRouteCatalog();
  const classifier = pickAutoClassifier(catalog.table, catalog.settings, currentRef(sessionMeta));
  return {
    success: true,
    data: {
      enabled: isAutoRoutingEnabled(catalog.settings),
      classifier: classifier ? { ...classifier, chosenBy: catalog.settings.classifier ? 'user' : 'auto' } : null,
      tiers: Object.fromEntries(AUTO_TIERS.map(tier => [tier, catalog.table[tier].map(entry => ({
        providerId: entry.providerId,
        model: entry.model,
        ...(entry.modelName ? { modelName: entry.modelName } : {}),
        source: entry.source,
        ...(entry.outputCostPerMillion !== undefined ? { outputCostPerMillion: entry.outputCostPerMillion } : {}),
      }))])),
    },
  };
}

export async function handleRouteExplain(
  payload: { prompt?: unknown },
  sessionMeta?: { providerId?: string | null; model?: string | null } | null,
): Promise<AdminResult> {
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
  if (!prompt) return { success: false, error: 'route explain needs a request: pass --prompt-file <path>.' };
  if (prompt.length > MAX_PROMPT_CHARS) return { success: false, error: `Request text exceeds ${MAX_PROMPT_CHARS} characters.` };
  const config = loadConfig();
  const current = currentRef(sessionMeta);
  const currentEnv = current ? resolveAutoRouteEnv(current, config) : undefined;
  const catalog = buildAutoRouteCatalog(config);
  if (!isAutoRoutingEnabled(catalog.settings)) {
    return { success: true, data: { enabled: false } };
  }
  // Explain is a dry run of a fresh turn: no warm cache, no context pressure.
  const result = await routeTurn({
    text: prompt,
    current,
    currentEnv: currentEnv === 'subscription' ? undefined : currentEnv,
  }, { catalog, config });
  if (!result) return { success: false, error: 'No model is available for auto routing. Configure a provider first.' };
  const { decision } = result;
  return {
    success: true,
    data: {
      enabled: true,
      tier: decision.tier,
      providerId: decision.target.providerId,
      model: decision.target.model,
      ...(result.effort ? { effort: result.effort } : {}),
      reason: decision.reason,
      switches: decision.switches,
      ...(decision.backup ? { backup: autoModelKey(decision.backup) } : {}),
      ...(result.classifier ? { classifier: autoModelKey(result.classifier) } : {}),
      ...(result.classify && !result.classify.ok ? { classifierError: result.classify.error } : {}),
      classifierLatencyMs: result.classify?.latencyMs ?? 0,
      latencyMs: result.latencyMs,
    },
  };
}
