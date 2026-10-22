import { describe, expect, it } from 'vitest';
import { assertDshDelegationHookReady, evaluateDshDelegationHook, DSH_DELEGATION_CONFIRMATION_HOOK_ID as hookId } from './delegation-gate';
import { compileDshExtensionSnapshot } from './extension-compiler';

function request(tool = 'Agent') {
  return {
    hookId, event: 'PreToolUse', tool, input: {}, origin: 'root',
    authority: { componentId: hookId, productSessionId: 'product', runtimeGeneration: 'generation',
      runtimeSessionId: 'runtime', turnId: 'turn', callId: 'call' },
  };
}
function evaluate(params: Record<string, unknown>, canDelegateSubagents: () => boolean = () => false) {
  return evaluateDshDelegationHook({ params, productSessionId: 'product', runtimeGeneration: 'generation',
    runtimeSessionId: 'runtime', componentGenerationAccepted: true, canDelegateSubagents });
}

describe('DSH native delegation confirmation gate', () => {
  it('requires a native ready receipt, never treating unsupported hooks as enforcement', () => {
    for (const state of ['unsupported', 'disabled', 'failed']) {
      expect(() => assertDshDelegationHookReady({ components: [{ key: `hook:${hookId}`, state }] })).toThrow();
    }
    expect(() => assertDshDelegationHookReady({})).toThrow();
    expect(() => assertDshDelegationHookReady({ components: [{ key: `hook:${hookId}`, state: 'ready' }] })).not.toThrow();
  });
  it('registers a fail-closed hook even with no user extensions', () => {
    expect(compileDshExtensionSnapshot().components).toContainEqual({ id: hookId, enabled: true, kind: 'hook',
      descriptor: { event: 'PreToolUse', originScope: ['root', 'foreground_child', 'background_child'], failurePolicy: 'deny' } });
  });
  it.each(['Agent', 'subagent', 'fork_agent'])('denies unconfirmed native %s before dispatch', tool => {
    expect(evaluate(request(tool))).toMatchObject({ state: 'deny', code: 'session_plan_confirmation_required' });
  });
  it('allows ordinary tools and checks the current confirmation on every delegation', () => {
    expect(evaluate(request('Read'))).toEqual({ state: 'continue' });
    let confirmed = false;
    const check = () => confirmed;
    expect(evaluate(request(), check).state).toBe('deny');
    confirmed = true;
    expect(evaluate(request(), check).state).toBe('continue');
  });
  it.each(['foreground_child', 'background_child'])('enforces delegation for %s', origin => {
    expect(evaluate({ ...request(), origin, agentId: 'child' }).state).toBe('deny');
    expect(evaluate({ ...request(), origin, agentId: 'child' }, () => true).state).toBe('continue');
  });
  it.each(['productSessionId', 'runtimeGeneration', 'runtimeSessionId', 'callId', 'turnId', 'componentId'])('rejects stale or incomplete %s', field => {
    const params = request();
    expect(evaluate({ ...params, authority: { ...params.authority, [field]: '' } }, () => true).state).toBe('deny');
  });
  it('fails closed if the owner cannot read confirmation', () => {
    expect(evaluate(request(), () => { throw new Error('unavailable'); })).toMatchObject({ state: 'deny', code: 'delegation_confirmation_unavailable' });
  });
  it('requires a retained component generation and an identified child actor', () => {
    expect(evaluateDshDelegationHook({ params: request(), productSessionId: 'product', runtimeGeneration: 'generation',
      runtimeSessionId: 'runtime', componentGenerationAccepted: false, canDelegateSubagents: () => true }).state).toBe('deny');
    expect(evaluate({ ...request(), origin: 'background_child' }, () => true).state).toBe('deny');
  });
  it('preserves legacy delegation when the owner omits its callback', () => {
    expect(evaluateDshDelegationHook({ params: request(), productSessionId: 'product', runtimeGeneration: 'generation',
      runtimeSessionId: 'runtime', componentGenerationAccepted: true }).state).toBe('continue');
  });
});
