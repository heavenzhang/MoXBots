import type { PendingOperation } from './native';

export type MobileMode = 'loading' | 'supported' | 'legacy' | 'error' | 'unavailable';
export type AttachmentReadiness = { state: 'ready' | 'uploading' | 'paused' | 'cancelled' | 'error'; assetId: string | null };
export type MutationAttempt = Pick<PendingOperation, 'protocol' | 'targetId' | 'agentId' | 'operationId' | 'sessionId'>;

export function blocksMutationForScope(pending: readonly PendingOperation[], targetId: string | null, sessionId: string | null): boolean {
  return pending.some((item) => item.targetId === targetId && item.sessionId === sessionId);
}

export function provisionalMutation(attempt: MutationAttempt): PendingOperation {
  return { ...attempt, status: 'unknown' };
}

export function reconcileFailedMutation(current: readonly PendingOperation[], attempt: MutationAttempt, journal: readonly PendingOperation[] | null): PendingOperation[] {
  const provisional = provisionalMutation(attempt);
  const sameAttempt = (item: PendingOperation) => item.operationId === attempt.operationId;
  if (journal === null) return current.some(sameAttempt) ? [...current] : [...current, provisional];
  const exact = journal.find((item) => item.operationId === attempt.operationId && item.protocol === attempt.protocol
    && item.targetId === attempt.targetId && item.agentId === attempt.agentId && item.sessionId === attempt.sessionId);
  if (exact) return current.some(sameAttempt) ? current.map((item) => sameAttempt(item) ? exact : item) : [...current, exact];
  if (journal.some(sameAttempt)) return current.some(sameAttempt) ? [...current] : [...current, provisional];
  return current.filter((item) => !sameAttempt(item));
}

const legacyUnsupportedCodes = new Set(['MOBILE_PROFILE_MISMATCH', 'MOBILE_INTENT_UNSUPPORTED', 'METHOD_UNSUPPORTED']);
export function permitsLegacyTextFallback(code: string): boolean {
  return legacyUnsupportedCodes.has(code);
}

export function sendProtocol(mode: MobileMode, text: string, modelId: string | null, attachments: readonly AttachmentReadiness[]): 'mobile' | 'legacy' | 'blocked' {
  if (!text.trim() && attachments.length === 0) return 'blocked';
  if (mode === 'supported') return attachments.every((item) => item.state === 'ready' && !!item.assetId) ? 'mobile' : 'blocked';
  if (mode === 'legacy') return attachments.length === 0 && modelId === null && text.length <= 8000 ? 'legacy' : 'blocked';
  return 'blocked';
}

export function receiptProtocol(operation: Pick<PendingOperation, 'protocol' | 'targetId' | 'agentId' | 'operationId'>):
  | { kind: 'session'; targetId: string; request: { kind: 'receipt'; agentId: string; operationId: string } }
  | { kind: 'mobile'; targetId: string; request: { version: 1; kind: 'mobile.receipt'; agentId: string; operationId: string } } {
  return operation.protocol === 'mobile'
    ? { kind: 'mobile', targetId: operation.targetId, request: { version: 1, kind: 'mobile.receipt', agentId: operation.agentId, operationId: operation.operationId } }
    : { kind: 'session', targetId: operation.targetId, request: { kind: 'receipt', agentId: operation.agentId, operationId: operation.operationId } };
}

/** Native speech failures concern this phone, never the remote Host connection. */
export function speechFailureMessage(code: string): string | null {
  if (!code.startsWith('MOBILE_SPEECH_')) return null;
  if (code === 'MOBILE_SPEECH_RECOGNITION_FAILED' || code.startsWith('MOBILE_SPEECH_RECOGNITION_FAILED_')) return '本机语音识别失败，可以重新录制；文字草稿已保留。';
  if (code === 'MOBILE_SPEECH_AUDIO_INPUT_UNAVAILABLE') return '当前没有可用的麦克风输入，请检查设备后重试；文字草稿已保留。';
  if (code === 'MOBILE_SPEECH_SERVICE_UNAVAILABLE') return '本机语音服务暂不可用，请稍后重试；文字草稿已保留。';
  return '本机语音输入暂时不可用，可以重新录制或继续使用键盘；文字草稿已保留。';
}
