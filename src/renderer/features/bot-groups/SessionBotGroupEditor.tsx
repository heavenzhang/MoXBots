import { useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfigData } from '@/config/useConfigData';
import { loadAppConfig } from '@/config/services/appConfigService';
import { loadProjects } from '@/config/services/projectService';
import { useSessionTaskOrchestrationContext } from '@/components/agent-status/useSessionTaskOrchestration';
import { readProjectSpaces, type ProjectSpace, type ProjectSpaceSessionSnapshot } from '../../../shared/projectSpaces';
import type { BotGroup } from '../../../shared/botGroup';
import BotGroupEditor from './BotGroupEditor';
import { botGroupChoices } from './botGroupUi';

/** Ready for the group Chat entry once real member delivery is wired.
 * Reads/writes through the existing observer and Config owners; no polling.
 * The caller supplies the Session's frozen project snapshot, not a filter.
 */
export default function SessionBotGroupEditor({ sessionId, projectSnapshot, onClose, returnFocusRef }: {
  sessionId: string;
  projectSnapshot: ProjectSpaceSessionSnapshot;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const state = useSessionTaskOrchestrationContext();
  const { config, projects } = useConfigData(); const { t } = useTranslation('app');
  let project: ProjectSpace | undefined;
  try { project = readProjectSpaces(config.projectSpaces).find(value => value.id === projectSnapshot.projectId); } catch { /* Retain the draft while the original config owner recovers. */ }
  const scope = JSON.stringify([sessionId, state?.epoch, projectSnapshot.projectId, projectSnapshot.botId]);
  const [initial, setInitial] = useState<{ scope: string; project: ProjectSpace; group?: BotGroup }>();
  const identityValid = !state?.botGroup || (state.botGroup.projectId === projectSnapshot.projectId && state.botGroup.rootBotId === projectSnapshot.botId);
  if (initial?.scope !== scope && state?.sessionId === sessionId && !state.botGroupUnknown && identityValid && project) setInitial({ scope, project, group: state.botGroup });
  if (!state || state.sessionId !== sessionId || initial?.scope !== scope) {
    return <div role="alert" className="flex items-center gap-3 p-3 text-sm text-[var(--ink-secondary)]">
      <span>{t('botGroups.readFailed')}</span><button type="button" onClick={onClose}>{t('botGroups.close')}</button>
    </div>;
  }
  const initialProject = initial.project;
  return <BotGroupEditor key={scope} sessionId={sessionId} rootBotId={projectSnapshot.botId}
    project={project ?? initialProject} group={initial.group} readUnavailable={state.botGroupUnknown || !project || !identityValid}
    choices={botGroupChoices(project ?? initialProject, config.agents ?? [], projects, state.botGroup ?? initial.group)}
    onClose={onClose} returnFocusRef={returnFocusRef} onSave={state.saveBotGroup} onSaved={onClose}
    onReload={async () => {
      const [group, freshConfig, workspaces] = await Promise.all([state.reloadBotGroup(), loadAppConfig(), loadProjects()]);
      const freshProject = readProjectSpaces(freshConfig.projectSpaces).find(value => value.id === projectSnapshot.projectId);
      if (!freshProject) throw new Error('BOT_GROUP_PROJECT_UNAVAILABLE');
      return { group, project: freshProject, choices: botGroupChoices(freshProject, freshConfig.agents ?? [], workspaces, group) };
    }} />;
}
