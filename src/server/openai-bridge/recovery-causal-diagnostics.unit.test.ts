import { describe, expect, it, vi } from 'vitest';
import { QueryRequestGuard } from './request-lifetime';
import { ContextRecoveryController } from './context-recovery';
import { ModelFailoverController } from './model-failover';
import { fetchFailureDiagnostic } from './transport-diagnostics';
import type { RecoveryCausalDiagnostic } from './recovery-causal-diagnostics';
import { observeRecoveryDiagnostic } from './recovery-causal-diagnostics';

const secret = 'PRIVATE_TOOL_INPUT_RESULT_ERROR_ID_DO_NOT_LOG';

describe('non-authoritative recovery causal observations', () => {
  it('consumes rejected default console diagnostics without changing its caller', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => Promise.reject(new Error(secret)));
    try {
      expect(observeRecoveryDiagnostic({ event: 'inference_admission_rejected', owner: 'context', reason: 'duplicate_exact_key' })).toBeUndefined();
      await Promise.resolve();
    } finally { log.mockRestore(); }
  });
  it('reports each original admission predicate without changing its order or state', async () => {
    const results = [];
    for (const mode of ['disabled', 'enabled', 'throws', 'rejects']) {
      const events: string[] = [];
      const observe = mode === 'disabled' ? undefined : (reason: string) => {
        events.push(reason); if (mode === 'throws') throw new Error(secret);
        if (mode === 'rejects') return Promise.reject(new Error(secret));
      };
      const guard = new QueryRequestGuard(observe);
      const lease = guard.begin(secret, 'first', false)!;
      const decisions = [!!lease, !!guard.begin(secret, 'first', false)];
      lease.block(); lease.interrupted(1); lease.finish();
      decisions.push(!!guard.begin(secret, 'first', false), !!guard.begin('other', 'changed', true));
      const snapshot = guard.settledScope(secret);
      const duplicate = new QueryRequestGuard(observe);
      duplicate.begin('source', 'shared', false)!.finish();
      decisions.push(!!duplicate.begin('target', 'shared', true));
      const capacity = new QueryRequestGuard(observe);
      for (let i = 0; i < 4096; i++) expect(capacity.begin('bounded', String(i), false)).toBeDefined();
      decisions.push(!!capacity.begin('bounded', 'overflow', false), !!capacity.begin('bounded', 'overflow2', false));
      results.push({ decisions, snapshot, count: capacity.inFlightCount });
      if (mode !== 'disabled') expect(events).toEqual(['duplicate_exact_key', 'blocked_exact_scope',
        'blocked_ambiguous_scope', 'duplicate_ambiguous_fingerprint', 'registry_capacity', 'registry_exhausted']);
      expect(JSON.stringify(events)).not.toContain(secret);
    }
    await Promise.resolve();
    expect(results[1]).toEqual(results[0]); expect(results[2]).toEqual(results[0]); expect(results[3]).toEqual(results[0]);
  });

  it.each(['context', 'failover'] as const)('keeps %s HTTP status, body, headers and dispatch identical with disabled/on/throwing observers', async layer => {
    const outputs = [];
    for (const mode of ['disabled', 'enabled', 'throws', 'rejects']) {
      const events: unknown[] = [];
      const onDiagnostic = mode === 'disabled' ? false as const : (event: unknown) => {
        events.push(event); if (mode === 'throws') throw new Error(secret);
        if (mode === 'rejects') return Promise.reject(new Error(secret));
      };
      const context = new ContextRecoveryController({ scope: () => secret, isActive: () => true,
        backup: async () => 'unused', onDiagnostic });
      const failover = new ModelFailoverController({ scope: () => secret, isActive: () => true,
        resolveBackup: () => undefined, onSwitch: () => {}, onDiagnostic });
      const dispatch = vi.fn(async () => Response.json({ type: 'message', content: [] }));
      const run = async () => {
        const request = new Request('http://fixture.invalid/messages');
        return layer === 'context' ? context.run(request, { model: 'fixture', max_tokens: 1,
          messages: [{ role: 'user', content: secret }] }, dispatch)
          : failover.run(request, { providerId: 'fixture', model: 'fixture', baseUrl: 'http://fixture.invalid' }, dispatch, secret);
      };
      await (await run()).text(); const denied = await run();
      outputs.push({ status: denied.status, body: await denied.text(), headers: [...denied.headers], calls: dispatch.mock.calls.length });
      if (mode !== 'disabled') expect(events).toEqual([{ event: 'inference_admission_rejected', owner: layer === 'context' ? 'context' : 'model_failover', reason: 'duplicate_exact_key' }]);
      expect(JSON.stringify(events)).not.toContain(secret);
    }
    expect(outputs[0].status).toBe(409); expect(outputs[0].calls).toBe(1);
    expect(outputs[1]).toEqual(outputs[0]); expect(outputs[2]).toEqual(outputs[0]); expect(outputs[3]).toEqual(outputs[0]);
  });

  it('observes actual reserve/commit persistence boundaries without exposing native IDs, inputs, results or errors', async () => {
    const outcomes = [];
    for (const mode of ['disabled', 'enabled', 'throws']) {
      const events: RecoveryCausalDiagnostic[] = []; const writes: unknown[] = []; let fail = false;
      const onDiagnostic = mode === 'disabled' ? false as const : (event: RecoveryCausalDiagnostic) => {
        events.push(event); if (mode === 'throws') throw new Error(secret);
      };
      const controller = new ContextRecoveryController({ scope: () => 'root', isActive: () => true,
        backup: async () => 'unused', persistLedger: async value => { if (fail) throw new Error(secret); writes.push(value); }, onDiagnostic });
      await controller.protectInference({ model: 'fixture', max_tokens: 1, messages: [{ role: 'user', content: 'fixed' }] });
      const input = { command: secret };
      expect(await controller.authorizeTool('Bash', input, secret)).toBeUndefined();
      fail = true;
      const failed = await controller.commitToolResult('Bash', input, secret, false, secret).then(() => 'unexpected', error => (error as Error).message);
      outcomes.push({ writes, failed });
      if (mode !== 'disabled') {
        expect(events.map(row => 'phase' in row ? row.phase : undefined)).toEqual(['reserve_enter', 'reserve_complete', 'commit_enter', 'commit_failed']);
        expect(events.every(row => (row as { persistence: string }).persistence === 'active')).toBe(true);
        expect(JSON.stringify(events)).not.toContain(secret);
        expect(JSON.stringify(events)).toMatch(/"toolIdDigest":"[a-f0-9]{24}"/);
        expect(JSON.stringify(events)).toMatch(/"actionDigest":"[a-f0-9]{24}"/);
      }
    }
    expect(outcomes[1]).toEqual(outcomes[0]); expect(outcomes[2]).toEqual(outcomes[0]);
    expect(outcomes[0].failed).toContain('Recovery ledger could not be committed');
  });

  it.each([false, true])('marks successful native result hooks with active/noop persistence (failed=%s)', async failed => {
    for (const active of [false, true]) {
      const events: unknown[] = [];
      const controller = new ContextRecoveryController({ scope: () => 'root', isActive: () => true,
        backup: async () => 'unused', persistLedger: async () => {}, onDiagnostic: event => events.push(event) });
      if (active) await controller.protectInference({ model: 'fixture', max_tokens: 1, messages: [{ role: 'user', content: 'fixed' }] });
      await controller.commitToolResult('Bash', { command: secret }, secret, failed, secret);
      expect(events).toEqual([
        expect.objectContaining({ phase: 'commit_enter', persistence: active ? 'active' : 'inactive', hook: failed ? 'post_tool_use_failure' : 'post_tool_use' }),
        expect.objectContaining({ phase: 'commit_complete', persistence: active ? 'active' : 'inactive', hook: failed ? 'post_tool_use_failure' : 'post_tool_use' }),
      ]);
      expect(JSON.stringify(events)).not.toContain(secret);
    }
  });

  it('does not log a completed native phase before its original persistence acknowledgement', async () => {
    const events: RecoveryCausalDiagnostic[] = []; let blocked = false; let release!: () => void;
    let gate = Promise.resolve();
    const controller = new ContextRecoveryController({ scope: () => 'root', isActive: () => true,
      backup: async () => 'unused', persistLedger: async () => { if (blocked) await gate; }, onDiagnostic: event => events.push(event) });
    await controller.protectInference({ model: 'fixture', max_tokens: 1, messages: [{ role: 'user', content: 'fixed' }] });
    for (const phase of ['reserve', 'commit']) {
      events.length = 0; blocked = true; gate = new Promise(resolve => { release = resolve; });
      const pending = phase === 'reserve' ? controller.authorizeTool('Bash', { command: secret }, secret)
        : controller.commitToolResult('Bash', { command: secret }, secret, false, secret);
      try {
        expect(events.filter(row => 'phase' in row).map(row => row.phase)).toEqual([`${phase}_enter`]);
        await Promise.resolve();
        expect(events.filter(row => 'phase' in row).map(row => row.phase)).toEqual([`${phase}_enter`]);
      } finally { release(); }
      await pending;
      expect(events.filter(row => 'phase' in row).map(row => row.phase)).toEqual([`${phase}_enter`, `${phase}_complete`]);
    }
  });

  it.each(['state_blocked', 'ledger_blocked', 'request_guard_blocked'] as const)('labels the first evaluated native generic gate (%s) without extra owner reads', async reason => {
    const outcomes = [];
    for (const mode of ['disabled', 'enabled', 'throws']) {
      const events: unknown[] = []; let scope = 'a'; let canRecover = true; let reads = 0; let failWrite = false;
      const controller = new ContextRecoveryController({ scope: () => { reads++; return scope; }, isActive: () => true,
        canRecover: () => canRecover, backup: async () => 'unused', persistLedger: async () => { if (failWrite) throw new Error(secret); },
        onDiagnostic: mode === 'disabled' ? false : event => { events.push(event); if (mode === 'throws') throw new Error(secret); } });
      if (reason === 'ledger_blocked') {
        await controller.protectInference({ model: 'fixture', max_tokens: 1, messages: [{ role: 'user', content: 'fixed' }] });
        failWrite = true;
        expect(await controller.authorizeTool('Bash', { command: secret }, secret)).toBe(
          'automatic_replay_blocked: Could not durably reserve this action; execution stopped.');
        if (mode !== 'disabled') expect(events).toContainEqual(expect.objectContaining({ phase: 'reserve_failed', persistence: 'active' }));
      } else {
        const response = await controller.run(new Request('http://fixture.invalid/messages'),
          { model: 'fixture', max_tokens: 1, stream: true, messages: [{ role: 'user', content: 'fixed' }] },
          async () => new Response('data: {"type":"message_start","message":{"content":[]}}\n\n',
            { headers: { 'content-type': 'text/event-stream' } }));
        await response.text();
        if (reason === 'request_guard_blocked') { scope = 'b'; canRecover = false; }
      }
      events.length = 0; reads = 0;
      const denied = controller.beforeTool('Bash', { command: secret });
      outcomes.push({ denied, reads });
      if (mode !== 'disabled') expect(events).toEqual([{ event: 'native_action_gate_rejected', reason }]);
    }
    expect(outcomes[0].denied).toContain('Context recovery stopped with preserved progress');
    expect(outcomes[1]).toEqual(outcomes[0]); expect(outcomes[2]).toEqual(outcomes[0]);
  });

  it('projects only bounded allowlisted codes and local abort flags, never error text or arbitrary codes', () => {
    const error = Object.assign(new Error(secret), { code: secret, cause: Object.assign(new Error(secret), { code: 'ECONNRESET' }) });
    const value = fetchFailureDiagnostic(error, { headersTimedOut: false, downstreamAborted: false, controllerAborted: false });
    expect(value).toContain('ECONNRESET'); expect(value).toContain('known_and_unknown'); expect(value).not.toContain(secret);
    expect(fetchFailureDiagnostic({ code: secret }, { headersTimedOut: false, downstreamAborted: false, controllerAborted: false })).toContain('"codeStatus":"unknown"');
    expect(fetchFailureDiagnostic(new Error(secret), { headersTimedOut: true, downstreamAborted: true, controllerAborted: true })).toContain('headers_and_downstream');
    const cycle = { code: 'UND_ERR_SOCKET', cause: null as unknown }; cycle.cause = cycle;
    expect(fetchFailureDiagnostic(cycle, { headersTimedOut: false, downstreamAborted: false, controllerAborted: true })).toContain('unattributed_local_abort');
    expect(fetchFailureDiagnostic({ get code() { throw new Error(secret); } }, { headersTimedOut: false, downstreamAborted: false, controllerAborted: false })).not.toContain(secret);
  });
});
