import { viewStillOwned, type ViewOwner } from './operationPolicy.ts';

export type SnapshotReadState = { owner: ViewOwner; status: 'idle' | 'pending' | 'error' | 'success' };
export type SnapshotReadFlight = { owner: ViewOwner };

/** A session read belongs to its view and request, never to unrelated global UI activity. */
export class SnapshotReadTracker {
  private flight: SnapshotReadFlight | null = null;
  private state: SnapshotReadState;

  constructor(owner: ViewOwner) { this.state = { owner: { ...owner }, status: 'idle' }; }

  current(): SnapshotReadState { return this.state; }

  reset(owner: ViewOwner): SnapshotReadState {
    this.flight = null;
    return this.state = { owner: { ...owner }, status: 'idle' };
  }

  pending(owner: ViewOwner): boolean {
    return this.state.status === 'pending' && viewStillOwned(this.state.owner, owner);
  }

  begin(owner: ViewOwner): SnapshotReadFlight | null {
    if (this.pending(owner)) return null;
    this.flight = { owner: { ...owner } };
    this.state = { owner: this.flight.owner, status: 'pending' };
    return this.flight;
  }

  finish(flight: SnapshotReadFlight, owner: ViewOwner, status: 'idle' | 'error' | 'success'): boolean {
    if (this.flight !== flight || !viewStillOwned(flight.owner, owner)) return false;
    this.flight = null;
    this.state = { owner: flight.owner, status };
    return true;
  }

  accept(owner: ViewOwner): SnapshotReadState {
    this.flight = null;
    return this.state = { owner: { ...owner }, status: 'success' };
  }
}

export function snapshotReadStatus(state: SnapshotReadState, owner: ViewOwner): SnapshotReadState['status'] {
  return viewStillOwned(state.owner, owner) ? state.status : 'idle';
}
