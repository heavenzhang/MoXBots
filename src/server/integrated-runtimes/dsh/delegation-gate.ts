import type { DshRpcObject } from './protocol-types';

export const DSH_DELEGATION_CONFIRMATION_HOOK_ID = 'myagents-session-delegation-confirmation-v1';

/** Canonical Agent policy covers native subagent and fork_agent entry points. */
const DELEGATION_TOOLS = new Set(['Agent', 'subagent', 'fork_agent']);

/** A declared hook is insufficient: native admission must prove it is executable. */
export function assertDshDelegationHookReady(result: DshRpcObject): void {
  if (!Array.isArray(result.components) || !result.components.some(raw => {
    const component = raw as DshRpcObject | null;
    return component?.key === `hook:${DSH_DELEGATION_CONFIRMATION_HOOK_ID}` && component.state === 'ready';
  })) throw new Error('DSH native delegation confirmation hook is not ready');
}

export function evaluateDshDelegationHook(input: {
  params: DshRpcObject;
  productSessionId: string;
  runtimeGeneration?: string;
  runtimeSessionId?: string;
  componentGenerationAccepted: boolean;
  canDelegateSubagents?: () => boolean;
}): DshRpcObject {
  const { params } = input;
  const authority = params.authority && typeof params.authority === 'object'
    ? params.authority as DshRpcObject : undefined;
  const deny = (code: string, message: string): DshRpcObject => ({ state: 'deny', code, message });
  const identified = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
  if (params.hookId !== DSH_DELEGATION_CONFIRMATION_HOOK_ID
    || params.event !== 'PreToolUse'
    || authority?.componentId !== DSH_DELEGATION_CONFIRMATION_HOOK_ID
    || !input.componentGenerationAccepted
    || authority.productSessionId !== input.productSessionId
    || !input.runtimeGeneration || authority.runtimeGeneration !== input.runtimeGeneration
    || !input.runtimeSessionId || authority.runtimeSessionId !== input.runtimeSessionId
    || !identified(authority.callId) || !identified(authority.turnId)
    || !identified(params.tool)
    || !['root', 'foreground_child', 'background_child'].includes(String(params.origin))
    || (params.origin !== 'root' && !identified(params.agentId))) {
    return deny('delegation_hook_authority_mismatch', 'Delegation policy request does not match the active Session and tool call.');
  }
  if (!DELEGATION_TOOLS.has(String(params.tool))) return { state: 'continue' };
  try {
    if (input.canDelegateSubagents?.() !== false) return { state: 'continue' };
  } catch {
    return deny('delegation_confirmation_unavailable', 'The confirmed Session plan could not be checked.');
  }
  return deny('session_plan_confirmation_required', '请先讨论并确认当前会话编排草案，再启动子 Agent。');
}
