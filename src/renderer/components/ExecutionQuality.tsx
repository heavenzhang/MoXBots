import { useTranslation } from 'react-i18next';
import { useNotifyRowLayoutChanged } from '@/context/ChatRowLayoutContext';
import type { Message } from '@/types/chat';
import { executionEvidence } from '@/utils/processResults';
import { formatDuration } from '@/utils/formatTokens';
import { readStreamRecoveryEvidence } from '../../shared/streamRecovery';

/** Observed evidence, not a subjective model score or business acceptance. */
export default function ExecutionQuality({ message, live = false }: { message: Message; live?: boolean }) {
  const { t } = useTranslation('chat');
  const notify = useNotifyRowLayoutChanged();
  const blocks = typeof message.content === 'string' ? [] : message.content;
  const recovery = readStreamRecoveryEvidence(message.streamRecovery);
  const hasExecutionEvidence = blocks.some(block => block.tool) || Boolean(message.usage);
  if (!hasExecutionEvidence && !recovery) return null;
  const evidence = executionEvidence(blocks, live);
  const usage = message.usage;
  const needsAttention = evidence.failed > 0 || evidence.stopped > 0 || evidence.unknown > 0
    || recovery?.status === 'stopped' || recovery?.status === 'blocked';
  // Only the server-observed interval is known, never a client-side stopwatch.
  const observedElapsed = recovery ? recovery.updatedAt - recovery.startedAt : undefined;
  return <details data-execution-quality className="mx-3 my-1 text-xs text-[var(--ink-muted)]"
    onToggle={() => notify('process-row-expand')}>
    <summary className="w-fit cursor-pointer rounded py-1 focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
      {t('process.quality.label')}
      {needsAttention && <> · {t('process.quality.attention')}</>}
      {recovery?.status === 'completed' && recovery.interruptions > 0 && <> · {t('process.quality.recovered')}</>}
    </summary>
    <dl className="mt-1 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 break-words pb-2 text-[var(--ink-secondary)] [&>dd]:min-w-0 [&>dd]:[overflow-wrap:anywhere] [&>dt]:[overflow-wrap:anywhere]">
      {hasExecutionEvidence && <>
        <dt>{t('process.quality.checks')}</dt><dd>{t('process.quality.checkCounts', { returned: evidence.checksReturned, failed: evidence.checksFailed })}</dd>
        <dt>{t('process.quality.execution')}</dt><dd>{t('process.quality.executionCounts', evidence)}</dd>
      </>}
      {usage && <><dt>Token</dt><dd>{t('process.quality.tokens', { input: usage.inputTokens, output: usage.outputTokens })}</dd></>}
      {usage?.model && <><dt>{t('process.quality.model')}</dt><dd>{usage.model}</dd></>}
      {recovery && <>
        <dt>{t('process.quality.recovery')}</dt><dd>{t('process.quality.recoveryCounts', { interruptions: recovery.interruptions, continuations: recovery.continuations })}</dd>
        <dt>{t('process.quality.recoveryStatus')}</dt><dd>{t(`process.quality.recoveryStatuses.${recovery.status}`)}</dd>
        <dt>{t('process.quality.protectedActions')}</dt><dd>{t('process.quality.protectedActionCount', { count: recovery.protectedActions })}</dd>
        {observedElapsed !== undefined && <><dt>{t('process.quality.observedElapsed')}</dt><dd>{formatDuration(observedElapsed)}</dd></>}
        {recovery.reason && <><dt>{t('process.quality.recoveryReason')}</dt><dd>{t(`process.quality.recoveryReasons.${recovery.reason}`)}</dd></>}
      </>}
      <dt>{t('process.quality.content')}</dt><dd>{t('process.quality.notAssessed')}</dd>
    </dl>
    <p className="max-w-prose pb-2">{t('process.quality.scope')}</p>
    {recovery && <p className="max-w-prose break-words pb-2">{t('process.quality.recoveryScope')}</p>}
  </details>;
}
