import { isSessionPlanConfirmed, type SessionPlanProposal } from './sessionPlanConfirmation';
import type { SessionTaskLedger, SessionTaskView, TaskPhase } from './sessionTaskOrchestration';

export type SessionPlanExecutionPhase = TaskPhase | 'confirmed' | 'queued' | 'starting';
export interface SessionPlanExecution {
  phase: SessionPlanExecutionPhase;
  total: number;
  completed: number;
  steps: { step: SessionPlanProposal['content']['steps'][number]; task?: SessionTaskView; phase: TaskPhase }[];
}

/** Read-only projection of the current confirmed version, never an execution owner. */
export function projectSessionPlanExecution(
  proposal: SessionPlanProposal,
  tasks: readonly SessionTaskView[],
  start?: SessionTaskLedger['planStart'],
): SessionPlanExecution | undefined {
  if (!isSessionPlanConfirmed(proposal)) return;
  const receipt = start?.proposalId === proposal.id && start.revision === proposal.revision && start.purpose !== 'revision' ? start : undefined;
  const steps = proposal.content.steps.map(step => {
    const task = tasks.find(task => !task.retired && task.id === step.id && task.proposalId === proposal.id && task.proposalRevision === proposal.revision);
    return { step, task, phase: task?.phase ?? (receipt?.state === 'dispatched' ? 'unknown' : 'pending') as TaskPhase };
  });
  const completed = steps.filter(item => item.phase === 'completed').length;
  const phases = steps.map(item => item.phase);
  let phase: SessionPlanExecutionPhase;
  if (steps.length > 0 && completed === steps.length) phase = 'completed';
  else if (receipt?.error) phase = 'unknown';
  else if (phases.includes('failed')) phase = 'failed';
  else if (phases.includes('rework')) phase = 'rework';
  else if (phases.includes('interrupted')) phase = 'interrupted';
  else if (phases.includes('unknown')) phase = 'unknown';
  else if (phases.includes('running')) phase = 'running';
  else if (phases.includes('awaiting_review')) phase = 'awaiting_review';
  else if (receipt?.state === 'pending') phase = 'queued';
  else if (receipt?.state === 'claimed') phase = 'starting';
  else if (phases.includes('pending') && steps.some(item => item.task)) phase = 'pending';
  else if (phases.includes('blocked')) phase = 'blocked';
  else if (receipt?.state === 'dispatched' || steps.some(item => item.task)) phase = 'pending';
  else phase = 'confirmed';
  return { phase, steps, total: steps.length, completed };
}
