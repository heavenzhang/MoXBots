/** Original registry initialization belongs to the locked Node startup owner. */
import {
  closeSync, constants, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readSync,
  readdirSync, realpathSync, renameSync, unlinkSync, writeSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { APP_DATA_DIR_NAME } from '../shared/appProfile';
import { loadConfig, loadProjects, withHostRegistryBootstrapLocks } from '../server/utils/admin-config';
import { getHomeDirOrNull } from '../server/utils/platform';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MARKER = 'registry-bootstrap-v1.json';
const INITIAL = { 'projects.json': Buffer.from('[]\n'), 'config.json': Buffer.from('{"agents":[]}\n') };
const LOCKS = new Set(['agent-config-intent.lock', 'projects.json.lock', 'config.json.lock']);
const UID = () => process.getuid?.() ?? fail();
function fail(): never { throw new HostRegistryBootstrapError(); }
export class HostRegistryBootstrapError extends Error {
  constructor() { super('HOST_REGISTRY_BOOTSTRAP_REJECTED'); this.name = 'HostRegistryBootstrapError'; }
}
type FileState = { bytes: Buffer; dev: number; ino: number; nlink: number };
type Directory = { fd: number; path: string; original: string; dev: number; ino: number };
type HostIdentity = { hostId: string; schemaVersion: 1 };
type Marker = { hostId: string; transaction: string; phase: 'pending' | 'committed' };
const tempName = (transaction: string, role: string) => `.registry-bootstrap-${transaction}-${role}.tmp`;

function directory(path: string): Directory {
  if (!isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) fail();
  let current: string = sep;
  for (const part of path.split(sep).filter(Boolean)) {
    current = join(current, part);
    const info = lstatSync(current);
    const rootStickyAncestor = current !== path && info.uid === 0 && (info.mode & 0o1000) !== 0;
    if (!info.isDirectory() || info.isSymbolicLink() || (info.uid !== 0 && info.uid !== UID())
        || ((info.mode & 0o022) !== 0 && !rootStickyAncestor)
        || (info.mode & (rootStickyAncestor ? 0o6000 : 0o7000)) !== 0) fail();
  }
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  const info = fstatSync(fd);
  const result = { fd, path: process.platform === 'linux' ? `/proc/self/fd/${fd}` : path,
    original: path, dev: info.dev, ino: info.ino };
  try { verifyDirectory(result); } catch (error) { closeSync(fd); throw error; }
  return result;
}
function verifyDirectory(value: Directory): void {
  const current = lstatSync(value.original), pinned = fstatSync(value.fd);
  if (!current.isDirectory() || current.isSymbolicLink() || realpathSync(value.original) !== value.original
      || current.uid !== UID() || (current.mode & 0o7777) !== 0o700
      || current.dev !== value.dev || current.ino !== value.ino || pinned.dev !== value.dev || pinned.ino !== value.ino) fail();
}
function optionalFile(parent: Directory, name: string, bound = 4 * 1024**2, links = [1]): FileState | undefined {
  verifyDirectory(parent);
  let fd: number;
  try { fd = openSync(join(parent.path, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.uid !== UID() || (before.mode & 0o7777) !== 0o600
        || !links.includes(before.nlink) || before.size > bound) fail();
    const buffer = Buffer.alloc(bound + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = readSync(fd, buffer, size, buffer.length - size, null);
      if (!count) break;
      size += count;
    }
    const bytes = buffer.subarray(0, size);
    const after = fstatSync(fd);
    if (bytes.length > bound || before.dev !== after.dev || before.ino !== after.ino
        || before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== after.size) fail();
    verifyDirectory(parent);
    return { bytes, dev: after.dev, ino: after.ino, nlink: after.nlink };
  } finally { closeSync(fd); }
}
function sameFile(a: FileState | undefined, b: FileState): boolean {
  return !!a && a.dev === b.dev && a.ino === b.ino && a.bytes.equals(b.bytes);
}
function temporaryFile(parent: Directory, bytes: Buffer, name: string, recover = false): FileState & { name: string } {
  verifyDirectory(parent);
  const previous = recover ? optionalFile(parent, name, bytes.length) : undefined;
  if (previous && !bytes.subarray(0, previous.bytes.length).equals(previous.bytes)) fail();
  const fd = openSync(join(parent.path, name), constants.O_WRONLY | constants.O_NOFOLLOW
    | (previous ? 0 : constants.O_CREAT | constants.O_EXCL), 0o600);
  let owned: (FileState & { name: string }) | undefined;
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.uid !== UID() || info.nlink !== 1 || (info.mode & 0o7777) !== 0o600) fail();
    if (previous && (previous.dev !== info.dev || previous.ino !== info.ino || previous.bytes.length !== info.size)) fail();
    owned = { name, bytes, dev: info.dev, ino: info.ino, nlink: info.nlink };
    let offset = previous?.bytes.length ?? 0;
    while (offset < bytes.length) {
      const written = writeSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!written) fail();
      offset += written;
    }
    fsyncSync(fd);
    verifyDirectory(parent); fsyncSync(parent.fd);
    const written = { name, bytes, dev: info.dev, ino: info.ino, nlink: info.nlink };
    if (!sameFile(optionalFile(parent, name, bytes.length), written)) fail();
    return written;
  } catch (error) {
    if (owned) removeOwnTemporary(parent, owned);
    throw error;
  } finally { closeSync(fd); }
}
function removeOwnTemporary(parent: Directory, temporary: FileState & { name: string }): void {
  let info;
  try { info = lstatSync(join(parent.path, temporary.name)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  if (!info.isFile() || info.isSymbolicLink() || info.dev !== temporary.dev || info.ino !== temporary.ino || info.uid !== UID()) fail();
  unlinkSync(join(parent.path, temporary.name)); fsyncSync(parent.fd);
}
function writeNew(parent: Directory, name: string, bytes: Buffer, temporaryName: string, recover = false): FileState {
  const current = optionalFile(parent, name, bytes.length, recover ? [1, 2] : [1]);
  const oldTemp = recover ? optionalFile(parent, temporaryName, bytes.length, [1, 2]) : undefined;
  if (current) {
    if (!current.bytes.equals(bytes)) fail();
    if (current.nlink === 2) {
      if (!oldTemp || oldTemp.nlink !== 2 || !sameFile(oldTemp, current)) fail();
      removeOwnTemporary(parent, { ...oldTemp, name: temporaryName });
    } else if (oldTemp) fail();
    return optionalFile(parent, name, bytes.length)!;
  }
  if (oldTemp && oldTemp.nlink !== 1) fail();
  const temporary = temporaryFile(parent, bytes, temporaryName, recover);
  try {
    verifyDirectory(parent);
    linkSync(join(parent.path, temporary.name), join(parent.path, name)); // atomic no-clobber publication
    removeOwnTemporary(parent, temporary);
    fsyncSync(parent.fd);
    const result = optionalFile(parent, name, bytes.length);
    if (!sameFile(result, temporary)) fail();
    return result!;
  } finally { removeOwnTemporary(parent, temporary); }
}

function markerBytes(marker: Marker): Buffer {
  return Buffer.from(JSON.stringify({ version: 1, purpose: 'host-registry-bootstrap', hostId: marker.hostId,
    transaction: marker.transaction, phase: marker.phase }) + '\n');
}
function commitMarker(parent: Directory, expected: FileState, marker: Marker): void {
  const created = temporaryFile(parent, markerBytes({ ...marker, phase: 'committed' }), tempName(marker.transaction, 'commit'), true);
  try {
    if (!sameFile(optionalFile(parent, MARKER, 1024), expected)) fail();
    verifyDirectory(parent);
    // The original three writer locks fence this expected inode/bytes phase CAS.
    renameSync(join(parent.path, created.name), join(parent.path, MARKER));
    fsyncSync(parent.fd);
    if (!sameFile(optionalFile(parent, MARKER, 1024), created)) fail();
  } finally {
    removeOwnTemporary(parent, created);
  }
}
function validPair(registry: Directory): void {
  const before = Object.keys(INITIAL).map(name => optionalFile(registry, name));
  if (before.some(value => !value)) fail();
  const config = loadConfig({ strict: true });
  if (!Array.isArray(config.agents)) fail();
  loadProjects({ strict: true });
  verifyDirectory(registry);
  Object.keys(INITIAL).forEach((name, index) => { if (!sameFile(optionalFile(registry, name), before[index]!)) fail(); });
}

function freshNamespace(state: Directory, home: Directory): void {
  if (readdirSync(state.path).some(name => !['home', 'host.lock', 'workspaces'].includes(name))) fail();
  // useradd --create-home may copy only these ordinary, non-writable skel files.
  for (const name of readdirSync(home.path)) {
    if (name === '.myagents') continue;
    if (!['.bashrc', '.bash_logout', '.profile'].includes(name)) fail();
    const info = lstatSync(join(home.path, name));
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== UID() || info.nlink !== 1 || (info.mode & 0o022) !== 0) fail();
  }
  const path = join(state.original, 'workspaces');
  try { lstatSync(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  const workspaces = directory(path);
  try {
    const entries = readdirSync(workspaces.path);
    if (entries.some(name => name !== 'default')) fail();
    if (entries.length) {
      const root = directory(join(path, 'default'));
      try { if (readdirSync(root.path).length) fail(); } finally { closeSync(root.fd); }
    }
  } finally { closeSync(workspaces.fd); }
}

function transactionEvidence(state: Directory, registry: Directory, marker: Marker): void {
  const identity = Buffer.from(JSON.stringify({ hostId: marker.hostId, schemaVersion: 1 }, null, 2));
  const specs = [
    { parent: state, role: 'pending', final: MARKER, bytes: markerBytes(marker) },
    { parent: state, role: 'identity', final: 'host-identity.json', bytes: identity },
    { parent: state, role: 'commit', final: undefined, bytes: markerBytes({ ...marker, phase: 'committed' }) },
    ...Object.entries(INITIAL).map(([name, bytes]) => ({ parent: registry, role: name.split('.')[0], final: name, bytes })),
  ];
  for (const parent of [state, registry]) {
    const allowed = new Set(specs.filter(item => item.parent === parent).map(item => tempName(marker.transaction, item.role)));
    if (readdirSync(parent.path).some(name => name.startsWith('.registry-bootstrap-') && !allowed.has(name))) fail();
  }
  for (const spec of specs) {
    const temporary = optionalFile(spec.parent, tempName(marker.transaction, spec.role), spec.bytes.length, [1, 2]);
    const final = spec.final ? optionalFile(spec.parent, spec.final, spec.bytes.length, [1, 2]) : undefined;
    if (temporary && !spec.bytes.subarray(0, temporary.bytes.length).equals(temporary.bytes)) fail();
    if (final && !final.bytes.equals(spec.bytes)) fail();
    if (temporary?.nlink === 2 || final?.nlink === 2) {
      if (!temporary || !final || temporary.nlink !== 2 || final.nlink !== 2 || !sameFile(temporary, final)) fail();
    } else if (temporary && final) fail();
  }
}

export async function initializeHostRegistry(stateDir: string): Promise<HostIdentity> {
  let state: Directory | undefined, home: Directory | undefined, registry: Directory | undefined;
  try {
    if (APP_DATA_DIR_NAME !== '.myagents' || getHomeDirOrNull() !== join(stateDir, 'home')) fail();
    state = directory(stateDir); home = directory(join(stateDir, 'home'));
    const originalMarker = optionalFile(state, MARKER, 1024, [1, 2]);
    let marker: Marker | undefined;
    if (originalMarker) {
      const value = JSON.parse(originalMarker.bytes.toString()) as Marker;
      if (!value || !UUID.test(value.hostId) || !UUID.test(value.transaction)
          || (value.phase !== 'pending' && value.phase !== 'committed') || !originalMarker.bytes.equals(markerBytes(value))) fail();
      marker = value;
      if (marker.phase === 'committed' && originalMarker.nlink !== 1) fail();
    }
    const originalIdentity = optionalFile(state, 'host-identity.json', 1024, marker?.phase === 'pending' ? [1, 2] : [1]);
    let identity: HostIdentity | undefined;
    if (originalIdentity) {
      const parsed = JSON.parse(originalIdentity.bytes.toString()) as HostIdentity;
      if (!parsed || parsed.schemaVersion !== 1 || typeof parsed.hostId !== 'string' || !UUID.test(parsed.hostId)
          || Object.keys(parsed).length !== 2) fail();
      identity = parsed;
    }
    const phase = marker?.phase;
    if (marker && ((identity && identity.hostId !== marker.hostId) || (!identity && phase === 'committed'))) fail();
    const registryPath = join(home.original, '.myagents');
    // Identity loss must not create a new Host before existing authority is checked.
    if (!identity && !marker) freshNamespace(state, home);
    try { lstatSync(registryPath); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || phase === 'committed' || (identity && !originalMarker)) fail();
      mkdirSync(registryPath, { mode: 0o700 });
      fsyncSync(home.fd);
    }
    registry = directory(registryPath);
    const previousEvidence = readdirSync(registry.path);
    if (!identity && !originalMarker && previousEvidence.length) fail();
    if (marker?.phase === 'pending') transactionEvidence(state, registry, marker);
    else if ([state, registry].some(parent => readdirSync(parent.path).some(name => name.startsWith('.registry-bootstrap-')))) fail();
    return await withHostRegistryBootstrapLocks(async () => {
      verifyDirectory(state!); verifyDirectory(home!); verifyDirectory(registry!);
      const links = phase === 'pending' ? [1, 2] : [1];
      const currentIdentity = optionalFile(state!, 'host-identity.json', 1024, links), currentMarker = optionalFile(state!, MARKER, 1024, links);
      if (originalIdentity ? !sameFile(currentIdentity, originalIdentity) : currentIdentity !== undefined) fail();
      if (originalMarker ? !sameFile(currentMarker, originalMarker) : currentMarker !== undefined) fail();
      const files = Object.entries(INITIAL).map(([name, bytes]) => ({ name, bytes, current: optionalFile(registry!, name, 4 * 1024**2, links) }));
      if (phase === 'committed') { validPair(registry!); return identity!; }
      if (identity && !originalMarker) { validPair(registry!); return identity; }
      const entries = readdirSync(registry!.path).filter(name => !LOCKS.has(name) && !name.startsWith('.registry-bootstrap-'));
      if (phase === 'pending') {
        transactionEvidence(state!, registry!, marker!);
        if (entries.some(name => !Object.hasOwn(INITIAL, name)) || files.some(file => file.current && !file.current.bytes.equals(file.bytes))) fail();
      } else if (previousEvidence.length || entries.length || files.some(file => file.current)) fail();
      if (!marker) { freshNamespace(state!, home!); marker = { hostId: randomUUID(), transaction: randomUUID(), phase: 'pending' }; }
      const hostId = marker.hostId;
      const pending = writeNew(state!, MARKER, markerBytes(marker), tempName(marker.transaction, 'pending'), !!originalMarker);
      if (!identity) {
        identity = { hostId, schemaVersion: 1 };
      }
      writeNew(state!, 'host-identity.json', Buffer.from(JSON.stringify(identity, null, 2)), tempName(marker.transaction, 'identity'), true);
      for (const file of files) writeNew(registry!, file.name, file.bytes, tempName(marker.transaction, file.name.split('.')[0]), true);
      validPair(registry!);
      commitMarker(state!, pending, marker);
      return identity;
    });
  } catch { throw new HostRegistryBootstrapError(); }
  finally { if (registry) closeSync(registry.fd); if (home) closeSync(home.fd); if (state) closeSync(state.fd); }
}
