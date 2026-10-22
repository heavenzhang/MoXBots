import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTabStateOptional } from '@/context/TabContext';
import { BACKGROUND_TASK_STATUS_EVENT } from '@/utils/backgroundTaskStatus';
import { collectTaskAttempts, emptyTaskLedger, mergeTaskObservations, projectSessionTasks,
  type SessionTaskLedger, type SessionTaskSnapshot } from '../../../shared/sessionTaskOrchestration';
import type { ProgressTodo } from '../../../shared/sessionWorkProgress';
import type { SessionPlanProposal } from '../../../shared/sessionPlanConfirmation';
import type { PlanUserAction } from './OrchestrationPlanCard';

type PlanLedger = SessionTaskLedger & { proposal?: SessionPlanProposal };
const EMPTY_PLAN: readonly ProgressTodo[] = [];
const SessionTaskContext = createContext<ReturnType<typeof useSessionTaskSnapshot> | null>(null);

/** One observer per Chat; transcript rows and Composer share its projection. */
export function SessionTaskOrchestrationProvider({ children }: { children: ReactNode }) {
  const tab = useTabStateOptional();
  const state = useSessionTaskSnapshot(tab?.agentPlanTodos ?? EMPTY_PLAN);
  return createElement(SessionTaskContext.Provider, { value: state }, children);
}

export const useSessionTaskOrchestrationContext = () => useContext(SessionTaskContext);

export function useSessionTaskOrchestration(fallbackPlan: readonly ProgressTodo[]) {
  const shared = useSessionTaskOrchestrationContext();
  // Standalone status bars still work; real Chat must not duplicate polling.
  const local = useSessionTaskSnapshot(fallbackPlan, shared === null);
  return shared ?? local;
}

/** Durable snapshot plus immediate event-driven transcript projection. */
function useSessionTaskSnapshot(fallbackPlan: readonly ProgressTodo[], enabled = true) {
  const tab = useTabStateOptional();
  const sessionId = tab?.sessionId ?? null;
  const apiGet = tab?.apiGet;
  const apiPost = tab?.apiPost;
  // Runtime hints only invalidate a previous capability; the server alone
  // grants support. Never infer it from a provider label or SSE ledger.
  const runtimeKey = JSON.stringify([tab?.sessionRuntimeSessionId, tab?.sessionRuntime, tab?.sessionRuntimeSource]);
  const currentRuntimeKey = useRef(runtimeKey);
  currentRuntimeKey.current = runtimeKey;
  const currentSession = useRef(sessionId);
  currentSession.current = sessionId;
  const scope = useRef({ sessionId, runtimeKey, epoch: 0 });
  if (scope.current.sessionId !== sessionId || scope.current.runtimeKey !== runtimeKey)
    scope.current = { sessionId, runtimeKey, epoch: scope.current.epoch + 1 };
  const [snapshot, setSnapshot] = useState<{ sessionId: string; ledger: PlanLedger;
    planSupport?: SessionTaskSnapshot['planSupport']; runtimeKey: string } | null>(null);
  const [failure, setFailure] = useState<{ sessionId: string; message: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const planSupport = snapshot?.sessionId === sessionId && snapshot.runtimeKey === runtimeKey
    && !tab?.isSessionLoading && failure?.sessionId !== sessionId ? snapshot.planSupport : undefined;
  const currentSupport = useRef(planSupport);
  currentSupport.current = planSupport;
  useEffect(() => {
    if (!enabled || !sessionId || !apiGet || tab?.isSessionLoading) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let busy = false;
    const adopt = (value: { sessionId?: string; ledger?: PlanLedger; planSupport?: SessionTaskSnapshot['planSupport'] }, fromSnapshot = false) => {
      if (disposed || currentRuntimeKey.current !== runtimeKey || value.sessionId !== sessionId || !value.ledger || !Number.isSafeInteger(value.ledger.revision)) return;
      const ledger = value.ledger;
      setSnapshot(prior => {
        const sameScope = prior?.sessionId === sessionId && prior.runtimeKey === runtimeKey;
        const support = fromSnapshot ? value.planSupport : sameScope ? prior.planSupport : undefined;
        const latestLedger = prior?.sessionId === sessionId && prior.ledger.revision > ledger.revision ? prior.ledger : ledger;
        return sameScope && JSON.stringify(prior.ledger) === JSON.stringify(latestLedger)
          && JSON.stringify(prior.planSupport) === JSON.stringify(support) ? prior
          : { sessionId, ledger: latestLedger, planSupport: support, runtimeKey };
      });
      if (fromSnapshot) setFailure(null);
    };
    const read = async () => {
      if (busy || disposed) return;
      clearTimeout(timer);
      busy = true;
      try {
        const result = await apiGet<SessionTaskSnapshot & { success?: boolean; error?: string }>(`/api/session/task-orchestration?sessionId=${encodeURIComponent(sessionId)}`);
        if (!result?.ledger || result.success === false) throw new Error(result?.error ?? 'TASK_SNAPSHOT_UNAVAILABLE');
        adopt(result, true);
      } catch (error) {
        if (!disposed) setFailure({ sessionId, message: error instanceof Error ? error.message : 'TASK_SNAPSHOT_UNAVAILABLE' });
      } finally {
        busy = false;
        if (!disposed) timer = setTimeout(() => { void read(); }, 2000);
      }
    };
    const event = (event: Event) => adopt((event as CustomEvent).detail ?? {});
    const background = (event: Event) => { if ((event as CustomEvent).detail?.sessionId === sessionId) void read(); };
    window.addEventListener('session-task-orchestration', event);
    window.addEventListener(BACKGROUND_TASK_STATUS_EVENT, background);
    void read();
    return () => { disposed = true; clearTimeout(timer); window.removeEventListener('session-task-orchestration', event); window.removeEventListener(BACKGROUND_TASK_STATUS_EVENT, background); };
  }, [enabled, sessionId, apiGet, tab?.isSessionLoading, runtimeKey, refresh]);
  const submitPlanAction = useCallback(async (kind: 'confirm' | 'request_revision', action: PlanUserAction & { feedback?: string }) => {
    if (!apiPost || !sessionId || action.sessionId !== sessionId || currentSession.current !== sessionId) throw new Error('PLAN_SESSION_CHANGED');
    if (currentSupport.current?.supported !== true) throw new Error('PLAN_RUNTIME_DELEGATION_UNAVAILABLE');
    const epoch = scope.current.epoch;
    const response = await apiPost<SessionTaskSnapshot & { success?: boolean; error?: string }>(
      '/api/session/task-orchestration/plan', { kind, ...action });
    if (currentSession.current !== sessionId || scope.current.epoch !== epoch) throw new Error('PLAN_SESSION_CHANGED');
    if (response?.success !== true || response.sessionId !== sessionId || !response.ledger || !Number.isSafeInteger(response.ledger.revision)) {
      throw new Error(response?.error ?? 'PLAN_SNAPSHOT_UNAVAILABLE');
    }
    // A transport acknowledgment cannot manufacture a confirmation receipt.
    const ledger = response.ledger;
    setSnapshot(prior => ({ sessionId, runtimeKey,
      ledger: prior?.sessionId === sessionId && prior.ledger.revision > ledger.revision ? prior.ledger : ledger,
      planSupport: response.planSupport }));
    setFailure(null);
  }, [apiPost, sessionId, runtimeKey]);
  const confirmPlan = useCallback((action: PlanUserAction) => submitPlanAction('confirm', action), [submitPlanAction]);
  const requestPlanRevision = useCallback((action: PlanUserAction & { feedback: string }) => submitPlanAction('request_revision', action), [submitPlanAction]);
  const tasks = useMemo(() => {
    if (!enabled) return [];
    const ledger = snapshot?.sessionId === sessionId ? snapshot.ledger : emptyTaskLedger();
    const current = mergeTaskObservations(ledger, collectTaskAttempts(tab?.messages ?? [], tab?.streamingMessage?.id),
      snapshot?.sessionId !== sessionId && fallbackPlan.length > 0 ? fallbackPlan : undefined);
    return projectSessionTasks(current, tab?.messages ?? []);
  }, [enabled, snapshot, sessionId, tab?.messages, tab?.streamingMessage?.id, fallbackPlan]);
  const proposal = snapshot?.sessionId === sessionId && snapshot.ledger.proposal?.sessionId === sessionId ? snapshot.ledger.proposal : undefined;
  // Publish only after this proposal has committed to the UI. Ingress must
  // bind a user's reply to the displayed revision, never the latest SSE head.
  useEffect(() => {
    const tabId = tab?.tabId;
    if (!enabled || !tabId || !sessionId) return;
    const target = planSupport?.supported === true && !tab?.isSessionLoading && proposal?.state === 'awaiting_confirmation'
      ? { proposalId: proposal.id, expectedRevision: proposal.revision } : null;
    const publish = (target: { proposalId: string; expectedRevision: number } | null) => {
      window.dispatchEvent(new CustomEvent('session-orchestration-visible-plan', { detail: { tabId, sessionId, target } }));
    };
    publish(target);
    return () => publish(null);
  }, [enabled, tab?.tabId, sessionId, tab?.isSessionLoading, planSupport?.supported, proposal?.id, proposal?.revision, proposal?.state]);
  const planStart = proposal && snapshot?.ledger.planStart?.proposalId === proposal.id && snapshot.ledger.planStart.revision === proposal.revision ? snapshot.ledger.planStart : undefined;
  const canRetryReview = tab?.sessionState === 'idle' && !tab.isLoading && !tab.queuedMessages?.length;
  return { sessionId, epoch: scope.current.epoch, canRetryReview, tasks, proposal, planSupport, planStart, confirmPlan, requestPlanRevision, stale: failure?.sessionId === sessionId, retry: () => setRefresh(v => v + 1) };
}
