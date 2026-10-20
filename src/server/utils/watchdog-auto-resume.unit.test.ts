import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { InactivityWatchdog } from './inactivity-watchdog';
import {
  isWatchdogProgressEvent,
  planWatchdogAutoResume,
  shouldAdoptPendingContinueIntoScheduledAutoResume,
  shouldConsumePendingContinueAfterAbort,
  shouldDeferPendingContinueToScheduledAutoResume,
  shouldPrependWatchdogAutoResume,
  shouldRenewWatchdogAutoResume,
} from './watchdog-auto-resume';

const sessionId = randomUUID();
const sdkUuid = () => randomUUID();
const assistantTextMessage = (): SDKMessage => ({ type: 'assistant', parent_tool_use_id: null, uuid: sdkUuid(), session_id: sessionId, message: {
  id: 'message-1', container: null, content: [{ type: 'text', text: 'Generated answer', citations: [] }], context_management: null, diagnostics: null,
  model: 'test-model', role: 'assistant', stop_details: null, stop_reason: null, stop_sequence: null, type: 'message',
  usage: { cache_creation: null, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, inference_geo: null, input_tokens: 1,
    iterations: null, output_tokens: 1, output_tokens_details: null, server_tool_use: null, service_tier: 'standard', speed: 'standard' },
} });
const toolResultMessage = (): SDKMessage => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'done' }] },
  parent_tool_use_id: null, uuid: sdkUuid(), session_id: sessionId });

describe('watchdog auto-resume policy', () => {
  it('treats only native output, deltas, completed tool results, and compaction boundaries as progress', () => {
    const compacting: SDKMessage = { type: 'system', subtype: 'status', status: 'compacting', uuid: sdkUuid(), session_id: sessionId };
    const commandsChanged: SDKMessage = { type: 'system', subtype: 'commands_changed', commands: [], uuid: sdkUuid(), session_id: sessionId };
    const sessionState: SDKMessage = { type: 'system', subtype: 'session_state_changed', state: 'running', uuid: sdkUuid(), session_id: sessionId };
    const taskCompleted: SDKMessage = { type: 'system', subtype: 'task_notification', task_id: 'task-1', status: 'completed', output_file: '/tmp/task-result', summary: 'done', uuid: sdkUuid(), session_id: sessionId };
    const compactBoundary: SDKMessage = { type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'auto', pre_tokens: 200_000 }, uuid: sdkUuid(), session_id: sessionId };
    const assistantText = assistantTextMessage();
    const textDelta: SDKMessage = { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'x' } }, parent_tool_use_id: null, uuid: sdkUuid(), session_id: sessionId };
    const emptyDelta: SDKMessage = { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '' } }, parent_tool_use_id: null, uuid: sdkUuid(), session_id: sessionId };
    const toolResult = toolResultMessage();
    const toolProgress: SDKMessage = { type: 'tool_progress', tool_use_id: 'tool-1', tool_name: 'Bash', parent_tool_use_id: null, elapsed_time_seconds: 30, heartbeat: true, uuid: sdkUuid(), session_id: sessionId };

    for (const metadata of [compacting, commandsChanged, sessionState, toolProgress, emptyDelta, { type: 'command_lifecycle' }, { type: 'future_sdk_event' }]) {
      expect(isWatchdogProgressEvent(metadata)).toBe(false);
    }
    for (const progress of [compactBoundary, assistantText, textDelta, toolResult, taskCompleted]) {
      expect(isWatchdogProgressEvent(progress)).toBe(true);
    }
  });

  it('fires at the bounded inactivity deadline despite compacting and command metadata events', () => {
    let now = 0;
    const watchdog = new InactivityWatchdog({ timeoutMs: 600_000, intervalMs: 30_000, now: () => now });
    const metadata: SDKMessage[] = [
      { type: 'system', subtype: 'status', status: 'compacting', uuid: sdkUuid(), session_id: sessionId },
      { type: 'system', subtype: 'commands_changed', commands: [], uuid: sdkUuid(), session_id: sessionId },
      { type: 'tool_progress', tool_use_id: 'tool-1', tool_name: 'Bash', parent_tool_use_id: null, elapsed_time_seconds: 30, heartbeat: true, uuid: sdkUuid(), session_id: sessionId },
    ];
    let fired = false;
    for (let tick = 1; tick <= 21; tick++) {
      now = tick * 30_000;
      if (isWatchdogProgressEvent(metadata[tick % metadata.length])) watchdog.markActivity();
      fired = watchdog.evaluateTick().fire;
      if (fired) break;
    }
    expect(fired).toBe(true);
    expect(now).toBe(630_000);
  });

  it('resets the inactivity deadline on actual streamed output and completed tool results', () => {
    let now = 0;
    const watchdog = new InactivityWatchdog({ timeoutMs: 600_000, intervalMs: 30_000, now: () => now });
    const assistantText = assistantTextMessage();
    const toolResult = toolResultMessage();
    for (let tick = 1; tick <= 20; tick++) {
      now = tick * 30_000;
      if (tick === 10 && isWatchdogProgressEvent(assistantText)) watchdog.markActivity();
      if (tick === 20 && isWatchdogProgressEvent(toolResult)) watchdog.markActivity();
      expect(watchdog.evaluateTick().fire).toBe(false);
    }
    let fired = false;
    for (let tick = 21; tick <= 41; tick++) {
      now = tick * 30_000;
      fired = watchdog.evaluateTick().fire;
      if (fired) break;
    }
    expect(fired).toBe(true);
    expect(now).toBe(1_230_000);
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
