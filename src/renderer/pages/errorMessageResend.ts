import { desktopContextOf } from '../../shared/agentMentions';
import { parseLeadingSystemReminder, parseSessionSendRequestDisplay } from '../../shared/systemReminder';
import { restoreMessageImages } from '../context/userImageAttachmentProjection';
import type { Message } from '../types/chat';
import { matchesSessionContinuation, type SessionContinuation } from '../../shared/sessionContinuation';

/** Only a definitively unadmitted local failure may resend its original input.
 * Resolve the live row again: a failed local bubble may have been reconciled
 * while its uncertain-delivery confirmation was open. */
export function projectErrorMessageResend(selected: Message, messages: readonly Message[]) {
  const message = messages.find(row => row.id === selected.id && row.role === 'user');
  if (!message || message.deliveryStatus !== 'failed' || message.deliveryUnconfirmed) return null;
  if (selected.deliveryStatus === 'failed' && selected.metadata?.clientRequestId
    && messages.some(row => row.role === 'user' && row.deliveryStatus === undefined
      && row.metadata?.clientRequestId === selected.metadata?.clientRequestId)) return null;
  const reminder = parseLeadingSystemReminder(typeof message.content === 'string' ? message.content : '');
  const text = message.desktopQuery?.visibleText
    ?? (reminder.visibleText || parseSessionSendRequestDisplay(reminder)?.payload || '');
  const images = restoreMessageImages(message.attachments);
  if (!text.trim() && !images.length) return null;
  return {
    text,
    images,
    asyncQuestionReply: message.asyncQuestionReply,
    context: {
      agentMentions: message.desktopQuery?.agentMentions,
      primaryContext: desktopContextOf(message.desktopQuery?.primaryContext),
      requiredSystemSkill: message.desktopQuery?.requiredSystemSkill,
    },
    // Only replace a local failure. Canonical history and partial tool work stay.
    retryFailedMessageId: message.deliveryStatus === 'failed' ? message.id : undefined,
  };
}

export type ErrorRecovery =
  | { kind: 'resend'; message: Message }
  | { kind: 'continue'; turnId: string }
  | { kind: 'inspect' };

/** UI projection only. The existing continuation admission rechecks the exact
 * canonical turn at entry, promotion and synchronous commit. */
export function projectErrorRecovery(
  messages: readonly Message[],
  userMessageId: string | null,
  continuation?: SessionContinuation,
): ErrorRecovery | null {
  const lastUser = messages.findLast(row => row.role === 'user' && !row.id.startsWith('task-notification-'));
  if (!lastUser) return { kind: 'inspect' };
  // A delayed error cannot replay or continue a superseded request.
  if (userMessageId && lastUser.id !== userMessageId) return { kind: 'inspect' };
  if (lastUser.deliveryStatus === 'sending') return null;
  if (lastUser.deliveryStatus === 'failed') {
    return projectErrorMessageResend(lastUser, messages)
      ? { kind: 'resend', message: lastUser } : { kind: 'inspect' };
  }
  if (matchesSessionContinuation(continuation, messages)
    && continuation.rootUserMessageId === lastUser.id) {
    return { kind: 'continue', turnId: continuation.turnId };
  }
  // Missing checkpoint, unsupported Runtime or uncertain delivery: read state,
  // never fall back to replaying an already admitted business instruction.
  return { kind: 'inspect' };
}
