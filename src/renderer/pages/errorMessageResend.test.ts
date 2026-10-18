import { describe, expect, it } from 'vitest';
import { buildGoalContextReminder, buildGoalContinuationReminder } from '../../shared/systemReminder';
import type { Message } from '../types/chat';
import { projectErrorMessageResend } from './errorMessageResend';

const goal = { objective: 'test goal', goalId: 'goal-test', goalStatus: 'active', turnNumber: 2 };
const user: Message = { id: 'u', role: 'user', content: 'try again', timestamp: new Date(0),
  sdkUuid: 'native-u', metadata: { source: 'desktop', clientRequestId: 'request-1' } };

describe('error banner resend', () => {
  it('preserves admitted history, native anchors and partially completed work', () => {
    const messages: Message[] = [user, { id: 'a', role: 'assistant', content: 'work already performed', timestamp: new Date(0), sdkUuid: 'native-a' }];
    const before = structuredClone(messages);
    const resend = projectErrorMessageResend(user, messages);
    expect(resend).toMatchObject({ text: 'try again', retryFailedMessageId: undefined });
    expect(messages).toEqual(before);
  });

  it.each([true, false])('resends only visible Goal input with query draft=%s', withDraft => {
    const message: Message = { ...user, content: buildGoalContextReminder({ ...goal, visibleUserMessage: 'continue' }),
      ...(withDraft ? { desktopQuery: { visibleText: 'continue', primaryContext: { kind: 'goal', firstTurn: false, input: { ...goal, visibleUserMessage: 'continue' } } } } : {}) };
    expect(projectErrorMessageResend(message, [message])?.text).toBe('continue');
  });

  it('does not resend a hidden automatic Goal continuation as a user request', () => {
    const message = { ...user, content: buildGoalContinuationReminder(goal) };
    expect(projectErrorMessageResend(message, [message])).toBeNull();
  });

  it('replaces only local failed presentation and refuses a reconciled uncertain send', () => {
    const failed: Message = { ...user, deliveryStatus: 'failed', deliveryUnconfirmed: true };
    expect(projectErrorMessageResend(failed, [failed])?.retryFailedMessageId).toBe('u');
    expect(projectErrorMessageResend(failed, [failed, { ...user, id: 'canonical-u' }])).toBeNull();
    expect(projectErrorMessageResend(failed, [user])).toBeNull();
    expect(projectErrorMessageResend(failed, [])).toBeNull();
  });

  it('restores the original attachment reference and asynchronous question reply', () => {
    const message: Message = { ...user, asyncQuestionReply: { questionId: 'q', questionIndex: 0 },
      attachments: [{ id: 'img', name: 'proof.png', mimeType: 'image/png', size: 12, isImage: true, relativePath: 'myagents_files/proof.png' }] };
    const resend = projectErrorMessageResend(message, [message]);
    expect(resend?.images).toMatchObject([{ id: 'img', source: 'attachment_ref', relativePath: 'myagents_files/proof.png', sizeBytes: 12 }]);
    expect(resend?.asyncQuestionReply).toEqual(message.asyncQuestionReply);
  });
});
