import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchSidecarParent } from './sidecar-parent';

afterEach(() => { vi.useRealTimers(); });

describe('desktop Sidecar parent lifetime', () => {
  it('keeps a live parent and retires only once when the OS reparents it', () => {
    vi.useFakeTimers();
    let parent = 42;
    const retire = vi.fn();
    watchSidecarParent('42', retire, () => parent);
    vi.advanceTimersByTime(3_000);
    expect(retire).not.toHaveBeenCalled();
    parent = 1;
    vi.advanceTimersByTime(3_000);
    expect(retire).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a lost owner before bootstrap and does not follow a replacement parent', () => {
    vi.useFakeTimers();
    const retire = vi.fn();
    watchSidecarParent('42', retire, () => 43);
    expect(retire).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops observing when its lifecycle is disposed', () => {
    vi.useFakeTimers();
    let parent = 42;
    const retire = vi.fn();
    const dispose = watchSidecarParent('42', retire, () => parent);
    dispose();
    parent = 1;
    vi.advanceTimersByTime(3_000);
    expect(retire).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['', '1', '0', '-1', '42.1', '42x', '9007199254740992'])(
    'rejects invalid launch identity %s', parent => {
      expect(() => watchSidecarParent(parent, vi.fn())).toThrow('Invalid desktop Sidecar parent identity');
    },
  );
});
