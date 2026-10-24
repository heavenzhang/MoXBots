import { describe, expect, it } from 'vitest';
import { assertDshProductInputMatches, fingerprintDshProductInput, replayDshProductInput } from './dsh-root-operation';
import type { PendingDshRootOperation, SessionMessage } from '../types/session';

const user: SessionMessage = { id: 'human-1', role: 'user', content: 'Implement and verify', timestamp: '2026-10-25T00:00:00Z' };
const reminder = '<system-reminder>[task:work:plan:step-1] Implement</system-reminder>';
function operation(hint?: string): PendingDshRootOperation & { runtimeReminder?: string } {
  return { schemaVersion: 1, clientOperationId: 'operation-1', clientUserMessageId: user.id,
    sourceRuntimeSessionId: 'native-1', productImageSha256: [], ...(hint ? { runtimeReminder: hint } : {}),
    productInputFingerprint: fingerprintDshProductInput(user, 'operation-1', [], hint) };
}
describe('DSH private reminder recovery', () => {
  it('recovers the original native payload while keeping the Product user untouched', () => {
    const journal = JSON.parse(JSON.stringify(operation(reminder))) as PendingDshRootOperation;
    expect(replayDshProductInput(journal, user).message).toBe(`${user.content}\n${reminder}`);
    expect(user.content).toBe('Implement and verify');
  });
  it('binds the private reminder and raw input so neither can change on recovery', () => {
    const original = operation(reminder);
    expect(() => assertDshProductInputMatches({ ...original, runtimeReminder: reminder + ' changed' }, user)).toThrow();
    expect(() => assertDshProductInputMatches(original, { ...user, content: 'Different authorized scope' })).toThrow();
  });
  it('retains the legacy fingerprint and replay when there is no private reminder', () => {
    expect(operation().productInputFingerprint).toBe(fingerprintDshProductInput(user, 'operation-1', []));
    expect(operation().productInputFingerprint).toBe('f1dd95b445601ecbcb17edff0c97fec03c708ec8967c2bac3ca9190c02ce43eb');
    expect(replayDshProductInput(operation(), user).message).toBe(user.content);
  });
  it('rejects invalid or unbounded reminder data from persisted input', () => {
    expect(() => fingerprintDshProductInput(user, 'operation-1', [], 'x'.repeat(512 * 1024 + 1))).toThrow();
  });
});
