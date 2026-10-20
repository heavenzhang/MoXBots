// ResponsesStreamTranslator: OpenAI Responses API SSE → Anthropic SSE events (state machine)

import type { AnthropicStreamEvent, AnthropicResponse } from '../types/anthropic';
import type { ResponsesOutputFunctionCall, ResponsesStreamEvent, ResponsesResponse } from '../types/openai-responses';
import { resolveResponsesStopReason, ResponsesApiError } from './response-responses';
import { generateMessageId } from '../utils/id';
import {
  emptyUsage,
  fromResponsesUsage,
  toAnthropicUsage,
  type UsageSnapshot,
  type UsageWarningLogger,
} from './usage';

interface FunctionCallBuffer {
  callId: string;
  name: string;
  args: string;
  argsFinal: boolean;
}

type DeferredSegment = { type: 'tool'; outputIndex: number }
  | { type: 'text' | 'thinking'; delta: string };

export class ResponsesStreamTranslator {
  private messageId: string;
  private requestModel: string;
  private contentIndex = 0;
  private activeBlockType: 'text' | 'thinking' | null = null;
  private hasEmittedStart = false;
  private hasFinished = false;
  private usage: UsageSnapshot = emptyUsage();
  private usageWarning: UsageWarningLogger | undefined;
  private functionCallBuffers = new Map<number, FunctionCallBuffer>();
  private hasActiveReasoning = false;
  private deferAfterToolCall = false;
  private deferredSegments: DeferredSegment[] = [];

  constructor(requestModel: string, usageWarning?: UsageWarningLogger) {
    this.messageId = generateMessageId();
    this.requestModel = requestModel;
    let warned = false;
    this.usageWarning = usageWarning
      ? (message) => {
          if (warned) return;
          warned = true;
          usageWarning(message);
        }
      : undefined;
  }

  /** Feed a Responses API SSE event, returns Anthropic SSE events to emit */
  feed(event: ResponsesStreamEvent): AnthropicStreamEvent[] {
    if (this.hasFinished) return [];
    const events: AnthropicStreamEvent[] = [];
    if (!this.hasEmittedStart) {
      this.hasEmittedStart = true;
      events.push(this.makeMessageStart());
    }

    switch (event.type) {
      case 'response.output_text.delta':
        this.handleTextDelta(event.delta, events);
        break;
      case 'response.output_text.done':
        if (!this.deferAfterToolCall) this.closeActiveBlock(events);
        break;
      case 'response.function_call_arguments.delta':
        this.handleFunctionCallDelta(event.output_index, event.delta, events);
        break;
      case 'response.function_call_arguments.done':
        this.setCompleteArguments(event.output_index, event.arguments, events);
        break;
      case 'response.output_item.added':
        if (event.item.type === 'function_call') this.addFunctionCall(event.output_index, event.item, events);
        break;
      case 'response.output_item.done':
        if (event.item.type === 'function_call') this.materializeFunctionCall(event.output_index, event.item, events);
        break;
      case 'response.reasoning_summary_text.delta':
        this.handleReasoningDelta(event.delta, events);
        break;
      case 'response.reasoning_summary_text.done':
        if (!this.deferAfterToolCall && this.hasActiveReasoning) {
          this.closeActiveBlock(events);
          this.hasActiveReasoning = false;
        }
        break;
      case 'response.completed':
      case 'response.failed':
      case 'response.incomplete':
        this.handleTerminal(event.response, events);
        break;
      case 'error':
        this.finishError(event.message, events);
        break;
      default:
        break;
    }
    return events;
  }

  private handleTextDelta(delta: string, events: AnthropicStreamEvent[]): void {
    if (this.deferAfterToolCall) {
      this.deferredSegments.push({ type: 'text', delta });
      return;
    }
    if (this.activeBlockType !== 'text') {
      this.closeActiveBlock(events);
      this.activeBlockType = 'text';
      events.push({ type: 'content_block_start', index: this.contentIndex, content_block: { type: 'text', text: '' } });
    }
    events.push({ type: 'content_block_delta', index: this.contentIndex, delta: { type: 'text_delta', text: delta } });
  }

  private handleReasoningDelta(delta: string, events: AnthropicStreamEvent[]): void {
    if (this.deferAfterToolCall) {
      this.deferredSegments.push({ type: 'thinking', delta });
      return;
    }
    if (this.activeBlockType !== 'thinking') {
      this.closeActiveBlock(events);
      this.activeBlockType = 'thinking';
      this.hasActiveReasoning = true;
      events.push({ type: 'content_block_start', index: this.contentIndex, content_block: { type: 'thinking', thinking: '', signature: '' } });
    }
    events.push({ type: 'content_block_delta', index: this.contentIndex, delta: { type: 'thinking_delta', thinking: delta } });
  }

  private addFunctionCall(outputIndex: number, item: ResponsesOutputFunctionCall, events: AnthropicStreamEvent[]): void {
    this.ensureToolSegment(outputIndex, events);
    const buffer = this.functionCallBuffers.get(outputIndex)!;
    this.mergeIdentity(buffer, item.call_id, item.name);
  }

  private ensureToolSegment(outputIndex: number, events: AnthropicStreamEvent[]): FunctionCallBuffer {
    let buffer = this.functionCallBuffers.get(outputIndex);
    if (buffer) return buffer;
    if (!this.deferAfterToolCall) {
      this.closeActiveBlock(events);
      this.hasActiveReasoning = false;
      this.deferAfterToolCall = true;
    }
    buffer = { callId: '', name: '', args: '', argsFinal: false };
    this.functionCallBuffers.set(outputIndex, buffer);
    this.deferredSegments.push({ type: 'tool', outputIndex });
    return buffer;
  }

  private handleFunctionCallDelta(outputIndex: number, delta: string, events: AnthropicStreamEvent[]): void {
    const buffer = this.ensureToolSegment(outputIndex, events);
    if (buffer.argsFinal) {
      // A repeated delta after the authoritative done event is contradictory.
      buffer.argsFinal = false;
      buffer.args = '\0';
      return;
    }
    buffer.args += delta;
  }

  private setCompleteArguments(outputIndex: number, args: string, events: AnthropicStreamEvent[]): void {
    const buffer = this.ensureToolSegment(outputIndex, events);
    this.mergeCompleteArguments(buffer, args);
  }

  private mergeCompleteArguments(buffer: FunctionCallBuffer, args: string): void {
    if (buffer.args === '\0' || (buffer.args && buffer.args !== args)) {
      buffer.args = '\0';
      return;
    }
    buffer.args = args;
    buffer.argsFinal = true;
  }

  private materializeFunctionCall(outputIndex: number, item: ResponsesOutputFunctionCall, events: AnthropicStreamEvent[] = []): void {
    const buffer = this.ensureToolSegment(outputIndex, events);
    this.mergeIdentity(buffer, item.call_id, item.name);
    this.mergeCompleteArguments(buffer, item.arguments);
  }

  private mergeIdentity(buffer: FunctionCallBuffer, callId: string, name: string): void {
    if (callId) {
      if (buffer.callId && buffer.callId !== callId) buffer.callId = '\0';
      else buffer.callId = callId;
    }
    if (name) {
      if (buffer.name && buffer.name !== name) buffer.name = '\0';
      else buffer.name = name;
    }
  }

  private mergeTerminalOutput(response: ResponsesResponse, events: AnthropicStreamEvent[]): void {
    (Array.isArray(response.output) ? response.output : []).forEach((item, outputIndex) => {
      if (item.type === 'function_call') this.materializeFunctionCall(outputIndex, item, events);
    });
  }

  private validateDeferredTools(): string | null {
    const callIdOwners = new Map<string, number>();
    for (const [outputIndex, buffer] of this.functionCallBuffers) {
      if (!buffer.callId || buffer.callId === '\0' || !buffer.name.trim() || buffer.name === '\0') return 'Invalid or incomplete Responses function call identity';
      const previousOwner = callIdOwners.get(buffer.callId);
      if (previousOwner !== undefined && previousOwner !== outputIndex) return 'Duplicate Responses function call identity';
      callIdOwners.set(buffer.callId, outputIndex);
      if (!buffer.argsFinal) return 'Responses function call arguments were not finalized';
      if (buffer.args === '\0') return 'Conflicting Responses function call arguments';
      const raw = buffer.args.trim() || '{}';
      try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Invalid Responses function call input object';
      } catch {
        return 'Incomplete or invalid Responses function call input JSON';
      }
    }
    return null;
  }

  private emitDeferredSegments(events: AnthropicStreamEvent[]): void {
    for (const segment of this.deferredSegments) {
      const index = this.contentIndex;
      if (segment.type === 'tool') {
        const call = this.functionCallBuffers.get(segment.outputIndex)!;
        const raw = call.args.trim() || '{}';
        events.push({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: call.callId, name: call.name, input: {} } });
        if (raw !== '{}') events.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: raw } });
      } else {
        events.push({ type: 'content_block_start', index, content_block: segment.type === 'text'
          ? { type: 'text', text: '' }
          : { type: 'thinking', thinking: '', signature: '' } });
        events.push({ type: 'content_block_delta', index, delta: segment.type === 'text'
          ? { type: 'text_delta', text: segment.delta }
          : { type: 'thinking_delta', thinking: segment.delta } });
      }
      events.push({ type: 'content_block_stop', index });
      this.contentIndex++;
    }
    this.deferredSegments = [];
  }

  private handleTerminal(response: ResponsesResponse, events: AnthropicStreamEvent[]): void {
    if (response.status === 'failed') {
      this.finishError(response.error?.message || 'Upstream Responses request failed', events);
      return;
    }
    if (response.status === 'completed') this.mergeTerminalOutput(response, events);
    if (this.functionCallBuffers.size > 0) {
      if (response.status !== 'completed') {
        this.finishError('Responses function call ended without a completed response', events);
        return;
      }
      const invalidTool = this.validateDeferredTools();
      if (invalidTool) {
        this.finishError(invalidTool, events);
        return;
      }
      this.emitDeferredSegments(events);
    }
    this.closeActiveBlock(events);
    this.hasFinished = true;
    if (response.usage) this.usage = fromResponsesUsage(response.usage, this.usageWarning);
    try {
      const stopReason = resolveResponsesStopReason(response, this.functionCallBuffers.size > 0);
      events.push({ type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: toAnthropicUsage(this.usage) });
      events.push({ type: 'message_stop' });
    } catch (err) {
      if (!(err instanceof ResponsesApiError)) throw err;
      events.push({ type: 'message_delta', delta: { stop_reason: null, stop_sequence: null }, usage: toAnthropicUsage(this.usage) });
      this.finishError(err.message, events);
    }
  }

  private finishError(message: string, events: AnthropicStreamEvent[]): void {
    this.closeActiveBlock(events);
    this.deferredSegments = [];
    this.hasFinished = true;
    events.push({ type: 'error', error: { type: 'api_error', message } });
  }

  /** EOF is not a Responses protocol terminal, even for an empty stream. */
  finalize(): AnthropicStreamEvent[] {
    if (this.hasFinished) return [];
    const events: AnthropicStreamEvent[] = [];
    this.finishError('Upstream Responses stream ended without a terminal event', events);
    return events;
  }

  private closeActiveBlock(events: AnthropicStreamEvent[]): void {
    if (this.activeBlockType !== null) {
      events.push({ type: 'content_block_stop', index: this.contentIndex });
      this.contentIndex++;
      this.activeBlockType = null;
    }
  }

  private makeMessageStart(): AnthropicStreamEvent {
    const message: AnthropicResponse = {
      id: this.messageId, type: 'message', role: 'assistant', content: [], model: this.requestModel,
      stop_reason: null, stop_sequence: null, usage: toAnthropicUsage(this.usage),
    };
    return { type: 'message_start', message };
  }
}
