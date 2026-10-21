// 请外援: the Session's primary model hands one self-contained task package to
// another model from the auto-routing tiers. Candidates come straight from the
// tier table (no presets, no roles); other tiers rank before the current one.
//
// The candidate runs one isolated text turn: no tools, no conversation
// history, no workspace access beyond attached file contents. Only the primary
// writes the workspace and accepts the result. Ask-first is a prompt contract:
// the primary names the model and the reason and waits for the user's yes.

import { readFileSync, realpathSync, statSync } from 'fs';
import { isAbsolute, relative, resolve } from 'path';

import {
  AUTO_TIERS,
  autoModelKey,
  bareModelId,
  isAutoRoutingEnabled,
  type AutoModelRef,
  type AutoTier,
} from '../../shared/autoRoute';
import { APP_CLI_NAME } from '../../shared/appProfile';
import { normalizeReasoningEffort, reasoningEffortChoices, REASONING_EFFORT_DEFAULT } from '../../shared/reasoningEffort';
import { isUpdaterQaBuild } from '../../shared/updaterQa';
import type { ProviderEnv } from '../provider-types';
import type { SessionMetadata } from '../types/session';
import { loadConfig, type AdminAppConfig } from '../utils/admin-config';
import { assertSafeFilePath } from '../utils/safe-file-path';
import { buildAutoRouteCatalog, resolveAutoRouteEnv, type AutoRouteCatalog, type AutoRouteCatalogEntry } from './router';

const MAX_PROMPT_CHARS = 200_000;
const MAX_FILES = 12;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_FILE_BYTES = 1024 * 1024;

export class AutoRouteAssistError extends Error {
  constructor(message: string, readonly status = 400, readonly hint?: string) {
    super(message);
    this.name = 'AutoRouteAssistError';
  }
}

export interface AssistCandidate extends AutoModelRef {
  rank: number;
  tier: AutoTier;
  modelName?: string;
  providerName: string;
  /** Effort levels this model accepts; empty = no effort knob. */
  allowedEfforts: readonly string[];
}

function currentRef(meta: SessionMetadata | null | undefined): AutoModelRef | undefined {
  return meta?.providerId && meta.model ? { providerId: meta.providerId, model: meta.model } : undefined;
}

function effortsFor(entry: AutoRouteCatalogEntry): readonly string[] {
  return reasoningEffortChoices('builtin', entry.provider.apiProtocol, entry.provider.id, entry.model, entry.provider.config?.baseUrl) ?? [];
}

/**
 * Tier models except the Session's own, cross-tier first: stronger tiers
 * before weaker ones, then the current tier, each in its tier order.
 */
export function listAssistCandidates(catalog: AutoRouteCatalog, current: AutoModelRef | undefined): AssistCandidate[] {
  const currentKey = current ? autoModelKey(current) : undefined;
  const currentTier = AUTO_TIERS.find(tier => catalog.table[tier].some(entry => autoModelKey(entry) === currentKey));
  const strongestFirst = [...AUTO_TIERS].reverse();
  const order = currentTier
    ? [...strongestFirst.filter(tier => tier !== currentTier), currentTier]
    : strongestFirst;
  const result: AssistCandidate[] = [];
  for (const tier of order) {
    for (const row of catalog.table[tier]) {
      const key = autoModelKey(row);
      if (key === currentKey) continue;
      const entry = catalog.entries.get(key);
      if (!entry) continue;
      result.push({
        rank: result.length + 1,
        tier,
        providerId: row.providerId,
        model: row.model,
        ...(row.modelName ? { modelName: row.modelName } : {}),
        providerName: entry.provider.name ?? entry.provider.id,
        allowedEfforts: effortsFor(entry),
      });
    }
  }
  return result;
}

/** Exact `provider/model` first, then a unique model id or display name. */
export function findAssistCandidate(candidates: readonly AssistCandidate[], selector: string): AssistCandidate | 'ambiguous' | undefined {
  const key = selector.trim();
  if (!key) return undefined;
  const exact = candidates.find(candidate => autoModelKey(candidate) === key);
  if (exact) return exact;
  const lower = key.toLocaleLowerCase();
  const matches = candidates.filter(candidate =>
    candidate.model.toLocaleLowerCase() === lower
    || bareModelId(candidate.model).toLocaleLowerCase() === lower
    || candidate.modelName?.toLocaleLowerCase() === lower);
  if (matches.length > 1) return 'ambiguous';
  return matches[0];
}

function requireAssistSession(meta: SessionMetadata | null | undefined, config: AdminAppConfig): AutoRouteCatalog {
  if (!meta) throw new AutoRouteAssistError('No current Session.', 409);
  if ((meta.runtime ?? 'builtin') !== 'builtin' || meta.providerExecutionIdentity) {
    throw new AutoRouteAssistError('请外援 is only available in builtin Sessions.', 409);
  }
  const catalog = buildAutoRouteCatalog(config);
  if (!isAutoRoutingEnabled(catalog.settings)) {
    throw new AutoRouteAssistError('Auto model selection is off, so there are no tier candidates.', 409,
      'The user can turn it on in Settings -> Model Providers -> Auto model selection.');
  }
  return catalog;
}

export function describeAssistCandidates(meta: SessionMetadata | null | undefined, config: AdminAppConfig = loadConfig()): Record<string, unknown> {
  const catalog = requireAssistSession(meta, config);
  const current = currentRef(meta);
  return {
    ...(current ? { current: autoModelKey(current) } : {}),
    mode: 'ask-first',
    candidates: listAssistCandidates(catalog, current).map(candidate => ({
      ...candidate,
      key: autoModelKey(candidate),
    })),
  };
}

export const ASSIST_SYSTEM_PROMPT = [
  'You are a second model asked for help by the primary agent of a coding session.',
  'You cannot run tools, browse, read files that are not included, or see the conversation with the user.',
  'Return only the requested deliverable, complete and self-contained. If information is missing, state the assumption you made or what is needed. Never claim to have executed commands, run tests or changed files.',
].join('\n');

/** Injectable for tests; production uses the isolated SDK utility turn. */
export type AssistRunner = (args: {
  candidate: AssistCandidate;
  providerEnv: ProviderEnv | undefined;
  prompt: string;
  effort?: string;
  signal?: AbortSignal;
  conversationId?: string;
}) => Promise<string | null>;

const defaultRunner: AssistRunner = async ({ candidate, providerEnv, prompt, effort, signal, conversationId }) => {
  const { generateUtilityText } = await import('../title-generator');
  return generateUtilityText({
    prompt,
    systemPrompt: ASSIST_SYSTEM_PROMPT,
    clean: text => text.trim() || null,
    requireSuccessfulTerminal: true,
    // Real generative work: no wall-clock budget. It ends when the model
    // finishes, fails, or the caller cancels.
    timeoutMs: null,
    label: `route-assist:${autoModelKey(candidate)}`,
    reasoning: { effort: effort ?? REASONING_EFFORT_DEFAULT },
    signal,
  }, candidate.model, providerEnv, conversationId);
};

export interface AssistDispatchInput {
  sessionMeta?: SessionMetadata | null;
  workspacePath?: string | null;
  /** `provider/model`, model id, or display name from `route candidates`. */
  target: string;
  prompt: string;
  files?: string[];
  /** The primary's per-dispatch choice; omitted = model default. */
  effort?: string;
  signal?: AbortSignal;
}

export interface AssistDispatchResult {
  providerId: string;
  model: string;
  tier: AutoTier;
  reasoningEffort: string;
  attempts: number;
  durationMs: number;
  files: string[];
  text: string;
}

function readAttachments(rawFiles: string[], workspacePath: string): { path: string; content: string }[] {
  if (rawFiles.length > MAX_FILES) throw new AutoRouteAssistError(`At most ${MAX_FILES} files can be attached to one request.`);
  // Labels are relative to the canonical root (macOS /var -> /private/var).
  const workspaceReal = realpathSync(workspacePath);
  let total = 0;
  return rawFiles.map(raw => {
    const input = raw.trim().replace(/^@/, '');
    const candidate = isAbsolute(input) ? input : resolve(workspacePath, input);
    let realPath: string;
    try {
      realPath = assertSafeFilePath(candidate, { workspacePath, extraRoots: [] });
    } catch (error) {
      throw new AutoRouteAssistError(`Cannot attach '${raw}': ${error instanceof Error ? error.message : String(error)}`);
    }
    const stat = statSync(realPath);
    if (!stat.isFile()) throw new AutoRouteAssistError(`Cannot attach '${raw}': not a file.`);
    if (stat.size > MAX_FILE_BYTES) throw new AutoRouteAssistError(`Cannot attach '${raw}': larger than 256KB.`);
    total += stat.size;
    if (total > MAX_TOTAL_FILE_BYTES) throw new AutoRouteAssistError('Attached files exceed 1MB in total.');
    const content = readFileSync(realPath, 'utf-8');
    if (content.includes('\0')) throw new AutoRouteAssistError(`Cannot attach '${raw}': binary files are not supported.`);
    return { path: relative(workspaceReal, realPath) || realPath, content };
  });
}

export function buildAssistPrompt(task: string, files: { path: string; content: string }[]): string {
  if (!files.length) return task;
  const blocks = files.map(file => `<file path="${file.path.replace(/"/g, '&quot;')}">\n${file.content}\n</file>`);
  return `${task}\n\nAttached workspace files:\n${blocks.join('\n')}`;
}

/**
 * Run one task package on one tier candidate. A failed invocation is retried
 * once on the same model, never rerouted silently.
 */
export async function dispatchAssist(
  input: AssistDispatchInput,
  runner: AssistRunner = defaultRunner,
  config: AdminAppConfig = loadConfig(),
): Promise<AssistDispatchResult> {
  if (isUpdaterQaBuild()) throw new AutoRouteAssistError('UPDATER_QA_EXECUTION_DISABLED', 403);
  const catalog = requireAssistSession(input.sessionMeta, config);
  const candidates = listAssistCandidates(catalog, currentRef(input.sessionMeta));
  const found = findAssistCandidate(candidates, input.target);
  if (found === 'ambiguous') {
    throw new AutoRouteAssistError(`"${input.target}" matches more than one model.`, 400, 'Pass provider/model from `route candidates`.');
  }
  if (!found) {
    throw new AutoRouteAssistError(`No tier candidate matching "${input.target}".`, 404,
      candidates.length ? `Candidates: ${candidates.map(autoModelKey).join(', ')}` : 'No other model is configured.');
  }
  const prompt = input.prompt.trim();
  if (!prompt) throw new AutoRouteAssistError('The task package is empty.');
  if (prompt.length > MAX_PROMPT_CHARS) throw new AutoRouteAssistError('The task package exceeds 200,000 characters; attach files instead.');

  let effort: string | undefined;
  const requested = input.effort?.trim();
  if (requested) {
    const normalized = normalizeReasoningEffort(requested);
    if (normalized && normalized !== REASONING_EFFORT_DEFAULT) {
      if (!found.allowedEfforts.includes(normalized)) {
        throw new AutoRouteAssistError(
          found.allowedEfforts.length
            ? `This model does not accept effort "${requested}". Allowed: ${found.allowedEfforts.join(', ')}.`
            : 'This model has no reasoning-effort setting; omit --effort.', 400);
      }
      effort = normalized;
    }
  }

  const workspacePath = input.workspacePath?.trim();
  const files = input.files?.length
    ? (() => {
        if (!workspacePath) throw new AutoRouteAssistError('No current workspace is available for --file paths.');
        return readAttachments(input.files, workspacePath);
      })()
    : [];

  const env = resolveAutoRouteEnv(found, config);
  if (!env) {
    throw new AutoRouteAssistError(`${autoModelKey(found)} needs a valid credential before it can help.`, 409,
      'Open Settings -> Model Providers and configure the provider.');
  }
  const providerEnv = env === 'subscription' ? undefined : env;
  const fullPrompt = buildAssistPrompt(prompt, files);
  const started = Date.now();
  let attempts = 0;
  let text: string | null = null;
  while (attempts < 2 && !text) {
    if (input.signal?.aborted) break;
    attempts += 1;
    text = await runner({ candidate: found, providerEnv, prompt: fullPrompt, effort, signal: input.signal, conversationId: input.sessionMeta?.id });
  }
  if (!text) {
    const cancelled = input.signal?.aborted === true;
    throw new AutoRouteAssistError(
      cancelled
        ? `Request to ${autoModelKey(found)} was cancelled after ${attempts} attempt(s).`
        : `${autoModelKey(found)} returned no output after ${attempts} attempt(s).`, 502,
      'Do not retry the same model again; tell the user, then use another candidate or do it yourself.');
  }
  return {
    providerId: found.providerId,
    model: found.model,
    tier: found.tier,
    reasoningEffort: effort ?? REASONING_EFFORT_DEFAULT,
    attempts,
    durationMs: Date.now() - started,
    files: files.map(file => file.path),
    text,
  };
}

export function assistErrorResponse(error: unknown): { success: false; error: string; data: { status: number }; recoveryHint?: { message: string } } {
  if (error instanceof AutoRouteAssistError) {
    return { success: false, error: error.message, data: { status: error.status }, ...(error.hint ? { recoveryHint: { message: error.hint } } : {}) };
  }
  return { success: false, error: error instanceof Error ? error.message : String(error), data: { status: 500 } };
}

export function getAssistReadme(): string {
  return `${APP_CLI_NAME} route assist — 请外援: ask another model for help

Usage:
  ${APP_CLI_NAME} route candidates [--json]
  ${APP_CLI_NAME} route assist --model <provider/model> --prompt-file <file> [--file <workspace-path> ...] [--effort <level>] [--json]

Candidates are the auto-routing tier models other than this Session's own,
models from other tiers first. The candidate runs one isolated text turn: no
tools, no conversation history, no workspace access beyond --file contents.

Ask first (the only mode): before every request, tell the user which model you
want, what you will send it, and why, then wait for the user's explicit yes.
Never send secrets, credentials, or files the user did not agree to share.

--effort is your call per request; omit it for the model default. 'route
candidates' lists the levels each model accepts; an unsupported level is
rejected instead of silently degraded.

A request has no wall-clock budget: it returns when the model finishes or
fails, and a failed invocation is retried once. Ctrl-C cancels it. The reply is
printed to stdout; checking it and applying any change remain your job.`;
}
