import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelRecoveryState } from '../../shared/modelRecovery';
import type { AnthropicRequest } from '../openai-bridge/types/anthropic';
import type { SessionModelRecovery } from './model-recovery';
import { SameTurnStreamContinuation, type StreamContinuationPermit } from './stream-continuation';

function harness(goalId?: string) {
  let root: string | undefined = 'original-root';
  let live = true;
  let state: ModelRecoveryState = {
    version: 1, kind: 'stream', id: 'recovery-1', status: 'waiting', sdkSessionId: 'native-1',
    routeIdentity: 'route-1', turnId: 'original-root', ...(goalId ? { goalId } : {}),
    attempt: 1, startedAt: 10_000, nextRetryAt: 25_000, deadlineAt: 100_000, lastStatus: 502,
  };
  const releaseStreamBinding = vi.fn(() => live && state.status === 'waiting'
    && Date.now() >= state.nextRetryAt && Date.now() < state.deadlineAt);
  const pause = vi.fn(async () => true);
  const advance = vi.fn((_body: AnthropicRequest) => 3);
  const enqueue = vi.fn((_permit: StreamContinuationPermit, _reminder: string) => true);
  const observe = vi.fn();
  const continuation = new SameTurnStreamContinuation({
    recovery: { readState: () => state, releaseStreamBinding, pause } as unknown as SessionModelRecovery,
    rootId: () => root, isLive: () => live, advance, enqueue, observe,
  });
  return { continuation, advance, enqueue, observe, releaseStreamBinding, pause,
    setRoot: (value: string | undefined) => { root = value; },
    setLive: (value: boolean) => { live = value; },
    patchState: (value: Partial<ModelRecoveryState>) => { state = { ...state, ...value }; },
    permit: () => enqueue.mock.calls[0][0], reminder: () => enqueue.mock.calls[0][1],
  };
}

function request(text: string): AnthropicRequest {
  return { model: 'fixture', max_tokens: 100, messages: [{ role: 'user', content: text }] };
}

describe('same original-turn stream continuation', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(10_000); });
  afterEach(() => vi.useRealTimers());

  it.each([undefined, 'goal-original'])('retains the same ordinary/Goal root (%s), uses a one-use marker and reports exact observations', goalId => {
    const h = harness(goalId);
    h.continuation.interrupted();
    expect(h.observe).toHaveBeenLastCalledWith({ version: 1, interruptions: 1, continuations: 0, protectedActions: 0,
      startedAt: 10_000, updatedAt: 10_000, status: 'waiting', reason: 'stream_interrupted' });
    expect(h.continuation.schedule()).toBe(true);
    expect(h.continuation.schedule()).toBe(false);
    vi.advanceTimersByTime(15_000);
    expect(h.enqueue).toHaveBeenCalledOnce();
    expect(h.permit()).toMatchObject({ rootId: 'original-root', recoveryId: 'recovery-1' });
    expect(h.continuation.acceptsInput(h.permit())).toBe(true);
    expect(h.continuation.acceptsInput({ ...h.permit() })).toBe(false);
    expect(h.reminder()).toContain(h.permit().marker);
    expect(h.reminder()).toContain('Do not repeat completed writes');
    expect(h.reminder()).not.toContain('PRIVATE ORIGINAL TASK: pay invoice 9988');
    const body = request(h.reminder());
    expect(h.continuation.authorizeRequest(body)).toBe(true);
    expect(h.advance).toHaveBeenCalledExactlyOnceWith(body);
    expect(h.releaseStreamBinding).toHaveBeenCalledOnce();
    expect(h.continuation.authorizeRequest(body)).toBe(false);
    expect(h.advance).toHaveBeenCalledOnce();
    expect(h.observe).toHaveBeenLastCalledWith({ version: 1, interruptions: 1, continuations: 1, protectedActions: 3,
      startedAt: 10_000, updatedAt: 25_000, status: 'resuming', reason: 'stream_interrupted' });
    vi.advanceTimersByTime(100);
    h.continuation.finish();
    expect(h.observe).toHaveBeenLastCalledWith({ version: 1, interruptions: 1, continuations: 1, protectedActions: 3,
      startedAt: 10_000, updatedAt: 25_100, status: 'completed', reason: 'stream_interrupted' });
  });

  it('never advances old SDK requests or a marker in system/history/assistant content', () => {
    const h = harness();
    h.continuation.interrupted(); h.continuation.schedule(); vi.advanceTimersByTime(15_000);
    const marker = h.permit().marker;
    const old = request('PRIVATE ORIGINAL TASK: pay invoice 9988');
    expect(h.continuation.authorizeRequest(old)).toBe(false);
    expect(h.continuation.authorizeRequest({ ...old, system: marker })).toBe(false);
    expect(h.continuation.authorizeRequest({ ...old, messages: [
      { role: 'user', content: marker }, { role: 'assistant', content: 'done' }, ...old.messages,
    ] })).toBe(false);
    expect(h.continuation.authorizeRequest({ ...old, messages: [{ role: 'assistant', content: marker }] })).toBe(false);
    expect(h.advance).not.toHaveBeenCalled();
    expect(h.releaseStreamBinding).not.toHaveBeenCalled();
    expect(h.continuation.authorizeRequest({ ...old, messages: [{ role: 'user', content: [{ type: 'text', text: marker }] }] })).toBe(true);
  });

  it.each(['canceled', 'deadline', 'root changed', 'checkpoint changed', 'paused'] as const)('does not enqueue after %s during backoff', change => {
    const h = harness();
    h.continuation.interrupted(); expect(h.continuation.schedule()).toBe(true);
    if (change === 'canceled') h.setLive(false);
    if (change === 'deadline') h.patchState({ deadlineAt: 25_000 });
    if (change === 'root changed') h.setRoot('new-root');
    if (change === 'checkpoint changed') h.patchState({ id: 'successor-recovery' });
    if (change === 'paused') h.patchState({ status: 'paused' });
    vi.advanceTimersByTime(15_000);
    expect(h.enqueue).not.toHaveBeenCalled(); expect(h.advance).not.toHaveBeenCalled();
    expect(h.continuation.schedule()).toBe(false);
  });

  it('Stop removes the timer and rejects a late previously enqueued marker', () => {
    const h = harness();
    h.continuation.interrupted(); h.continuation.schedule();
    h.continuation.stop(); vi.advanceTimersByTime(100_000);
    expect(h.enqueue).not.toHaveBeenCalled();
    expect(h.observe).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'stopped', reason: 'stopped' }));
    vi.setSystemTime(10_000);
    const late = harness();
    late.continuation.interrupted(); late.continuation.schedule(); vi.advanceTimersByTime(15_000);
    const body = request(late.reminder()); late.continuation.stop();
    expect(late.continuation.authorizeRequest(body)).toBe(false); expect(late.advance).not.toHaveBeenCalled();
  });

  it('rejects an expired marker before retiring old inference scopes', () => {
    const h = harness();
    h.continuation.interrupted(); h.continuation.schedule(); vi.advanceTimersByTime(15_000);
    vi.setSystemTime(100_000);
    expect(() => h.continuation.authorizeRequest(request(h.reminder()))).toThrow('automatic_replay_blocked');
    expect(h.advance).not.toHaveBeenCalled();
  });

  it('accepts the last user marker with SDK 0.3.296 trailing system reminders', () => {
    const h = harness();
    h.continuation.interrupted(); h.continuation.schedule(); vi.advanceTimersByTime(15_000);
    const body = { ...request(h.reminder()), messages: [
      { role: 'user', content: h.reminder() },
      { role: 'system', content: [{ type: 'text', text: '<total_tokens>14999880 tokens left</total_tokens>' }] },
    ] } as unknown as AnthropicRequest;
    const superseded = { ...body, messages: [body.messages[0], { role: 'user', content: 'newer user input' }, body.messages[1]] } as AnthropicRequest;
    expect(h.continuation.authorizeRequest(superseded)).toBe(false);
    expect(h.advance).not.toHaveBeenCalled();
    expect(h.continuation.authorizeRequest(body)).toBe(true);
    expect(h.advance).toHaveBeenCalledExactlyOnceWith(body);
  });

  it('pauses and reports a blocked observation when the native input owner rejects enqueue', () => {
    const h = harness(); h.enqueue.mockReturnValue(false);
    h.continuation.interrupted(); h.continuation.schedule(); vi.advanceTimersByTime(15_000);
    expect(h.pause).toHaveBeenCalledExactlyOnceWith('Stream continuation input owner is unavailable');
    expect(h.observe).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'blocked', reason: 'storage_failed', continuations: 0 }));
    expect(h.advance).not.toHaveBeenCalled();
  });

  it('does not arm or resume a stopped durable checkpoint', () => {
    const h = harness(); h.patchState({ status: 'paused', reason: 'user stop' });
    h.continuation.interrupted(); expect(h.continuation.schedule()).toBe(false);
    vi.advanceTimersByTime(100_000);
    expect(h.enqueue).not.toHaveBeenCalled(); expect(h.observe).not.toHaveBeenCalled();
  });

  it('counts repeated interruptions without refreshing observed start and resets between turns', () => {
    const h = harness();
    h.continuation.interrupted(); h.continuation.schedule(); vi.advanceTimersByTime(15_000);
    h.continuation.authorizeRequest(request(h.reminder()));
    vi.advanceTimersByTime(2_000);
    h.patchState({ nextRetryAt: 30_000, attempt: 2 });
    h.continuation.interrupted(); h.continuation.schedule();
    expect(h.observe).toHaveBeenLastCalledWith({ version: 1, interruptions: 2, continuations: 1, protectedActions: 3,
      startedAt: 10_000, updatedAt: 27_000, status: 'waiting', reason: 'stream_interrupted' });
    h.continuation.reset(); vi.advanceTimersByTime(10_000);
    expect(h.enqueue).toHaveBeenCalledOnce();
    h.continuation.interrupted();
    expect(h.observe).toHaveBeenLastCalledWith({ version: 1, interruptions: 1, continuations: 0, protectedActions: 0,
      startedAt: 37_000, updatedAt: 37_000, status: 'waiting', reason: 'stream_interrupted' });
  });
});
