import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SkillInstallError } from './installer';

/** The recursive importer skips links, so its entry must be an actual file. */
export function readSkillFolderEntry(folder: string): string {
  let descriptor: number | undefined;
  try {
    const path = join(folder, 'SKILL.md');
    if (!lstatSync(path).isFile()) throw new Error('Not a regular file');
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    if (!fstatSync(descriptor).isFile()) throw new Error('Not a regular file');
    return readFileSync(descriptor, 'utf8');
  } catch {
    throw new SkillInstallError('SKILL.md must be a readable regular file, not a symbolic link', 400);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
