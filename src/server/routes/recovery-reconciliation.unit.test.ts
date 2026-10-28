import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../session-engine', () => ({ getSessionEngine: () => { throw new Error('Unexpected default engine'); } }));
import { handleRecoveryReconciliationRoute } from './recovery-reconciliation';
import type { SessionEngine } from '../session-engine/types';
const path = '/api/session/recovery/reconcile';
const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const body = JSON.stringify({ sessionId: 's', sdkSessionId: 'n', epoch: 1, reviewAuthority: 'a', ledgerDigest: 'd', actionHash: 'h' });
function request(signed = false, sentBody = body) {
  const headers = new Headers({ 'x-myagents-internal-cli-token': 'untrusted-tool-token' });
  if (signed) {
    vi.stubEnv('MYAGENTS_USER_ACTION_PUBLIC_KEY', key.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'));
    const proof = Buffer.from(JSON.stringify({ version: 1, sessionId: 's', path, bodySha256: createHash('sha256').update(body).digest('hex'), timestampMs: Date.now(), nonce: randomUUID() }));
    headers.set('x-myagents-user-action', proof.toString('base64'));
    headers.set('x-myagents-user-action-signature', sign('sha256', proof, key.privateKey).toString('base64'));
  }
  return new Request(`http://local${path}`, { method: 'POST', body: sentBody, headers });
}
function engine() { return { inspectRecoveryActions: vi.fn(async () => ({ actions: [] })), reconcileRecoveryAction: vi.fn(async () => ({ resolvedCount: 1 })) } as unknown as SessionEngine; }
afterEach(() => vi.unstubAllEnvs());
it('requires a native signature over the exact body, not the CLI capability', async () => {
  const e = engine();
  expect((await handleRecoveryReconciliationRoute(path, request(), e))?.status).toBe(403);
  expect((await handleRecoveryReconciliationRoute(path, request(true, body.replace('"h"', '"other"')), e))?.status).toBe(403);
  expect(e.reconcileRecoveryAction).not.toHaveBeenCalled();
  const result = await handleRecoveryReconciliationRoute(path, request(true), e);
  expect(result?.status).toBe(200); expect(result?.headers.get('cache-control')).toBe('no-store');
  expect(e.reconcileRecoveryAction).toHaveBeenCalledWith(JSON.parse(body));
});
it('fails closed for unsupported runtimes, oversized data and method confusion', async () => {
  expect((await handleRecoveryReconciliationRoute(path, request(true), {} as SessionEngine))?.status).toBe(409);
  const e = engine();
  expect((await handleRecoveryReconciliationRoute(path, request(false, 'x'.repeat(8193)), e))?.status).toBe(413);
  expect((await handleRecoveryReconciliationRoute(path, new Request(`http://local${path}`), e))?.status).toBe(405);
  expect(e.reconcileRecoveryAction).not.toHaveBeenCalled();
});
