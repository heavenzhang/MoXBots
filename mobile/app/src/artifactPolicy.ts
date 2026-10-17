import type { ArtifactDownload } from './native';

export type ArtifactOwner = { targetId: string; identityKey: string; agentId: string; sessionId: string };
export type ArtifactDownloadFlight = { epoch: number; artifactId: string; eventVersion: number };
export type ArtifactRowFlight = { epoch: number; artifactId: string; sequence: number };

function sameOwner(left: ArtifactOwner, right: ArtifactOwner): boolean {
  return left.targetId === right.targetId && left.identityKey === right.identityKey
    && left.agentId === right.agentId && left.sessionId === right.sessionId;
}

/** Fences native replies and event callbacks to the visible target/session and its latest event. */
export class ArtifactDownloadTracker {
  private owner: ArtifactOwner | null = null;
  private epoch = 0;
  private eventVersions = new Map<string, number>();
  private latestValues = new Map<string, ArtifactDownload>();
  private unknownArtifacts = new Set<string>();

  activate(owner: ArtifactOwner): number {
    this.owner = owner;
    this.epoch += 1;
    this.eventVersions.clear();
    this.latestValues.clear();
    this.unknownArtifacts.clear();
    return this.epoch;
  }

  blur(): void {
    this.owner = null;
    this.epoch += 1;
    this.eventVersions.clear();
    this.latestValues.clear();
    this.unknownArtifacts.clear();
  }

  isCurrent(epoch: number, owner?: ArtifactOwner): boolean {
    return this.epoch === epoch && this.owner !== null && (!owner || sameOwner(this.owner, owner));
  }

  begin(artifactId: string, epoch: number): ArtifactDownloadFlight {
    return { epoch, artifactId, eventVersion: this.eventVersions.get(artifactId) ?? 0 };
  }

  acceptEvent(event: ArtifactDownload, epoch: number): boolean {
    if (!this.isCurrent(epoch) || !this.matches(event)) return false;
    this.eventVersions.set(event.artifactId, (this.eventVersions.get(event.artifactId) ?? 0) + 1);
    this.latestValues.set(event.artifactId, event);
    this.unknownArtifacts.delete(event.artifactId);
    return true;
  }

  acceptReply(reply: ArtifactDownload, flight: ArtifactDownloadFlight): boolean {
    const accepted = this.isCurrent(flight.epoch) && reply.artifactId === flight.artifactId
      && (this.eventVersions.get(flight.artifactId) ?? 0) === flight.eventVersion && this.matches(reply);
    if (accepted) { this.latestValues.set(reply.artifactId, reply); this.unknownArtifacts.delete(reply.artifactId); }
    return accepted;
  }

  acceptAbsence(flight: ArtifactDownloadFlight): boolean {
    if (!this.isCurrent(flight.epoch) || (this.eventVersions.get(flight.artifactId) ?? 0) !== flight.eventVersion) return false;
    this.eventVersions.set(flight.artifactId, flight.eventVersion + 1);
    this.latestValues.delete(flight.artifactId);
    this.unknownArtifacts.delete(flight.artifactId);
    return true;
  }

  forget(artifactId: string, epoch: number): boolean {
    if (!this.isCurrent(epoch)) return false;
    this.eventVersions.set(artifactId, (this.eventVersions.get(artifactId) ?? 0) + 1);
    this.latestValues.delete(artifactId);
    this.unknownArtifacts.delete(artifactId);
    return true;
  }

  markUnknown(artifactId: string, epoch: number): boolean {
    if (!this.isCurrent(epoch)) return false;
    this.unknownArtifacts.add(artifactId);
    return true;
  }

  isUnknown(artifactId: string, epoch: number): boolean {
    return this.isCurrent(epoch) && this.unknownArtifacts.has(artifactId);
  }

  latest(artifactId: string, epoch: number): ArtifactDownload | null {
    return this.isCurrent(epoch) ? this.latestValues.get(artifactId) ?? null : null;
  }

  private matches(value: ArtifactDownload): boolean {
    return !!this.owner && value.targetId === this.owner.targetId && value.identityKey === this.owner.identityKey
      && value.agentId === this.owner.agentId && value.sessionId === this.owner.sessionId;
  }
}

/** Locks row actions to a specific screen epoch; stale finally blocks cannot release a new lock. */
export class ArtifactRowBusyTracker {
  private sequence = 0;
  private flights = new Map<string, ArtifactRowFlight>();

  claim(artifactId: string, epoch: number): ArtifactRowFlight | null {
    if (this.flights.has(artifactId)) return null;
    const flight = { artifactId, epoch, sequence: ++this.sequence };
    this.flights.set(artifactId, flight);
    return flight;
  }

  release(flight: ArtifactRowFlight): boolean {
    const current = this.flights.get(flight.artifactId);
    if (!current || current.epoch !== flight.epoch || current.sequence !== flight.sequence) return false;
    this.flights.delete(flight.artifactId);
    return true;
  }

  reset(): void {
    this.flights.clear();
  }
}

export function artifactListBelongsToOwner(value: { targetId: string; identityKey: string; agentId: string; sessionId: string }, owner: ArtifactOwner): boolean {
  return sameOwner(value, owner);
}

export function artifactEventMatchesDescriptor(event: ArtifactDownload, descriptor: ArtifactDescriptorShape, owner: ArtifactOwner): boolean {
  return sameOwner(event, owner) && event.artifactId === descriptor.artifactId && event.name === descriptor.name
    && event.mimeType === descriptor.mimeType && event.sha256 === descriptor.sha256 && event.totalBytes === descriptor.sizeBytes;
}

type ArtifactDescriptorShape = { artifactId: string; name: string; mimeType: string; sha256: string; sizeBytes: number };

/** Runs bounded read-only status checks sequentially and stops before dispatching another when ownership is lost. */
export async function restoreArtifactStatuses<T extends { artifactId: string }>(
  items: readonly T[],
  isCurrent: () => boolean,
  shouldCheck: (artifactId: string) => boolean,
  query: (item: T) => Promise<void>,
  limit = 20,
): Promise<void> {
  for (const item of items.slice(0, limit)) {
    if (!isCurrent()) return;
    if (!shouldCheck(item.artifactId)) continue;
    await query(item);
  }
}
