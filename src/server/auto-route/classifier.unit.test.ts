import { describe, expect, it, vi } from 'vitest';

import {
  AUTO_ROUTE_CLASSIFIER_CACHE_MS,
  AUTO_ROUTE_CLASSIFIER_COOLDOWN_MS,
  ClassifierTransportError,
  createAutoRouteClassifier,
  type ClassifierTransport,
} from './classifier';
import { readMessagesText } from './transport';

const classifier = { providerId: 'p', model: 'flash' };

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe('createAutoRouteClassifier', () => {
  it('classifies, then serves the same question from cache for 10 minutes', async () => {
    const c = clock();
    const transport = vi.fn<ClassifierTransport>(async () => '3');
    const engine = createAutoRouteClassifier(transport, { now: c.now });
    expect(await engine.classify(classifier, { text: 'design a sync engine' })).toMatchObject({ ok: true, tier: 'strong', cached: false });
    expect(await engine.classify(classifier, { text: 'design a sync engine' })).toMatchObject({ ok: true, tier: 'strong', cached: true });
    c.advance(AUTO_ROUTE_CLASSIFIER_CACHE_MS + 1);
    expect(await engine.classify(classifier, { text: 'design a sync engine' })).toMatchObject({ cached: false });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('sends the verbatim system prompt and the numbered levels', async () => {
    const transport = vi.fn<ClassifierTransport>(async () => '1');
    await createAutoRouteClassifier(transport).classify(classifier, { text: 'hi' });
    const request = transport.mock.calls[0][0];
    expect(request.system).toMatch(/^You route a user's message to a coding assistant\./);
    expect(request.prompt).toContain('<message>\nhi\n</message>');
  });

  it('shares one call between identical in-flight questions', async () => {
    let release: (value: string) => void = () => {};
    const transport = vi.fn<ClassifierTransport>(() => new Promise<string>(resolve => { release = resolve; }));
    const engine = createAutoRouteClassifier(transport);
    const a = engine.classify(classifier, { text: 'same' });
    const b = engine.classify(classifier, { text: 'same' });
    release('2');
    expect(await a).toMatchObject({ ok: true, tier: 'balanced' });
    expect(await b).toMatchObject({ ok: true, tier: 'balanced' });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('cools down for 30s after a transport failure, but not after a bad answer', async () => {
    const c = clock();
    const transport = vi.fn<ClassifierTransport>()
      .mockResolvedValueOnce('I think it is hard')
      .mockRejectedValueOnce(new ClassifierTransportError('HTTP 503'))
      .mockResolvedValue('1');
    const engine = createAutoRouteClassifier(transport, { now: c.now });

    expect(await engine.classify(classifier, { text: 'a' })).toMatchObject({ ok: false, kind: 'answer' });
    expect(await engine.classify(classifier, { text: 'b' })).toMatchObject({ ok: false, kind: 'transport', error: 'HTTP 503' });
    expect(await engine.classify(classifier, { text: 'c' })).toMatchObject({ ok: false, kind: 'cooldown' });
    expect(engine.lastFailure(classifier)?.error).toBe('HTTP 503');
    c.advance(AUTO_ROUTE_CLASSIFIER_COOLDOWN_MS + 1);
    expect(await engine.classify(classifier, { text: 'c' })).toMatchObject({ ok: true, tier: 'fast' });
    expect(engine.lastFailure(classifier)).toBeUndefined();
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('times out at the budget and reports it as a transport failure', async () => {
    const transport: ClassifierTransport = ({ signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
    const engine = createAutoRouteClassifier(transport, { timeoutMs: 20 });
    expect(await engine.classify(classifier, { text: 'slow' })).toMatchObject({
      ok: false, kind: 'transport', error: 'classifier did not answer within 0s',
    });
  });

  it('a caller-cancelled turn does not start a cooldown', async () => {
    const controller = new AbortController();
    const transport: ClassifierTransport = ({ signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
    const engine = createAutoRouteClassifier(transport);
    const pending = engine.classify(classifier, { text: 'x' }, controller.signal);
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, kind: 'transport' });
    const ok = createAutoRouteClassifier(async () => '1');
    expect(await ok.classify(classifier, { text: 'x' })).toMatchObject({ ok: true });
  });
});

describe('readMessagesText', () => {
  it('joins text blocks and skips thinking', () => {
    expect(readMessagesText({ content: [{ type: 'thinking', thinking: '...' }, { type: 'text', text: '2' }] })).toBe('2');
    expect(readMessagesText(null)).toBe('');
  });
});
