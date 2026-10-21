import type { ModelFailoverSettings } from '../../shared/modelFailover';
import { isModelFailoverProvider, modelFailoverMode } from '../../shared/modelFailover';
import { canResumeAcrossProviderBoundary } from '../../shared/providerHistory';
import { findAutoTierEntry, isAutoRoutingEnabled, parseAutoRoutingSettings } from '../../shared/autoRoute';
import { buildAutoRouteCatalog } from '../auto-route/catalog';
import { lookupModelCapability, lookupProviderModelContextLength } from '../utils/model-capabilities';
import type { ModelEntity } from '../../shared/config-types';
import type { ProviderEnv } from '../provider-types';
import { findEffectiveProvider, loadConfig, materializeProviderRouteEnv } from '../utils/admin-config';
import { ModelFailoverController, type InferenceRecoveryHooks } from '../openai-bridge/model-failover';
import type { UpstreamConfig } from '../openai-bridge/types/bridge';

export function sessionApiFailoverEligible(env?: ProviderEnv): boolean {
  if (!env?.providerId || !env.apiKey || !env.baseUrl || env.credentialSource || env.endpointSource) return false;
  const provider = findEffectiveProvider(env.providerId, loadConfig());
  return !!provider && isModelFailoverProvider(provider);
}

/** Uses config.json/catalog authority, but never writes selected Session config. */
export function createSessionModelFailover(options: {
  current: () => { env?: ProviderEnv; model: string; turnId?: string; contextTokens?: number };
  isLive: () => boolean;
  canSwitch?: () => boolean;
  onSwitch: (target: UpstreamConfig, status: number) => void;
  onUnavailable?: (reason: string) => void;
  canRetry?: () => boolean;
  retryDelaysMs?: readonly [number, number, number];
  recovery?: InferenceRecoveryHooks;
  /** Auto routing's next model in the turn's tier; used when no backup is configured. */
  autoBackup?: () => NonNullable<ModelFailoverSettings['backup']> | undefined;
}): ModelFailoverController {
  type Ref = NonNullable<ModelFailoverSettings['backup']>;
  const sameRef = (a: Ref | undefined, b: Ref) => a?.providerId === b.providerId && a.modelId === b.modelId;
  let unavailableReason = '没有可用的备用候选';
  const pickRef = (settings: ModelFailoverSettings | undefined, config = loadConfig()): Ref | undefined => {
    const mode = modelFailoverMode(settings);
    if (mode === 'off') { unavailableReason = '已关闭自动切换模型'; return undefined; }
    if (mode === 'specified') {
      unavailableReason = '指定备用尚未配置或当前不可用';
      return settings?.backup;
    }
    if (!isAutoRoutingEnabled(parseAutoRoutingSettings((config as { autoRouting?: unknown }).autoRouting))) {
      unavailableReason = '自动选模型已关闭，未使用旧自动备用'; return undefined;
    }
    unavailableReason = '本轮没有符合当前策略的自动备用';
    return options.autoBackup?.();
  };
  let root: { scope: string; primaryIdentity: string; backup?: Ref; reportedReason?: string } | undefined;
  const identity = () => {
    const { env, model } = options.current();
    return JSON.stringify([env?.providerId, env?.baseUrl, model]);
  };
  const resolveBackup = (ref: Ref): UpstreamConfig | undefined => {
    const current = options.current();
    const env = current.env;
    if (!options.isLive() || !sessionApiFailoverEligible(env)) return undefined;
    const config = loadConfig();
    const settings = config.modelFailover as ModelFailoverSettings | undefined;
    if (!sameRef(pickRef(settings, config), ref)) return undefined;
    if (ref.providerId === env!.providerId && ref.modelId === current.model) { unavailableReason = '备用与当前主模型相同'; return undefined; }
    const provider = findEffectiveProvider(ref.providerId, config);
    if (!provider || !isModelFailoverProvider(provider) || !Array.isArray(provider.models)
      || !provider.models.some(row => row && typeof row === 'object' && row.model === ref.modelId)) {
      unavailableReason = '备用供应商或模型已禁用、删除或不支持当前运行方式'; return undefined;
    }
    const backup = materializeProviderRouteEnv({ kind: 'provider', providerId: ref.providerId, model: ref.modelId }, config);
    if (!backup?.apiKey?.trim() || !backup.baseUrl?.trim() || backup.credentialSource || backup.endpointSource) {
      unavailableReason = '备用缺少可用的 API 密钥或服务地址'; return undefined;
    }
    if (!canResumeAcrossProviderBoundary({ ...env, model: current.model }, { ...backup, model: ref.modelId })) {
      unavailableReason = '备用不能安全续接当前会话历史'; return undefined;
    }
    const catalog = buildAutoRouteCatalog(config);
    const primaryTier = findAutoTierEntry(catalog.table, { providerId: env!.providerId!, model: current.model });
    const backupTier = findAutoTierEntry(catalog.table, { providerId: ref.providerId, model: ref.modelId });
    if (!backupTier || !primaryTier || (settings?.allowCrossTier !== true && primaryTier.tier !== backupTier.tier)) {
      unavailableReason = settings?.allowCrossTier === true ? '无法确认主备模型的可用档位' : '未开启跨档接管，备用不在当前主模型档位'; return undefined;
    }
    return {
      providerId: ref.providerId, model: ref.modelId, apiKey: backup.apiKey, baseUrl: backup.baseUrl,
      apiProtocol: backup.apiProtocol ?? 'anthropic', authType: backup.authType,
      upstreamFormat: backup.upstreamFormat, maxOutputTokens: backup.maxOutputTokens,
      maxOutputTokensParamName: backup.maxOutputTokensParamName, headersTimeoutMs: 30_000,
      continuationInstruction: 'Continue the existing task using the conversation and completed tool results. Do not restart the user task or repeat confirmed successful writes, sends, submissions or deployments. If an earlier action has an uncertain outcome, verify it with a read-only check first; if verification is unavailable, stop and explain instead of repeating it.',
      responseModel: ref.modelId,
    };
  };
  const requests = new WeakMap<Request, Promise<{ images: boolean; tools: boolean; output: number } | undefined>>();
  const requestNeeds = (request: Request) => {
    let pending = requests.get(request);
    if (!pending) {
      pending = request.clone().json().then((body: unknown) => {
        if (!body || typeof body !== 'object') return undefined;
        const row = body as Record<string, unknown>;
        if (!Array.isArray(row.messages)) return undefined;
        let images = false;
        let tools = Array.isArray(row.tools) && row.tools.length > 0;
        const visit = (value: unknown): void => {
          if (Array.isArray(value)) { value.forEach(visit); return; }
          if (!value || typeof value !== 'object') return;
          const block = value as Record<string, unknown>;
          images ||= block.type === 'image' || block.type === 'image_url' || block.type === 'input_image';
          tools ||= block.type === 'tool_use' || block.type === 'tool_result';
          Object.values(block).forEach(visit);
        };
        visit(row.messages);
        return { images, tools, output: typeof row.max_tokens === 'number' && Number.isFinite(row.max_tokens) ? Math.max(0, row.max_tokens) : 0 };
      }).catch(() => undefined);
      requests.set(request, pending);
    }
    return pending;
  };
  return new ModelFailoverController({
    scope: () => {
      if (!options.isLive()) return undefined;
      // Recovery eligibility can disappear; an established root's replay guard
      // must survive that change. Never re-pin a different backup mid-turn.
      if (root) return root.primaryIdentity === identity() ? root.scope : undefined;
      const current = options.current();
      const ref = pickRef(loadConfig().modelFailover as ModelFailoverSettings | undefined);
      if (!current.turnId) return undefined;
      const backup = typeof ref?.providerId === 'string' && typeof ref.modelId === 'string' && resolveBackup(ref) ? { ...ref } : undefined;
      root = { scope: JSON.stringify([current.turnId, identity()]), primaryIdentity: identity(), backup };
      return root.scope;
    },
    resolveBackup: () => root?.backup ? resolveBackup(root.backup) : undefined,
    validateBackup: async (request, target) => {
      const needs = await requestNeeds(request);
      if (!needs) { unavailableReason = '无法确认本轮请求的内容要求'; return false; }
      const config = loadConfig();
      const provider = findEffectiveProvider(target.providerId!, config);
      const model = (Array.isArray(provider?.models) ? provider.models as ModelEntity[] : []).find(row => row.model === target.model);
      if (!model) { unavailableReason = '备用模型已不可用'; return false; }
      const capability = lookupModelCapability(target.model!);
      const modalities = model.inputModalities ?? capability?.inputModalities;
      if (needs.images && !modalities?.includes('image')) {
        unavailableReason = '备用的图片输入能力不支持或尚未确认'; return false;
      }
      const protocol = target.apiProtocol ?? 'anthropic';
      if (needs.tools && protocol !== 'anthropic' && protocol !== 'openai') {
        unavailableReason = '备用接口不支持本轮工具调用协议'; return false;
      }
      const declaredProtocol = protocol === 'anthropic' ? 'anthropic:messages' : target.upstreamFormat === 'responses' ? 'openai:responses' : 'openai:chat-completions';
      if (needs.tools && model.supportedProtocols?.length && !model.supportedProtocols.includes(declaredProtocol)) {
        unavailableReason = '备用模型未声明支持本轮工具调用协议'; return false;
      }
      const window = model.contextLength ?? lookupProviderModelContextLength(target.model!, target.providerId!);
      const used = options.current().contextTokens;
      // OpenAI translators intentionally drop the SDK's Claude-scale max_tokens.
      // Only the target's explicit cap is a known output budget on that route.
      const outputBudget = protocol === 'anthropic' ? needs.output : target.maxOutputTokens ?? 0;
      if (typeof window === 'number' && typeof used === 'number' && used + outputBudget > window) {
        unavailableReason = '备用上下文窗口不足以容纳已知上下文及输出预算'; return false;
      }
      return true;
    },
    onBackupUnavailable: () => {
      if (root && root.reportedReason !== unavailableReason) {
        root.reportedReason = unavailableReason;
        options.onUnavailable?.(unavailableReason);
      }
    },
    canSwitch: options.canSwitch,
    canRetry: options.canRetry,
    retryDelaysMs: options.retryDelaysMs,
    recovery: options.recovery,
    isActive: options.isLive,
    requestIdentity: identity,
    onSwitch: options.onSwitch,
    onTurnEnd: () => { root = undefined; },
  });
}
