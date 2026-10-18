import { desktopContextOf } from '../../shared/agentMentions';
import { parseLeadingSystemReminder, parseSessionSendRequestDisplay } from '../../shared/systemReminder';
import { restoreMessageImages } from '../context/userImageAttachmentProjection';
import type { Message } from '../types/chat';

/** Error recovery is an ordinary new send, never a conversation/file rewind.
 * Resolve the live row again: a failed local bubble may have been reconciled
 * while its uncertain-delivery confirmation was open. */
export function projectErrorMessageResend(selected: Message, messages: readonly Message[]) {
  const message = messages.find(row => row.id === selected.id && row.role === 'user');
  if (!message || message.deliveryStatus === 'sending') return null;
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
