import { chmodSync, constants, copyFileSync, mkdirSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { prepareSharpRuntime } from '../prepare-sharp-runtime.mjs';
import { validateSharpRuntime } from '../npm-runtime-validation.mjs';

// The Host installer permits only regular files. npm's validated, in-tree .bin
// symlinks must become independent files in this release, never shared cache inodes.
export async function stageHostImageRuntime(resources, { prepare = prepareSharpRuntime, validate = validateSharpRuntime } = {}) {
  const prepared = await prepare('linux', 'x64');
  const destination = join(resources, 'sharp-runtime');
  const root = realpathSync(prepared.root);
  function copy(source, target, ancestors = new Set()) {
    const actual = realpathSync(source);
    const rel = relative(root, actual);
    if (isAbsolute(rel) || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\')) {
      throw new Error('Host image runtime link escapes prepared root');
    }
    const info = statSync(source);
    if (info.isDirectory()) {
      if (ancestors.has(actual)) throw new Error('Host image runtime contains a directory cycle');
      mkdirSync(target);
      const next = new Set([...ancestors, actual]);
      for (const name of readdirSync(source)) copy(join(source, name), join(target, name), next);
    } else if (info.isFile()) {
      copyFileSync(source, target, constants.COPYFILE_EXCL);
      chmodSync(target, info.mode & 0o755);
    } else throw new Error('Host image runtime contains a special file');
  }
  mkdirSync(resources, { recursive: true });
  copy(root, destination);
  validate(destination, 'linux', 'x64');
  return destination;
}
