import type { UpstreamConfig } from './types/bridge';

const SAFE_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN',
  'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
  'UND_ERR_ABORTED', 'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID']);
const label = (value?: string): string => value && /^[\w./: -]{1,160}$/.test(value) ? value : 'redacted';
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};

/** Pre-header fetch facts only. No endpoint, provider, message, header or abort reason is serialized. */
export function fetchFailureDiagnostic(error: unknown, local: {
  headersTimedOut: boolean; downstreamAborted: boolean; controllerAborted: boolean;
}): string {
  const codes = new Set<string>(); const seen = new Set<unknown>(); let unknownCode = false;
  const visit = (value: unknown, depth: number): void => {
    if (!value || seen.has(value) || depth > 3 || seen.size >= 12) return;
    seen.add(value);
    const entry = object(value);
    if (typeof entry.code === 'string') {
      if (SAFE_CODES.has(entry.code)) codes.add(entry.code); else unknownCode = true;
    }
    visit(entry.cause, depth + 1);
    if (Array.isArray(entry.errors)) for (const child of entry.errors.slice(0, 4)) visit(child, depth + 1);
  };
  try { visit(error, 0); } catch { unknownCode = true; }
  return `[recovery-causal] ${JSON.stringify({ event: 'upstream_fetch_failed', codes: [...codes],
    codeStatus: codes.size ? unknownCode ? 'known_and_unknown' : 'known' : unknownCode ? 'unknown' : 'absent',
    localAbort: local.headersTimedOut ? local.downstreamAborted ? 'headers_and_downstream' : 'headers_timeout'
      : local.downstreamAborted ? 'downstream' : local.controllerAborted ? 'unattributed_local_abort' : 'none' })}`;
}

/** Never serialize Error.message/stack, proxy URLs, bodies, request headers, or credential-bearing URLs. */
export function transportDiagnostic(upstream: UpstreamConfig, details: {
  phase: 'response_headers' | 'response_body'; route?: 'direct' | 'proxy' | 'unresolved'; error?: unknown; status?: number; mappedStatus?: number;
  cancelled: boolean; timedOut: boolean; bytesDelivered: number; response?: { headers: { get(name: string): string | null } };
}): string {
  let host = 'invalid';
  try { host = new URL(upstream.baseUrl).hostname; } catch { /* invalid endpoint remains non-secret */ }
  const codes = new Set<string>();
  const seen = new Set<unknown>();
  const visit = (value: unknown, depth: number): void => {
    if (!value || seen.has(value) || depth > 3 || seen.size >= 12) return;
    seen.add(value);
    const entry = object(value);
    if (typeof entry.code === 'string' && SAFE_CODES.has(entry.code)) codes.add(entry.code);
    visit(entry.cause, depth + 1);
    if (Array.isArray(entry.errors)) for (const child of entry.errors.slice(0, 4)) visit(child, depth + 1);
  };
  visit(details.error, 0);
  const errorName = details.error instanceof Error && ['Error', 'TypeError', 'AbortError', 'TimeoutError', 'AggregateError'].includes(details.error.name)
    ? details.error.name : details.error === undefined ? 'none' : 'unknown';
  const ids: Record<string, string> = {};
  for (const name of ['x-request-id', 'request-id', 'cf-ray']) {
    const value = details.response?.headers.get(name);
    if (value && /^[\w-]{1,128}$/.test(value)) ids[name] = value;
  }
  return `[bridge] Anthropic upstream diagnostic ${JSON.stringify({ provider: label(upstream.providerId),
    model: label(upstream.model), protocol: 'anthropic', host, endpoint: '/v1/messages',
    phase: details.phase, route: details.route, status: details.status, mappedStatus: details.mappedStatus, cancelled: details.cancelled, timedOut: details.timedOut,
    bytesDelivered: details.bytesDelivered, errorName, codes: [...codes], requestIds: ids })}`;
}
