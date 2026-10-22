import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeHandler } from './handler';

const state = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('undici', async original => ({ ...await original<typeof import('undici')>(), fetch: (...args: unknown[]) => state.fetch(...args) }));
const secret = 'SYNTHETIC_MESSAGE_CODE_URL_ID_HEADER_SECRET';
afterEach(() => { state.fetch.mockReset(); vi.restoreAllMocks(); });

describe('real fetch-catch diagnostic wiring with synthetic transport only', () => {
  it.each(['socket', 'unknown-code', 'headers-timeout', 'downstream-abort'] as const)(
    'keeps %s response and one dispatch unchanged with disabled/on/throwing diagnostics', async failure => {
      const outcomes = [];
      for (const mode of ['disabled', 'enabled', 'throws', 'rejects']) {
        state.fetch.mockReset();
        const abort = new AbortController();
        const error = Object.assign(new TypeError(secret), { cause: Object.assign(new Error(secret),
          { code: failure === 'unknown-code' ? secret : 'ECONNRESET' }) });
        state.fetch.mockImplementation(async (_url: unknown, init: { signal: AbortSignal }) => {
          if (failure === 'headers-timeout' || failure === 'downstream-abort') {
            return new Promise((_resolve, reject) => {
              init.signal.addEventListener('abort', () => reject(error), { once: true });
              if (failure === 'downstream-abort') abort.abort(new Error(secret));
            });
          }
          throw error;
        });
        const diagnostics: string[] = [];
        const handler = createBridgeHandler({ upstreamHeadersTimeoutMs: 10,
          logger: mode === 'disabled' ? null : line => {
            if (!line.startsWith('[recovery-causal]')) return;
            diagnostics.push(line); if (mode === 'throws') throw new Error(secret);
            if (mode === 'rejects') return Promise.reject(new Error(secret));
          }, getUpstreamConfig: () => ({ providerId: 'fixture', model: 'fixture', apiProtocol: 'openai',
            apiKey: secret, baseUrl: `https://user:${secret}@fixture.invalid/${secret}` }) });
        const response = await handler(new Request(`http://fixture.invalid/bridge/${secret}/v1/messages`, {
          method: 'POST', signal: abort.signal, headers: { 'content-type': 'application/json', authorization: secret },
          body: JSON.stringify({ model: 'fixture', max_tokens: 1, messages: [{ role: 'user', content: secret }] }),
        }));
        outcomes.push({ status: response.status, body: await response.text(), headers: [...response.headers], dispatches: state.fetch.mock.calls.length });
        if (mode !== 'disabled') {
          expect(diagnostics).toHaveLength(1);
          expect(diagnostics[0]).toContain('upstream_fetch_failed'); expect(diagnostics[0]).not.toContain(secret);
          expect(diagnostics[0]).not.toContain('fixture.invalid');
          expect(diagnostics[0]).toContain(failure === 'unknown-code' ? '"codeStatus":"unknown"' : 'ECONNRESET');
          expect(diagnostics[0]).toContain(`"localAbort":"${failure === 'headers-timeout' ? 'headers_timeout' : failure === 'downstream-abort' ? 'downstream' : 'none'}"`);
        }
      }
      expect(outcomes[0].dispatches).toBe(1);
      expect(outcomes[0].status).toBe(failure === 'headers-timeout' ? 408 : 502);
      expect(outcomes[1]).toEqual(outcomes[0]); expect(outcomes[2]).toEqual(outcomes[0]);
      expect(outcomes[3]).toEqual(outcomes[0]);
    },
  );
});
