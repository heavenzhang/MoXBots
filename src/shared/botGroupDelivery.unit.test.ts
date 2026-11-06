import { describe, expect, it } from 'vitest';
import { assertBotGroupDispatchClaim, botGroupDeliverySchema, botGroupSendSchema, BOT_GROUP_DELIVERY_LIMITS,
  boundedGroupText, readBotGroupDeliveries, renderBotGroupHistory } from './botGroupDelivery';
import type { SessionTaskLedger } from './sessionTaskOrchestration';
import fixture from './__fixtures__/bot-group-delivery.json';

const ledger = () => structuredClone(fixture.baseline.sessions[0].taskOrchestration) as unknown as SessionTaskLedger;
function validate(value: typeof fixture.baseline) {
  return assertBotGroupDispatchClaim(value.sessions[0].taskOrchestration as unknown as SessionTaskLedger, value.binding, {
    sessionId: value.binding.targetSessionId, messageId: value.binding.messageId,
    botId: value.botId, workspacePath: value.workspacePath, text: value.prompt,
  });
}
describe('Bot group delivery bounded contract and native parity cases', () => {
  it('accepts the original exact persisted claim', () => expect(validate(fixture.baseline).claim.botId).toBe('other'));
  it.each(fixture.cases)('rejects $name before target admission', test => {
    const input = structuredClone(fixture.baseline);
    const path = test.path.split('/').slice(1);
    let parent = input as unknown as Record<string, unknown>;
    for (const key of path.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
    parent[path.at(-1)!] = test.value;
    expect(() => validate(input)).toThrow();
  });
  it('allows an in-flight target to finish admission after its ACK became unknown, not after a result', () => {
    const input = structuredClone(fixture.baseline); input.sessions[0].taskOrchestration.botGroupDeliveries[0].state = 'unconfirmed';
    expect(validate(input).claim.state).toBe('unconfirmed');
    input.sessions[0].taskOrchestration.botGroupDeliveries[0].state = 'completed';
    expect(() => validate(input)).toThrow();
  });
  it('rejects duplicate planned identities and a missing group instead of inventing history', () => {
    const value = ledger(); value.botGroupDeliveries!.push({ ...value.botGroupDeliveries![0] });
    expect(() => readBotGroupDeliveries(value)).toThrow();
    const missing = ledger(); delete missing.botGroup;
    expect(() => readBotGroupDeliveries(missing)).toThrow();
  });
  it('requires explicit recipient and bounds multilingual input in bytes', () => {
    const command = { sessionId: 'group-root', requestId: fixture.baseline.binding.requestId,
      recipient: { groupId: 'group-root', botId: 'other', groupRevision: 1 }, text: '你'.repeat(2730) };
    expect(botGroupSendSchema.safeParse(command).success).toBe(true);
    expect(botGroupSendSchema.safeParse({ ...command, text: command.text + '你' }).success).toBe(false);
    expect(botGroupSendSchema.safeParse({ ...command, recipient: undefined }).success).toBe(false);
    expect(botGroupSendSchema.safeParse({ ...command, broadcast: true }).success).toBe(false);
  });
  it('does not accept a completed result without a real terminal turn', () => {
    const value = ledger().botGroupDeliveries![0];
    expect(botGroupDeliverySchema.safeParse({ ...value, state: 'completed' }).success).toBe(false);
    expect(botGroupDeliverySchema.safeParse({ ...value, state: 'completed', result: { eventId: 'event', text: 'done', payloadSha256: 'b'.repeat(64),
      truncated: false, terminalStatus: 'complete', receivedAt: value.createdAt } }).success).toBe(false);
  });
  it('bounds UTF-8 excerpts including their marker and never includes future messages or rejected requests', () => {
    const first = botGroupDeliverySchema.parse(ledger().botGroupDeliveries![0]);
    const result = { eventId: 'event', turnId: 'turn', payloadSha256: 'b'.repeat(64), text: '你'.repeat(10000), truncated: false, terminalStatus: 'complete' as const, receivedAt: first.createdAt };
    const past = { ...first, state: 'completed' as const, result };
    const current = { ...first, requestId: 'current', text: 'CURRENT SECRET' };
    const future = { ...first, requestId: 'future', text: 'FUTURE SECRET' };
    const rejected = { ...first, requestId: 'rejected', state: 'rejected' as const, text: 'REJECTED SECRET' };
    const text = renderBotGroupHistory([rejected, past, current, future], 'current');
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(BOT_GROUP_DELIVERY_LIMITS.contextBytes);
    expect(text).toContain('[Excerpt]'); expect(text).toContain('你'); expect(text).not.toContain('SECRET');
    expect(() => renderBotGroupHistory([past], 'missing')).toThrow('NOT_FOUND');
    expect(boundedGroupText('😀你x', 6)).toEqual({ text: '😀', truncated: true });
  });
});
