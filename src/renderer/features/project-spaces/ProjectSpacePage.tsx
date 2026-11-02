import { useTranslation } from 'react-i18next';
import { useConfigData } from '@/config/useConfigData';
import { useTaskCenterData } from '@/hooks/useTaskCenterData';
import { mutateProjectSpace, loadProjectSpace } from '@/config/services/projectSpaceService';
import { isAutomationHistoryOrigin } from '../../../shared/session-origin';
import { isSystemMaintenanceSession } from '../../../shared/managedScheduledJob';
import { readProjectSpaces, type ProjectSpace } from '../../../shared/projectSpaces';
import type { ProjectSpaceBinding } from './tabModule';
import ProjectSpaceView from './ProjectSpaceView';
export default function ProjectSpacePage({ projectId, isActive, onNewConversation, onOpenConversation, onCreateBot }: ProjectSpaceBinding & { projectId: string; isActive: boolean }) {
  const { config } = useConfigData(); const data = useTaskCenterData({ isActive }); const { t } = useTranslation('app');
  let project: ProjectSpace | undefined; let invalid = false;
  try { project = readProjectSpaces(config.projectSpaces).find(item => item.id === projectId); } catch { invalid = true; }
  if (!project) return <div role="alert" className="p-8 text-sm text-[var(--ink-secondary)]">{t(`projectSpaces.${invalid ? 'readFailed' : 'notFound'}`)}</div>;
  return <ProjectSpaceView key={project.id} project={project} bots={config.agents ?? []}
    sessions={data.sessions.filter(session => !isAutomationHistoryOrigin(session.origin, session) && !isSystemMaintenanceSession(session))}
    loading={data.isSessionsLoading} readError={data.sessionsError}
    onSave={(draft, expectedRevision) => mutateProjectSpace({ kind: 'update', id: projectId, draft, expectedRevision, at: new Date().toISOString() })}
    onArchive={(archived, expectedRevision) => mutateProjectSpace({ kind: 'archive', id: projectId, archived, expectedRevision, at: new Date().toISOString() })}
    onReload={() => loadProjectSpace(projectId)}
    onNewConversation={botId => onNewConversation(projectId, botId)} onOpenConversation={onOpenConversation} onCreateBot={onCreateBot}
    onRefresh={() => data.refresh('sessions', { force: true })} />;
}
