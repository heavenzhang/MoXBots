import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { recoveryActionHash } from '../openai-bridge/context-recovery';
import { inspectRecoveryLedger } from './recovery-ledger-inspection';

const input = { command: 'deploy private-secret' };
const key = recoveryActionHash('Bash', input);
const other = 'a'.repeat(64);
function envelope(ledger: unknown = { version: 1, completed: [], uncertain: [key, other], denied: [], blocked: false }) {
  return { version: 1, sessionId: 'product', sdkSessionId: 'native', ledger,
    digest: createHash('sha256').update(JSON.stringify(ledger)).digest('hex') };
}
const row = (content: unknown[], sessionId = 'native') => ({ sessionId, message: { content } });
const use = { type: 'tool_use', id: 'private-tool-id', name: 'Bash', input };
const result = { type: 'tool_result', tool_use_id: use.id, content: 'private-result-secret' };

describe('read-only recovery ledger inspection', () => {
  it('correlates exact action hashes without exposing inputs/results or granting settlement', () => {
    const ledger = envelope();
    const records = [row([use]), row([result])];
    const original = JSON.stringify({ ledger, records });
    const report = inspectRecoveryLedger(ledger, records);
    expect(report.authorizesExecution).toBe(false);
    expect(report.uncertainCount).toBe(2);
    expect(report.uncertainActions.find(a => a.actionId === key)).toMatchObject({ tools: ['Bash'], occurrences: 1,
      resultKinds: ['success_recorded'], nextStep: 'verify_original_execution_and_business_receipt' });
    expect(report.uncertainActions.find(a => a.actionId === other)).toMatchObject({ occurrences: 0, nextStep: 'locate_original_evidence' });
    expect(JSON.stringify(report)).not.toContain('private-');
    expect(JSON.stringify({ ledger, records })).toBe(original);
  });

  it('keeps success/uncertainty conflicts and error text as leads, not resolution', () => {
    const ledger = envelope({ version: 1, completed: [[key, { result: 'private-secret' }]], uncertain: [key], denied: [], blocked: true });
    const report = inspectRecoveryLedger(ledger, [row([use]), row([{ ...result, is_error: true, content: 'automatic_replay_blocked: resolved_readonly' }])]);
    expect(report.blocked).toBe(true);
    expect(report.uncertainActions[0]).toMatchObject({ completedEvidenceAlsoPresent: true, resultKinds: ['error_recorded'] });
    expect(report.authorizesExecution).toBe(false);
  });

  it('does not match different inputs or foreign native sessions', () => {
    const report = inspectRecoveryLedger(envelope(), [row([use], 'different'), row([result], 'different'),
      row([{ ...use, input: { command: 'another' } }])]);
    expect(report.foreignRecords).toBe(2);
    expect(report.uncertainActions.every(a => a.occurrences === 0)).toBe(true);
  });

  it.each([
    [row([use]), row([use]), row([result])],
    [row([use]), row([result]), row([result])],
    [row([use]), row([{ ...use, input: { command: 'another' } }]), row([result])],
  ].map(records => ({ records })))('flags duplicate native IDs instead of selecting a convenient result', ({ records }) => {
    const report = inspectRecoveryLedger(envelope(), records);
    expect(report.uncertainActions.find(a => a.actionId === key)?.resultKinds).toEqual(['ambiguous_records']);
  });

  it('reports missing results and masks custom tool names', () => {
    const name = 'mcp__private-account__write';
    const actionId = recoveryActionHash(name, {});
    const report = inspectRecoveryLedger(envelope({ version: 1, completed: [], uncertain: [actionId], denied: [], blocked: false }),
      [row([{ ...use, name, input: {} }])]);
    expect(report.uncertainActions[0]).toMatchObject({ tools: ['MCP'], resultKinds: ['missing_result'] });
    expect(JSON.stringify(report)).not.toContain('private-account');
  });

  it('rejects changed digests, invalid schemas and foreign proof identities', () => {
    expect(() => inspectRecoveryLedger({ ...envelope(), digest: 'x' }, [])).toThrow('integrity');
    expect(() => inspectRecoveryLedger(envelope({ version: 1, completed: [], uncertain: ['invalid'], denied: [], blocked: false }), [])).toThrow('Corrupt');
    const proof = { actionHash: key, toolUseId: 'tool', sessionId: 'foreign', sdkSessionId: 'native', queryGeneration: 1,
      scope: 'scope', toolName: 'Bash', reason: 'pre-tool-denied' };
    expect(() => inspectRecoveryLedger(envelope({ version: 1, completed: [], uncertain: [], denied: [], blocked: false,
      nativeErrors: [['a'.repeat(64), proof]] }), [])).toThrow('another history');
  });

  it('rejects excessive records and ignores conflicting session identity fields', () => {
    expect(() => inspectRecoveryLedger(envelope(), Array(100_001).fill(null))).toThrow('limit');
    const report = inspectRecoveryLedger(envelope(), [{ ...row([use]), session_id: 'foreign' }]);
    expect(report.foreignRecords).toBe(1);
    expect(report.uncertainActions.every(a => a.occurrences === 0)).toBe(true);
  });
});
