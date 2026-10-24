import type { Message, ToolUseSimple } from '@/types/chat';
import { dshToolDisplayName } from '../../shared/toolDisplay/dshToolNames';
import { getProcessOutcome, processInput } from './processPresentation';

type Translate = (key: string, options?: Record<string, unknown>) => string;

function label(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/[\r\n\t]+/g, ' ').trim();
  return text ? text.slice(0, 180) : undefined;
}

function target(tool: ToolUseSimple): string | undefined {
  const input = processInput(tool);
  const path = label(input.file_path ?? input.path ?? input.notebook_path);
  return path?.replaceAll('\\', '/').split('/').filter(Boolean).at(-1);
}

/** Only the live streaming message is evidence of current work. Never scan
 * reopened history, parse private reasoning, or turn output text into status. */
export function currentActivity(message: Message | null, t: Translate): string {
  const prefix = 'shell.messageList.activity.';
  if (!message) return t(`${prefix}waitingModel`);
  if (typeof message.content === 'string') return t(`${prefix}${message.streamingTextActive ? 'answering' : 'waitingModel'}`);
  const active = message.content.filter(block =>
    (block.type === 'tool_use' || block.type === 'server_tool_use')
    && block.tool && getProcessOutcome(block, true) === 'running',
  );
  if (message.streamingTextActive && !active.some(block => block.tool?.isLoading)) {
    return t(`${prefix}answering`);
  }
  // Prefer a currently executing parent tool; a background child alone does not
  // prove that the parent is waiting for it rather than answering the user.
  const block = active.findLast(block => block.tool?.isLoading) ?? active.at(-1);
  if (block?.tool) {
    const tool = block.tool;
    const name = dshToolDisplayName(tool.name);
    const input = processInput(tool);
    const description = label(input.description);
    let text: string;
    if ((name === 'CollabAgent' && input.tool === 'wait')
      || ['TaskOutput', 'BashOutput', 'wait', 'wait_agent', 'wait_threads'].includes(name)
      || name.endsWith('__wait_threads')) {
      text = t(`${prefix}waitingTask`, { target: description ?? name });
    } else if (['Task', 'Agent', 'CollabAgent'].includes(name)) {
      text = t(`${prefix}delegating`, { target: description ?? label(input.name) ?? name });
    } else if (['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(name)) {
      const file = target(tool);
      text = file ? t(`${prefix}${name === 'Read' ? 'reading' : 'updating'}`, { target: file })
        : t(`process.work.${name === 'Read' ? 'explore' : 'change'}`);
    } else if (['Grep', 'Glob', 'WebSearch'].includes(name)) {
      const query = label(input.pattern ?? input.query);
      text = query ? t(`${prefix}searching`, { target: query }) : t('process.work.explore');
    } else if (['Bash', 'bash', 'pwsh', 'PowerShell'].includes(name)) {
      // Shell commands can contain credentials. Prefer the public description;
      // raw commands remain available in the existing expandable tool record.
      text = description ? t(`${prefix}executing`, { target: description }) : t(`${prefix}command`);
    } else {
      text = t(`${prefix}executing`, { target: description ?? name });
    }
    return active.length > 1 ? t(`${prefix}parallel`, { action: text, count: active.length }) : text;
  }
  if (message.streamingTextActive) return t(`${prefix}answering`);
  const last = message.content.at(-1);
  if (last?.type === 'thinking' && !last.isComplete && !last.isStopped && !last.isFailed) {
    return t('process.work.think');
  }
  return t(`${prefix}waitingModel`);
}
