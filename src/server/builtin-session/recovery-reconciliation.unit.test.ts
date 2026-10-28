import { describe, expect, it, vi } from 'vitest';
import { ContextRecoveryController, recoveryActionHash } from '../openai-bridge/context-recovery';
import { inspectRecoveryActions, reconcileRecoveryAction, recoveryLedgerDigest, type RecoveryReviewDependencies } from './recovery-reconciliation';

function fixture(name = 'TaskGet', input: Record<string, unknown> = { taskId: '1' }) {
  const owner = { sessionId: 'product', sdkSessionId: 'native', epoch: 3, reviewAuthority: 'process-1' };
  const hash = recoveryActionHash(name, input);
  let ledger: unknown = { version: 1, completed: [], uncertain: [hash, recoveryActionHash('Bash', { command: 'echo success' })], denied: [], blocked: false };
  let current = true;
  const rows = [{ type: 'assistant', uuid: 'uuid-1', session_id: 'native', message: { content: [
    { type: 'tool_use', id: 'call-1', name, input },
    { type: 'tool_use', id: 'call-2', name: 'Bash', input: { command: 'echo success' } },
  ] } }];
  const adopt = vi.fn();
  const deps: RecoveryReviewDependencies = { owner, isCurrent: () => current, load: () => ledger,
    readNative: vi.fn(async () => rows), adopt,
    save: vi.fn(async (next, expected, live) => {
      if (!live() || recoveryLedgerDigest(ledger) !== expected) throw new Error('CAS refused');
      ledger = next;
    }),
  };
  return { deps, hash, rows, adopt, setCurrent: (v: boolean) => { current = v; }, setLedger: (v: unknown) => { ledger = v; },
    request: async () => { const snapshot = await inspectRecoveryActions(deps); const { actions: _actions, resolvedCount: _count, ...identity } = snapshot; return { ...identity, actionHash: hash }; } };
}

describe('native query outcome review', () => {
  it.each([['TaskGet', { taskId: '1' }], ['TaskGet', {}], ['TaskList', {}]] as const)('records %s without claiming success or replaying', async (name, input) => {
    const f = fixture(name, input);
    const initial = await inspectRecoveryActions(f.deps);
    expect(initial.actions.find(a => a.actionHash === f.hash)?.eligible).toBe(true);
    expect(JSON.stringify(initial)).not.toContain('echo success');
    const result = await reconcileRecoveryAction(await f.request(), f.deps);
    expect(result.resolvedCount).toBe(1); expect(result.actions).toHaveLength(1);
    expect(f.adopt).toHaveBeenCalledTimes(1);
    expect((f.deps.load() as { uncertain: string[] }).uncertain).toContain(f.hash);
    const reloaded = await inspectRecoveryActions(f.deps);
    expect(reloaded.actions).toEqual(result.actions);
    expect(reloaded.resolvedCount).toBe(1);
  });
  it.each([
    ['Bash', { command: 'cat /tmp/status.json' }], ['TaskUpdate', { taskId: '1', status: 'completed' }],
    ['mcp__tasks__TaskGet', { taskId: '1' }], ['SendMessage', { type: 'message', content: 'done' }],
    ['TaskGet', { taskId: '1', command: 'write' }], ['TaskList', { update: true }], ['TaskGet', { taskId: 1 }],
  ])('never certifies %s or unsupported inputs', async (name, input) => {
    const f = fixture(name as string, input as Record<string, unknown>);
    await expect(reconcileRecoveryAction(await f.request(), f.deps)).rejects.toThrow('unproven');
    expect(f.deps.save).not.toHaveBeenCalled();
  });
  it.each(['foreign', 'duplicate', 'missing'])('rejects %s native evidence', async mode => {
    const f = fixture();
    if (mode === 'foreign') f.rows[0].session_id = 'another-history';
    if (mode === 'duplicate') f.rows.push(structuredClone(f.rows[0]));
    if (mode === 'missing') f.rows.length = 0;
    await expect(reconcileRecoveryAction(await f.request(), f.deps)).rejects.toThrow('unproven');
    expect(f.deps.save).not.toHaveBeenCalled();
  });
  it.each(['sessionId', 'sdkSessionId', 'epoch', 'reviewAuthority', 'ledgerDigest', 'actionHash'])('rejects a stale or forged %s', async key => {
    const f = fixture(); const request = await f.request();
    await expect(reconcileRecoveryAction({ ...request, [key]: 'changed' }, f.deps)).rejects.toThrow();
    expect(f.deps.save).not.toHaveBeenCalled();
  });
  it('invalidates an old page and duplicate signed POST after one successful review', async () => {
    const f = fixture(); const request = await f.request();
    await reconcileRecoveryAction(request, f.deps);
    await expect(reconcileRecoveryAction(request, f.deps)).rejects.toThrow('stale');
    expect(f.deps.save).toHaveBeenCalledTimes(1);
  });
  it.each(['owner', 'ledger', 'storage'])('fails closed when %s changes across IO', async kind => {
    const f = fixture(); const request = await f.request();
    if (kind === 'storage') f.deps.save = vi.fn(async () => { throw new Error('disk failure'); });
    else f.deps.readNative = async () => {
      if (kind === 'owner') f.setCurrent(false);
      else f.setLedger({ ...f.deps.load() as object, denied: ['c'.repeat(64)] });
      return f.rows;
    };
    await expect(reconcileRecoveryAction(request, f.deps)).rejects.toThrow();
    expect(f.adopt).not.toHaveBeenCalled();
  });
  it('never accepts a forged task receipt for a mutating action or another owner', async () => {
    const f = fixture(); await reconcileRecoveryAction(await f.request(), f.deps);
    const original = f.deps.load() as { readonlyTasks: Record<string, unknown>[] };
    for (const change of [{ toolName: 'Bash' }, { actionHash: 'a'.repeat(64) }, { sessionId: 'foreign' }, { input: { taskId: 'different' } }]) {
      f.setLedger({ ...original, readonlyTasks: [{ ...original.readonlyTasks[0], ...change }] });
      await expect(inspectRecoveryActions(f.deps)).rejects.toThrow('Invalid readonly');
    }
  });
  it('keeps live request/stop fences while adopting a committed readonly receipt', async () => {
    const f = fixture();
    const context = new ContextRecoveryController({ initialLedger: f.deps.load(), recoveryOwner: f.deps.owner,
      scope: () => 'turn', isActive: () => false, backup: async () => '' });
    f.deps.adopt = receipt => context.adoptReadonlyTaskResolution(receipt);
    await reconcileRecoveryAction(await f.request(), f.deps);
    expect(context.inspectActionLedger().uncertainCount).toBe(1);
    expect(context.beforeTool('Bash', { command: 'something-new' })).toContain('blocked');
    expect(context.canRetryInference()).toBe(false);
  });
});
