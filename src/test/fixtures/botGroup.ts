import type { BotGroup, BotGroupConfiguration } from '../../shared/botGroup';
import type { ProjectSpace } from '../../shared/projectSpaces';

const at = '2026-11-07T00:00:00.000Z';
export const groupCommand: BotGroupConfiguration = { sessionId: 's1', requestId: '074fbff4-335d-414b-9d38-be9896ba499a', expectedRevision: 0, projectRevision: 1, title: '产品协作', memberBotIds: ['root', 'writer'] };
export const groupProject: ProjectSpace = { id: 'project', name: '产品体验', description: '', instructions: '', memberBotIds: ['root', 'writer', 'tester'], materials: [], resources: [], revision: 1, createdAt: at, updatedAt: at };
export function groupFixture(overrides: Partial<BotGroup> = {}): BotGroup {
  return { schemaVersion: 1, groupId: 's1', projectId: 'project', rootBotId: 'root', title: '产品协作', revision: 1,
    createdAt: at, updatedAt: at, historyBoundaryMessageId: null,
    members: ['root', 'writer'].map((botId, index) => ({ botId, name: '小墨', icon: index ? 'bot:moss' : 'bot:spark', workspacePath: `/demo/${botId}`, active: true, joinedAt: at })),
    receipts: [{ requestId: groupCommand.requestId, digest: 'a'.repeat(64), revision: 1 }], ...overrides };
}
