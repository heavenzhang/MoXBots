import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTranscriptProjection } from '../../shared/sessionTranscript';
import type { DispatchGuard } from '../session-core/turn-queue';
import type { DesktopMessageRequest, SessionEngine } from './types';

const state = vi.hoisted(() => ({ active: undefined as unknown }));
vi.mock('../SessionStore', () => ({ getActiveSessionTranscript: () => state.active }));
import { prepareContinuationAdmission } from './continuation-admission';

function fixture() {
  const projection = createTranscriptProjection();
  projection.messages.set('u1', { id: 'u1', role: 'user', content: 'Original work', timestamp: 't' });
  projection.turns.set('turn1', { id: 'turn1', rootUserMessageId: 'u1', startedAt: 't', status: 'interrupted' });
  state.active = { writer: { projection, status: { generation: 'generation1' } }, hasPendingMutation: false };
  const live = { sessionState: 'idle', isBusy: false, waitingForUser: false };
  const engine = {
    kind: 'builtin', isBusy: vi.fn(() => live.isBusy),
    getRuntimeIdentity: () => ({ sessionId: 'session1' }),
    getLiveSessionState: () => live,
    getQueueStatus: vi.fn(() => [] as { id: string }[]),
    getStreamReplaySnapshot: vi.fn(() => ({ pendingInteractiveRequests: [] as unknown[] })),
  } as unknown as SessionEngine;
  const request: DesktopMessageRequest = { text: 'Continue', continueFromTurnId: 'turn1',
    sessionId: 'session1', workspacePath: '/workspace', scenario: { type: 'desktop', surface: 'chat' } };
  return { projection, live, engine, request };
}
function admitted(engine: SessionEngine, request: DesktopMessageRequest) {
  const decision = prepareContinuationAdmission(engine, request);
  if (!decision?.accepted) throw new Error('Expected continuation admission');
  return decision;
}
describe('canonical continuation admission', () => {
  beforeEach(() => { state.active = undefined; });

  it.each(['busy', 'queue', 'approval', 'running'] as const)('rejects %s before preparation or enqueue', reason => {
    const { engine, request, live } = fixture();
    if (reason === 'busy') live.isBusy = true;
    if (reason === 'running') live.sessionState = 'running';
    if (reason === 'queue') vi.mocked(engine.getQueueStatus).mockReturnValue([{ id: 'other', messagePreview: 'other' }]);
    if (reason === 'approval') vi.mocked(engine.getStreamReplaySnapshot).mockReturnValue({ pendingInteractiveRequests: [{ type: 'permission', data: {} }] } as ReturnType<SessionEngine['getStreamReplaySnapshot']>);
    expect(prepareContinuationAdmission(engine, request)).toMatchObject({ accepted: false, result: { success: false, status: 409, code: 'SESSION_CONTINUATION_BUSY' } });
  });

  it('allows an acknowledged shell but still rejects classified work and a user wait', () => {
    const shell = fixture();
    Object.assign(shell.live, {
      hasBackgroundWork: true,
      backgroundWorkActive: true,
      backgroundWorkBlocksContinuation: false,
    });
    expect(() => admitted(shell.engine, shell.request)).not.toThrow();

    const blocking = fixture();
    Object.assign(blocking.live, {
      hasBackgroundWork: false,
      backgroundWorkBlocksContinuation: true,
    });
    expect(prepareContinuationAdmission(blocking.engine, blocking.request)).toMatchObject({
      accepted: false, result: { success: false, status: 409, code: 'SESSION_CONTINUATION_BUSY' },
    });

    const waiting = fixture();
    waiting.live.waitingForUser = true;
    expect(prepareContinuationAdmission(waiting.engine, waiting.request)).toMatchObject({
      accepted: false, result: { code: 'SESSION_CONTINUATION_BUSY' },
    });
  });

  it('keeps the conservative gate for a runtime without a classified snapshot', () => {
    const { engine, request, live } = fixture();
    Object.assign(live, { backgroundWorkActive: true });
    expect(prepareContinuationAdmission(engine, request)).toMatchObject({
      accepted: false, result: { code: 'SESSION_CONTINUATION_BUSY' },
    });
  });

  it.each(['complete', 'error', 'running'] as const)('rejects a canonical %s turn despite stale displayed metadata', status => {
    const { engine, request, projection } = fixture();
    projection.turns.get('turn1')!.status = status;
    expect(prepareContinuationAdmission(engine, request)).toMatchObject({ accepted: false, result: { code: 'SESSION_CONTINUATION_STALE' } });
  });

  it('rejects a replaced transcript owner and a changed root input', () => {
    const { engine, request, projection } = fixture();
    const first = admitted(engine, request);
    state.active = { writer: { projection, status: { generation: 'generation1' } }, hasPendingMutation: false };
    expect(first.revalidateEntry()?.code).toBe('SESSION_CONTINUATION_STALE');
    const second = admitted(engine, request);
    projection.messages.set('u2', { id: 'u2', role: 'user', content: 'New work', timestamp: 't' });
    expect(second.revalidateEntry()?.code).toBe('SESSION_CONTINUATION_STALE');
  });

  it('rejects an in-place transcript replacement even if it preserves the old turn ids', () => {
    const { engine, request } = fixture();
    const decision = admitted(engine, request);
    (state.active as { writer: { status: { generation: string } } }).writer.status.generation = 'replacement';
    expect(decision.revalidateEntry()?.code).toBe('SESSION_CONTINUATION_STALE');
  });

  it('rechecks a changed turn after asynchronous query preparation', () => {
    const { engine, request, projection } = fixture();
    const decision = admitted(engine, request);
    projection.turns.get('turn1')!.status = 'complete';
    expect(decision.revalidateEntry()?.code).toBe('SESSION_CONTINUATION_STALE');
  });

  it('ignores only its own busy reservation at promotion and rechecks synchronously at commit', async () => {
    const { engine, request, projection, live } = fixture();
    const decision = admitted(engine, request);
    live.isBusy = true; // The queue now owns this item's promotion.
    live.sessionState = 'running';
    const guard = await decision.guard();
    expect(guard.accepted).toBe(true);
    expect(guard.validateAtCommit?.().accepted).toBe(true);
    projection.turns.get('turn1')!.status = 'complete';
    expect(guard.validateAtCommit?.()).toMatchObject({ accepted: false, code: 'SESSION_CONTINUATION_STALE' });
  });

  it('rejects a second concurrent intent when the first commit creates a new root', async () => {
    const { engine, request, projection } = fixture();
    const first = admitted(engine, request);
    const second = admitted(engine, request);
    expect((await first.guard()).validateAtCommit?.().accepted).toBe(true);
    projection.messages.set('u2', { id: 'u2', role: 'user', content: 'Continue', timestamp: 't' });
    projection.turns.set('turn2', { id: 'turn2', rootUserMessageId: 'u2', startedAt: 't', status: 'running' });
    expect(await second.guard()).toMatchObject({ accepted: false, code: 'SESSION_CONTINUATION_STALE' });
  });

  it('retains prior commit rejection, cancellation and awaited rollback', async () => {
    const { engine, request } = fixture();
    const rollback = Promise.resolve();
    const prior: DispatchGuard = Object.assign(vi.fn(async () => ({ accepted: true,
      validateAtCommit: () => ({ accepted: false, error: 'domain rejected', rollbackBeforeReject: rollback }) })),
    { cancel: vi.fn(async () => {}) });
    request.beforeDispatch = prior;
    const decision = admitted(engine, request);
    expect((await decision.guard()).validateAtCommit?.()).toEqual({ accepted: false, error: 'domain rejected', rollbackBeforeReject: rollback });
    await decision.guard.cancel?.();
    expect(prior.cancel).toHaveBeenCalledOnce();
    expect(await decision.guard()).toMatchObject({ accepted: false, code: 'SESSION_CONTINUATION_STALE' });
  });

  it('cancels the preceding claim if its asynchronous preparation changes the turn', async () => {
    const { engine, request, projection } = fixture();
    const cancel = vi.fn(async () => {});
    request.beforeDispatch = Object.assign(async () => {
      projection.turns.get('turn1')!.status = 'complete';
      return { accepted: true };
    }, { cancel });
    const result = await admitted(engine, request).guard();
    expect(result).toMatchObject({ accepted: false, code: 'SESSION_CONTINUATION_STALE' });
    await result.rollbackBeforeReject;
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each(['external', 'integrated'] as const)('fails closed for %s without changing ordinary sends', kind => {
    const { engine, request } = fixture(); engine.kind = kind;
    const result = prepareContinuationAdmission(engine, request);
    expect(result).toMatchObject({ accepted: false, result: { error: expect.stringContaining('手动继续') } });
    expect(prepareContinuationAdmission(engine, { ...request, continueFromTurnId: undefined })).toBeUndefined();
  });
});
