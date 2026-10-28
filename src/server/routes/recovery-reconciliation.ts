import { getSessionEngine } from '../session-engine';
import { verifySessionUserAction } from '../session-engine/user-action-proof';
import { RECOVERY_REVIEW_ACTIONS_PATH, RECOVERY_RECONCILE_PATH, type RecoveryActionRequest } from '../../shared/recoveryReconciliation';
import type { SessionEngine } from '../session-engine/types';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
export async function handleRecoveryReconciliationRoute(path: string, request: Request, suppliedEngine?: SessionEngine): Promise<Response | null> {
  if (![RECOVERY_REVIEW_ACTIONS_PATH, RECOVERY_RECONCILE_PATH].includes(path)) return null;
  const engine = suppliedEngine ?? getSessionEngine();
  if (!engine.inspectRecoveryActions || !engine.reconcileRecoveryAction) return json({ error: 'recovery_review_unsupported_runtime' }, 409);
  try {
    if (path === RECOVERY_REVIEW_ACTIONS_PATH && request.method === 'GET') return json(await engine.inspectRecoveryActions());
    if (path !== RECOVERY_RECONCILE_PATH || request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'recovery_review_invalid_request' }, 400);
    let body = ''; let size = 0; const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 8192) { await reader.cancel(); return json({ error: 'recovery_review_invalid_request' }, 413); }
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
    } finally { reader.releaseLock(); }
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('sessionId' in parsed)
      || typeof parsed.sessionId !== 'string') return json({ error: 'recovery_review_invalid_request' }, 400);
    if (!verifySessionUserAction(request, parsed.sessionId, body)) return json({ error: 'native_recovery_review_required' }, 403);
    return json(await engine.reconcileRecoveryAction(parsed as RecoveryActionRequest));
  } catch {
    return json({ error: 'recovery_review_changed_or_unavailable' }, 409);
  }
}
