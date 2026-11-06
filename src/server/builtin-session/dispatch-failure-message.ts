import type { DispatchGuardResult } from '../session-core/turn-queue';

/** Only the owner that knows the input was not dispatched may use this notice. */
export function preDispatchFailureMessage(result: DispatchGuardResult): string {
  const reasons: Record<string, string> = {
    TOOL_OUTCOME_UNKNOWN: '先前工具的结果尚未确认，任务已暂停。请展开执行详情核查原操作结果；重复发送不会解除暂停。',
    WAITING_FOR_USER: '已有待确认事项，请先处理会话中的提问或审批。',
    BACKGROUND_WORK_ACTIVE: '后台工作尚未结束，请在任务详情查看其进度。',
    EXECUTION_PREVIOUS_TURN_UNSETTLED: '上一轮还未完成结果核对，请查看任务进度。',
    EXECUTION_REQUIRES_REVIEW: '任务仍有未核实的暂停原因，请查看执行详情。',
    EXECUTION_DISPATCH_OUTCOME_UNKNOWN: '上一轮是否开始执行尚未确认，请先核查原操作结果。',
    EXECUTION_TURN_OUTCOME_UNKNOWN: '上一轮的结束结果尚未确认。请在执行详情核查该轮记录；确认前不会重新执行原操作。',
    EXECUTION_INPUT_REVOKED: '这条输入已被停止操作或后续输入取消。请核对最新消息；如仍需执行，可重新提出要求。',
    EXECUTION_CONTINUATION_REVOKED: '本次接续已被停止操作或后续输入取消。请核对最新任务状态，再决定是否继续。',
    EXECUTION_CONTINUATION_CHANGED: '当前任务已发生变化，本次接续未执行。请核对最新任务后再提出要求。',
    dispatch_unconfirmed: '这条消息是否已开始执行尚未确认。请核查会话进度和原操作记录，避免重复执行。',
    continuation_admission_busy: '上一条接续请求仍在处理，请等待其结果后再继续。',
    continuation_not_admitted: '接续请求未能进入执行。请核对当前任务状态后重新提出要求。',
    continuation_cancelled_before_dispatch: '本次接续已在执行前取消。请核对最新消息；如仍需执行，可重新提出要求。',
    admission_cancelled: '本次任务请求已在执行前取消。请核对最新消息；如仍需执行，可重新提出要求。',
    EXECUTION_ALREADY_COMPLETED: '原任务已完成，请查看已有成果。',
  };
  const reason = result.error && reasons[result.error];
  return `本次消息未执行：${reason ?? (result.code === 'turn_conflict'
    ? '上一轮仍占用会话，请等待其结束后再继续。'
    : '会话状态已变化，请查看当前任务详情后再继续。')}`;
}
