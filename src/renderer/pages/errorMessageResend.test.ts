import { describe, expect, it } from 'vitest';
import { buildGoalContextReminder, buildGoalContinuationReminder } from '../../shared/systemReminder';
import type { Message } from '../types/chat';
import { projectErrorMessageResend, projectErrorRecovery } from './errorMessageResend';

const goal = { objective: 'test goal', goalId: 'goal-test', goalStatus: 'active', turnNumber: 2 };
const user: Message = { id: 'u', role: 'user', content: 'try again', timestamp: new Date(0),
  sdkUuid: 'native-u', metadata: { source: 'desktop', clientRequestId: 'request-1' } };

describe('error banner resend', () => {
  it('continues admitted work from the exact turn without replaying its original instruction', () => {
    const messages: Message[] = [user, { id: 'a', role: 'assistant', content: 'work already performed', timestamp: new Date(0), sdkUuid: 'native-a' }];
    const before = structuredClone(messages);
    const resend = projectErrorMessageResend(user, messages);
    expect(resend).toBeNull();
    expect(projectErrorRecovery(messages, user.id, { turnId: 'turn1', rootUserMessageId: user.id, status: 'error' }))
      .toEqual({ kind: 'continue', turnId: 'turn1' });
    expect(messages).toEqual(before);
  });

  it.each([true, false])('resends only visible Goal input with query draft=%s', withDraft => {
    const message: Message = { ...user, deliveryStatus: 'failed', content: buildGoalContextReminder({ ...goal, visibleUserMessage: 'continue' }),
      ...(withDraft ? { desktopQuery: { visibleText: 'continue', primaryContext: { kind: 'goal', firstTurn: false, input: { ...goal, visibleUserMessage: 'continue' } } } } : {}) };
    expect(projectErrorMessageResend(message, [message])?.text).toBe('continue');
  });

  it('does not resend a hidden automatic Goal continuation as a user request', () => {
    const message = { ...user, deliveryStatus: 'failed' as const, content: buildGoalContinuationReminder(goal) };
    expect(projectErrorMessageResend(message, [message])).toBeNull();
  });

  it('replaces only local failed presentation and refuses a reconciled uncertain send', () => {
    const failed: Message = { ...user, deliveryStatus: 'failed' };
    expect(projectErrorMessageResend(failed, [failed])?.retryFailedMessageId).toBe('u');
    expect(projectErrorMessageResend(failed, [failed, { ...user, id: 'canonical-u' }])).toBeNull();
    expect(projectErrorMessageResend(failed, [user])).toBeNull();
    expect(projectErrorMessageResend(failed, [])).toBeNull();
  });

  it('restores the original attachment reference and asynchronous question reply', () => {
    const message: Message = { ...user, deliveryStatus: 'failed', asyncQuestionReply: { questionId: 'q', questionIndex: 0 },
      attachments: [{ id: 'img', name: 'proof.png', mimeType: 'image/png', size: 12, isImage: true, relativePath: 'myagents_files/proof.png' }] };
    const resend = projectErrorMessageResend(message, [message]);
    expect(resend?.images).toMatchObject([{ id: 'img', source: 'attachment_ref', relativePath: 'myagents_files/proof.png', sizeBytes: 12 }]);
    expect(resend?.asyncQuestionReply).toEqual(message.asyncQuestionReply);
  });

  it('only resends a definitive local failure, and only inspects an uncertain delivery', () => {
    const failed: Message = { ...user, deliveryStatus: 'failed' };
    expect(projectErrorRecovery([failed], user.id)).toEqual({ kind: 'resend', message: failed });
    const uncertain = { ...failed, deliveryUnconfirmed: true };
    expect(projectErrorMessageResend(uncertain, [uncertain])).toBeNull();
    expect(projectErrorRecovery([uncertain], user.id)).toEqual({ kind: 'inspect' });
    expect(projectErrorRecovery([{ ...user, deliveryStatus: 'sending' }], user.id)).toBeNull();
  });

  it('does not turn missing checkpoints, completed work or delayed errors into task replays', () => {
    expect(projectErrorRecovery([user], user.id)).toEqual({ kind: 'inspect' });
    const continuation = { turnId: 'turn1', rootUserMessageId: user.id, status: 'error' as const };
    expect(projectErrorRecovery([user, { ...user, id: 'newer' }], user.id, continuation)).toEqual({ kind: 'inspect' });
    const completed: Message = { id: 'a', role: 'assistant', timestamp: new Date(0), content: 'done', turnId: 'turn1', transcriptState: 'complete' };
    expect(projectErrorRecovery([user, completed], user.id, continuation)).toEqual({ kind: 'inspect' });
  });
});
