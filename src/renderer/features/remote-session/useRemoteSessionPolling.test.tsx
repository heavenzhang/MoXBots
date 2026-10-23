import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useRemoteSessionPolling, type RemotePollingActivity } from './useRemoteSessionPolling';
function Harness({ active = true, enabled = true, sync }: { active?: boolean; enabled?: boolean; sync: (cancelled: () => boolean) => Promise<RemotePollingActivity | void> }) {
  useRemoteSessionPolling({ enabled, foreground: active, scopeKey: 's', refresh: 0, synchronize: sync });
  return null;
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('keeps observing background sessions and wakes immediately on return', async () => {
  const sync = vi.fn(async (_cancelled: () => boolean) => {});
  const view = render(<Harness active={false} sync={sync} />);
  await act(async () => {});
  expect(sync).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(sync).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(3500); });
  expect(sync).toHaveBeenCalledTimes(2);
  view.rerender(<Harness active sync={sync} />);
  await act(async () => {});
  expect(sync).toHaveBeenCalledTimes(3);
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(sync).toHaveBeenCalledTimes(4);
});
it('reads running output sooner, returns to idle cadence, and stays slow in the background', async () => {
  const sync = vi.fn().mockResolvedValueOnce('running').mockResolvedValueOnce('idle').mockResolvedValue('running');
  const view = render(<Harness sync={sync} />); await act(async () => {});
  await act(async () => { await vi.advanceTimersByTimeAsync(299); });
  expect(sync).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(sync).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(1499); });
  expect(sync).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(sync).toHaveBeenCalledTimes(3);
  view.rerender(<Harness active={false} sync={sync} />);
  // One already scheduled foreground read may finish; subsequent cycles use background cadence.
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(sync).toHaveBeenCalledTimes(4);
  await act(async () => { await vi.advanceTimersByTimeAsync(4999); });
  expect(sync).toHaveBeenCalledTimes(4);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(sync).toHaveBeenCalledTimes(5);
});
it('backs off repeated read failures and returns to the running cadence after recovery', async () => {
  const sync = vi.fn().mockResolvedValueOnce('error').mockRejectedValueOnce(new Error('offline')).mockResolvedValue('running');
  render(<Harness sync={sync} />); await act(async () => {});
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(sync).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(2999); });
  expect(sync).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(sync).toHaveBeenCalledTimes(3);
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(sync).toHaveBeenCalledTimes(4);
});
it('coalesces wakeups during one read, then performs a fresh read without overlap', async () => {
  let complete!: () => void;
  const sync = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; })).mockResolvedValue(undefined);
  const view = render(<Harness active={false} sync={sync} />);
  view.rerender(<Harness active sync={sync} />);
  act(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('focus')); });
  expect(sync).toHaveBeenCalledTimes(1);
  await act(async () => { complete(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(sync).toHaveBeenCalledTimes(2);
});
it('pauses while offline and cancels timers and pending completion authority on cleanup', async () => {
  const sync = vi.fn(async (_cancelled: () => boolean) => {});
  const view = render(<Harness enabled={false} sync={sync} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(sync).not.toHaveBeenCalled();
  view.rerender(<Harness sync={sync} />); await act(async () => {});
  expect(sync).toHaveBeenCalledTimes(1);
  const cancelled = sync.mock.calls[0][0];
  view.unmount();
  expect(cancelled()).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); window.dispatchEvent(new Event('focus')); });
  expect(sync).toHaveBeenCalledTimes(1);
});
