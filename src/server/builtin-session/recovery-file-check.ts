import { open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import type { RecoveryResultCheck } from '../../shared/recoveryReconciliation';
const LIMIT = 2 * 1024 * 1024;
const digest = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
/** Read only an exact original Write target within its existing workspace. Never execute a shell or follow a target symlink. */
export async function checkRecoveryFile(workspace: string, name: string, input: Record<string, unknown>): Promise<RecoveryResultCheck> {
  if (name !== 'Write' || typeof input.file_path !== 'string' || typeof input.content !== 'string') return { kind: 'external_check_required' };
  if (!workspace || !isAbsolute(input.file_path) || Buffer.byteLength(input.content) > LIMIT) return { kind: 'file_unavailable' };
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const root = await realpath(workspace);
    const target = resolve(input.file_path);
    const parent = await realpath(resolve(target, '..'));
    const within = relative(root, parent);
    if (within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) return { kind: 'file_outside_workspace' };
    if (typeof constants.O_NOFOLLOW !== 'number') return { kind: 'file_unavailable' };
    file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = await file.stat();
    if (!before.isFile() || before.size > LIMIT) return { kind: 'file_unavailable' };
    const bytes = Buffer.alloc(Math.min(LIMIT + 1, before.size + 1));
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    const after = await file.stat();
    if (before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytesRead !== before.size)
      return { kind: 'file_changed' };
    const matches = digest(bytes.subarray(0, bytesRead)) === digest(input.content);
    return { kind: matches ? 'file_matches' : 'file_differs', checkedAt: new Date().toISOString() };
  } catch (error) {
    return { kind: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'file_missing' : 'file_unavailable' };
  } finally { await file?.close(); }
}
