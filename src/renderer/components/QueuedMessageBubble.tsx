import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ClockIcon, PlayIcon, CloseIcon, EditIcon } from '@/components/icons';
import Tip from '@/components/Tip';
import type { QueuedMessageInfo } from '@/types/queue';

type QueueAction = (queueId: string) => void | boolean | Promise<void | boolean>;

interface QueuedMessagesPanelProps {
  messages: QueuedMessageInfo[];
  onCancel?: QueueAction;
  onEdit?: QueueAction;
  onForceExecute?: QueueAction;
}

function QueuedMessageRow({ message, onCancel, onEdit, onForceExecute }: Omit<QueuedMessagesPanelProps, 'messages'> & { message: QueuedMessageInfo }) {
  const { t } = useTranslation('chat');
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const canCancel = message.canCancel !== false && !message.queueId.startsWith('opt-') && !accepted;
  const canForceExecute = message.canForceExecute !== false && !message.queueId.startsWith('opt-');
  const actionClass = 'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-sm text-[var(--ink-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-muted)] disabled:cursor-default disabled:opacity-50';

  const run = async (action: QueueAction) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setErrorKey(null);
    try {
      if (await action(message.queueId) === false) setErrorKey('actionFailed');
    } catch (error) {
      const failure = error as { errorCode?: string; status?: number } | null;
      if (failure?.errorCode === 'queue_already_accepted' || (!failure?.errorCode && failure?.status === 409)) {
        setAccepted(true);
        setErrorKey('alreadyAccepted');
      } else if (failure?.errorCode === 'queue_draft_not_empty') {
        setErrorKey('draftNotEmpty');
      } else if (failure?.errorCode === 'queue_cancel_unavailable') {
        setErrorKey('cancelUnavailable');
      } else {
        setErrorKey('actionFailed');
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return (
    <div className="min-w-0 space-y-2 p-3" aria-busy={pending}>
      <div className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-sm text-[var(--ink)] [overflow-wrap:anywhere]">
        {message.text}
      </div>
      {message.images && message.images.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {message.images.map((img) => (
            <div key={img.id} className="h-8 w-8 overflow-hidden rounded border border-[var(--line)]">
              <img src={img.preview} alt={img.name} className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      )}
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {canCancel && onEdit && (
          <button type="button" className={actionClass} disabled={pending} onClick={() => void run(onEdit)}>
            <EditIcon size={14} />{t('shell.queue.edit')}
          </button>
        )}
        {canForceExecute && onForceExecute && (
          <Tip label={t('shell.queue.sendNowHint')}>
            <button type="button" className={actionClass} disabled={pending} onClick={() => void run(onForceExecute)}>
              <PlayIcon size={14} />{t('shell.queue.sendNow')}
            </button>
          </Tip>
        )}
        {canCancel && onCancel && (
          <Tip label={message.isInFlight ? t('shell.queue.recallSend') : t('shell.queue.cancelQueued')} className="ml-auto">
            <button
              type="button"
              aria-label={message.isInFlight ? t('shell.queue.recallSend') : t('shell.queue.cancelQueued')}
              className={`${actionClass} w-8 px-0`}
              disabled={pending}
              onClick={() => void run(onCancel)}
            >
              <CloseIcon size={14} />
            </button>
          </Tip>
        )}
        {!canCancel && !canForceExecute && !errorKey && (
          <span className="text-xs text-[var(--ink-muted)]">{t('shell.queue.submitted')}</span>
        )}
      </div>
      {pending && <div role="status" className="text-xs text-[var(--ink-muted)]">{t('shell.queue.processing')}</div>}
      {errorKey && <div role="alert" className="text-xs leading-relaxed text-[var(--ink-muted)]">{t(`shell.queue.${errorKey}`)}</div>}
    </div>
  );
}

/** Queue owner confirms each action; the card never hides a rejected request. */
export default function QueuedMessagesPanel({ messages, ...actions }: QueuedMessagesPanelProps) {
  const { t } = useTranslation('chat');
  if (messages.length === 0) return null;

  return (
    <section
      aria-label={t('shell.queue.title', { count: messages.length })}
      className="pointer-events-auto w-[360px] max-w-full min-w-0 overflow-hidden rounded-xl border border-[var(--line)] shadow-sm backdrop-blur-sm"
      style={{ backgroundColor: 'color-mix(in srgb, var(--paper) 96%, transparent)' }}
    >
      <div className="flex items-center gap-1.5 border-b border-[var(--line)] px-3 py-2 text-xs text-[var(--ink-muted)]">
        <ClockIcon size={12} />
        <span>{t('shell.queue.title', { count: messages.length })}</span>
      </div>
      <div className="max-h-72 overflow-y-auto divide-y divide-[var(--line)]">
        {messages.map(message => <QueuedMessageRow key={message.queueId} message={message} {...actions} />)}
      </div>
    </section>
  );
}
