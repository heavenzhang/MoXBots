import type { SSEEvent } from './sse-parser';

/** Only a typed JSON message_stop proves Anthropic completion; headers/EOF/[DONE] do not. */
export function modelStreamEventType(event: SSEEvent): string | undefined {
  // Empty unnamed/ping frames carry no model output. Named model events still require JSON.
  if (!event.data.trim() && (!event.event || event.event === 'ping')) return undefined;
  let payload: unknown;
  try { payload = JSON.parse(event.data); }
  catch { throw new Error('Malformed model stream event'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || !('type' in payload) || typeof payload.type !== 'string' || !payload.type
    || (event.event && event.event !== payload.type)) throw new Error('Malformed model stream event');
  return payload.type;
}
