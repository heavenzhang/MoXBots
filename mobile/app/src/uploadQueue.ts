/** Serializes upload jobs while allowing an owner switch to invalidate queued work. */
export class SerialUploadQueue {
  private ownerEpoch = 0;
  private tail: Promise<void> = Promise.resolve();

  currentEpoch(): number { return this.ownerEpoch; }

  invalidate(): void { this.ownerEpoch += 1; }

  enqueue(epoch: number, job: (isCurrent: () => boolean) => Promise<void>): Promise<void> {
    const run = this.tail.catch(() => undefined).then(async () => {
      const isCurrent = () => epoch === this.ownerEpoch;
      if (isCurrent()) await job(isCurrent);
    });
    this.tail = run.catch(() => undefined);
    return run;
  }
}

/** System pickers may return before Android restores window focus. The native
 * foreground check remains authoritative; this only delays the queued request. */
export function waitForUploadForeground(
  isReady: () => boolean,
  isCurrent: () => boolean,
  subscribe: (check: () => void) => () => void,
  timeoutMs = 5000,
): Promise<boolean> {
  if (!isCurrent()) return Promise.resolve(false);
  if (isReady()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    let unsubscribe = () => {};
    const finish = (ready: boolean) => {
      if (done) return;
      done = true;
      unsubscribe();
      clearTimeout(timer);
      resolve(ready);
    };
    const check = () => {
      if (!isCurrent()) finish(false);
      else if (isReady()) finish(true);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    try { unsubscribe = subscribe(check); }
    catch { finish(false); return; }
    // A subscription may report its state synchronously.
    if (done) { unsubscribe(); return; }
    check();
  });
}
