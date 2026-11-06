import { expect, it } from 'vitest';
import { preDispatchFailureMessage } from './dispatch-failure-message';

it.each(['TOOL_OUTCOME_UNKNOWN', 'WAITING_FOR_USER', 'BACKGROUND_WORK_ACTIVE', 'EXECUTION_PREVIOUS_TURN_UNSETTLED', 'EXECUTION_ALREADY_COMPLETED'])
  ('explains a known pre-dispatch rejection: %s', error => {
    const message = preDispatchFailureMessage({ accepted: false, error });
    expect(message).toMatch(/^本次消息未执行：/);
    expect(message).not.toContain(error);
    expect(message).not.toContain('会话状态已变化');
  });
it('does not disclose arbitrary raw error content', () => {
  expect(preDispatchFailureMessage({ accepted: false, error: 'private path or token' })).not.toContain('private');
});
