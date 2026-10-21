import { streamFailureMessage, type StreamFailureDiagnostic } from '../stream-failure-diagnostic';
// Anthropic SSE event serializer

import type { AnthropicStreamEvent } from '../types/anthropic';
import type { SSEEvent } from './sse-parser';

export function formatSSE(event: AnthropicStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** Reframe complete upstream events; an incomplete tail must never reach the SDK. */
export function formatSSEFrame(event: SSEEvent): string {
  const name = event.event === undefined ? '' : `event: ${event.event}\n`;
  return name + event.data.split('\n').map(line => `data: ${line}\n`).join('') + '\n';
}

/** Cross-process safety classification; never include the upstream body/error. */
export function formatReplayBlockedStreamError(diagnostic?: StreamFailureDiagnostic): string {
  return formatSSE({ type: 'error', error: { type: 'api_error',
    message: 'automatic_replay_blocked: Model stream failed before verified completion. Check preserved progress before continuing.' + streamFailureMessage(diagnostic),
  } });
}
