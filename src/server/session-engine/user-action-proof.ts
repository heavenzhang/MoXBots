import { createHash, createPublicKey, verify } from 'node:crypto';

/** Rust holds the private key. Runtimes and shell tools inherit only a public key. */
export function verifySessionUserAction(request: Request, sessionId: string, body: string): boolean {
  try {
    const key = process.env.MYAGENTS_USER_ACTION_PUBLIC_KEY;
    const encoded = request.headers.get('x-myagents-user-action');
    const signature = request.headers.get('x-myagents-user-action-signature');
    if (!key || !encoded || !signature || encoded.length > 4096 || signature.length > 256) return false;
    const bytes = Buffer.from(encoded, 'base64');
    const proof = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
    const path = new URL(request.url).pathname;
    if (request.method !== 'POST' || !['/api/session/task-orchestration/plan', '/chat/send'].includes(path)
      || Object.keys(proof).sort().join(',') !== 'bodySha256,nonce,path,sessionId,timestampMs,version'
      || proof.version !== 1 || proof.sessionId !== sessionId || proof.path !== path
      || typeof proof.timestampMs !== 'number' || !Number.isSafeInteger(proof.timestampMs)
      || Date.now() - proof.timestampMs > 60_000 || proof.timestampMs - Date.now() > 10_000
      || typeof proof.nonce !== 'string' || !/^[a-f0-9-]{36}$/i.test(proof.nonce)
      || proof.bodySha256 !== createHash('sha256').update(body).digest('hex')) return false;
    return verify('sha256', bytes, createPublicKey({ key: Buffer.from(key, 'base64'), format: 'der', type: 'spki' }), Buffer.from(signature, 'base64'));
  } catch { return false; }
}
