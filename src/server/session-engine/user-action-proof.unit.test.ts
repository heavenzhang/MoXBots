import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifySessionUserAction } from './user-action-proof';
const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
function request(body = '{"sessionId":"s1"}', overrides: Record<string, unknown> = {}, path = '/api/session/task-orchestration/plan') {
  const proof = Buffer.from(JSON.stringify({ version: 1, sessionId: 's1', path, bodySha256: createHash('sha256').update(body).digest('hex'), timestampMs: Date.now(), nonce: randomUUID(), ...overrides }));
  vi.stubEnv('MYAGENTS_USER_ACTION_PUBLIC_KEY', keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'));
  return new Request(`http://local${path}`, { method: 'POST', body, headers: { 'x-myagents-user-action': proof.toString('base64'), 'x-myagents-user-action-signature': sign('sha256', proof, keys.privateKey).toString('base64') } });
}
afterEach(() => vi.unstubAllEnvs());
describe('native desktop user-action proof', () => {
  it.each(['/api/session/task-orchestration/plan', '/chat/send'])('verifies the exact Rust-compatible P256 DER signature for %s', path => {
    expect(verifySessionUserAction(request(undefined, {}, path), 's1', '{"sessionId":"s1"}')).toBe(true);
  });
  it.each([{ sessionId: 's2' }, { path: '/chat/send' }, { bodySha256: 'changed' }, { timestampMs: Date.now() - 61_000 }, { timestampMs: Date.now() + 61_000 }, { version: 2 }, { nonce: 'fake' }, { source: 'human' }])('rejects altered or stale authority %j', override => {
    expect(verifySessionUserAction(request(undefined, override), 's1', '{"sessionId":"s1"}')).toBe(false);
  });
  it('rejects plain loopback/CLI tokens, forged signatures and body tampering', () => {
    const value = request();
    expect(verifySessionUserAction(new Request('http://local/api/session/task-orchestration/plan', { method: 'POST', headers: { 'x-myagents-internal-cli-token': 'tool-token' } }), 's1', '{}')).toBe(false);
    expect(verifySessionUserAction(value, 's1', '{}')).toBe(false);
    value.headers.set('x-myagents-user-action-signature', Buffer.alloc(70).toString('base64'));
    expect(verifySessionUserAction(value, 's1', '{"sessionId":"s1"}')).toBe(false);
  });
});
