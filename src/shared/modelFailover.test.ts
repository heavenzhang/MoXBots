import { describe, expect, it } from 'vitest';
import { isModelFailoverProvider, isModelFailoverStatus } from './modelFailover';

describe('automatic API recovery boundaries', () => {
  it.each([408, 429, 500, 502, 503, 504, 529])('allows availability recovery for %s', status => {
    expect(isModelFailoverStatus(status)).toBe(true);
  });
  it.each([200, 400, 401, 402, 403, 404, 409, 422])('never recovers authorization, billing or bad input %s', status => {
    expect(isModelFailoverStatus(status)).toBe(false);
  });
  it('excludes runtime-owned, disabled and scoped credentials', () => {
    expect(isModelFailoverProvider({ id: 'api', type: 'api' })).toBe(true);
    for (const provider of [
      { id: 'api', type: 'api', enabled: false },
      { id: 'subscription', type: 'subscription' },
      { id: 'runtime', type: 'api', execution: { kind: 'dsh' } },
      { id: 'cloud-session:private', type: 'api' },
    ]) expect(isModelFailoverProvider(provider)).toBe(false);
  });
});
