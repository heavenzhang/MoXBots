/** Read-only, in-memory provenance. Never used to grant recovery or execute tools. */
export type StreamFailureOrigin = 'provider_terminal' | 'protocol_validation' | 'unproven_eof' | 'transport';
export type StreamFailureCategory = 'authentication' | 'billing' | 'rate_limit' | 'context_limit' | 'permission' | 'server' | 'unknown';
export interface StreamFailureDiagnostic { readonly origin: StreamFailureOrigin; readonly category: StreamFailureCategory }

const origins: Readonly<Record<StreamFailureOrigin, string>> = {
  provider_terminal: '模型服务失败终态', protocol_validation: '协议校验失败', unproven_eof: '未确认终态的流结束', transport: '传输中断',
};
const categories: Readonly<Record<StreamFailureCategory, string>> = {
  authentication: '鉴权错误', billing: '额度或计费错误', rate_limit: '请求限流', context_limit: '上下文超限',
  permission: '服务权限错误', server: '服务异常', unknown: '未分类',
};
// Exact known codes only. Raw provider strings are never stored or formatted.
const providerCodes: Readonly<Record<string, StreamFailureCategory>> = Object.freeze({
  invalid_api_key: 'authentication', authentication_error: 'authentication',
  insufficient_quota: 'billing', billing_error: 'billing', rate_limit_exceeded: 'rate_limit', rate_limit_error: 'rate_limit',
  context_length_exceeded: 'context_limit', permission_denied: 'permission', permission_error: 'permission',
  server_error: 'server', overloaded_error: 'server',
});
export function streamFailure(origin: StreamFailureOrigin, code?: unknown): StreamFailureDiagnostic {
  return Object.freeze({ origin, category: origin === 'provider_terminal' && typeof code === 'string'
    && Object.hasOwn(providerCodes, code) ? providerCodes[code] : 'unknown' });
}
/** Discard extra fields; return a fresh two-enum value, never a provider object. */
export function safeStreamFailure(value: unknown): StreamFailureDiagnostic | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as StreamFailureDiagnostic;
  if (typeof candidate.origin !== 'string' || typeof candidate.category !== 'string'
    || !Object.hasOwn(origins, candidate.origin) || !Object.hasOwn(categories, candidate.category)) return undefined;
  return Object.freeze({ origin: candidate.origin, category: candidate.origin === 'provider_terminal' ? candidate.category : 'unknown' });
}
export function streamFailureMessage(value?: StreamFailureDiagnostic): string {
  const safe = safeStreamFailure(value);
  return safe ? ` 首个失败：${origins[safe.origin]}（${categories[safe.category]}）；进度已保留，自动重放仍被禁止。` : '';
}
