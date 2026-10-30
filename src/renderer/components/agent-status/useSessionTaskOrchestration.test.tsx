import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyTaskLedger, type SessionTaskLedger } from '../../../shared/sessionTaskOrchestration';
import type { SessionExecutionRecoveryProjection } from '../../../shared/sessionTaskOrchestration';
import { useSessionTaskOrchestration } from './useSessionTaskOrchestration';
const tab = vi.hoisted(() => ({ tabId: 'tab-1', sessionId: 's1', isSessionLoading: false, isLoading: false, hasNativeWork: false, hasBackgroundWork: false, sessionState: 'idle', messages: [], streamingMessage: null, sessionRuntime: null as string | null, sessionRuntimeSessionId: 's1', sessionRuntimeSource: null, apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock('@/context/TabContext', () => ({ useTabStateOptional: () => tab }));
const plan: [] = [];
const supported = { supported: true, runtime: 'builtin' };
const ledger = (revision: number, accepted = false): SessionTaskLedger => ({ ...emptyTaskLedger(), revision,
  tasks: [{ id: 'work', title: 'Task from snapshot', blockedBy: [] }],
  reviews: accepted ? [{ taskId: 'work', attemptId: 'main', decision: 'accept', evidence: 'Verified' }] : [] });
const event = (value: SessionTaskLedger, sessionId = 's1') => window.dispatchEvent(new CustomEvent('session-task-orchestration', { detail: { sessionId, ledger: value } }));
beforeEach(() => { vi.clearAllMocks(); tab.sessionId = 's1'; tab.sessionRuntime = null; tab.isLoading = false; tab.hasNativeWork = false; tab.hasBackgroundWork = false; tab.sessionState = 'idle'; tab.isSessionLoading = false; tab.apiGet.mockResolvedValue({ success: true, planSupport: supported, sessionId: 's1', ledger: ledger(1) }); });
afterEach(() => vi.useRealTimers());
describe('Session task snapshot and event reconciliation', () => {
  it('settles historical main-plan activity on Stop without changing progress or acceptance', async () => {
    const saved = { ...emptyTaskLedger(), revision: 1, plan: [
      { key: 'work', content: 'Verify the change', activeForm: 'Verifying the change', status: 'in_progress' as const },
      { key: 'done', content: 'Change returned for review', activeForm: 'Change returned for review', status: 'completed' as const },
    ] };
    tab.isLoading = true; tab.sessionState = 'running';
    tab.apiGet.mockResolvedValue({ success: true, planSupport: supported, sessionId: 's1', ledger: saved });
    const { result, rerender } = renderHook(() => useSessionTaskOrchestration(plan));
    await waitFor(() => expect(result.current.tasks[0]?.phase).toBe('running'));
    tab.isLoading = false; tab.sessionState = 'idle'; rerender();
    expect(result.current.tasks.map(task => task.phase)).toEqual(['interrupted', 'awaiting_review']);
    expect(saved.plan[0].status).toBe('in_progress');
    tab.isSessionLoading = true; rerender();
    expect(result.current.tasks[0].phase).toBe('unknown');
    tab.isSessionLoading = false; tab.isLoading = true; tab.sessionState = 'running'; rerender();
    expect(result.current.tasks[0].phase).toBe('running');
  });

  it('updates the independent recovery projection when ledger revision is unchanged and ignores SSE recovery', async () => {
    const waiting: SessionExecutionRecoveryProjection = { turnId: 'queue-1', status: 'waiting', attempt: 1, lastStatus: 503, nextRetryAt: 100 };
    const paused: SessionExecutionRecoveryProjection = { ...waiting, status: 'paused', attempt: 2 };
    tab.apiGet.mockResolvedValue({ success: true, planSupport: supported, sessionId: 's1', ledger: ledger(1), executionRecovery: waiting });
    const { result } = renderHook(() => useSessionTaskOrchestration(plan));
    await waitFor(() => expect(result.current.executionRecovery).toEqual(waiting));
    act(() => window.dispatchEvent(new CustomEvent('session-task-orchestration', { detail: { sessionId: 's1', ledger: ledger(1), executionRecovery: paused } })));
    expect(result.current.executionRecovery).toEqual(waiting);
    tab.apiGet.mockResolvedValue({ success: true, planSupport: supported, sessionId: 's1', ledger: ledger(1), executionRecovery: paused });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.executionRecovery).toEqual(paused));
  });

  it('keeps recovery scoped and reports it unknown after snapshot failure', async () => {
    const recovery: SessionExecutionRecoveryProjection = { turnId: 'queue-1', status: 'waiting', attempt: 1, lastStatus: 503, nextRetryAt: 100 };
    tab.apiGet.mockResolvedValue({ success: true, planSupport: supported, sessionId: 's1', ledger: ledger(1), executionRecovery: recovery });
    const { result, rerender } = renderHook(() => useSessionTaskOrchestration(plan));
    await waitFor(() => expect(result.current.executionRecovery).toEqual(recovery));
    tab.sessionId = 's2';
    tab.apiGet.mockRejectedValue(new Error('offline'));
    rerender();
    await waitFor(() => expect(result.current.executionRecovery).toBeUndefined());
    await waitFor(() => expect(result.current.executionUnknown).toBe(true));
  });

  it('does not offer duplicate root review while native continuation or background work remains active', async () => {
    const { result, rerender } = renderHook(() => useSessionTaskOrchestration(plan));
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    expect(result.current.canRetryReview).toBe(true);
    tab.hasNativeWork = true; rerender();
    expect(result.current.canRetryReview).toBe(false);
    tab.hasNativeWork = false; tab.hasBackgroundWork = true; rerender();
    expect(result.current.canRetryReview).toBe(false);
    tab.hasBackgroundWork = false; rerender();
    expect(result.current.canRetryReview).toBe(true);
  });

  it('updates acceptance immediately from an event without any message/plan mutation', async () => {
    const { result } = renderHook(() => useSessionTaskOrchestration(plan));
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    act(() => { event(ledger(2, true)); });
    expect(result.current.tasks[0].phase).toBe('completed');
  });
  it('does not let a late older REST snapshot overwrite a newer acceptance event', async () => {
    let finish!: (value: unknown) => void;
    tab.apiGet.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(() => useSessionTaskOrchestration(plan));
    act(() => { event(ledger(4, true)); });
    await act(async () => { finish({ success: true, planSupport: supported, sessionId: 's1', ledger: ledger(3) }); });
    expect(result.current.tasks[0].phase).toBe('completed');
  });
  it('keeps confirmed state visibly stale on disconnect and clears the warning after recovery', async () => {
    const { result } = renderHook(() => useSessionTaskOrchestration(plan));
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    tab.apiGet.mockRejectedValue(new Error('offline'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.stale).toBe(true));
    expect(result.current.tasks[0].title).toBe('Task from snapshot');
    tab.apiGet.mockResolvedValue({ success: true, planSupport: supported, sessionId: 's1', ledger: ledger(5, true) });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.stale).toBe(false));
    expect(result.current.tasks[0].phase).toBe('completed');
  });
  it('isolates a session switch from old requests and old-session events', async () => {
    let finish!: (value: unknown) => void;
    tab.apiGet.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { result, rerender } = renderHook(() => useSessionTaskOrchestration(plan));
    tab.sessionId = 's2';
    tab.apiGet.mockResolvedValue({ success: true, planSupport: supported, sessionId: 's2', ledger: emptyTaskLedger() });
    rerender();
    await act(async () => { finish({ success: true, planSupport: supported, sessionId: 's1', ledger: ledger(10, true) }); event(ledger(11, true)); });
    expect(result.current.tasks).toEqual([]);
  });
  it('keeps snapshot polling serial while a request is unresolved', async () => {
    vi.useFakeTimers();
    tab.apiGet.mockReturnValue(new Promise(() => undefined));
    const { unmount } = renderHook(() => useSessionTaskOrchestration(plan));
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(tab.apiGet).toHaveBeenCalledTimes(1);
    unmount();
  });
});

const proposal = { id: 'p1', sessionId: 's1', revision: 1, policyVersion: '1', state: 'awaiting_confirmation' as const, content: { objective: 'Review plan', scope: 'Scope', steps: [{ id: 'step', title: 'Step' }], acceptanceCriteria: ['Proof'] }, changes: [] };
const action = { sessionId: 's1', proposalId: 'p1', expectedRevision: 1, requestId: 'request-1' };
describe('authoritative plan actions', () => {
  it('loads a proposal without formal tasks and adopts only returned ledger state', async () => {
    tab.apiGet.mockResolvedValue({success:true,planSupport:supported,sessionId:'s1',ledger:{...emptyTaskLedger(),revision:1,proposal}});
    const {result}=renderHook(()=>useSessionTaskOrchestration(plan));
    await waitFor(()=>expect(result.current.proposal?.id).toBe('p1'));
    expect(result.current.tasks).toEqual([]);
    tab.apiPost.mockResolvedValue({success:true,planSupport:supported,sessionId:'s1',ledger:{...emptyTaskLedger(),revision:2,proposal}});
    await act(async()=>result.current.confirmPlan(action));
    expect(result.current.proposal?.state).toBe('awaiting_confirmation');
    expect(tab.apiPost).toHaveBeenCalledWith('/api/session/task-orchestration/plan',{kind:'confirm',...action});
  });
  it('rejects acknowledgment-only and failure responses without inventing confirmed state', async () => {
    const {result}=renderHook(()=>useSessionTaskOrchestration(plan));
    await waitFor(()=>expect(result.current.planSupport?.supported).toBe(true));
    for(const response of [{success:true},{success:false,error:'PLAN_REVISION_CHANGED'}]) {
      tab.apiPost.mockResolvedValue(response);
      await act(async()=>{await expect(result.current.confirmPlan(action)).rejects.toThrow();});
    }
    expect(result.current.proposal).toBeUndefined();
  });
  it('posts revision feedback with the original retry request identity', async()=>{
    const {result}=renderHook(()=>useSessionTaskOrchestration(plan));
    await waitFor(()=>expect(result.current.planSupport?.supported).toBe(true));
    tab.apiPost.mockResolvedValue({success:true,planSupport:supported,sessionId:'s1',ledger:emptyTaskLedger()});
    await act(async()=>result.current.requestPlanRevision({...action,feedback:'Narrow the scope'}));
    expect(tab.apiPost).toHaveBeenCalledWith('/api/session/task-orchestration/plan',{kind:'request_revision',...action,feedback:'Narrow the scope'});
  });
  it('rejects a late POST across A/B/A rather than accepting its old session generation', async()=>{
    let finish!: (value:unknown)=>void;
    tab.apiPost.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
    const {result,rerender}=renderHook(()=>useSessionTaskOrchestration(plan));
    await waitFor(()=>expect(result.current.planSupport?.supported).toBe(true));
    const pending=result.current.confirmPlan(action);
    const checked=expect(pending).rejects.toThrow('PLAN_SESSION_CHANGED');
    tab.sessionId='s2';rerender();tab.sessionId='s1';rerender();
    await act(async()=>{finish({success:true,planSupport:supported,sessionId:'s1',ledger:{...emptyTaskLedger(),revision:99,proposal}});await checked;});
    expect(result.current.proposal).toBeUndefined();
  });
});

describe('displayed proposal revision at human ingress',()=>{
  it('publishes only the revision committed to the UI, then clears it on confirmation and unmount',async()=>{
    const events:unknown[]=[];const onVisible=(e:Event)=>events.push((e as CustomEvent).detail);
    window.addEventListener('session-orchestration-visible-plan',onVisible);
    try{
      tab.apiGet.mockResolvedValue({success:true,planSupport:supported,sessionId:'s1',ledger:{...emptyTaskLedger(),revision:1,proposal}});
      const {result,unmount}=renderHook(()=>useSessionTaskOrchestration(plan));
      await waitFor(()=>expect(result.current.proposal?.id).toBe('p1'));
      expect(events.at(-1)).toEqual({tabId:'tab-1',sessionId:'s1',target:{proposalId:'p1',expectedRevision:1}});
      act(()=>{
        event({...emptyTaskLedger(),revision:2,proposal:{...proposal,revision:2}});
        expect(events.at(-1)).toEqual({tabId:'tab-1',sessionId:'s1',target:{proposalId:'p1',expectedRevision:1}});
      });
      expect(events.at(-1)).toEqual({tabId:'tab-1',sessionId:'s1',target:{proposalId:'p1',expectedRevision:2}});
      act(()=>event({...emptyTaskLedger(),revision:3,proposal:{...proposal,revision:2,state:'confirmed'}}));
      expect(events.at(-1)).toEqual({tabId:'tab-1',sessionId:'s1',target:null});
      unmount();expect(events.at(-1)).toEqual({tabId:'tab-1',sessionId:'s1',target:null});
    }finally{window.removeEventListener('session-orchestration-visible-plan',onVisible);}
  });
});

describe('authoritative native plan capability', () => {
  it('does not grant confirmation from a ledger event or a snapshot without capability', async () => {
    tab.apiGet.mockResolvedValue({ success: true, sessionId: 's1', ledger: { ...emptyTaskLedger(), revision: 1, proposal } });
    const { result } = renderHook(() => useSessionTaskOrchestration(plan));
    await waitFor(() => expect(result.current.proposal?.id).toBe('p1'));
    act(() => event({ ...emptyTaskLedger(), revision: 2, proposal }));
    await expect(result.current.confirmPlan(action)).rejects.toThrow('PLAN_RUNTIME_DELEGATION_UNAVAILABLE');
    expect(tab.apiPost).not.toHaveBeenCalled();
  });

  it('adopts unsupported capability at an equal ledger revision and preserves it across SSE', async () => {
    const value = { ...emptyTaskLedger(), revision: 1, proposal };
    tab.apiGet.mockResolvedValue({ success: true, planSupport: supported, sessionId: 's1', ledger: value });
    const { result } = renderHook(() => useSessionTaskOrchestration(plan));
    await waitFor(() => expect(result.current.planSupport?.supported).toBe(true));
    tab.apiGet.mockResolvedValue({ success: true, sessionId: 's1', ledger: value,
      planSupport: { supported: false, runtime: 'codex', reason: 'PLAN_RUNTIME_DELEGATION_UNAVAILABLE' } });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.planSupport?.supported).toBe(false));
    act(() => event({ ...value, revision: 2 }));
    expect(result.current.planSupport?.supported).toBe(false);
    expect(result.current.proposal).toEqual(proposal);
    await expect(result.current.confirmPlan(action)).rejects.toThrow('PLAN_RUNTIME_DELEGATION_UNAVAILABLE');
    expect(tab.apiPost).not.toHaveBeenCalled();
  });

  it('invalidates capability and an in-flight action when the runtime changes within one Session', async () => {
    tab.apiGet.mockResolvedValue({ success: true, planSupport: supported, sessionId: 's1', ledger: { ...emptyTaskLedger(), revision: 1, proposal } });
    const { result, rerender } = renderHook(() => useSessionTaskOrchestration(plan));
    await waitFor(() => expect(result.current.planSupport?.supported).toBe(true));
    let finish!: (value: unknown) => void;
    tab.apiPost.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = result.current.confirmPlan(action);
    const checked = expect(pending).rejects.toThrow('PLAN_SESSION_CHANGED');
    tab.apiGet.mockReturnValue(new Promise(() => undefined));
    tab.sessionRuntime = 'codex';
    rerender();
    expect(result.current.planSupport).toBeUndefined();
    await expect(result.current.confirmPlan(action)).rejects.toThrow('PLAN_RUNTIME_DELEGATION_UNAVAILABLE');
    await act(async () => {
      finish({ success: true, planSupport: supported, sessionId: 's1', ledger: { ...emptyTaskLedger(), revision: 99, proposal } });
      await checked;
    });
    expect(result.current.planSupport).toBeUndefined();
    expect(result.current.proposal).toEqual(proposal);
    expect(tab.apiPost).toHaveBeenCalledOnce();
  });
});
