// Auto model routing — pure engine shared by the sidecar, CLI and renderer.
//
// Ownership:
//   - desired state: `AppConfig.autoRouting` (tier overrides, in-tier order,
//     classifier pick). Absent means "on, everything inferred".
//   - birth snapshot: `SessionMetadata.modelMode` ('auto' when absent).
//   - execution: the sidecar classifies each NEW user turn once, picks a model
//     from the tier table and keeps it for the whole turn (tool round trips
//     never re-route).
//
// The engine follows Magpie's intent routing (yetone/magpie, MIT): a
// numbered-choice classifier over difficulty levels, the previous turn as
// context for short follow-ups, "keep the previous tier" on failure, and no
// downgrade while the prompt cache is warm. Only the engine is ported — there
// is no rule language, the user sees three tiers.

import { normalizeReasoningEffort } from './reasoningEffort';

export const AUTO_TIERS = ['fast', 'balanced', 'strong'] as const;
export type AutoTier = (typeof AUTO_TIERS)[number];
export type ModelMode = 'auto' | 'manual';

export function isAutoTier(value: unknown): value is AutoTier {
  return typeof value === 'string' && (AUTO_TIERS as readonly string[]).includes(value);
}

/** Absent or malformed means auto: auto routing is the product default. */
export function normalizeModelMode(value: unknown): ModelMode {
  return value === 'manual' ? 'manual' : 'auto';
}

// ---------------------------------------------------------------------------
// Classifier prompt
// ---------------------------------------------------------------------------

/** Difficulty levels, in tier order. Level n of the prompt is AUTO_TIERS[n-1]. */
export const AUTO_TIER_LEVELS: Record<AutoTier, string> = {
  fast: 'an easy request: a greeting, a quick question, a lookup, a small edit, or running a command',
  balanced: 'an ordinary request: a focused feature or fix in one place, explaining code, or writing a document',
  strong: 'a hard request: designing, debugging, a change across several files, a long analysis, or planning',
};

/** Magpie `classifyPrompt`, verbatim: levels mean every message has one. */
export const AUTO_ROUTE_CLASSIFIER_SYSTEM_PROMPT = "You route a user's message to a coding assistant. "
  + "Given numbered kinds and the user's message, answer with the number of the kind that fits the message best. "
  + 'The kinds may be topics, or levels such as how hard or how big a request is; '
  + 'when they are levels, every message has one, a greeting or a question about the assistant included. '
  + 'Answer 0 only when the message is plainly none of the kinds. Answer with the number only.';

/** Caps in characters (Magpie `userText` / `priorCap`). */
const MESSAGE_HEAD = 3000;
const MESSAGE_TAIL = 1000;
const PRIOR_CAP = 1000;

/** `text` with its middle left out when longer than head+tail characters. */
export function cutMiddle(text: string, head: number, tail: number): string {
  const chars = Array.from(text);
  if (chars.length <= head + tail) return text;
  return `${chars.slice(0, head).join('')}\n…\n${chars.slice(chars.length - tail).join('')}`;
}

function keepTail(text: string, cap: number): string {
  const chars = Array.from(text);
  return chars.length > cap ? `…${chars.slice(chars.length - cap).join('')}` : text;
}

export interface AutoRouteClassifierInput {
  /** The user's own words for this turn: no system reminders or injected context. */
  text: string;
  /** The user's message before this one, if any. */
  previousUser?: string;
  /** The assistant's text reply between the two (no tool calls or thinking). */
  previousReply?: string;
  /** Tier the previous turn ran at, so "go on" stays where it was. */
  previousTier?: AutoTier;
}

/** User content for the classifier call. The system prompt is the constant above. */
export function buildAutoRouteClassifierPrompt(input: AutoRouteClassifierInput): string {
  const lines: string[] = ['Kinds:'];
  AUTO_TIERS.forEach((tier, index) => lines.push(`${index + 1}. ${AUTO_TIER_LEVELS[tier]}`));
  let body = `${lines.join('\n')}\n`;
  const previousUser = input.previousUser?.trim()
    ? cutMiddle(input.previousUser.trim(), PRIOR_CAP * 3 / 4, PRIOR_CAP / 4)
    : '';
  const previousReply = input.previousReply?.trim() ? keepTail(input.previousReply.trim(), PRIOR_CAP) : '';
  if (previousUser || previousReply) {
    body += "\nWhat came before the user's message, in the same conversation, to judge a short follow-up (go on, yes, fix that) by:\n";
    if (previousUser) body += `<previous_user_message>\n${previousUser}\n</previous_user_message>\n`;
    if (previousReply) body += `<previous_assistant_reply>\n${previousReply}\n</previous_assistant_reply>\n`;
  }
  if (input.previousTier) {
    const n = AUTO_TIERS.indexOf(input.previousTier) + 1;
    body += `\nThe user's message before this one, in the same conversation, was of kind ${n}. `
      + `A message that only carries on from it — go on, yes, do it, fix that — is of kind ${n} too; `
      + 'one that asks for something of its own is of the kind that fits it.\n';
  }
  body += `\nThe user's message:\n<message>\n${cutMiddle(input.text, MESSAGE_HEAD, MESSAGE_TAIL)}\n</message>\n\n`
    + 'The number of the kind that fits it best (0 only if none does):';
  return body;
}

export type AutoRouteAnswer =
  | { ok: true; tier: AutoTier }
  | { ok: false; reason: 'none' | 'invalid'; answer: string };

/** First integer of the answer; 0 is "none of them", anything else out of range is invalid. */
export function parseAutoRouteAnswer(raw: string): AutoRouteAnswer {
  const answer = raw.trim().slice(0, 80);
  const match = /\d+/.exec(raw);
  if (!match) return { ok: false, reason: 'invalid', answer };
  const n = Number(match[0]);
  if (n === 0) return { ok: false, reason: 'none', answer };
  if (!Number.isSafeInteger(n) || n < 1 || n > AUTO_TIERS.length) return { ok: false, reason: 'invalid', answer };
  return { ok: true, tier: AUTO_TIERS[n - 1] };
}

// ---------------------------------------------------------------------------
// Reasoning effort
// ---------------------------------------------------------------------------

const EFFORT_SCALE = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
const TIER_EFFORT: Record<AutoTier, string> = { fast: 'low', balanced: 'medium', strong: 'high' };

/**
 * Closest supported effort to the tier's target (Magpie `fitLevel`). Unknown
 * choices mean the model exposes no effort knob: send nothing.
 */
export function fitEffort(tier: AutoTier, choices: readonly string[] | null | undefined,
): string | undefined {
  const supported = (choices ?? [])
    .map(choice => normalizeReasoningEffort(choice))
    .filter((choice): choice is string => !!choice && (EFFORT_SCALE as readonly string[]).includes(choice));
  if (supported.length === 0) return undefined;
  const target = TIER_EFFORT[tier];
  if (supported.includes(target)) return target;
  const at = EFFORT_SCALE.indexOf(target as (typeof EFFORT_SCALE)[number]);
  let best = supported[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const choice of supported) {
    const distance = Math.abs(EFFORT_SCALE.indexOf(choice as (typeof EFFORT_SCALE)[number]) - at,
    );
    // Ties go up for the strong tier and down otherwise.
    const tieWins = distance === bestDistance
      && (tier === 'strong'
        ? EFFORT_SCALE.indexOf(choice as (typeof EFFORT_SCALE)[number]) > EFFORT_SCALE.indexOf(best as (typeof EFFORT_SCALE)[number])
        : EFFORT_SCALE.indexOf(choice as (typeof EFFORT_SCALE)[number]) < EFFORT_SCALE.indexOf(best as (typeof EFFORT_SCALE)[number]));
    if (distance < bestDistance || tieWins) {
      best = choice;
      bestDistance = distance;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Tiering
// ---------------------------------------------------------------------------

export interface AutoModelRef {
  providerId: string;
  model: string;
}

/** `providerId/model`. Provider ids never contain '/', model ids may. */
export function autoModelKey(ref: AutoModelRef): string {
  return `${ref.providerId}/${ref.model}`;
}

export function parseAutoModelKey(key: string): AutoModelRef | null {
  const slash = key.indexOf('/');
  if (slash <= 0 || slash === key.length - 1) return null;
  return { providerId: key.slice(0, slash), model: key.slice(slash + 1) };
}

/** A model id without a router's vendor prefix or a context suffix, lowercased. */
export function bareModelId(model: string): string {
  const withoutSuffix = model.replace(/(?:\[1m\]|\s+1m)\s*$/i, '').trim();
  return withoutSuffix.slice(withoutSuffix.lastIndexOf('/') + 1).toLowerCase();
}

/** Ids that draw, speak, listen, embed or search instead of answering a turn (Magpie `nonChat`). */
const NON_CHAT = /embed|rerank|image|imagen|dall-e|tts|whisper|audio|realtime|transcribe|moderation|ocr|veo|sora|speech|research|guard|computer-use/;

export function isNonChatModel(model: string): boolean {
  return NON_CHAT.test(model.toLowerCase());
}

const SMALL_WORDS = new Set(['mini', 'nano', 'flash', 'haiku', 'lite', 'small', 'air', 'turbo', 'fast', 'instant', 'tiny', 'highspeed']);
const TINY_WORDS = new Set(['nano', 'lite', 'tiny']);
const SIZE_WORD = /^(\d+(?:\.\d+)?)b$/;

/** How small a model's id says it is (Magpie `sizeOf`). Words, not substrings: "gemini" is no "mini". */
export function modelSizeFromName(model: string): { small: boolean; tiny: boolean } {
  let small = false;
  let tiny = false;
  for (const word of model.toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean)) {
    const size = SIZE_WORD.exec(word);
    if (size) {
      const billions = Number(size[1]);
      small ||= billions <= 72;
      tiny ||= billions <= 15;
      continue;
    }
    small ||= SMALL_WORDS.has(word);
    tiny ||= TINY_WORDS.has(word);
  }
  return { small, tiny };
}

/**
 * Curated families, matched against the bare lowercase model id. This is the
 * catalog layer Magpie lacks: relays and routers rarely carry list prices, so
 * names we maintain beat a missing price. `rank` orders models inside a tier
 * (higher first). First match wins, so specific rules come before broad ones.
 */
interface CuratedTierRule { pattern: RegExp; tier: AutoTier; rank: number }
const CURATED_TIER_RULES: readonly CuratedTierRule[] = [
  // Small variants of any family.
  { pattern: /(^|[-_.])(mini|nano|flash|lite|haiku|air|turbo|instant|highspeed|tiny)([-_.]|$)/, tier: 'fast', rank: 50 },
  { pattern: /(^|[-_.])fast$/, tier: 'fast', rank: 50 },
  // Anthropic
  { pattern: /^claude-(fable|mythos|opus)-/, tier: 'strong', rank: 100 },
  { pattern: /^claude-sonnet-/, tier: 'balanced', rank: 90 },
  // OpenAI
  { pattern: /^gpt-\d+(\.\d+)?-(pro)$/, tier: 'strong', rank: 85 },
  { pattern: /^gpt-\d+(\.\d+)?(-(codex|sol|luna|chat))?$/, tier: 'strong', rank: 95 },
  { pattern: /^o\d+(-pro)?$/, tier: 'strong', rank: 85 },
  // Google
  { pattern: /^gemini-[\d.]+-pro/, tier: 'strong', rank: 92 },
  // xAI
  { pattern: /^grok-\d+(\.\d+)?(-heavy)?$/, tier: 'strong', rank: 90 },
  { pattern: /^grok-composer-/, tier: 'balanced', rank: 70 },
  // Open-weight flagships
  { pattern: /^glm-5(\.\d+)?$/, tier: 'strong', rank: 80 },
  { pattern: /^glm-4/, tier: 'balanced', rank: 60 },
  { pattern: /^deepseek-v\d+(\.\d+)?-pro$/, tier: 'strong', rank: 80 },
  { pattern: /^deepseek-(v\d+(\.\d+)?|chat|reasoner)$/, tier: 'balanced', rank: 70 },
  { pattern: /^(kimi-)?k3(-\d+k)?$/, tier: 'strong', rank: 82 },
  { pattern: /^kimi-for-coding$/, tier: 'strong', rank: 78 },
  { pattern: /^kimi-k2/, tier: 'balanced', rank: 72 },
  { pattern: /^minimax-m3$/, tier: 'strong', rank: 76 },
  { pattern: /^minimax-m2/, tier: 'balanced', rank: 65 },
  { pattern: /^qwen\d+(\.\d+)?-(max|plus)$/, tier: 'strong', rank: 75 },
  { pattern: /^qwen\d+(\.\d+)?-coder-plus$/, tier: 'balanced', rank: 70 },
  { pattern: /^doubao-seed-[\d.-]+-pro/, tier: 'strong', rank: 74 },
  { pattern: /^doubao-seed-[\d.-]+-code/, tier: 'balanced', rank: 68 },
  { pattern: /^mimo-v[\d.]+-pro$/, tier: 'strong', rank: 72 },
  { pattern: /^mimo-v[\d.]+$/, tier: 'balanced', rank: 62 },
  { pattern: /^step-\d+(\.\d+)?(-preview)?$/, tier: 'balanced', rank: 60 },
];

export function curatedModelTier(model: string): { tier: AutoTier; rank: number } | undefined {
  const bare = bareModelId(model);
  const rule = CURATED_TIER_RULES.find(entry => entry.pattern.test(bare));
  return rule ? { tier: rule.tier, rank: rule.rank } : undefined;
}

/** Output price (USD/M) a flagship costs at least (Magpie `frontierOut`). */
export const FRONTIER_OUTPUT_PRICE = 10;
/** Past this a model thinks for minutes a turn; price no longer says "strong" (Magpie `tooDear`). */
const TOO_DEAR_OUTPUT_PRICE = 100;

export type AutoTierSource = 'override' | 'catalog' | 'price' | 'name' | 'default';

export interface AutoTierCandidate extends AutoModelRef {
  /** Display name, for menus and the CLI. */
  modelName?: string;
  /** Tier the provider's own catalog entry declares (`ModelEntity.tier`). */
  catalogTier?: AutoTier;
  /** List output price, USD per million tokens. */
  outputCostPerMillion?: number;
  contextLength?: number;
}

export interface AutoTierEntry extends AutoTierCandidate {
  tier: AutoTier;
  source: AutoTierSource;
  rank: number;
}

export type AutoTierTable = Record<AutoTier, AutoTierEntry[]>;

export interface AutoRoutingSettings {
  /** Absent means on. */
  enabled?: boolean;
  classifier?: AutoModelRef;
  /** `providerId/model` → tier, set by the user moving a model. */
  tierOverrides?: Record<string, AutoTier>;
  /** In-tier order the user chose; unlisted models follow in inferred order. */
  tierOrder?: Partial<Record<AutoTier, string[]>>;
  /** Absent follows the provider directory. Present is an explicit membership
   * snapshot; an empty object deliberately permits no automatic candidates. */
  pool?: Record<string, { enabled: boolean }>;
}

export interface AutoRouteManagedModel extends AutoModelRef {
  modelName?: string;
  providerName?: string;
  tier: AutoTier;
  source: AutoTierSource;
  inPool: boolean;
  enabled: boolean;
  available: boolean;
  unavailableReason?: 'provider-disabled' | 'provider-unavailable' | 'runtime-unsupported' | 'model-unavailable' | 'not-chat';
}

export function isAutoPoolEnabled(settings: AutoRoutingSettings, ref: AutoModelRef): boolean {
  return settings.pool === undefined || settings.pool[autoModelKey(ref)]?.enabled === true;
}

/** Pure edits run against the latest config inside its existing writer lock. */
export type AutoRoutingModifier = (current: AutoRoutingSettings) => AutoRoutingSettings;

/** Untrusted config → settings. Malformed parts are dropped, never guessed. */
export function parseAutoRoutingSettings(value: unknown): AutoRoutingSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const out: AutoRoutingSettings = {};
  if (typeof raw.enabled === 'boolean') out.enabled = raw.enabled;
  if (Object.hasOwn(raw, 'pool') && raw.pool !== undefined) {
    const members = raw.pool && typeof raw.pool === 'object' && !Array.isArray(raw.pool) ? raw.pool : {};
    out.pool = Object.fromEntries(Object.entries(members as Record<string, unknown>)
      .filter(([key]) => parseAutoModelKey(key) !== null)
      .map(([key, entry]) => [key, { enabled: Boolean(entry && typeof entry === 'object'
        && (entry as Record<string, unknown>).enabled === true) }]));
  }
  const classifier = raw.classifier as Record<string, unknown> | undefined;
  if (classifier && typeof classifier.providerId === 'string' && typeof classifier.model === 'string'
    && classifier.providerId.trim() && classifier.model.trim()) {
    out.classifier = { providerId: classifier.providerId.trim(), model: classifier.model.trim() };
  }
  if (raw.tierOverrides && typeof raw.tierOverrides === 'object' && !Array.isArray(raw.tierOverrides)) {
    const overrides = Object.fromEntries(
      Object.entries(raw.tierOverrides as Record<string, unknown>)
        .filter((entry): entry is [string, AutoTier] => parseAutoModelKey(entry[0]) !== null && isAutoTier(entry[1])),
    );
    if (Object.keys(overrides).length > 0) out.tierOverrides = overrides;
  }
  if (raw.tierOrder && typeof raw.tierOrder === 'object' && !Array.isArray(raw.tierOrder)) {
    const order: Partial<Record<AutoTier, string[]>> = {};
    for (const tier of AUTO_TIERS) {
      const list = (raw.tierOrder as Record<string, unknown>)[tier];
      if (!Array.isArray(list)) continue;
      const keys = [...new Set(list.filter((key): key is string => typeof key === 'string' && parseAutoModelKey(key) !== null))];
      if (keys.length > 0) order[tier] = keys;
    }
    if (Object.keys(order).length > 0) out.tierOrder = order;
  }
  return out;
}

export function isAutoRoutingEnabled(settings: AutoRoutingSettings | undefined): boolean {
  return settings?.enabled !== false;
}

/**
 * Tier of one model. Priority: user override → provider catalog tag → our
 * curated families → list price → name words → balanced.
 */
export function inferAutoTier(
  candidate: AutoTierCandidate,
  context: { overrides?: Record<string, AutoTier>; strongestPrice?: number } = {},
): { tier: AutoTier; source: AutoTierSource; rank: number } {
  const override = context.overrides?.[autoModelKey(candidate)];
  const curated = curatedModelTier(candidate.model);
  const rank = curated?.rank ?? 0;
  if (override) return { tier: override, source: 'override', rank };
  if (candidate.catalogTier) return { tier: candidate.catalogTier, source: 'catalog', rank };
  if (curated) return { tier: curated.tier, source: 'catalog', rank };
  const size = modelSizeFromName(candidate.model);
  const price = candidate.outputCostPerMillion;
  if (price !== undefined && price > 0) {
    if (price >= FRONTIER_OUTPUT_PRICE && price <= TOO_DEAR_OUTPUT_PRICE) return { tier: 'strong', source: 'price', rank };
    // Cheap beside the strongest (Magpie `cheapest`: a quarter or less). A
    // cheap model whose name is not small is a mid-size open model, not a
    // fast one, unless it is far cheaper still.
    const reference = Math.max(context.strongestPrice ?? 0, FRONTIER_OUTPUT_PRICE);
    if (price <= reference / 8 || (price <= reference / 4 && size.small)) return { tier: 'fast', source: 'price', rank };
    return { tier: 'balanced', source: 'price', rank };
  }
  if (size.small) return { tier: 'fast', source: 'name', rank };
  return { tier: 'balanced', source: 'default', rank };
}

/**
 * Three ordered lists of chat models. Inside a tier: the user's order first,
 * then curated rank, then price (dearest first), then catalog order.
 */
export function buildAutoTierTable(
  candidates: readonly AutoTierCandidate[],
  settings: AutoRoutingSettings = {},
): AutoTierTable {
  const seen = new Set<string>();
  const chat = candidates.filter(candidate => {
    const key = autoModelKey(candidate);
    if (seen.has(key) || isNonChatModel(candidate.model) || !isAutoPoolEnabled(settings, candidate)) return false;
    seen.add(key);
    return true;
  });
  const strongestPrice = chat.reduce((max, candidate) => {
    const price = candidate.outputCostPerMillion ?? 0;
    return price <= TOO_DEAR_OUTPUT_PRICE && price > max ? price : max;
  }, 0);
  const table: AutoTierTable = { fast: [], balanced: [], strong: [] };
  chat.forEach(candidate => {
    const inferred = inferAutoTier(candidate, { overrides: settings.tierOverrides, strongestPrice });
    table[inferred.tier].push({ ...candidate, ...inferred });
  });
  for (const tier of AUTO_TIERS) {
    const userOrder = settings.tierOrder?.[tier] ?? [];
    const position = (entry: AutoTierEntry) => {
      const at = userOrder.indexOf(autoModelKey(entry));
      return at < 0 ? Number.POSITIVE_INFINITY : at;
    };
    const catalogOrder = new Map(table[tier].map((entry, index) => [autoModelKey(entry), index]));
    table[tier].sort((a, b) => (position(a) - position(b))
      || (b.rank - a.rank)
      || ((b.outputCostPerMillion ?? 0) - (a.outputCostPerMillion ?? 0))
      || (catalogOrder.get(autoModelKey(a))! - catalogOrder.get(autoModelKey(b))!));
  }
  return table;
}

/** Order in which tiers are tried for a request: its own, then the nearest. */
export function autoTierFallbackOrder(tier: AutoTier): AutoTier[] {
  if (tier === 'fast') return ['fast', 'balanced', 'strong'];
  if (tier === 'strong') return ['strong', 'balanced', 'fast'];
  return ['balanced', 'strong', 'fast'];
}

export function findAutoTierEntry(table: AutoTierTable, ref: AutoModelRef | undefined): AutoTierEntry | undefined {
  if (!ref) return undefined;
  const key = autoModelKey(ref);
  for (const tier of AUTO_TIERS) {
    const entry = table[tier].find(candidate => autoModelKey(candidate) === key);
    if (entry) return entry;
  }
  return undefined;
}

/**
 * The classifier model: the user's pick, else the first fast model, else the
 * current one. Asked every new turn, so quick beats clever.
 */
export function pickAutoClassifier(
  table: AutoTierTable,
  settings: AutoRoutingSettings,
  current: AutoModelRef | undefined,
): AutoModelRef | undefined {
  if (settings.classifier) return settings.classifier;
  const fast = table.fast.find(entry => !modelSizeFromName(entry.model).tiny) ?? table.fast[0];
  if (fast) return { providerId: fast.providerId, model: fast.model };
  const fallback = table.balanced[0] ?? table.strong[0];
  return fallback ? { providerId: fallback.providerId, model: fallback.model } : current;
}

// ---------------------------------------------------------------------------
// Per-turn decision
// ---------------------------------------------------------------------------

export type AutoRouteReason =
  | 'classified'
  | 'cached'
  | 'held-warm-cache'
  | 'fallback-previous'
  | 'classifier-failed'
  | 'grown'
  | 'unavailable-fallback';

/** Prompt cache lifetime. Inside it a session only moves up a tier. */
export const AUTO_ROUTE_WARM_CACHE_MS = 5 * 60_000;
/** Context share at which only a larger window may be chosen (Magpie `outgrown`). */
export const AUTO_ROUTE_CONTEXT_PRESSURE = 0.95;

export interface AutoRouteDecisionInput {
  table: AutoTierTable;
  /** Classifier verdict; undefined when it failed and there is no previous tier. */
  tier: AutoTier | undefined;
  /** How the verdict came about: fresh, cached, or the previous tier reused. */
  verdict: 'classified' | 'cached' | 'fallback-previous' | 'classifier-failed';
  /** The Session's current model, if it has one. */
  current?: AutoModelRef;
  /** When the previous turn ended, ms epoch. */
  lastTurnAt?: number;
  now: number;
  /** Share of the current model's window in use, 0..1. */
  contextUsed?: number;
  /** Can this model run here (credential, same provider history, not cooling down)? */
  isUsable: (ref: AutoTierEntry) => boolean;
  /** Recovery has stricter execution/history requirements than initial routing. */
  canRecover?: (candidate: AutoTierEntry, primary: AutoTierEntry) => boolean;
  /** Stable ranking before the bounded snapshot, e.g. independent failure domains first. */
  recoveryPriority?: (
    candidate: AutoTierEntry,
    primary: AutoTierEntry,
  ) => number;
}

export interface AutoRouteDecision {
  tier: AutoTier
  target: AutoTierEntry;
  /** Next usable model to fail over to, if any. */
  backup?: AutoTierEntry;
  /** Planned same-tier recovery chain; never evidence of an actual invocation. */
  candidates?: AutoTierEntry[];
  reason: AutoRouteReason;
  /** True when target differs from the current model. */
  switches: boolean;
}

const TIER_INDEX: Record<AutoTier, number> = { fast: 0, balanced: 1, strong: 2 };

/**
 * Choose the turn's model. Same tier keeps the current model (no reload),
 * a warm cache never moves down, and context pressure only moves to a larger
 * window. Returns null when no model is usable at all.
 */
export function decideAutoRoute(input: AutoRouteDecisionInput,
): AutoRouteDecision | null {
  const currentEntry = findAutoTierEntry(input.table, input.current);
  const currentUsable = currentEntry ? input.isUsable(currentEntry) : false;
  const requested: AutoTier = input.tier ?? currentEntry?.tier ?? 'balanced';
  let reason: AutoRouteReason = input.verdict;

  const ordered = (tier: AutoTier) => autoTierFallbackOrder(tier)
    .flatMap(entryTier => input.table[entryTier])
    .filter(entry => input.isUsable(entry));

  let tier = requested;
  // Warm cache: moving down costs a full cache miss for a cheaper turn.
  const warm = input.lastTurnAt !== undefined && input.now - input.lastTurnAt < AUTO_ROUTE_WARM_CACHE_MS;
  if (warm && currentEntry && currentUsable && TIER_INDEX[currentEntry.tier] > TIER_INDEX[requested]) {
    tier = currentEntry.tier;
    reason = 'held-warm-cache';
  }

  const candidates = ordered(tier);
  if (candidates.length === 0) return null;
  let target = currentEntry && currentUsable && currentEntry.tier === tier ? currentEntry : candidates[0];
  // A removed/paused current model must not survive admission's classifier
  // failure fallback. Only an eligible current entry may keep that behavior.
  if (!currentUsable && input.current && reason === 'classifier-failed') reason = 'unavailable-fallback';
  if (target.tier !== tier && reason !== 'held-warm-cache') reason = 'unavailable-fallback';

  // Context pressure: only a model with a larger window may take the turn.
  if (input.contextUsed !== undefined && input.contextUsed >= AUTO_ROUTE_CONTEXT_PRESSURE && currentEntry?.contextLength) {
    const window = currentEntry.contextLength;
    if (!target.contextLength || target.contextLength <= window) {
      const larger = candidates.find(entry => (entry.contextLength ?? 0) > window);
      if (larger) {
        target = larger;
        reason = 'grown';
      }
    }
  }

  const recoveryCandidates = candidates.filter(
      entry => autoModelKey(entry) !== autoModelKey(target)
    && entry.tier === target.tier && input.canRecover?.(entry, target) !== false,
    )
    .sort(
      (a, b) =>
        (input.recoveryPriority?.(a, target) ?? 0) -
        (input.recoveryPriority?.(b, target) ?? 0),
    )
    .slice(0, 3);
  const backup = recoveryCandidates[0];
  return {
    tier: target.tier,
    target,
    ...(backup ? { backup } : {}),
    candidates: recoveryCandidates,
    reason,
    switches: !input.current || autoModelKey(input.current) !== autoModelKey(target),
  };
}

/** Per-turn route record. Never carries the user's text. */
export interface AutoRouteRecord {
  tier?: AutoTier;
  providerId: string;
  model: string;
  effort?: string;
  reason: AutoRouteReason;
  classifierModel?: string;
  /** Planned backup, not a claim that a switch has executed. */
  backup?: AutoModelRef;
  /** Ordered planned pool candidates; these are not completed model calls. */
  candidates?: AutoModelRef[];
  /** Historical transcript metadata only; no longer a runtime setting. */
  failoverMode?: 'auto' | 'specified' | 'off';
  backupUnavailableReason?: 'off' | 'not-configured' | 'unavailable' | 'cross-tier' | 'no-candidate';
  /** Failed initial classification kept the live model; no tier was established. */
  unclassified?: boolean;
  latencyMs: number;
  at: string;
}
