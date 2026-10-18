// Classifier transport: the fastest path that is byte-equivalent to how the
// Session itself reaches the provider.
//
//   - Anthropic-protocol API key → direct `/v1/messages` (undici, provider
//     proxy policy, no redirects). No SDK subprocess, so no spawn latency.
//   - OpenAI-protocol → the loopback one-shot Bridge, which owns translation,
//     token-param naming and the upstream proxy exactly as a real turn does.
//   - Managed credentials, endpoints and the SDK-native subscription → the
//     isolated SDK utility turn (`generateUtilityText`), the only path that
//     can resolve those bearers.

import { fetch as undiciFetch, ProxyAgent, type Dispatcher } from 'undici';

import { anthropicAuthHeaders, joinAnthropicMessagesUrl } from '../provider-probe';
import { opencodeGoConversationId, opencodeGoHeaders } from '../opencode-go-request';
import { TOKENDANCE_APP_URL, TOKENDANCE_PROVIDER_ID } from '../../shared/tokendance';
import type { ProviderEnv } from '../provider-types';
import { ClassifierTransportError, type ClassifierTransport, type ClassifierTransportRequest } from './classifier';

/** Room for a reasoning model to think before the number (Magpie: 2048). */
const CLASSIFIER_MAX_TOKENS = 2048;
const ANTHROPIC_VERSION = '2023-06-01';
const ERROR_BODY_MAX = 300;

export interface ClassifierTransportDeps {
  /** Provider env for a model, or 'subscription' for the SDK-native one; undefined when unusable. */
  resolveEnv: (providerId: string, model: string) => ProviderEnv | 'subscription' | undefined;
  getProxyForProviderUrl: (providerId: string, url: string) => string | undefined;
  getSidecarPort: () => number;
  startOneShotBridge: (providerEnv: ProviderEnv, model: string, description: string) => { token: string; release: () => void };
  generateUtilityText: (
    task: { prompt: string; systemPrompt: string; clean: (text: string) => string | null; signal?: AbortSignal },
    model: string,
    providerEnv?: ProviderEnv,
  ) => Promise<string | null>;
}

function messagesBody(request: ClassifierTransportRequest): string {
  return JSON.stringify({
    model: request.classifier.model,
    max_tokens: CLASSIFIER_MAX_TOKENS,
    temperature: 0,
    system: request.system,
    messages: [{ role: 'user', content: request.prompt }],
  });
}

/** Text of an Anthropic Messages response; thinking blocks are skipped. */
export function readMessagesText(payload: unknown): string {
  const content = (payload as { content?: unknown } | null)?.content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block): block is { type: 'text'; text: string } =>
      !!block && typeof block === 'object' && (block as { type?: unknown }).type === 'text'
      && typeof (block as { text?: unknown }).text === 'string')
    .map(block => block.text)
    .join('\n');
}

async function readResponse(resp: { ok: boolean; status: number; text: () => Promise<string> }): Promise<string> {
  const body = await resp.text();
  if (!resp.ok) {
    throw new ClassifierTransportError(`classifier HTTP ${resp.status}: ${body.slice(0, ERROR_BODY_MAX)}`);
  }
  try {
    return readMessagesText(JSON.parse(body));
  } catch {
    throw new ClassifierTransportError('classifier returned a body that is not JSON');
  }
}

function asTransportError(error: unknown): ClassifierTransportError {
  if (error instanceof ClassifierTransportError) return error;
  const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined;
  const message = error instanceof Error ? error.message : String(error);
  const causeMessage = cause instanceof Error ? cause.message : '';
  return new ClassifierTransportError(causeMessage ? `${message} (${causeMessage})` : message);
}

export function createClassifierTransport(deps: ClassifierTransportDeps): ClassifierTransport {
  return async (request) => {
    const { providerId, model } = request.classifier;
    const env = deps.resolveEnv(providerId, model);
    if (!env) throw new ClassifierTransportError(`classifier provider "${providerId}" is unavailable or has no credential`);

    // Managed bearers and the SDK-native subscription only resolve inside an SDK turn.
    if (env === 'subscription' || env.credentialSource || env.endpointSource || !env.apiKey) {
      const text = await deps.generateUtilityText(
        { prompt: request.prompt, systemPrompt: request.system, clean: value => value.trim() || null, signal: request.signal },
        model,
        env === 'subscription' ? undefined : env,
      );
      if (request.signal.aborted) throw new ClassifierTransportError('classifier timed out');
      if (text === null) throw new ClassifierTransportError('classifier utility turn returned nothing');
      return text;
    }

    try {
      if (env.apiProtocol === 'openai') {
        const port = deps.getSidecarPort();
        if (port <= 0) throw new ClassifierTransportError('sidecar port unavailable');
        const bridge = deps.startOneShotBridge(env, model, `auto-route-classifier:${env.baseUrl ?? ''}`);
        try {
          const resp = await fetch(`http://127.0.0.1:${port}/bridge/${bridge.token}/v1/messages`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': env.apiKey, 'anthropic-version': ANTHROPIC_VERSION },
            body: messagesBody(request),
            signal: request.signal,
          });
          return await readResponse(resp);
        } finally {
          bridge.release();
        }
      }

      if (!env.baseUrl) throw new ClassifierTransportError('classifier provider has no base URL');
      const url = joinAnthropicMessagesUrl(env.baseUrl);
      const proxyUrl = deps.getProxyForProviderUrl(providerId, url);
      const agent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
      try {
        const init: Parameters<typeof undiciFetch>[1] & { dispatcher?: Dispatcher } = {
          method: 'POST',
          headers: {
            ...anthropicAuthHeaders(env.authType, env.apiKey),
            ...(providerId === TOKENDANCE_PROVIDER_ID ? { 'X-App-URL': TOKENDANCE_APP_URL } : {}),
            ...opencodeGoHeaders(providerId, opencodeGoConversationId(undefined)),
          },
          body: messagesBody(request),
          signal: request.signal,
          // A user-configured base URL may be local; a redirect to elsewhere is refused.
          redirect: 'error',
          ...(agent ? { dispatcher: agent } : {}),
        };
        return await readResponse(await undiciFetch(url, init));
      } finally {
        if (agent) await agent.close().catch(() => {});
      }
    } catch (error) {
      throw asTransportError(error);
    }
  };
}
