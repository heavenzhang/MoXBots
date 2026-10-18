import type { Message, ToolUseSimple } from '@/types/chat';
import { isSubagentContainerTool } from '@/components/tools/subagentActivity';
import { parseBackgroundTaskNotificationMessage, type BackgroundTaskNotificationRecord } from '@/utils/backgroundTaskStatus';
import { compareBackgroundTaskRuns } from '../../../shared/backgroundTaskRun';
import { getInputStringProp, resolveToolInputRecord } from '../../../shared/toolDisplay/filePatch';

export interface SubagentView {
  id: string;
  messageId: string;
  currentTurn: boolean;
  title: string;
  agentType: string;
  status: 'running' | 'completed' | 'failed' | 'interrupted' | 'unknown';
  requestedModel?: string;
  model?: string;
  prompt?: string;
  result?: string;
  startedAt?: number;
  finishedAt?: number;
  lastActivityAt?: number;
  tool: ToolUseSimple;
  parentAgentId?: string;
  agentId?: string;
  runId?: string;
}

/** Recover complete historical JSON before falling back to parsed/raw input. */
export function resolveSubagentInput(tool: ToolUseSimple): Record<string, unknown> {
  return resolveToolInputRecord(tool) ?? {};
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function resultRecord(result: string | undefined): Record<string, unknown> | undefined {
  if (!result) return undefined;
  try { return record(JSON.parse(result)); } catch { return undefined; }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function terminalStatus(status: unknown): SubagentView['status'] | undefined {
  if (status === 'completed') return 'completed';
  if (status === 'error' || status === 'failed') return 'failed';
  if (status === 'stopped' || status === 'killed' || status === 'interrupted' || status === 'aborted') return 'interrupted';
  return undefined;
}

function isLaunchReceipt(tool: ToolUseSimple, result: Record<string, unknown> | undefined): boolean {
  return result?.status === 'async_launched' || result?.status === 'pending'
    || (!terminalStatus(result?.status) && (!!result?.outputFile || !!result?.output_file))
    || /(?:async|background) agent launched|agent launched successfully/i.test(tool.result ?? '');
}

function isRejectedAttempt(result: string | undefined): boolean {
  // Some old persisted tools dropped isError. Match runtime error prefixes,
  // never arbitrary words inside a successful review report.
  return /^(?:Error:\s*)?(?:PreToolUse:(?:Agent|Task) hook error\b|Agent type[^\n]{0,160}(?:not found|does not exist)\b|Unknown agent type\b)/i.test(result?.trim() ?? '');
}

function reportText(tool: ToolUseSimple, result: Record<string, unknown> | undefined): string | undefined {
  if (tool.subagentLifecycle?.result !== undefined) return tool.subagentLifecycle.result;
  // A spawn/control receipt only acknowledges a request; it is never a child report.
  if (isLaunchReceipt(tool, result) || tool.name === 'CollabAgent') return undefined;
  if (Array.isArray(result?.content)) {
    return result.content.map(item => record(item))
      .filter(item => item?.type === 'text')
      .map(item => text(item?.text)).filter(Boolean).join('\n\n') || undefined;
  }
  if (result) return text(result.result) ?? text(result.output);
  return text(tool.result);
}

/**
 * Read-only transcript projection. Lifecycle facts outrank notification/result
 * fallbacks. Loading flags prove activity only on the explicitly live message;
 * cold history must never resurrect an unverified child as running.
 * currentMessageId identifies the actively executing assistant message, not the
 * whole current turn. currentTurn independently includes every assistant after
 * the last visible user request, even when no message is currently streaming.
 */
export function collectSubagentViews(messages: Message[], currentMessageId?: string | null): SubagentView[] {
  const notifications = new Map<string, BackgroundTaskNotificationRecord>();
  let lastUserIndex = -1;
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    const notification = parseBackgroundTaskNotificationMessage(message);
    if (notification) {
      if (!notification.toolUseId) continue;
      const previous = notifications.get(notification.toolUseId);
      if (!previous || compareBackgroundTaskRuns(notification.runId, previous.runId) >= 0) {
        notifications.set(notification.toolUseId, notification);
      }
    } else if (message.role === 'user') {
      lastUserIndex = index;
    }
  }

  const views = new Map<string, SubagentView>();
  function visit(tool: ToolUseSimple, message: Message, index: number, parentAgentId?: string): void {
    const input = resolveSubagentInput(tool);
    const action = getInputStringProp(input, 'tool');
    const isContainer = isSubagentContainerTool(tool.name)
      && (tool.name !== 'CollabAgent' || action === 'spawnAgent' || (!action && !!tool.subagentLifecycle));
    let childParentId = parentAgentId;
    if (isContainer) {
      const lifecycle = tool.subagentLifecycle;
      const result = resultRecord(tool.result);
      const candidate = notifications.get(tool.id);
      const receiptRunId = text(result?.runId);
      const notification = candidate && (!receiptRunId || compareBackgroundTaskRuns(candidate.runId, receiptRunId) >= 0)
        ? candidate : undefined;
      const report = reportText(tool, result) ?? (lifecycle ? undefined : text(notification?.summary));
      let status: SubagentView['status'] = lifecycle?.status
        ?? terminalStatus(notification?.status)
        ?? (tool.isStopped ? 'interrupted' : tool.isError || tool.isFailed || isRejectedAttempt(tool.result) ? 'failed' : undefined)
        // Codex spawn completion acknowledges creation, not child completion.
        ?? (tool.name === 'CollabAgent' ? undefined : terminalStatus(result?.status))
        ?? (tool.name === 'CollabAgent' || isLaunchReceipt(tool, result) ? undefined : terminalStatus(tool.resultMeta?.status))
        ?? 'unknown';
      if (status === 'unknown') {
        if (notification?.status === 'running') status = 'running';
        else if (tool.name !== 'CollabAgent' && report !== undefined && !isLaunchReceipt(tool, result)) status = 'completed';
        else if (message.id === currentMessageId && tool.isLoading && !tool.result) status = 'running';
      }
      const agentId = lifecycle?.agentId ?? text(result?.agentId);
      childParentId = agentId ?? tool.id;
      const prompt = text(getInputStringProp(input, 'prompt')) ?? text(result?.prompt);
      const agentType = lifecycle?.agentType ?? getInputStringProp(input, 'subagent_type')
        ?? (tool.name === 'CollabAgent' ? 'Codex' : 'general-purpose');
      views.set(tool.id, {
        id: tool.id,
        messageId: message.id,
        currentTurn: index > lastUserIndex,
        title: text(lifecycle?.description) ?? text(getInputStringProp(input, 'description')) ?? text(result?.description)
          ?? notification?.description ?? prompt?.split('\n')[0].slice(0, 120) ?? agentType,
        agentType,
        status,
        requestedModel: getInputStringProp(input, 'model'),
        // Request aliases and the main agent's usage do not prove a child's model.
        model: text(lifecycle?.model) ?? text(result?.resolvedModel),
        prompt,
        result: report,
        startedAt: lifecycle?.timingVerified === false ? undefined
          : lifecycle?.startedAt ?? tool.executionTiming?.startedAt ?? tool.taskStartTime,
        finishedAt: lifecycle?.timingVerified === false ? undefined
          : lifecycle?.finishedAt ?? (tool.name === 'CollabAgent' || isLaunchReceipt(tool, result) ? undefined : tool.executionTiming?.finishedAt),
        lastActivityAt: lifecycle?.lastActivityAt ?? tool.executionTiming?.lastActivityAt,
        parentAgentId: lifecycle?.tree?.parentAgentId ?? parentAgentId,
        agentId,
        runId: receiptRunId,
        tool,
      });
    }
    for (const call of tool.subagentCalls ?? []) {
      visit({ ...call, streamIndex: 0 }, message, index, childParentId);
    }
  }
  messages.forEach((message, index) => {
    if (message.role !== 'assistant' || typeof message.content === 'string') return;
    for (const block of message.content) {
      if (block.type === 'tool_use' && block.tool) visit(block.tool, message, index);
    }
  });
  return [...views.values()];
}
