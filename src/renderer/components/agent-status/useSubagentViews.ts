import { useEffect, useMemo, useState } from 'react';
import { useTabStateOptional } from '@/context/TabContext';
import { BACKGROUND_TASK_STATUS_EVENT, getBackgroundTaskStatus } from '@/utils/backgroundTaskStatus';
import { collectSubagentViews } from './subagentViewModel';
import type { Message } from '@/types/chat';

const EMPTY: Message[] = [];

/** Session-scoped live status enriches the transcript; the transcript still owns identity. */
export function useSubagentViews() {
  const tab = useTabStateOptional();
  const messages = tab?.messages ?? EMPTY;
  const sessionId = tab?.sessionId ?? null;
  const liveMessageId = tab?.streamingMessage?.id ?? null;
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId?: string | null }>).detail;
      if ((detail?.sessionId ?? null) === sessionId) setEpoch(value => value + 1);
    };
    window.addEventListener(BACKGROUND_TASK_STATUS_EVENT, update);
    return () => window.removeEventListener(BACKGROUND_TASK_STATUS_EVENT, update);
  }, [sessionId]);
  const views = useMemo(() => {
    void epoch;
    return collectSubagentViews(messages, liveMessageId).map(view => {
      if (view.tool.subagentLifecycle) return view;
      const status = getBackgroundTaskStatus(view.id, sessionId, view.runId);
      switch (status) {
        case 'running': return view.status === 'unknown' || view.status === 'running' ? { ...view, status: 'running' as const } : view;
        case 'completed': return { ...view, status: 'completed' as const };
        case 'error': case 'failed': return { ...view, status: 'failed' as const };
        case 'stopped': return { ...view, status: 'interrupted' as const };
        default: return view;
      }
    });
  }, [messages, liveMessageId, sessionId, epoch]);
  return { views, tab };
}
