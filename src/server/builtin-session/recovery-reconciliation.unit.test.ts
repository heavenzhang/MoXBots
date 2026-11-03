import { createSessionExecution } from '../../shared/sessionExecution';
import { emptyTaskLedger } from '../../shared/sessionTaskOrchestration';
import { describe, expect, it, vi } from 'vitest';
import { ContextRecoveryController, recoveryActionHash } from '../openai-bridge/context-recovery';
import { inspectRecoveryActions, reconcileRecoveryAction, reconcileAvailableRecoveryProof, recoveryLedgerDigest, type RecoveryReviewDependencies } from './recovery-reconciliation';

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
    request: async () => { const snapshot = await inspectRecoveryActions(deps); return { sessionId:snapshot.sessionId, sdkSessionId:snapshot.sdkSessionId, epoch:snapshot.epoch, reviewAuthority:snapshot.reviewAuthority, ledgerDigest:snapshot.ledgerDigest, actionHash:hash }; } };
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
    f.deps.adopt = receipt => {
      if (receipt.kind === 'builtin-task-query-reviewed') context.adoptReadonlyTaskResolution(receipt);
      else if (receipt.kind === 'native-completion-reviewed') context.adoptNativeCompletion(receipt);
      else context.adoptPreToolDenialResolution(receipt);
    };
    await reconcileRecoveryAction(await f.request(), f.deps);
    expect(context.inspectActionLedger().uncertainCount).toBe(1);
    expect(context.beforeTool('Bash', { command: 'something-new' })).toContain('blocked');
    expect(context.canRetryInference()).toBe(false);
  });
});


it.each([['Read', 'read_file'], ['Write', 'write_file'], ['Edit', 'edit_file']] as const)('describes %s from exact native input without granting eligibility', async (name, kind) => {
  const f = fixture(name, { file_path: '/private/work/方案.docx', content: 'private body', token: 'private token' });
  const result = await inspectRecoveryActions(f.deps);
  expect(result.actions.find(a => a.actionHash === f.hash)).toMatchObject({ eligible: false, presentation: { kind, target: '方案.docx' } });
  expect(JSON.stringify(result)).not.toMatch(/private body|private token|private\/work/);
  expect(f.deps.save).not.toHaveBeenCalled();
});
it('identifies uncertain Bash without exposing commands or guessing business effects', async () => {
  const f = fixture('Bash', { command: 'SECRET_TOKEN=private-value do-something', description: 'private description' });
  const result = await inspectRecoveryActions(f.deps);
  expect(result.actions.find(a => a.actionHash === f.hash)).toMatchObject({ tool: 'Bash', eligible: false, presentation: { kind: 'command' } });
  expect(JSON.stringify(result)).not.toMatch(/SECRET_TOKEN|private-value|private description/);
});
it('does not invent a description from missing or duplicate native evidence', async () => {
  const f = fixture('Write', { file_path: '/private/file.txt' });
  f.rows.push(structuredClone(f.rows[0]));
  let result = await inspectRecoveryActions(f.deps);
  expect(result.actions.find(a => a.actionHash === f.hash)?.presentation).toBeUndefined();
  f.rows.length = 0;
  result = await inspectRecoveryActions(f.deps);
  expect(result.actions.every(a => a.presentation === undefined)).toBe(true);
});

describe('background recovery and necessary user decisions', () => {
  function blockedFixture() {
    const f = fixture('Write', {file_path:'/workspace/report.txt',content:'private'});
    const ledger=emptyTaskLedger();
    ledger.execution={...createSessionExecution({id:'execution',requestId:'human',originalInput:'save report',queueId:'q',now:1,
      intent:{kind:'execute',objective:'save report',scope:'report',acceptanceCriteria:['saved']}}),
      phase:'paused',reason:'TOOL_OUTCOME_UNKNOWN',lastSettledQueueId:'q'};
    ledger.executionEvidence=[{id:'call-1',queueId:'q',name:'Write',digest:'observed',successful:false,observationOrder:1,mutating:true,pending:true}];
    f.deps.taskLedger=()=>ledger;
    return {...f,ledger};
  }
  it('projects only the exact pending call blocking the settled current task',async()=>{
    const f=blockedFixture();
    const snapshot=await inspectRecoveryActions(f.deps);
    expect(snapshot.attention).toEqual({executionId:'execution',actionHashes:[f.hash]});
    expect(snapshot.actions).toHaveLength(2);
    expect(JSON.stringify(snapshot)).not.toContain('private');
  });
  it.each(['no-task','running','completed','stopped','unsettled','unrelated','automatic','delegation'])('keeps %s uncertainty silent',async mode=>{
    const f=blockedFixture();
    if(mode==='no-task')f.ledger.execution=undefined;
    if(mode==='running')f.ledger.execution!.phase='running';
    if(mode==='completed')f.ledger.execution!.phase='completed';
    if(mode==='stopped')f.ledger.execution!.reason='stopped';
    if(mode==='unsettled')f.ledger.execution!.lastSettledQueueId='old';
    if(mode==='unrelated')f.ledger.executionEvidence![0].id='unrelated';
    if(mode==='automatic')f.deps.canInvestigate=()=>true;
    if(mode==='delegation')f.ledger.delegationClaims=[{toolUseId:'child',taskId:'t',executionId:'execution',state:'running'}];
    expect((await inspectRecoveryActions(f.deps)).attention).toBeUndefined();
  });
  it('clears stale attention when the original owner starts its investigation',async()=>{
    const f=blockedFixture(); f.deps.canInvestigate=()=>true;
    f.deps.startInvestigation=vi.fn(async()=>{f.ledger.execution!.phase='running';});
    const result=await reconcileRecoveryAction({...await f.request(),kind:'investigate'},f.deps);
    expect(result.attention).toBeUndefined();
    expect(f.deps.startInvestigation).toHaveBeenCalledOnce();
  });
  it('automatically settles proven calls without a mounted UI or dispatching an investigation',async()=>{
    const f=fixture(); f.deps.startInvestigation=vi.fn();
    await reconcileAvailableRecoveryProof(f.deps);
    const result=await inspectRecoveryActions(f.deps);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].eligible).toBe(false);
    expect(f.adopt).toHaveBeenCalledOnce();
    expect(f.deps.startInvestigation).not.toHaveBeenCalled();
  });
  it('retains unknown calls and stops on storage failure rather than retrying writes',async()=>{
    const f=fixture();f.deps.save=vi.fn(async()=>{throw new Error('storage');});
    await expect(reconcileAvailableRecoveryProof(f.deps)).rejects.toThrow('storage');
    expect(f.deps.save).toHaveBeenCalledOnce();
    expect(f.adopt).not.toHaveBeenCalled();
    expect((await inspectRecoveryActions(f.deps)).actions).toHaveLength(2);
  });
});
