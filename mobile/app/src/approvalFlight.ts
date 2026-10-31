import type { Interaction, Snapshot, Target } from './native';
export function approvalFlightKey(target: Target, snapshot: Pick<Snapshot,'sessionId'>, item: Interaction): string {
  return JSON.stringify([target.identityKey,target.agentId,snapshot.sessionId,item.generation,item.turnId,item.requestId]);
}
/** Navigation cannot unlock an already submitted request; unrelated requests remain independent. */
export class ApprovalFlights {
  private flights = new Map<string, symbol>();
  claim(key: string): symbol | null { if(this.flights.has(key))return null;const token=Symbol('approval');this.flights.set(key,token);return token; }
  release(key: string, token: symbol): boolean { if(this.flights.get(key)!==token)return false;this.flights.delete(key);return true; }
}
