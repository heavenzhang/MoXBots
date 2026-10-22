import { describe, expect, it, vi } from 'vitest';
import { fireAcceptedUserTitleHook, firePostTurnTitleHook, setPostTurnTitleHook } from './turn-hooks';

describe('one title owner across admission and terminal triggers', () => {
  it('routes both events through the same slot with distinct context policy', () => {
    const hook = vi.fn();
    setPostTurnTitleHook(hook);
    fireAcceptedUserTitleHook('session', 'builtin', 'model');
    firePostTurnTitleHook('session', 'builtin', 'model');
    expect(hook.mock.calls).toEqual([
      ['session', 'builtin', 'model', undefined, 'accepted-user'],
      ['session', 'builtin', 'model', undefined],
    ]);
  });
  it('does not let a title callback failure fail user admission', () => {
    setPostTurnTitleHook(() => { throw new Error('title unavailable'); });
    expect(() => fireAcceptedUserTitleHook('session', 'codex', 'model')).not.toThrow();
  });
});
