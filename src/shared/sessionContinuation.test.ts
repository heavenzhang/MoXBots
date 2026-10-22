import { describe, expect, it } from 'vitest';
import { createTranscriptProjection, type TranscriptTurn } from './sessionTranscript';
import { deriveSessionContinuation, matchesSessionContinuation } from './sessionContinuation';

function fixture(status: TranscriptTurn['status']) {
  const projection = createTranscriptProjection();
  projection.messages.set('u1', { id: 'u1', role: 'user', content: 'unfinished', timestamp: 't' });
  projection.turns.set('turn1', { id: 'turn1', rootUserMessageId: 'u1', startedAt: 't', status });
  return projection;
}
describe('persisted conversation continuation', () => {
  it.each(['stopped', 'interrupted'] as const)('projects exact %s work without replaying input', status => {
    expect(deriveSessionContinuation(fixture(status))).toEqual({ turnId: 'turn1', rootUserMessageId: 'u1', status });
  });
  it.each(['running', 'complete', 'error'] as const)('does not offer active, completed or unresolved-error %s work as resumable', status => {
    expect(deriveSessionContinuation(fixture(status))).toBeUndefined();
  });
  it('rejects legacy running metadata even when the original root matches', () => {
    expect(matchesSessionContinuation({ turnId: 'turn1', rootUserMessageId: 'u1', status: 'running' },
      [{ id: 'u1', role: 'user' }])).toBe(false);
  });
  it('does not infer incomplete work from user text or an older stopped turn', () => {
    const projection = fixture('stopped');
    projection.messages.set('u2', { id: 'u2', role: 'user', content: 'continue old work', timestamp: 't' });
    expect(deriveSessionContinuation(projection)).toBeUndefined();
    projection.turns.set('turn2', { id: 'turn2', rootUserMessageId: 'u2', startedAt: 't', status: 'complete' });
    expect(deriveSessionContinuation(projection)).toBeUndefined();
  });
  it('does not treat collaboration or orphaned turn metadata as a user continuation', () => {
    const projection = fixture('interrupted');
    projection.turns.get('turn1')!.origin = 'collaboration';
    expect(deriveSessionContinuation(projection)).toBeUndefined();
    projection.turns.get('turn1')!.origin = undefined;
    projection.messages.clear();
    expect(deriveSessionContinuation(projection)).toBeUndefined();
  });
  it('rejects stale requests and newer or unconfirmed sends while allowing paginated exact-turn history', () => {
    const continuation = deriveSessionContinuation(fixture('interrupted'));
    expect(matchesSessionContinuation(continuation, [{ id: 'u1', role: 'user' }], 'turn1')).toBe(true);
    expect(matchesSessionContinuation(continuation, [{ id: 'u1', role: 'user' }], 'old')).toBe(false);
    expect(matchesSessionContinuation(continuation, [{ id: 'u2', role: 'user' }])).toBe(false);
    expect(matchesSessionContinuation(continuation, [{ id: 'u1', role: 'user', deliveryStatus: 'failed' }])).toBe(false);
    expect(matchesSessionContinuation(continuation, [{ id: 'answer', role: 'assistant', turnId: 'turn1' }])).toBe(true);
    expect(matchesSessionContinuation(continuation, [])).toBe(false);
    expect(matchesSessionContinuation(continuation, [{ id: 'u1', role: 'user' }, { id: 'answer', role: 'assistant', turnId: 'turn1', transcriptState: 'complete' }])).toBe(false);
    expect(matchesSessionContinuation(continuation, [{ id: 'u1', role: 'user' }, { id: 'answer', role: 'assistant', turnId: 'turn1', transcriptState: 'interrupted' }])).toBe(true);
  });
});
