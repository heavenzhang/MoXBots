import type { ProjectSpaceSessionSnapshot } from '../../../shared/projectSpaces';
export function projectSpaceSnapshot(workspacePath: string, projectId = 'A', botId = 'bot'): ProjectSpaceSessionSnapshot {
  return { schemaVersion: 1, projectId, projectName: `Project ${projectId}`, projectRevision: 1,
    botId, botName: `Bot ${botId}`, workspacePath, capturedAt: '2026-11-02T00:00:00Z',
    description: `${projectId}-fixed-description`, instructions: `${projectId}-fixed-instructions`,
    materials: [{ id: 'material', title: 'Reference', content: `${projectId}-material-secret` }],
    resources: [{ id: 'directory', label: 'Directory reference', path: '/reference-only' }] };
}
