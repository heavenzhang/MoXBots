// Auto-route classifier: one numbered-choice call per new user turn.
//
// Behaviour follows Magpie `classify.go`: an 8s budget, a 30s cooldown after a
// transport failure only (a bad answer is the model's, not the link's), a
// 10-minute verdict cache keyed by classifier + prompt, and one shared call
// when the same question is already in flight. The transport is injected so
// the policy is unit-tested without the network.

import { createHash } from 'node:crypto';

import {
  AUTO_ROUTE_CLASSIFIER_SYSTEM_PROMPT,
  buildAutoRouteClassifierPrompt,
  parseAutoRouteAnswer,
  type AutoModelRef,
  type AutoRouteClassifierInput,
  type AutoTier,
} from '../../shared/autoRoute';

export const AUTO_ROUTE_CLASSIFIER_TIMEOUT_MS = 8_000;
export const AUTO_ROUTE_CLASSIFIER_COOLDOWN_MS = 30_000;
export const AUTO_ROUTE_CLASSIFIER_CACHE_MS = 10 * 60_000;
const CACHE_PRUNE_AT = 4096;

/** Thrown by a transport when the link failed (network, timeout, 5xx, auth). */
export class ClassifierTransportError extends Error {
  constructor(message: string, readonly reason?: 'output_limit') {
    super(message);
    this.name = 'ClassifierTransportError';
  }
}

export interface ClassifierTransportRequest {
  classifier: AutoModelRef;
  system: string;
  prompt: string;
  signal: AbortSignal;
  /** Optional bounded structured utility output; tier classifier keeps its tiny default. */
  maxTokens?: number;
  /** Caller-owned utility deadline; forwarding must not silently shorten it. */
  timeoutMs?: number;
}

/** Returns the model's raw answer text, or throws ClassifierTransportError. */
export type ClassifierTransport = (request: ClassifierTransportRequest) => Promise<string>;

export type ClassifyOutcome =
  | { ok: true; tier: AutoTier; cached: boolean; latencyMs: number }
  | { ok: false; kind: 'cooldown' | 'transport' | 'answer'; error: string; latencyMs: number };

interface CachedVerdict { tier: AutoTier; at: number }

export interface AutoRouteClassifier {
  classify(classifier: AutoModelRef, input: AutoRouteClassifierInput, signal?: AbortSignal): Promise<ClassifyOutcome>;
  /** Last failure per classifier model, for settings and `route explain`. */
  lastFailure(classifier: AutoModelRef): { error: string; at: number } | undefined;
  reset(): void;
}

function classifierKey(ref: AutoModelRef): string {
  return `${ref.providerId}/${ref.model}`;
}

export function createAutoRouteClassifier(
  transport: ClassifierTransport,
  options: { now?: () => number; timeoutMs?: number } = {},
): AutoRouteClassifier {
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? AUTO_ROUTE_CLASSIFIER_TIMEOUT_MS;
  const cache = new Map<string, CachedVerdict>();
  const inFlight = new Map<string, Promise<ClassifyOutcome>>();
  const coolingUntil = new Map<string, number>();
  const failures = new Map<string, { error: string; at: number }>();

  function prune(at: number): void {
    if (cache.size <= CACHE_PRUNE_AT) return;
    for (const [key, verdict] of cache) {
      if (at - verdict.at > AUTO_ROUTE_CLASSIFIER_CACHE_MS) cache.delete(key);
    }
  }

  async function ask(
    classifier: AutoModelRef,
    prompt: string,
    cacheKey: string,
    signal: AbortSignal | undefined,
  ): Promise<ClassifyOutcome> {
    const started = now();
    const model = classifierKey(classifier);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const raw = await transport({ classifier, system: AUTO_ROUTE_CLASSIFIER_SYSTEM_PROMPT, prompt, signal: controller.signal });
      const parsed = parseAutoRouteAnswer(raw);
      if (!parsed.ok) {
        // The link works; the model answered off-format. No cooldown.
        const error = parsed.reason === 'none'
          ? 'classifier answered 0 (none of the levels)'
          : `classifier answered "${parsed.answer}", not a number from 1 to 3`;
        failures.set(model, { error, at: now() });
        return { ok: false, kind: 'answer', error, latencyMs: now() - started };
      }
      const at = now();
      cache.set(cacheKey, { tier: parsed.tier, at });
      failures.delete(model);
      coolingUntil.delete(model);
      prune(at);
      return { ok: true, tier: parsed.tier, cached: false, latencyMs: at - started };
    } catch (error) {
      const timedOut = controller.signal.aborted && !signal?.aborted;
      const message = timedOut
        ? `classifier did not answer within ${Math.round(timeoutMs / 1000)}s`
        : error instanceof Error ? error.message : String(error);
      const at = now();
      failures.set(model, { error: message, at });
      // Caller-cancelled turns say nothing about the link.
      if (!signal?.aborted) coolingUntil.set(model, at + AUTO_ROUTE_CLASSIFIER_COOLDOWN_MS);
      return { ok: false, kind: 'transport', error: message, latencyMs: at - started };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  return {
    async classify(classifier, input, signal) {
      const prompt = buildAutoRouteClassifierPrompt(input);
      const model = classifierKey(classifier);
      const cacheKey = createHash('sha256').update(model).update('\0').update(prompt).digest('hex');
      const at = now();
      const cached = cache.get(cacheKey);
      if (cached && at - cached.at <= AUTO_ROUTE_CLASSIFIER_CACHE_MS) {
        return { ok: true, tier: cached.tier, cached: true, latencyMs: 0 };
      }
      const until = coolingUntil.get(model);
      if (until !== undefined && at < until) {
        const last = failures.get(model)?.error ?? 'classifier unavailable';
        return { ok: false, kind: 'cooldown', error: `cooling down after: ${last}`, latencyMs: 0 };
      }
      const pending = inFlight.get(cacheKey);
      if (pending) return pending;
      const request = ask(classifier, prompt, cacheKey, signal).finally(() => inFlight.delete(cacheKey));
      inFlight.set(cacheKey, request);
      return request;
    },
    lastFailure(classifier) {
      return failures.get(classifierKey(classifier));
    },
    reset() {
      cache.clear();
      inFlight.clear();
      coolingUntil.clear();
      failures.clear();
    },
  };
}
