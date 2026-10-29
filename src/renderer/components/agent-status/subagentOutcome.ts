import { isSubagentDispatchFailure } from '../../../shared/subagentDispatchFailure';
import type { TaskPhase } from '../../../shared/sessionTaskOrchestration';

/** Shared by the native tool annotation and collaboration row. */
export function subagentDetailAction(phase?: TaskPhase) {
  if (phase === 'failed') return 'orchestration.collaboration.viewError';
  if (phase === 'running') return 'orchestration.collaboration.viewProgress';
  return phase === 'awaiting_review' || phase === 'completed' || phase === 'rework'
    ? 'orchestration.inline.viewResult' : 'orchestration.collaboration.viewExecution';
}

/** A short public result, never an inferred execution/acceptance state. */
export function subagentOutcome(result?: string): { kind: 'planBlocked' | 'dispatchRejected' | 'report'; text?: string } {
  if (isSubagentDispatchFailure(result)) {
    return { kind: /\bPlan\b|规划模式|计划模式/i.test(result ?? '') ? 'planBlocked' : 'dispatchRejected' };
  }
  const text = result?.split('\n').map(line => line.replace(/^\s*[#>*-]+\s*/, '').trim()).find(Boolean);
  return { kind: 'report', text: text?.slice(0, 180) };
}
