import { createHash, randomUUID } from 'crypto';
import { withLogContext } from './logger-context';

interface TitleTraceContext {
  sessionId?: string;
  utilitySessionId: string;
  runtime: string;
  runtimeSource?: string;
  providerId?: string;
  requestedModel: string;
}

function textSummary(text: string | null) {
  return {
    present: text !== null && text.length > 0,
    chars: text === null ? 0 : Array.from(text).length,
    hash: text === null ? null : createHash('sha256').update(text).digest('hex'),
  };
}

/** Low-frequency semantic evidence only; UnifiedLogger remains the sole writer.
 * Prompt, title, raw errors, credentials, URLs and workspace paths never enter
 * these records. A returned-title hash can be compared with the actual Store
 * title without retaining another plaintext copy of user content. */
export function createTitleGenerationTrace(context: TitleTraceContext) {
  const generationId = randomUUID();
  const startedAt = Date.now();
  let finished = false;
  const boundedId = (value: string | undefined) => value?.replace(/[^\p{L}\p{N}._:/@+ -]/gu, '?').slice(0, 160);
  const identity = {
    generationId,
    sessionId: boundedId(context.sessionId) ?? null,
    utilitySessionId: boundedId(context.utilitySessionId),
    runtime: boundedId(context.runtime),
    runtimeSource: boundedId(context.runtimeSource),
    providerId: boundedId(context.providerId),
    requestedModel: boundedId(context.requestedModel),
  };
  function emit(phase: 'request' | 'terminal' | 'result', detail: object) {
    if (finished) return;
    // Diagnostics must not change generation, cancellation or cleanup outcomes.
    try {
      withLogContext({ sessionId: identity.sessionId ?? '', requestId: generationId, runtime: identity.runtime }, () => {
        console.log('[title-generation]', JSON.stringify({
          ...identity, phase, at: new Date().toISOString(), elapsedMs: Date.now() - startedAt, ...detail,
        }));
      });
    } catch { /* logging is best effort, never an execution gate */ }
  }
  return {
    request(prompt: string) {
      emit('request', { prompt: textSummary(prompt) });
    },
    terminal(input: { success: boolean; text: string | null; reportedModels?: string[]; responseSessionId?: string }) {
      emit('terminal', {
        success: input.success,
        response: textSummary(input.text),
        reportedModels: input.reportedModels?.slice(0, 8).map(boundedId) ?? [],
        responseSessionId: boundedId(input.responseSessionId),
      });
    },
    result(title: string | null) {
      emit('result', { outcome: title ? 'generated' : 'not-generated', returnedTitle: textSummary(title) });
      finished = true; // late SDK/runtime events cannot certify a cancelled result
    },
  };
}
