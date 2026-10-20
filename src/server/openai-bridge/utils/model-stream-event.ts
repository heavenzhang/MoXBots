import type { SSEEvent } from './sse-parser';

/** Only a typed JSON message_stop proves Anthropic completion; headers/EOF/[DONE] do not. */
export function modelStreamEventType(event: SSEEvent): string | undefined {
  return parseModelStreamEvent(event)?.type;
}

/** Preserve the validated payload for semantic progress checks without parsing twice. */
export function parseModelStreamEvent(event: SSEEvent): (Record<string, unknown> & { type: string }) | undefined {
  // Empty unnamed/ping frames carry no model output. Named model events still require JSON.
  if (!event.data.trim() && (!event.event || event.event === 'ping')) return undefined;
  let payload: unknown;
  try { payload = JSON.parse(event.data); }
  catch { throw new Error('Malformed model stream event'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || !('type' in payload) || typeof payload.type !== 'string' || !payload.type
    || (event.event && event.event !== payload.type)) throw new Error('Malformed model stream event');
  return payload as Record<string, unknown> & { type: string };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function nonempty(value: unknown): boolean { return typeof value === 'string' && value.length > 0; }

function blockHasContent(value: unknown): boolean {
  const block = record(value);
  if (!block) return false;
  if (block.type === 'text') return nonempty(block.text);
  if (block.type === 'thinking') return nonempty(block.thinking);
  if (block.type === 'redacted_thinking') return nonempty(block.data);
  return (block.type === 'tool_use' || block.type === 'server_tool_use') && nonempty(block.id) && nonempty(block.name);
}

/** Empty/usage/status/boundary frames are transport liveness, not model progress. */
export function hasModelStreamProgress(payload: Record<string, unknown> & { type: string }): boolean {
  if (payload.type === 'message_stop') return true;
  if (payload.type === 'content_block_start') return blockHasContent(payload.content_block);
  if (payload.type === 'message_start') {
    const message = record(payload.message);
    return Array.isArray(message?.content) && message.content.some(blockHasContent);
  }
  if (payload.type !== 'content_block_delta') return false;
  const delta = record(payload.delta);
  return !!delta && ((delta.type === 'text_delta' && nonempty(delta.text))
    || (delta.type === 'thinking_delta' && nonempty(delta.thinking))
    || (delta.type === 'input_json_delta' && nonempty(delta.partial_json)));
}
