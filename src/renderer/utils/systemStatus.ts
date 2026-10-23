import type { TFunction } from 'i18next';

/** One presentation for the transcript footer and the fixed composer. */
export function resolveSystemStatus(status: string, t: TFunction<'chat'>): string {
  if (status === 'compacting' || status === 'rewinding') {
    return t(`shell.messageList.systemStatus.${status}`);
  }
  if (status.startsWith('api_retry:')) {
    const [, attempt, max] = status.split(':');
    return t('shell.messageList.systemStatus.apiRetry', { attempt: attempt || '1', max: max || '?' });
  }
  if (status === 'model_recovery_paused') {
    return t('shell.messageList.systemStatus.modelRecoveryPaused');
  }
  if (status.startsWith('model_recovery:')) {
    const [, nextRetryAt, attempt] = status.split(':');
    const seconds = Math.max(0, Math.ceil((Number(nextRetryAt) - Date.now()) / 1000));
    return seconds > 0
      ? t('shell.messageList.systemStatus.modelRecoveryWaiting', { seconds, attempt: attempt || '1' })
      : t('shell.messageList.systemStatus.modelRecoveryConnecting', { attempt: attempt || '1' });
  }
  return status;
}
