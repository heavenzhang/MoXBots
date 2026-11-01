import type { TFunction } from 'i18next';
import { ProjectSpaceError, type ProjectSpace, type ProjectSpaceDraft } from '../../../shared/projectSpaces';
export function projectSpaceErrorText(error: unknown, t: TFunction): string {
  const keys = { invalid: 'invalid', 'not-found': 'notFound', archived: 'draftArchived', 'revision-conflict': 'stale', 'bot-not-member': 'botNotMember', 'bot-unavailable': 'botUnavailable', 'workspace-conflict': 'workspaceConflict', immutable: 'contextChanged' } as const;
  return t(`projectSpaces.${error instanceof ProjectSpaceError ? keys[error.code] : 'saveFailed'}`);
}
export function projectSpaceDraft(project?: ProjectSpace): ProjectSpaceDraft {
  return project ? structuredClone({ name: project.name, description: project.description, instructions: project.instructions, memberBotIds: project.memberBotIds, materials: project.materials, resources: project.resources }) : { name: '', description: '', instructions: '', memberBotIds: [], materials: [], resources: [] };
}
