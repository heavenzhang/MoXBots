import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClassifierTransport } from './transport';

const calls = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('undici', async original => ({ ...await original<typeof import('undici')>(), fetch: calls.fetch }));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('bounded semantic output transport', () => {
  function fixture(protocol: 'anthropic' | 'openai') {
    const release = vi.fn();
    vi.stubGlobal('fetch', calls.fetch);
    const transport = createClassifierTransport({
      resolveEnv: () => ({ apiProtocol: protocol, baseUrl: 'https://synthetic.invalid', apiKey: 'synthetic-only' }),
      getProxyForProviderUrl: () => undefined, getSidecarPort: () => 1234,
      startOneShotBridge: () => ({ token: 'synthetic', release }),
      generateUtilityText: async () => { throw new Error('Unexpected SDK transport'); },
    });
    const request = { classifier: { providerId: 'fixture', model: 'reasoning-fixture' },
      system: 'Return JSON', prompt: 'Continue same task', signal: new AbortController().signal, maxTokens: 4096 };
    return { transport, request, release };
  }

  it.each([408, 429, 500, 502, 503, 504, 529, 400, 401, 403, 404])('classifies HTTP %s without exposing the response body', async status => {
    const { transport, request } = fixture('anthropic');
    calls.fetch.mockResolvedValue({ ok: false, status, text: async () => 'private upstream detail' });
    const error = await transport(request).catch(error => error);
    expect(error).toMatchObject({ status, retryable: status === 408 || status === 429 || status >= 500 });
    expect(error.message).not.toContain('private upstream detail');
  });

  it.each(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'CERT_HAS_EXPIRED'])('classifies network failure %s', async code => {
    const { transport, request } = fixture('anthropic');
    calls.fetch.mockRejectedValue(new TypeError('fetch failed', { cause: Object.assign(new Error('network detail'), { code }) }));
    await expect(transport(request)).rejects.toMatchObject({ retryable: code !== 'CERT_HAS_EXPIRED', code });
  });

  it.each(['anthropic', 'openai'] as const)('preserves room for reasoning and final JSON (%s)', async protocol => {
    const { transport, request, release } = fixture(protocol);
    calls.fetch.mockImplementation(async (_url, options) => {
      const budget = JSON.parse(options.body).max_tokens;
      return { ok: true, status: 200, text: async () => JSON.stringify({
        stop_reason: budget < 2000 ? 'max_tokens' : 'end_turn',
        content: budget < 2000 ? [{ type: 'thinking', thinking: 'private' }]
          : [{ type: 'thinking', thinking: 'private' }, { type: 'text', text: '{"kind":"execute"}' }],
      }) };
    });
    expect(await transport(request)).toBe('{"kind":"execute"}');
    expect(JSON.parse(calls.fetch.mock.calls[0][1].body).max_tokens).toBe(4096);
    expect(calls.fetch).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledTimes(protocol === 'openai' ? 1 : 0);
  });

  it.each([{ content: [] }, { content: [{ type: 'text', text: '{"kind":"execute"}' }] }])('never accepts output truncated by the provider ($content)', async ({ content }) => {
    const { transport, request } = fixture('anthropic');
    calls.fetch.mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({
      stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: 'private' }, ...content],
      usage: { output_tokens: 4096 },
    }) });
    await expect(transport(request)).rejects.toMatchObject({ reason: 'output_limit' });
    expect(calls.fetch).toHaveBeenCalledOnce();
  });

  it.each([[undefined, 2048], [1024, 1024], [999999, 4096], [Number.NaN, 2048], [1, 16]])('keeps bounded defaults (%s)', async (maxTokens, expected) => {
    const { transport, request } = fixture('anthropic');
    calls.fetch.mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: 'text', text: '1' }] }) });
    await transport({ ...request, maxTokens });
    expect(JSON.parse(calls.fetch.mock.calls[0][1].body).max_tokens).toBe(expected);
  });
});
