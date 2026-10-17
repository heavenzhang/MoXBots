import type { NativeAttachmentUpload } from './native';

type UploadScope = Pick<NativeAttachmentUpload, 'localId' | 'targetId' | 'identityKey' | 'agentId' | 'uploadId'>;

function matchesScope(upload: NativeAttachmentUpload, scope: UploadScope): boolean {
  return upload.localId === scope.localId && upload.targetId === scope.targetId
    && upload.identityKey === scope.identityKey && upload.agentId === scope.agentId
    && upload.uploadId === scope.uploadId;
}

function isTerminal(upload: NativeAttachmentUpload): boolean {
  return upload.state === 'ready' || upload.state === 'cancelled';
}

/** Keeps event/reply ordering monotonic and lets callers await a scoped native outcome. */
export class AttachmentUploadTracker {
  private readonly latest = new Map<string, NativeAttachmentUpload>();
  private readonly waiters = new Map<string, Set<{
    scope: UploadScope;
    acceptPausedError: boolean;
    resolve: (upload: NativeAttachmentUpload | null) => void;
  }>>();

  publish(incoming: NativeAttachmentUpload): NativeAttachmentUpload {
    const prior = this.latest.get(incoming.localId);
    const next = prior && matchesScope(prior, incoming) && isTerminal(prior) && !isTerminal(incoming)
      ? prior : incoming;
    this.latest.set(incoming.localId, next);
    const waiting = this.waiters.get(next.localId);
    if (waiting) {
      for (const waiter of [...waiting]) {
        if (!matchesScope(next, waiter.scope)) continue;
        if (isTerminal(next) || (waiter.acceptPausedError && next.state === 'paused' && next.errorCode)) {
          waiting.delete(waiter);
          waiter.resolve(next);
        }
      }
      if (waiting.size === 0) this.waiters.delete(next.localId);
    }
    return next;
  }

  current(localId: string): NativeAttachmentUpload | null {
    return this.latest.get(localId) ?? null;
  }

  wait(scope: UploadScope, acceptPausedError = false): Promise<NativeAttachmentUpload | null> {
    const current = this.latest.get(scope.localId);
    if (current && matchesScope(current, scope)
      && (isTerminal(current) || (acceptPausedError && current.state === 'paused' && current.errorCode))) {
      return Promise.resolve(current);
    }
    return new Promise((resolve) => {
      const waiting = this.waiters.get(scope.localId) ?? new Set();
      waiting.add({ scope, acceptPausedError, resolve });
      this.waiters.set(scope.localId, waiting);
    });
  }

  invalidate(): void {
    for (const waiting of this.waiters.values()) for (const waiter of waiting) waiter.resolve(null);
    this.waiters.clear();
    this.latest.clear();
  }
}

export function isConfirmedUploadRecordAbsence(code: string): boolean {
  return code === 'MOBILE_ATTACHMENT_UPLOAD_NOT_FOUND' || code === 'MOBILE_UPLOAD_NOT_FOUND';
}
