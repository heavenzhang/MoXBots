/** Rust owns desktop Sidecar lifetime. Unix does not close a process group
 * when its owner dies without running Drop; retire the orphan through the
 * existing shutdown path instead of letting it keep executing beside a new app.
 * Windows uses the existing kill-on-close Job Object for this boundary. */
export function watchSidecarParent(
  expectedParent: string,
  onParentExit: () => void,
  getParentPid: () => number = () => process.ppid,
): () => void {
  if (!/^[1-9]\d*$/u.test(expectedParent) || !Number.isSafeInteger(Number(expectedParent))
    || Number(expectedParent) <= 1) {
    throw new Error('Invalid desktop Sidecar parent identity');
  }
  const parentPid = Number(expectedParent);
  let retired = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    retired = true;
    if (timer) clearInterval(timer);
  };
  const check = () => {
    // Read the OS parent relationship, not PID existence: a recycled PID
    // cannot acquire authority over this already-reparented child.
    if (!retired && getParentPid() !== parentPid) {
      stop();
      onParentExit();
    }
  };
  check();
  if (!retired) {
    timer = setInterval(check, 1_000);
    timer.unref();
  }
  return stop;
}

/** Desktop Unix Sidecars are process-group leaders created by Rust spawn_tree.
 * If Rust died before Drop, retain that same exact group boundary here. Start
 * the normal shutdown first so our SIGTERM handler is idempotent and Product
 * can drain, while native/tool descendants receive their own termination. */
export function retireOrphanedSidecar(onShutdown: () => void): void {
  onShutdown();
  signalOrphanedSidecarGroup('SIGTERM');
}

/** The desktop Sidecar remains the group leader until its bounded drain ends.
 * SIGKILL at every desktop shutdown mirrors Rust's escalation, including tools
 * that ignore SIGTERM or parent loss faster than a monitor tick. Do not use
 * this for a standalone server or a PID discovered by scan. */
export function signalOrphanedSidecarGroup(signal: 'SIGTERM' | 'SIGKILL'): void {
  try {
    process.kill(-process.pid, signal);
  } catch (error) {
    // An already-retired/absent group still completes normal local shutdown.
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      console.warn('[process] orphaned Sidecar group termination failed:', error);
    }
  }
}
