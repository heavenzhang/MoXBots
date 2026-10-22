// Turn admission hook for auto routing. Runs before the builtin adapter
// materializes the provider route: an idle Session in auto mode gets its new
// turn's model chosen here, the choice is written to the Session snapshot (so
// the renderer's next send and the picker follow it), and a text-free route
// record rides along on the user message.
//
// Legacy routing failures keep the original request. An unavailable explicit
// candidate pool blocks an idle automatic turn instead of using an excluded
// current/default model; manual and already-active turns are unaffected.

import { normalizeModelMode, type AutoModelRef, type AutoRouteRecord, type AutoTier } from '../../shared/autoRoute';
import { createConcreteProviderRoute, type ProviderRoute } from '../../shared/providerRoute';
import { normalizeReasoningEffort } from '../../shared/reasoningEffort';
import type { MessageWire } from '../builtin-session/types';
import type { ProviderEnv } from '../provider-types';
import type { SessionMetadata } from '../types/session';
import { buildSessionSnapshotPatchUpdates } from '../utils/session-snapshot-patch';
import type { RouteTurnInput, RouteTurnResult } from './router';
import { getAutoRouteSessionState, setAutoRouteSessionState } from './session-state';
import { AutoRoutePoolUnavailableError } from './errors';

/** The routable part of a desktop / IM / background request. Mutated in place. */
export interface AutoRoutableRequest {
  model?: string;
  providerRoute?: ProviderRoute;
  providerEnv?: ProviderEnv | 'subscription';
  reasoningEffort?: string;
}

export interface AutoRouteAdmissionDeps {
  getSessionMetadata: (sessionId: string) => SessionMetadata | null | undefined;
  isSessionBusy: () => boolean;
  getMessages: () => MessageWire[];
  current: () => { providerId: string | null; model: string | undefined; env: ProviderEnv | undefined };
  route: (input: RouteTurnInput) => Promise<RouteTurnResult | null>;
  /** Recheck latest explicit membership before any best-effort fallback. */
  assertFallbackAllowed?: () => void;
  updateSessionMetadata: (
    sessionId: string,
    updates: ReturnType<typeof buildSessionSnapshotPatchUpdates>,
    precondition: (current: SessionMetadata) => boolean,
  ) => Promise<SessionMetadata | null>;
  broadcast: (event: string, data: unknown) => void;
  /** Emits `auto_route_decide`; params never carry message text. */
  trackDecision: (params: Record<string, string | number | boolean | null | undefined>) => void;
  /** Image input support for a model; images restrict the candidates. */
  supportsImages: (model: string) => boolean;
  now?: () => number;
}

export interface AutoRouteAdmissionInput {
  sessionId: string;
  /** What the user typed, without injected reminders. */
  text: string;
  hasImages?: boolean;
  /** Analytics source: desktop, im, background. */
  source: string;
}

const REMINDER_BLOCK = /<system-reminder>[\s\S]*?<\/system-reminder>\s*/g;

/** Visible text of a message: reminders removed, tool and thinking blocks skipped. */
export function autoRouteMessageText(content: MessageWire['content']): string {
  const raw = typeof content === 'string'
    ? content
    : content.filter(block => block.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n');
  return raw.replace(REMINDER_BLOCK, '').trim();
}

/** Previous user message, the reply that followed it, and when that turn ended. */
export function previousTurn(messages: readonly MessageWire[]): {
  user?: string;
  reply?: string;
  tier?: AutoTier;
  endedAt?: number;
} {
  let reply: string | undefined;
  let endedAt: number | undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.messageKind === 'diagnostic') continue;
    if (endedAt === undefined) {
      const at = Date.parse(message.timestamp);
      if (Number.isFinite(at)) endedAt = at;
    }
    if (message.role === 'assistant') {
      if (reply === undefined) {
        const text = autoRouteMessageText(message.content);
        if (text) reply = text;
      }
      continue;
    }
    const user = autoRouteMessageText(message.content);
    if (!user) continue;
    return { user, reply, tier: message.metadata?.autoRoute?.unclassified ? undefined : message.metadata?.autoRoute?.tier, endedAt };
  }
  return { endedAt };
}

function shouldRoute(meta: SessionMetadata | null | undefined): boolean {
  if (!meta) return false;
  if ((meta.runtime ?? 'builtin') !== 'builtin') return false;
  if (meta.providerExecutionIdentity) return false;
  return normalizeModelMode(meta.modelMode) === 'auto';
}

/**
 * Route one new turn. Returns the record to store on the user message, or
 * undefined when the turn runs on the request's own model.
 */
export async function applyAutoRouteAdmission(
  request: AutoRoutableRequest,
  input: AutoRouteAdmissionInput,
  deps: AutoRouteAdmissionDeps,
): Promise<AutoRouteRecord | undefined> {
  const fallback = () => {
    if (!deps.isSessionBusy() && shouldRoute(deps.getSessionMetadata(input.sessionId))) deps.assertFallbackAllowed?.();
    return undefined;
  };
  try {
    // Queued/steering/tool messages belong to the active turn. Its candidate
    // remains frozen; only a genuinely idle new turn may revoke stale state.
    if (deps.isSessionBusy()) return undefined;
    const previousState = getAutoRouteSessionState(input.sessionId);
    setAutoRouteSessionState(input.sessionId, previousState?.tier ? { tier: previousState.tier } : undefined);
    const meta = deps.getSessionMetadata(input.sessionId);
    const text = autoRouteMessageText(input.text);
    if (!shouldRoute(meta) || !text) return undefined;

    const messages = deps.getMessages();
    const previous = previousTurn(messages);
    const current = deps.current();
    const currentRef: AutoModelRef | undefined = current.providerId && current.model
      ? { providerId: current.providerId, model: current.model }
      : undefined;
    const usedPercent = meta!.lastContextUsage?.usedPercent;

    const result = await deps.route({
      text,
      previousUser: previous.user,
      previousReply: previous.reply,
      previousTier: getAutoRouteSessionState(input.sessionId)?.tier ?? previous.tier,
      current: currentRef,
      currentEnv: current.env,
      lastTurnAt: previous.endedAt,
      ...(typeof usedPercent === 'number' ? { contextUsed: usedPercent / 100 } : {}),
      freshHistory: messages.length === 0,
      ...(input.hasImages ? { accept: (ref: AutoModelRef) => deps.supportsImages(ref.model) } : {}),
    });
    if (!result) return fallback();
    const { decision } = result;
    // Even a same-model verdict can race a manual selection while classifying.
    const latest = deps.getSessionMetadata(input.sessionId);
    if (deps.isSessionBusy() || !shouldRoute(latest) || latest?.configSnapshotAt !== meta!.configSnapshotAt) return fallback();
    // No verdict and no previous tier: nothing to base a switch on, so the
    // turn runs on its own model (Magpie `Fallback: previous`).
    if (decision.reason === 'classifier-failed') {
      if (!currentRef) return fallback();
      deps.assertFallbackAllowed?.();
      return { providerId: currentRef.providerId, model: currentRef.model,
        reason: 'classifier-failed', unclassified: true, failoverMode: result.failover?.mode,
        ...(result.failover?.mode === 'off' ? { backupUnavailableReason: 'off' as const } : {}), latencyMs: result.latencyMs,
        at: new Date((deps.now ?? Date.now)()).toISOString() };
    }

    const target = decision.target;
    const effort = result.effort ?? normalizeReasoningEffort(request.reasoningEffort) ?? undefined;
    const currentEffort = normalizeReasoningEffort(meta!.reasoningEffort);
    const changesSnapshot = decision.switches
      || meta!.providerRoute?.kind === undefined
      || (result.effort !== undefined && result.effort !== currentEffort);

    if (changesSnapshot && meta!.configSnapshotAt) {
      const payload = {
        providerRoute: createConcreteProviderRoute(target.providerId, target.model),
        model: target.model,
        ...(result.effort !== undefined ? { reasoningEffort: result.effort } : {}),
        providerEnvJson: meta!.providerId === target.providerId ? meta!.providerEnvJson : null,
      };
      const nowIso = new Date((deps.now ?? Date.now)()).toISOString();
      const updates = buildSessionSnapshotPatchUpdates({ existing: meta!, payload, nowIso });
      const expected = meta!.configSnapshotAt;
      const updated = await deps.updateSessionMetadata(input.sessionId, updates, latest =>
        latest.configSnapshotAt === expected && normalizeModelMode(latest.modelMode) === 'auto');
      // Someone changed the Session config meanwhile (e.g. picked a model):
      // their choice wins and this turn runs as requested.
      if (!updated) return fallback();
      deps.broadcast('chat:session-config-changed', { sessionId: updated.id });
    }

    if (decision.switches) {
      request.providerRoute = createConcreteProviderRoute(target.providerId, target.model);
      request.providerEnv = undefined;
    } else {
      // Same model: keep the live provider env as is so nothing reloads.
      request.providerRoute = undefined;
      request.providerEnv = undefined;
    }
    request.model = target.model;
    if (effort !== undefined) request.reasoningEffort = effort;

    setAutoRouteSessionState(input.sessionId, {
      tier: decision.tier,
      primary: { providerId: target.providerId, model: target.model },
      ...(decision.backup ? { backup: { providerId: decision.backup.providerId, modelId: decision.backup.model } } : {}),
    });

    const record: AutoRouteRecord = {
      tier: decision.tier,
      providerId: target.providerId,
      model: target.model,
      ...(effort !== undefined ? { effort } : {}),
      reason: decision.reason,
      ...(result.failover ? { failoverMode: result.failover.mode, backup: result.failover.backup,
        backupUnavailableReason: result.failover.unavailableReason } : {}),
      ...(result.classifier ? { classifierModel: result.classifier.model } : {}),
      latencyMs: result.latencyMs,
      at: new Date((deps.now ?? Date.now)()).toISOString(),
    };
    deps.trackDecision({
      session_id: input.sessionId,
      source: input.source,
      tier: decision.tier,
      reason: decision.reason,
      switches: decision.switches,
      provider_id: target.providerId,
      model: target.model,
      effort: effort ?? null,
      has_backup: decision.backup !== undefined,
      classifier_model: result.classifier?.model ?? null,
      classifier_ok: result.classify?.ok ?? false,
      classifier_cached: result.classify?.ok === true ? result.classify.cached : false,
      classifier_latency_ms: result.classify?.latencyMs ?? 0,
      latency_ms: result.latencyMs,
    });
    return record;
  } catch (error) {
    if (error instanceof AutoRoutePoolUnavailableError && !deps.isSessionBusy()
      && shouldRoute(deps.getSessionMetadata(input.sessionId))) throw error;
    fallback();
    console.warn('[auto-route] admission skipped:', error instanceof Error ? error.message : String(error));
    return undefined;
  }
}
