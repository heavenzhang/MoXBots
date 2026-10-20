import { parseLeadingSystemReminder } from '../../shared/systemReminder';
import { shouldRecordAdmissionActivity, type SessionActivityTurnFacts } from '../session-core/session-activity-policy';

export const WATCHDOG_RESUME_REMINDER =
  '<system-reminder>The previous turn was aborted by the inactivity watchdog (10-minute timeout). Resume from existing context and complete the unfinished task.</system-reminder>';

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Only native output or a completed operation renews inference inactivity. */
export function isWatchdogProgressEvent(message: unknown): boolean {
  if (!record(message) || typeof message.type !== 'string') return false;

  if (message.type === 'system') {
    if (message.subtype === 'task_notification') {
      return typeof message.task_id === 'string' && message.task_id.length > 0
        && ['completed', 'failed', 'stopped'].includes(String(message.status));
    }
    if (message.subtype !== 'compact_boundary' || !record(message.compact_metadata)) return false;
    return (message.compact_metadata.trigger === 'auto' || message.compact_metadata.trigger === 'manual')
      && typeof message.compact_metadata.pre_tokens === 'number'
      && Number.isFinite(message.compact_metadata.pre_tokens);
  }

  if (message.type === 'assistant' && record(message.message) && Array.isArray(message.message.content)) {
    return message.message.content.some(block => {
      if (!record(block)) return false;
      if (block.type === 'text' || block.type === 'thinking') {
        const key = block.type === 'text' ? 'text' : 'thinking';
        return typeof block[key] === 'string' && block[key].length > 0;
      }
      if (block.type === 'redacted_thinking') return typeof block.data === 'string' && block.data.length > 0;
      return (block.type === 'tool_use' || block.type === 'server_tool_use')
        && typeof block.id === 'string' && block.id.length > 0
        && typeof block.name === 'string' && block.name.length > 0
        && Object.hasOwn(block, 'input');
    });
  }

  if (message.type === 'stream_event' && record(message.event)
    && message.event.type === 'content_block_delta' && record(message.event.delta)) {
    const delta = message.event.delta;
    if (delta.type === 'text_delta') return typeof delta.text === 'string' && delta.text.length > 0;
    if (delta.type === 'thinking_delta') return typeof delta.thinking === 'string' && delta.thinking.length > 0;
    if (delta.type === 'input_json_delta') return typeof delta.partial_json === 'string' && delta.partial_json.length > 0;
    if (delta.type === 'compaction_delta') return typeof delta.content === 'string' && delta.content.length > 0;
    if (delta.type === 'signature_delta') return typeof delta.signature === 'string' && delta.signature.length > 0;
    return false;
  }

  if (message.type === 'user' && record(message.message) && Array.isArray(message.message.content)) {
    return message.message.content.some(block => record(block) && block.type === 'tool_result'
      && typeof block.tool_use_id === 'string' && block.tool_use_id.length > 0);
  }

  return false;
}

/** A retry or maintenance turn cannot replenish its own recovery budget. */
export function shouldRenewWatchdogAutoResume(input: {
  facts: SessionActivityTurnFacts;
  ownedTurn: boolean;
  retry: boolean;
}): boolean {
  const reminder = parseLeadingSystemReminder(input.facts.inputText);
  return !input.ownedTurn && !input.retry
    && shouldRecordAdmissionActivity(input.facts)
    && (!reminder.hasReminder || reminder.visibleText.trim().length > 0);
}

export interface WatchdogAutoResumePlanInput {
  turnHadSubstantiveActivity: boolean;
  alreadyAutoResumed: boolean;
  /** Goal settlement owns continuation; never inject an unowned Session turn. */
  goalOwned?: boolean;
}

export interface WatchdogAutoResumePlan {
  persistPendingContinue: boolean;
  scheduleAutoResume: boolean;
}

/**
 * Decide what a watchdog-fired abort should do with the resume reminder.
 *
 * A substantive turn gets both:
 *   1. a durable pending flag, so sidecar death still has a next-enqueue fallback;
 *   2. an immediate auto-resume schedule, so no user message is needed to trigger it.
 *
 * The per-process cap prevents reminder -> watchdog -> reminder loops.
 */
export function planWatchdogAutoResume(input: WatchdogAutoResumePlanInput): WatchdogAutoResumePlan {
  if (input.goalOwned || !input.turnHadSubstantiveActivity || input.alreadyAutoResumed) {
    return {
      persistPendingContinue: false,
      scheduleAutoResume: false,
    };
  }
  return {
    persistPendingContinue: true,
    scheduleAutoResume: true,
  };
}

export interface PendingContinueConsumeInput {
  pendingContinueAfterAbort?: boolean;
  consuming: boolean;
  alreadyAutoResumed: boolean;
  deferToScheduledAutoResume: boolean;
}

export function shouldConsumePendingContinueAfterAbort(input: PendingContinueConsumeInput): boolean {
  return Boolean(input.pendingContinueAfterAbort)
    && !input.consuming
    && !input.alreadyAutoResumed
    && !input.deferToScheduledAutoResume;
}

export interface PendingContinueDeferralInput {
  trigger: 'next-enqueue' | 'watchdog-auto';
  scheduledAutoResume: boolean;
}

export function shouldDeferPendingContinueToScheduledAutoResume(input: PendingContinueDeferralInput): boolean {
  return input.trigger === 'next-enqueue'
    && input.scheduledAutoResume;
}

export interface PendingContinueAdoptionInput {
  trigger: 'next-enqueue' | 'watchdog-auto';
  pendingContinueAfterAbort: boolean;
  sessionTerminating: boolean;
  consuming: boolean;
  alreadyAutoResumed: boolean;
  scheduledAutoResume: boolean;
}

export function shouldAdoptPendingContinueIntoScheduledAutoResume(input: PendingContinueAdoptionInput): boolean {
  return input.trigger === 'next-enqueue'
    && input.pendingContinueAfterAbort
    && input.sessionTerminating
    && !input.consuming
    && !input.alreadyAutoResumed
    && !input.scheduledAutoResume;
}

export interface WatchdogAutoResumeDispatchInput {
  sessionActive: boolean;
  sessionTerminating: boolean;
}

export function shouldPrependWatchdogAutoResume(input: WatchdogAutoResumeDispatchInput): boolean {
  return input.sessionTerminating || !input.sessionActive;
}
