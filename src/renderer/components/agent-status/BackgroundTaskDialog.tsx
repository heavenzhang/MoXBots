import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRightIcon, CloseIcon, RefreshIcon } from '@/components/icons';
import OverlayBackdrop from '@/components/OverlayBackdrop';
import { useTabStateOptional } from '@/context/TabContext';
import { useCloseLayer } from '@/hooks/useCloseLayer';
import { isImeComposingEvent } from '@/utils/imeKeyboard';
import { BACKGROUND_TASK_STATUS_EVENT, getBackgroundTaskStatus, isTerminalStatus } from '@/utils/backgroundTaskStatus';
import type { Message, ToolUseSimple } from '@/types/chat';
import type { BackgroundTaskContinuationIdentity, BackgroundTaskDetail } from '../../../shared/types/background-task';
import type { SubagentStatus } from './types';
import { useElapsedSeconds } from './useElapsedSeconds';

export function findTaskTool(messages: Message[], toolId: string): ToolUseSimple | undefined {
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block.type === 'tool_use' && block.tool?.id === toolId) return block.tool;
    }
  }
}

type TaskResponse = { success: boolean; task?: BackgroundTaskDetail; errorCode?: string };

export default function BackgroundTaskDialog({
  subagent, sessionId, messages, onClose, onJumpToTool,
}: {
  subagent: SubagentStatus;
  sessionId: string | null;
  messages: Message[];
  onClose: () => void;
  onJumpToTool: (toolId: string) => void;
}) {
  const { t, i18n } = useTranslation('app');
  const tab = useTabStateOptional();
  const apiGetRef = useRef(tab?.apiGet);
  const apiPostRef = useRef(tab?.apiPost);
  useLayoutEffect(() => {
    apiGetRef.current = tab?.apiGet;
    apiPostRef.current = tab?.apiPost;
  }, [tab?.apiGet, tab?.apiPost]);
  const sessionScope = JSON.stringify([sessionId, subagent.id]);
  const [detailSnapshot, setDetail] = useState<{ scope: string; task: BackgroundTaskDetail } | null>(null);
  const detail = detailSnapshot?.scope === sessionScope ? detailSnapshot.task : null;
  const [error, setError] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(subagent.mode === 'background');
  const [refresh, setRefresh] = useState(0);
  const [terminalStatus, setTerminalStatus] = useState<BackgroundTaskDetail['status'] | null>(null);
  const [acknowledgement, setAcknowledgement] = useState<{ key: string; phase: 'sending' | 'rejected' | 'failed' } | null>(null);
  const identity = detail?.continuation?.identity;
  const identityKey = JSON.stringify([sessionScope, identity]);
  const identityKeyRef = useRef(identityKey);
  useLayoutEffect(() => { identityKeyRef.current = identityKey; }, [identityKey]);
  const acknowledgementPhase = acknowledgement?.key === identityKey ? acknowledgement.phase : 'idle';
  const continuationAllowed = detail?.continuation?.acknowledged === true;
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const logTitleId = useId();
  const tool = findTaskTool(messages, subagent.id);
  const status = terminalStatus ?? (unavailable || error ? 'unknown' : detail?.status ?? (subagent.status === 'interrupted' ? 'stopped' : subagent.status));
  const elapsed = useElapsedSeconds(detail?.startedAt ?? subagent.startedAt, detail?.finishedAt ?? subagent.finishedAt);
  useCloseLayer(() => { onClose(); return true; }, 240);

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);

  useEffect(() => {
    const update = (readAgain = false) => {
      const status = getBackgroundTaskStatus(subagent.id, sessionId);
      if (!isTerminalStatus(status)) {
        setTerminalStatus(null);
        if (readAgain) setRefresh(value => value + 1);
        return;
      }
      setTerminalStatus(status === 'error' ? 'failed' : status);
      // One final read captures the last output. If the Query has retired,
      // its terminal event still owns status and the last readable log stays.
      setRefresh(value => value + 1);
    };
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId?: string | null; toolUseId?: string }>).detail;
      if ((detail?.sessionId ?? null) !== sessionId || detail?.toolUseId !== subagent.id) return;
      update(true);
    };
    update();
    window.addEventListener(BACKGROUND_TASK_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(BACKGROUND_TASK_STATUS_EVENT, onStatus);
  }, [sessionId, subagent.id]);

  useEffect(() => {
    if (subagent.mode !== 'background') return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      setLoading(true);
      try {
        const apiGet = apiGetRef.current;
        if (!apiGet) throw new Error('No session API');
        const response = await apiGet<TaskResponse>(`/api/session/background-task?toolUseId=${encodeURIComponent(subagent.id)}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!response.success || !response.task) {
          if (['BACKGROUND_TASK_UNSUPPORTED', 'BACKGROUND_TASK_NOT_FOUND', 'unsupported', 'task_not_found'].includes(response.errorCode ?? '')) {
            setUnavailable(true);
            setError(false);
            return;
          }
          throw new Error('Task read failed');
        }
        setDetail({ scope: sessionScope, task: response.task });
        setError(false);
        setUnavailable(false);
        if (response.task.status === 'running') timer = setTimeout(() => { void load(); }, 2000);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [sessionId, subagent.id, subagent.mode, refresh, sessionScope]);

  const command = detail?.command ?? (tool?.parsedInput && 'command' in tool.parsedInput && typeof tool.parsedInput.command === 'string' ? tool.parsedInput.command : undefined);
  const transcript = subagent.mode === 'sync'
    ? (tool?.subagentCalls ?? []).map(call => `${call.name}\n${call.result ?? ''}`).join('\n\n') || tool?.result || ''
    : '';
  const output = detail?.output ?? transcript;
  const outputState = detail?.outputState ?? (unavailable ? 'unavailable' : 'empty');
  const buttonClass = 'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm text-[var(--ink-secondary)] hover:bg-[var(--paper-inset)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50';
  // Only the runtime detail owner can offer a confirmation capability. Never
  // infer eligibility or identity from a cached Agent row/description.
  const isRunningShell = status === 'running' && !error && !unavailable
    && subagent.mode === 'background' && identity !== undefined;
  const acknowledgeContinuation = async () => {
    const post = apiPostRef.current;
    if (!post || !identity || acknowledgementPhase === 'sending') return;
    const key = identityKey;
    const observed = { ...identity };
    const allow = !continuationAllowed;
    setAcknowledgement({ key, phase: 'sending' });
    try {
      const result = await post<{
        allow: boolean;
        acknowledged: BackgroundTaskContinuationIdentity[];
        rejected: { taskId: string; reason: string }[];
      }>('/api/session/background-work/acknowledge', { tasks: [observed], allow });
      if (identityKeyRef.current !== key) return;
      const applied = result.allow === allow && result.acknowledged.some(task =>
        task.taskId === observed.taskId && task.runId === observed.runId && task.queryId === observed.queryId);
      if (!applied || result.rejected.some(task => task.taskId === observed.taskId)) {
        setAcknowledgement({ key, phase: 'rejected' });
        return;
      }
      setDetail(previous => previous?.scope === sessionScope
        && JSON.stringify(previous.task.continuation?.identity) === JSON.stringify(observed)
        ? { ...previous, task: { ...previous.task, continuation: { identity: observed, acknowledged: allow } } }
        : previous);
      setAcknowledgement(null);
    } catch {
      if (identityKeyRef.current === key) setAcknowledgement({ key, phase: 'failed' });
    }
  };

  return (
    <OverlayBackdrop onClose={onClose} className="z-[240] p-3 sm:p-6" portal>
      <section
        ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="flex max-h-[min(760px,90dvh)] w-full min-w-0 max-w-3xl flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--paper-elevated)] text-[var(--ink)] shadow-xl"
        onKeyDown={event => {
          if (isImeComposingEvent(event.nativeEvent)) return;
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
          if (event.key !== 'Tab') return;
          const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]');
          if (!focusable?.length) return;
          const first = focusable[0], last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--line-subtle)] p-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold">{t('backgroundTask.title')}</h2>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--ink-secondary)] [overflow-wrap:anywhere]">{detail?.description || subagent.description || subagent.agentType}</p>
          </div>
          <button type="button" ref={closeRef} onClick={onClose} aria-label={t('backgroundTask.close')} className={buttonClass}><CloseIcon className="size-4" /></button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <span role="status" className={status === 'failed' ? 'font-medium text-[var(--error)]' : 'font-medium'}>{t('backgroundTask.statusLabel')}: {t(`backgroundTask.${status}`)}</span>
            <span className="text-[var(--ink-muted)]">{subagent.agentType}</span>
            {elapsed && status === 'running' && <span className="text-[var(--ink-muted)]">{t('backgroundTask.duration', { elapsed })}</span>}
            {detail?.taskId && <span className="break-all font-mono text-[var(--ink-muted)]">{t('backgroundTask.taskId')}: {detail.taskId}</span>}
          </div>
          {command && <div className="mt-4"><h3 className="mb-2 text-sm font-medium">{t('backgroundTask.command')}</h3><pre className="overflow-x-auto rounded-lg bg-[var(--paper-inset)] p-3 font-mono text-xs" tabIndex={0}>{command}</pre></div>}
          {detail?.summary && <p className="mt-3 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{detail.summary}</p>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <h3 id={logTitleId} className="text-sm font-medium">{t(subagent.mode === 'sync' ? 'backgroundTask.transcript' : 'backgroundTask.logs')}</h3>
            {subagent.mode === 'background' && <button type="button" className={buttonClass} disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshIcon className={`size-3.5 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} />{t(loading ? 'backgroundTask.refreshing' : 'backgroundTask.refresh')}</button>}
          </div>
          {error && <p role="alert" className="my-2 text-sm text-[var(--error)]">{t('backgroundTask.loadFailed')}</p>}
          {unavailable && detail && <p className="my-2 text-sm text-[var(--ink-muted)]">{t('backgroundTask.retained')}</p>}
          {loading && !detail && <p className="py-4 text-sm text-[var(--ink-muted)]">{t('backgroundTask.loading')}</p>}
          {output ? <pre role="region" aria-labelledby={logTitleId} tabIndex={0} className="mt-2 max-h-[45dvh] min-h-32 overflow-auto whitespace-pre rounded-lg border border-[var(--line-subtle)] bg-[var(--paper-inset)] p-3 font-mono text-xs leading-relaxed focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">{output}</pre>
            : !loading && !error && <p className="mt-2 rounded-lg bg-[var(--paper-inset)] p-4 text-sm text-[var(--ink-muted)]">{t(`backgroundTask.${outputState === 'ready' ? 'empty' : outputState}`)}</p>}
          {detail?.truncated && <p className="mt-2 text-xs text-[var(--ink-muted)]">{t('backgroundTask.truncated', { bytes: detail.totalBytes.toLocaleString(i18n.language) })}</p>}
          <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-[var(--ink-muted)]">
            {status === 'running' && !error && !unavailable && subagent.mode === 'background' && <span>{t('backgroundTask.autoRefresh')}</span>}
            {detail && <span>{t('backgroundTask.updated', { time: new Date(detail.updatedAt).toLocaleTimeString(i18n.language) })}</span>}
          </div>
          {!tool && <p className="mt-4 text-xs text-[var(--ink-muted)]">{t('backgroundTask.noMessage')}</p>}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--line-subtle)] p-3">
          <div className="min-w-0">
            <p className="text-xs text-[var(--ink-muted)]">{t('backgroundTask.readOnly')}</p>
            {isRunningShell && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={acknowledgementPhase === 'sending'}
                  onClick={() => { void acknowledgeContinuation(); }}
                >
                  {t(acknowledgementPhase === 'sending'
                    ? 'backgroundTask.acknowledging'
                    : continuationAllowed
                      ? 'backgroundTask.revokeContinuation'
                      : 'backgroundTask.allowContinuation')}
                </button>
                {!continuationAllowed && acknowledgementPhase === 'idle' && (
                  <span className="text-xs text-[var(--ink-muted)]">{t('backgroundTask.allowContinuationHint')}</span>
                )}
                {continuationAllowed && (
                  <span className="text-xs text-[var(--ink-muted)]">{t('backgroundTask.continuationAllowedHint')}</span>
                )}
                {(acknowledgementPhase === 'rejected' || acknowledgementPhase === 'failed') && (
                  <span role="alert" className="text-xs text-[var(--error)]">
                    {t(acknowledgementPhase === 'rejected'
                      ? 'backgroundTask.continuationRejected'
                      : 'backgroundTask.continuationFailed')}
                  </span>
                )}
              </div>
            )}
          </div>
          {tool && <button type="button" className={buttonClass} onClick={() => { onClose(); onJumpToTool(subagent.id); }}>{t('backgroundTask.locate')}<ChevronRightIcon className="size-3.5" /></button>}
        </footer>
      </section>
    </OverlayBackdrop>
  );
}
