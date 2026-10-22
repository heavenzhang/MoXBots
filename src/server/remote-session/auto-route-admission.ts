import { isDeepStrictEqual } from 'node:util';
import { normalizeModelMode } from '../../shared/autoRoute';
import { isConcreteProviderRoute } from '../../shared/providerRoute';
import type { AutoRouteSnapshotAdmission, SessionMetadata } from '../types/session';
import { RemoteSessionError } from './receipts';

// Exactly the fields written by automatic routing. All other desired execution
// fields remain under the original observation, including permissions and tools.
const ROUTE_FIELDS = ['configSnapshotAt', 'providerId', 'providerRoute',
  'providerExecutionIdentity', 'providerEnvJson', 'model', 'reasoningEffort'] as const;

function identity(snapshot: SessionMetadata) {
  return [snapshot.id, snapshot.agentDir, snapshot.modelMode, snapshot.sdkSessionId,
    snapshot.unifiedSession, snapshot.materializationState,
    snapshot.materializationSourceSessionId, snapshot.hostBotBinding];
}

/** One process-local, one-CAS acknowledgement, bound to the original remote
 * operation. Advancing it never changes the durable receipt or its authority. */
export function createRemoteAutoRouteSnapshotAdmission(args: {
  initial: SessionMetadata;
  observation: string;
  observe: (snapshot: SessionMetadata) => string;
  current: () => SessionMetadata | null | undefined;
  isOwnerCurrent: () => boolean;
}): AutoRouteSnapshotAdmission {
  const originalIdentity = structuredClone(identity(args.initial));
  let expected = args.observation;
  let applied = false;
  const matches = (snapshot: SessionMetadata | null | undefined, observation: string) =>
    !!snapshot && args.isOwnerCurrent() && isDeepStrictEqual(identity(snapshot), originalIdentity)
      && args.observe(snapshot) === observation;
  return {
    isCurrent: snapshot => matches(snapshot, expected),
    didApply(before, after) {
      const unchanged = { ...after };
      for (const key of ROUTE_FIELDS) {
        (unchanged as unknown as Record<string, unknown>)[key] = before[key];
      }
      const afterObservation = args.observe(after);
      if (applied || !matches(before, expected)
        || normalizeModelMode(before.modelMode) !== 'auto' || (before.runtime ?? 'builtin') !== 'builtin'
        || before.providerExecutionIdentity || after.providerExecutionIdentity
        || !after.configSnapshotAt || after.providerEnvJson !== undefined
        || !isConcreteProviderRoute(after.providerRoute)
        || after.providerRoute.providerId !== after.providerId || after.providerRoute.model !== after.model
        || args.observe(unchanged) !== expected
        || !matches(after, afterObservation) || !matches(args.current(), afterObservation)) {
        throw new RemoteSessionError('REMOTE_SESSION_OWNER_CHANGED');
      }
      expected = afterObservation;
      applied = true;
    },
  };
}
