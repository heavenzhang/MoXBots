import type { DispatchGuardResult } from '../session-core/turn-queue';

/** Only the owner that knows the input was not dispatched may use this notice. */
export function preDispatchFailureMessage(result: DispatchGuardResult): string {
  const reasons: Record<string, string> = {
    TOOL_OUTCOME_UNKNOWN: '先前工具的结果尚未确认，任务已暂停。请展开执行详情核查原操作结果；重复发送不会解除暂停。',
    WAITING_FOR_USER: '已有待确认事项，请先处理会话中的提问或审批。',
    BACKGROUND_WORK_ACTIVE: '后台工作尚未结束，请在任务详情查看其进度。',
    EXECUTION_PREVIOUS_TURN_UNSETTLED: '上一轮还未完成结果核对，请查看任务进度。',
    EXECUTION_ALREADY_COMPLETED: '原任务已完成，请查看已有成果。',
  };
  const reason = result.error && reasons[result.error];
  return `本次消息未执行：${reason ?? (result.code === 'turn_conflict'
    ? '上一轮仍占用会话，请等待其结束后再继续。'
    : '会话状态已变化，请查看当前任务详情后再继续。')}`;
}
