import { describe, expect, it } from 'vitest';

import {
  isWatchdogProgressEvent,
  planWatchdogAutoResume,
  shouldAdoptPendingContinueIntoScheduledAutoResume,
  shouldConsumePendingContinueAfterAbort,
  shouldDeferPendingContinueToScheduledAutoResume,
  shouldPrependWatchdogAutoResume,
  shouldRenewWatchdogAutoResume,
} from './watchdog-auto-resume';

describe('watchdog auto-resume policy', () => {
  it('distinguishes compacting/requesting status liveness from actual progress', () => {
    expect(isWatchdogProgressEvent({ type: 'system', subtype: 'status' })).toBe(false);
    expect(isWatchdogProgressEvent({ type: 'system', subtype: 'init' })).toBe(false);
    expect(isWatchdogProgressEvent({ type: 'system', subtype: 'compact_boundary' })).toBe(true);
    expect(isWatchdogProgressEvent({ type: 'system', subtype: 'tool_progress' })).toBe(true);
    expect(isWatchdogProgressEvent({ type: 'stream_event' })).toBe(true);
    expect(isWatchdogProgressEvent({ type: 'assistant' })).toBe(true);
  });
  it('renews only new business admission, retaining retry and maintenance caps', () => {
    const input = { facts: { inputText: 'new business' }, ownedTurn: false, retry: false };
    expect(shouldRenewWatchdogAutoResume(input)).toBe(true);
    expect(shouldRenewWatchdogAutoResume({ ...input, ownedTurn: true })).toBe(false);
    expect(shouldRenewWatchdogAutoResume({ ...input, retry: true })).toBe(false);
    for (const inputText of [
      '<system-reminder>continue after watchdog</system-reminder>',
      '<system-reminder><MEMORY_UPDATE>update</MEMORY_UPDATE></system-reminder>',
      '<system-reminder><HEARTBEAT>check</HEARTBEAT></system-reminder>',
    ]) expect(shouldRenewWatchdogAutoResume({ ...input, facts: { inputText } })).toBe(false);
    expect(shouldRenewWatchdogAutoResume({ ...input, facts: {
      inputText: 'memory update', origin: { kind: 'automation', surface: 'memory_update' },
    } })).toBe(false);
    expect(shouldRenewWatchdogAutoResume({ ...input, facts: {
      inputText: '<system-reminder>context</system-reminder>new business',
    } })).toBe(true);
  });
  it('leaves Goal recovery with its durable owner even after substantive output', () => {
    expect(planWatchdogAutoResume({
      turnHadSubstantiveActivity: true,
      alreadyAutoResumed: false,
      goalOwned: true,
    })).toEqual({ persistPendingContinue: false, scheduleAutoResume: false });
  });
  it('marks and schedules auto-resume for a substantive watchdog abort', () => {
    expect(planWatchdogAutoResume({
      turnHadSubstantiveActivity: true,
      alreadyAutoResumed: false,
    })).toEqual({
      persistPendingContinue: true,
      scheduleAutoResume: true,
    });
  });

  it('does not schedule auto-resume for an empty watchdog abort', () => {
    expect(planWatchdogAutoResume({
      turnHadSubstantiveActivity: false,
      alreadyAutoResumed: false,
    })).toEqual({
      persistPendingContinue: false,
      scheduleAutoResume: false,
    });
  });

  it('does not re-arm a session after this process already injected auto-resume', () => {
    expect(planWatchdogAutoResume({
      turnHadSubstantiveActivity: true,
      alreadyAutoResumed: true,
    })).toEqual({
      persistPendingContinue: false,
      scheduleAutoResume: false,
    });
  });

  it('allows pending-flag fallback only when not already consuming or capped', () => {
    expect(shouldConsumePendingContinueAfterAbort({
      pendingContinueAfterAbort: true,
      consuming: false,
      alreadyAutoResumed: false,
      deferToScheduledAutoResume: false,
    })).toBe(true);

    expect(shouldConsumePendingContinueAfterAbort({
      pendingContinueAfterAbort: true,
      consuming: true,
      alreadyAutoResumed: false,
      deferToScheduledAutoResume: false,
    })).toBe(false);

    expect(shouldConsumePendingContinueAfterAbort({
      pendingContinueAfterAbort: true,
      consuming: false,
      alreadyAutoResumed: true,
      deferToScheduledAutoResume: false,
    })).toBe(false);

    expect(shouldConsumePendingContinueAfterAbort({
      pendingContinueAfterAbort: false,
      consuming: false,
      alreadyAutoResumed: false,
      deferToScheduledAutoResume: false,
    })).toBe(false);

    expect(shouldConsumePendingContinueAfterAbort({
      pendingContinueAfterAbort: true,
      consuming: false,
      alreadyAutoResumed: false,
      deferToScheduledAutoResume: true,
    })).toBe(false);
  });

  it('prepends watchdog auto-resume after teardown so rescued queued work stays behind it', () => {
    expect(shouldPrependWatchdogAutoResume({ sessionActive: false, sessionTerminating: false })).toBe(true);
    expect(shouldPrependWatchdogAutoResume({ sessionActive: true, sessionTerminating: false })).toBe(false);
    expect(shouldPrependWatchdogAutoResume({ sessionActive: true, sessionTerminating: true })).toBe(true);
  });

  it('defers next-enqueue fallback while watchdog auto-resume still owns the pending flag', () => {
    expect(shouldDeferPendingContinueToScheduledAutoResume({
      trigger: 'next-enqueue',
      scheduledAutoResume: false,
    })).toBe(false);

    expect(shouldDeferPendingContinueToScheduledAutoResume({
      trigger: 'next-enqueue',
      scheduledAutoResume: true,
    })).toBe(true);

    expect(shouldDeferPendingContinueToScheduledAutoResume({
      trigger: 'next-enqueue',
      scheduledAutoResume: false,
    })).toBe(false);

    expect(shouldDeferPendingContinueToScheduledAutoResume({
      trigger: 'watchdog-auto',
      scheduledAutoResume: true,
    })).toBe(false);
  });

  it('adopts crash fallback into scheduled auto-resume when a session is already terminating', () => {
    expect(shouldAdoptPendingContinueIntoScheduledAutoResume({
      trigger: 'next-enqueue',
      pendingContinueAfterAbort: true,
      sessionTerminating: true,
      consuming: false,
      alreadyAutoResumed: false,
      scheduledAutoResume: false,
    })).toBe(true);

    expect(shouldAdoptPendingContinueIntoScheduledAutoResume({
      trigger: 'next-enqueue',
      pendingContinueAfterAbort: true,
      sessionTerminating: false,
      consuming: false,
      alreadyAutoResumed: false,
      scheduledAutoResume: false,
    })).toBe(false);

    expect(shouldAdoptPendingContinueIntoScheduledAutoResume({
      trigger: 'watchdog-auto',
      pendingContinueAfterAbort: true,
      sessionTerminating: true,
      consuming: false,
      alreadyAutoResumed: false,
      scheduledAutoResume: false,
    })).toBe(false);

    expect(shouldAdoptPendingContinueIntoScheduledAutoResume({
      trigger: 'next-enqueue',
      pendingContinueAfterAbort: true,
      sessionTerminating: true,
      consuming: false,
      alreadyAutoResumed: false,
      scheduledAutoResume: true,
    })).toBe(false);
  });
});
