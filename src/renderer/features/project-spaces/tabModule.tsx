import { lazy, memo, Suspense } from 'react';
import type { TabModuleDefinition } from '@/tab-workspace/contracts';
import type { SessionMetadata } from '@/api/sessionClient';
import { PAGE_FALLBACK } from '@/tab-workspace/PageFallback';
import type { ProjectSpaceTab } from './tabContract';
const ProjectSpacePage = lazy(() => import('./ProjectSpacePage'));
export interface ProjectSpaceOpenIntent { projectSpaceId: string; title: string }
export interface ProjectSpaceBinding {
  onNewConversation: (projectId: string, botId?: string) => void;
  onOpenConversation: (session: SessionMetadata) => void;
  onCreateBot: () => void;
}
const Renderer = memo(function ProjectSpaceTabRenderer({ tab, isActive, isDeferred, binding }: {
  tab: ProjectSpaceTab; isActive: boolean; isDeferred: boolean; binding: ProjectSpaceBinding;
}) {
  if (isDeferred) return PAGE_FALLBACK;
  return <Suspense fallback={PAGE_FALLBACK}><ProjectSpacePage key={tab.projectSpaceId} projectId={tab.projectSpaceId} isActive={isActive} {...binding} /></Suspense>;
});
export const projectSpaceTabModule = {
  kind: 'projectspace', render: Renderer,
  chrome: tab => ({ title: tab.title }), identity: tab => tab.projectSpaceId,
  open: {
    findExisting: (tabs, intent) => tabs.find(tab => tab.projectSpaceId === intent.projectSpaceId),
    create: (intent, { id }) => ({ id, view: 'projectspace', title: intent.title, projectSpaceId: intent.projectSpaceId }),
    reopen: (tab, intent) => ({ ...tab, title: intent.title }),
  },
  initialMount: () => 'deferred-content',
} satisfies TabModuleDefinition<ProjectSpaceTab, ProjectSpaceOpenIntent, ProjectSpaceBinding>;
