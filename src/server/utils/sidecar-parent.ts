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
