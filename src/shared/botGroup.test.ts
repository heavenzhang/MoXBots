import { describe, expect, it } from 'vitest';
import { BOT_GROUP_LIMITS, botGroupConfigurationSchema, botGroupSchema, configureBotGroup, resolveBotGroupMembers, selectBotGroupRecipient, type BotGroupConfiguration } from './botGroup';
import { emptyTaskLedger, mergeTaskObservations, applySessionTaskAction } from './sessionTaskOrchestration';
const at = '2026-11-07T00:00:00Z';
const ids = ['a', 'b', 'c'];
const project = { id: 'project', name: 'Project', description: '', instructions: '', memberBotIds: ids, materials: [], resources: [], revision: 1, createdAt: at, updatedAt: at };
const bots = ids.map(id => ({ id, name: 'Same display name', enabled: true }));
const workspaces = ids.map(id => ({ id: `workspace-${id}`, agentId: id, path: `/${id}` }));
const command = (patch: Partial<BotGroupConfiguration> = {}): BotGroupConfiguration => ({ sessionId: 'root', requestId: '11111111-1111-4111-8111-111111111111', expectedRevision: 0, projectRevision: 1, title: 'Our group', memberBotIds: ['a', 'b'], ...patch });
const resolve = (cmd = command(), overrides: Partial<Parameters<typeof resolveBotGroupMembers>[0]> = {}) => resolveBotGroupMembers({ command: cmd, projectId: 'project', rootBotId: 'a', rootWorkspacePath: '/a', projectSpaces: [project], bots, workspaces, at, ...overrides });
const context = (cmd = command()) => ({ projectId: 'project', rootBotId: 'a', members: resolve(cmd), at, historyBoundaryMessageId: 'private-before-group', digest: 'a'.repeat(64) });
const initial = () => configureBotGroup(undefined, command(), context());
describe('stable Bot group membership and explicit recipient', () => {
  it('keeps same-name Bots distinct and never accepts a client identity snapshot', () => {
    expect(initial().members.map(member => [member.botId, member.workspacePath])).toEqual([['a', '/a'], ['b', '/b']]);
    expect(botGroupConfigurationSchema.safeParse({ ...command(), members: [{ botId: 'b', workspacePath: '/a' }] }).success).toBe(false);
  });
  it('rejects missing, multiple, name-based, inactive or stale recipients without fallback', () => {
    const group = initial();
    for (const input of [undefined, {}, { botId: 'Same display name', groupId: 'root', groupRevision: 1 }, { botIds: ['a', 'b'], groupId: 'root', groupRevision: 1 }, { botId: 'b', groupId: 'root', groupRevision: 0 }]) {
      expect(() => selectBotGroupRecipient(group, input)).toThrow();
    }
    expect(() => selectBotGroupRecipient(group, { botId: 'b', groupId: 'root', groupRevision: 2 })).toThrow('REVISION_CONFLICT');
    expect(selectBotGroupRecipient(group, { botId: 'b', groupId: 'root', groupRevision: 1 }).workspacePath).toBe('/b');
    expect(() => selectBotGroupRecipient({ ...group, groupId: 'another-group' }, { botId: 'b', groupId: 'root', groupRevision: 1 })).toThrow('SESSION_CHANGED');
  });
  it('rejects unavailable, duplicate and non-project Bot identities and ambiguous workspace claims', () => {
    for (const overrides of [
      { bots: [bots[0]] }, { bots: [...bots, bots[1]] }, { bots: bots.map(bot => ({ ...bot, enabled: bot.id !== 'b' })) },
      { workspaces: [...workspaces, { ...workspaces[1], id: 'second', hidden: true }] },
      { projectSpaces: [{ ...project, memberBotIds: ['a'] }] },
    ]) expect(() => resolve(command(), overrides)).toThrow();
  });
  it('does not convert another project, archived project, old project revision or moved root workspace', () => {
    for (const overrides of [{ projectId: 'other' }, { projectSpaces: [{ ...project, archivedAt: at }] }, { rootWorkspacePath: '/other' }]) {
      expect(() => resolve(command(), overrides)).toThrow();
    }
    expect(() => resolve(command({ projectRevision: 2 }))).toThrow('PROJECT_CHANGED');
    expect(() => resolve(command({ memberBotIds: ['b', 'c'] }))).toThrow('ROOT_REQUIRED');
  });
  it('preserves membership identity and original private-history boundary across rename, removal and reactivation', () => {
    const group = initial();
    const cmd = command({ requestId: '22222222-2222-4222-8222-222222222222', expectedRevision: 1, memberBotIds: ['a', 'c'] });
    const next = configureBotGroup(group, cmd, { ...context(cmd), digest: 'b'.repeat(64), historyBoundaryMessageId: 'later', at: '2026-11-07T01:00:00Z' });
    expect(next.members.find(member => member.botId === 'b')?.active).toBe(false);
    expect(next.historyBoundaryMessageId).toBe('private-before-group');
    expect(() => selectBotGroupRecipient(next, { botId: 'b', groupId: 'root', groupRevision: 2 })).toThrow('RECIPIENT_UNAVAILABLE');
    const restoredCmd = command({ requestId: '33333333-3333-4333-8333-333333333333', expectedRevision: 2 });
    const restored = configureBotGroup(next, restoredCmd, { ...context(restoredCmd), digest: 'c'.repeat(64), members: resolve(restoredCmd).map(member => ({ ...member, name: 'Renamed' })) });
    expect(restored.members.find(member => member.botId === 'b')).toMatchObject({ active: true, joinedAt: at, name: 'Renamed' });
    expect(initial()).toEqual(group);
  });
  it('returns the current configuration for an acknowledged request and refuses reused IDs with new content', () => {
    const group = initial();
    expect(configureBotGroup(group, command(), context())).toBe(group);
    expect(() => configureBotGroup(group, command(), { ...context(), digest: 'b'.repeat(64) })).toThrow('REQUEST_CONFLICT');
    expect(() => configureBotGroup(group, command({ requestId: '22222222-2222-4222-8222-222222222222' }), context())).toThrow('REVISION_CONFLICT');
  });
  it('refuses silent workspace rebinding and does not evict receipts to accept a new edit', () => {
    const group = initial();
    const cmd = command({ requestId: '22222222-2222-4222-8222-222222222222', expectedRevision: 1 });
    expect(() => configureBotGroup(group, cmd, { ...context(cmd), members: resolve(cmd).map(member => ({ ...member, workspacePath: '/moved' })) })).toThrow('MEMBER_WORKSPACE_CHANGED');
    const full = { ...group, receipts: Array.from({ length: BOT_GROUP_LIMITS.receipts }, (_, i) => ({ requestId: `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`, digest: 'a'.repeat(64), revision: 1 })) };
    expect(botGroupSchema.safeParse(full).success).toBe(true);
    expect(() => configureBotGroup(full, cmd, context(cmd))).toThrow('HISTORY_LIMIT');
    expect(full.receipts).toHaveLength(BOT_GROUP_LIMITS.receipts);
  });
  it('treats malformed persisted membership as an error rather than an empty group', () => {
    expect(botGroupSchema.safeParse({ ...initial(), members: [initial().members[0], initial().members[0]] }).success).toBe(false);
    expect(botGroupConfigurationSchema.safeParse(command({ memberBotIds: ['a', 'a'] })).success).toBe(false);
  });
  it('preserves group and ordinary ledger fields through existing task mutations and observation', () => {
    const plain = emptyTaskLedger();
    expect(mergeTaskObservations(plain, []).botGroup).toBeUndefined();
    const original = { ...plain, botGroup: initial(), delegationLaunches: 5 };
    const next = applySessionTaskAction(original, { kind: 'ensure', taskId: 'task', title: 'Work', expectedRevision: 0 });
    expect(mergeTaskObservations(next, []).botGroup).toEqual(original.botGroup);
    expect(next.delegationLaunches).toBe(5);
    expect(original.tasks).toEqual([]);
  });
});
