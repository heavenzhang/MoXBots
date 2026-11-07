/** Internal, non-serializable proof for an already bounded Query-owned rejection.
 * This never grants request/tool/retry admission and cannot be supplied by headers.
 */
export type SealedRejectionOwner = Readonly<{ isCurrent: () => boolean }>;
const owners = new WeakMap<Response, SealedRejectionOwner>();

export function isSealedRejectionOwnerCurrent(owner: SealedRejectionOwner | undefined): boolean {
  try { return owner?.isCurrent() === true; } catch { return false; }
}

/** Call only for a complete rejection read back from the existing Query guard. */
export function sealReceivedRejection(response: Response, owner: SealedRejectionOwner): Response {
  if (!response.ok && response.status !== 499 && isSealedRejectionOwnerCurrent(owner)) owners.set(response, owner);
  return response;
}

export function sealedRejectionOwner(response: Response): SealedRejectionOwner | undefined {
  return owners.get(response);
}
