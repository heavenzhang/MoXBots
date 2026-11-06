import type { SessionMetadata } from '@/api/sessionClient';
import type { Task } from '../../../shared/types/task';
import { workspacePathsEqual } from '../../../shared/workspacePath';
import { isManagedScheduledJob, isSystemMaintenanceSession } from '../../../shared/managedScheduledJob';
import { isAutomationHistoryOrigin } from '../../../shared/session-origin';
import { boardGoalState, freshActivity, type ActivitySnapshot } from '../project-board/projection';

/** A Bot's workspace can serve many projects; membership is never a join key. */
export function projectWorkSessions(projectId: string, sessions: readonly SessionMetadata[]) {
  return sessions.filter(session => session.projectSpace?.projectId === projectId &&
    workspacePathsEqual(session.agentDir, session.projectSpace.workspacePath) &&
    !isSystemMaintenanceSession(session) && !isAutomationHistoryOrigin(session.origin, session))
    .sort((a, b) => Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt) || a.id.localeCompare(b.id));
}

export type ProjectWorkStatus = 'running' | 'attention' | 'completed' | 'idle' | 'unknown' | 'todo';
export interface ProjectWorkRow {
  id: string;
  title: string;
  session: SessionMetadata;
  status: ProjectWorkStatus;
  taskId?: string;
  summary?: string;
}

export function projectSpaceWorkRows(sessions: readonly SessionMetadata[], tasks: readonly Task[], activity: ReadonlyMap<string, ActivitySnapshot>, now: number): ProjectWorkRow[] {
  const byId = new Map(sessions.map(session => [session.id, session]));
  const rows: ProjectWorkRow[] = [];
  const represented = new Set<string>();
  for (const task of tasks) {
    if (task.deleted || task.status === 'deleted' || isManagedScheduledJob(task) || !task.sessionIds.length) continue;
    // A mixed or partially unknown history is not proof this Task belongs to
    // one logical project. Do not expose another project's work by Bot/path.
    if (!task.sessionIds.every(id => byId.has(id))) continue;
    const linked = sessions.filter(session => task.sessionIds.includes(session.id));
    if (task.workspacePath && linked.some(session => !workspacePathsEqual(session.agentDir, task.workspacePath!))) continue;
    const session = linked.find(item => item.id === task.lastExecution?.sessionId) ?? linked[0];
    if (!session) continue;
    // TaskStore permits only Done -> Archived; Session archival has no such meaning.
    const completed = task.status === 'done' || task.status === 'archived';
    const status: ProjectWorkStatus = task.executionState === 'running' || task.executionState === 'stopping' ? 'running'
      : task.executionState === 'stop_failed' || task.status === 'blocked' || task.status === 'stopped' || task.status === 'verifying' ? 'attention'
      : completed ? 'completed' : task.status === 'running' && task.executor === 'user' ? 'running'
      : task.status === 'running' && task.executionMode === 'once' ? 'unknown' : 'todo';
    if (!completed && session.archived) continue;
    rows.push({ id: `task:${task.id}`, taskId: task.id, title: task.name, session, status, summary: task.description });
    if (status !== 'completed') for (const item of linked) represented.add(item.id);
  }
  for (const session of sessions) {
    if (session.archived || represented.has(session.id)) continue;
    const snapshot = activity.get(session.id);
    const goal = boardGoalState(snapshot, now);
    const live = freshActivity(snapshot, now);
    const status: ProjectWorkStatus = live === 'running' || goal === 'running' ? 'running'
      : live === 'waiting_user_action' || ['blocked', 'paused', 'stopped'].includes(goal ?? '') || session.continuation && session.continuation.status !== 'running' ? 'attention'
      : snapshot?.error || goal === 'unknown' ? 'unknown'
      : goal === 'complete' ? 'completed' : !live ? 'unknown' : 'idle';
    // Idle means available; only an explicit Task/Goal terminal proves completion.
    rows.push({ id: `session:${session.id}`, title: session.title, session, status,
      summary: snapshot?.progress?.todos.find(todo => todo.status === 'in_progress')?.activeForm });
  }
  const rank: Record<ProjectWorkStatus, number> = { attention: 0, running: 1, todo: 2, unknown: 3, idle: 4, completed: 5 };
  return rows.sort((a, b) => rank[a.status] - rank[b.status] || Date.parse(b.session.lastActiveAt) - Date.parse(a.session.lastActiveAt));
}
