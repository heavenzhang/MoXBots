import { readProjectSpaces, normalizeProjectSpaceDraft, ProjectSpaceError, applyProjectSpaceMutation, type ProjectSpace, type ProjectSpaceMutation } from '../../../shared/projectSpaces';
import { loadAppConfig, atomicModifyConfig } from './appConfigService';
/** The existing ConfigStore lock reloads the latest disk state before mutation. */
export async function mutateProjectSpace(command: ProjectSpaceMutation): Promise<ProjectSpace> {
  let saved;
  try {
    saved = await atomicModifyConfig(config => ({
      ...config,
      projectSpaces: applyProjectSpaceMutation(config.projectSpaces, command, config.agents ?? []),
    }));
  } catch (cause) {
    if (command.kind === 'create') {
      // A disk acknowledgement can be lost after the atomic write. Reconcile
      // the same stable create ID; a retry must never manufacture a new project.
      try {
        const original = await loadProjectSpace(command.id);
        const { name, description, instructions, memberBotIds, materials, resources } = original;
        if (JSON.stringify(normalizeProjectSpaceDraft({ name, description, instructions, memberBotIds, materials, resources })) === JSON.stringify(normalizeProjectSpaceDraft(command.draft))) return original;
      } catch { /* Preserve the original failure when its outcome cannot be read. */ }
    }
    throw cause;
  }
  const project = saved.projectSpaces?.find(item => item.id === command.id);
  if (!project) throw new Error('Saved project was not found');
  return project;
}

export async function loadProjectSpace(id: string): Promise<ProjectSpace> {
  const project = readProjectSpaces((await loadAppConfig()).projectSpaces).find(item => item.id === id);
  if (!project) throw new ProjectSpaceError('not-found', 'Project no longer exists');
  return project;
}
