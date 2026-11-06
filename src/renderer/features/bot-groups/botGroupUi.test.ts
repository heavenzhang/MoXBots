import { describe, expect, it } from 'vitest';
import { groupFixture, groupProject } from '../../../test/fixtures/botGroup';
import { botGroupChoices } from './botGroupUi';
const bots = ['root', 'writer', 'tester'].map(id => ({ id, name: '同名 Bot', enabled: true }));
const workspaces = bots.map(bot => ({ id: `w-${bot.id}`, path: `/demo/${bot.id}`, agentId: bot.id }));
describe('available group choices', () => {
  it('keeps same-name Bots distinct and rejects ambiguous workspace claims', () => {
    const choices = botGroupChoices(groupProject, bots, [...workspaces, { id: 'duplicate', path: '/another', agentId: 'writer', hidden: true }]);
    expect(choices.map(choice => choice.id)).toEqual(['root', 'writer', 'tester']);
    expect(choices.map(choice => choice.unavailable)).toEqual([false, true, false]);
  });
  it('keeps removed members visible for deselection and cannot treat old snapshots as enabled Bots', () => {
    const choices = botGroupChoices({ ...groupProject, memberBotIds: ['root', 'tester'] }, [bots[0], bots[2]], workspaces, groupFixture());
    expect(choices.find(choice => choice.id === 'writer')).toMatchObject({ name: '小墨', workspacePath: '/demo/writer', unavailable: true });
    expect(botGroupChoices(groupProject, [...bots, bots[0]], workspaces)[0].unavailable).toBe(true);
  });
  it('disables an archived project and disabled Bots without altering source membership', () => {
    expect(botGroupChoices({ ...groupProject, archivedAt: groupProject.updatedAt }, bots, workspaces).every(choice => choice.unavailable)).toBe(true);
    expect(botGroupChoices(groupProject, bots.map(bot => ({ ...bot, enabled: false })), workspaces).every(choice => choice.unavailable)).toBe(true);
    expect(groupProject.memberBotIds).toEqual(['root', 'writer', 'tester']);
  });
});
