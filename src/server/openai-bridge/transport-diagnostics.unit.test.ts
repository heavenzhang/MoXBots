import { describe, expect, it } from 'vitest';
import { transportDiagnostic } from './transport-diagnostics';

describe('safe upstream transport diagnostics', () => {
  it('retains nested and aggregate socket/DNS/TLS codes without error text or URL secrets', () => {
    const secret = 'DO_NOT_LOG_API_KEY_OR_PROMPT';
    const error = new TypeError(secret, { cause: new AggregateError([
      Object.assign(new Error(secret), { code: 'ECONNRESET' }),
      Object.assign(new Error(secret), { code: 'ENOTFOUND' }),
      Object.assign(new Error(secret), { code: 'CERT_HAS_EXPIRED' }),
      Object.assign(new Error(secret), { code: secret }),
    ], secret) });
    const log = transportDiagnostic({ providerId: 'openrouter', model: 'fixture', baseUrl: `https://user:${secret}@example.test/${secret}?key=${secret}` },
      { phase: 'response_headers', error, cancelled: false, timedOut: false, bytesDelivered: 0 });
    expect(log).toContain('ECONNRESET'); expect(log).toContain('ENOTFOUND'); expect(log).toContain('CERT_HAS_EXPIRED');
    expect(log).toContain('example.test'); expect(log).toContain('response_headers'); expect(log).not.toContain(secret);
  });
  it('retains body phase/status/request IDs and handles cyclic causes', () => {
    const error = Object.assign(new Error('private prompt'), { code: 'UND_ERR_SOCKET', cause: undefined as unknown }); error.cause = error;
    const log = transportDiagnostic({ providerId: 'fixture', baseUrl: 'invalid' }, { phase: 'response_body', error, status: 200,
      response: new Response(null, { headers: { 'x-request-id': 'req-123', 'request-id': 'private\tdata' } }),
      cancelled: true, timedOut: false, bytesDelivered: 123 });
    expect(log).toContain('UND_ERR_SOCKET'); expect(log).toContain('req-123'); expect(log).toContain('"bytesDelivered":123');
    expect(log).toContain('"cancelled":true'); expect(log).not.toContain('private');
  });
});
