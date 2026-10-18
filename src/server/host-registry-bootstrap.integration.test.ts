import fs from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initializeHostRegistry } from '../host/registry-bootstrap';
import { createHostMobileAgentCatalog } from '../host/mobile-agent-catalog';
import type { LocalSourceAuthority } from '../host/management-ipc';
import { withFileLock } from './utils/file-lock';

let state: string, home: string, registry: string, originalUmask: number;
const MARKER = 'registry-bootstrap-v1.json';
const transactions = new Map<string, string>();
const marker = (hostId: string, phase: 'pending' | 'committed', transaction?: string) => {
  const selected = transaction ?? transactions.get(hostId) ?? randomUUID(); transactions.set(hostId, selected);
  return JSON.stringify({ version: 1, purpose: 'host-registry-bootstrap', hostId, transaction: selected, phase }) + '\n';
};
const markerRecord = () => JSON.parse(fs.readFileSync(join(state, MARKER), 'utf8')) as { hostId: string; transaction: string; phase: string };
const write = (path: string, data: string) => fs.writeFileSync(path, data, { mode: 0o600 });
function setup(base = homedir()) {
  state = fs.realpathSync(fs.mkdtempSync(join(base, '.host-registry-bootstrap-')));
  fs.chmodSync(state, 0o700);
  home = join(state, 'home'); registry = join(home, '.myagents');
  fs.mkdirSync(home, { mode: 0o700 });
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
}
beforeEach(() => { originalUmask = process.umask(0o077); setup(); });
afterEach(() => {
  vi.restoreAllMocks(); syncBuiltinESMExports(); vi.unstubAllEnvs();
  fs.rmSync(state, { recursive: true, force: true });
  process.umask(originalUmask);
});
function identity(hostId = randomUUID()) {
  write(join(state, 'host-identity.json'), JSON.stringify({ hostId, schemaVersion: 1 }));
  return hostId;
}
function pair(config = '{"agents":[]}', projects = '[]') {
  fs.mkdirSync(registry, { mode: 0o700, recursive: true });
  write(join(registry, 'config.json'), config); write(join(registry, 'projects.json'), projects);
}
function files() {
  const found: Record<string, string> = {};
  function walk(path: string, prefix = '') {
    for (const entry of fs.readdirSync(path)) {
      const target = join(path, entry), name = prefix + entry, info = fs.lstatSync(target);
      if (info.isSymbolicLink()) found[name] = 'symlink:' + fs.readlinkSync(target);
      else if (info.isDirectory()) walk(target, name + '/');
      else found[name] = fs.readFileSync(target).toString('base64');
    }
  }
  walk(state); return found;
}
async function unchangedRejected() {
  const before = files();
  await expect(initializeHostRegistry(state)).rejects.toThrow('HOST_REGISTRY_BOOTSTRAP_REJECTED');
  expect(files()).toEqual(before);
}
function authority(hostId: string): LocalSourceAuthority {
  return { connection: { serviceId: 's', networkId: 'n', bootEpoch: 'boot', connectionEpoch: randomUUID() },
    local: { serviceId: 's', environment: 'test', networkId: 'n', principalId: 'p', deviceId: hostId, keyGeneration: 1 },
    accountBinding: 'binding', managementBinding: 'binding' };
}
function faultLink(name: string) {
  const original = fs.linkSync;
  const spy = vi.spyOn(fs, 'linkSync').mockImplementation((source, target) => {
    if (String(target).endsWith('/' + name)) throw Object.assign(new Error('synthetic interruption'), { code: 'EIO' });
    return original(source, target);
  });
  syncBuiltinESMExports();
  return () => { spy.mockRestore(); syncBuiltinESMExports(); };
}

it('reproduces missing fresh catalog then initializes an authoritative genuinely empty catalog', async () => {
  const catalog = createHostMobileAgentCatalog({ workspacePath: async () => { throw new Error('empty catalog must not resolve workspaces'); } });
  await expect(catalog.request(authority(randomUUID()))).rejects.toThrow();
  const actual = await initializeHostRegistry(state);
  const page = await catalog.request(authority(actual.hostId));
  expect(page.kind).toBe('catalog.chunk'); expect(page.nextCursor).toBeNull();
  expect(Buffer.from(page.dataBase64, 'base64').toString()).toBe('[]');
  expect(fs.readFileSync(join(registry, 'config.json'), 'utf8')).toBe('{"agents":[]}\n');
  expect(fs.readFileSync(join(registry, 'projects.json'), 'utf8')).toBe('[]\n');
  expect(fs.readFileSync(join(state, MARKER), 'utf8')).toBe(marker(actual.hostId, 'committed', markerRecord().transaction));
  expect(fs.readdirSync(state).filter(name => name.startsWith('.registry-bootstrap-'))).toEqual([]);
});

it('accepts a complete old pair with original identity byte-for-byte and without creating a marker', async () => {
  const hostId = identity();
  pair('{"agents":[],"providerApiKeys":{"fixture":"SYNTHETIC_PRIVATE"}}');
  write(join(registry, 'config.json.bak'), 'SYNTHETIC_PRIVATE');
  const before = files();
  expect((await initializeHostRegistry(state)).hostId).toBe(hostId);
  expect(files()).toEqual(before); expect(fs.existsSync(join(state, MARKER))).toBe(false);
});

it('preserves changed valid registry, original HostID and committed marker on repeat', async () => {
  const original = await initializeHostRegistry(state);
  const identityBefore = fs.readFileSync(join(state, 'host-identity.json'));
  pair('{"agents":[{"id":"a","name":"a","enabled":false}],"secret":"SYNTHETIC_PRIVATE"}', '[{"id":"w","name":"w","path":"/workspace","agentId":"a"}]');
  const before = files(), inode = fs.statSync(join(registry, 'config.json')).ino;
  expect(await initializeHostRegistry(state)).toEqual(original);
  expect(files()).toEqual(before); expect(fs.statSync(join(registry, 'config.json')).ino).toBe(inode);
  expect(fs.readFileSync(join(state, 'host-identity.json'))).toEqual(identityBefore);
});

it.each(['config.json.bak', 'projects.json.tmp', 'foreign-authority.json'])('rejects fresh identity creation with existing %s evidence', async name => {
  fs.mkdirSync(registry, { mode: 0o700 }); write(join(registry, name), 'preserve');
  await unchangedRejected(); expect(fs.existsSync(join(state, 'host-identity.json'))).toBe(false);
});

it('does not create a new identity when the old registry remains but identity was lost', async () => {
  pair(); await unchangedRejected(); expect(fs.existsSync(join(state, 'host-identity.json'))).toBe(false);
});

it('does not infer fresh permission from an existing identity and missing registry', async () => {
  identity(); await unchangedRejected(); expect(fs.existsSync(registry)).toBe(false);
});

it.each([['{"agents":[]}', undefined], ['{broken', '[]'], ['{"agents":null}', '[]'], ['{"agents":[]}', '{}']])(
  'rejects partial or corrupt authority without changes', async (config, projects) => {
    identity(); fs.mkdirSync(registry, { mode: 0o700 }); write(join(registry, 'config.json'), config!);
    if (projects !== undefined) write(join(registry, 'projects.json'), projects);
    await unchangedRejected();
  });

it('rejects symlink registry directory before any writer lock or identity publication', async () => {
  const target = join(home, 'foreign'); fs.mkdirSync(target, { mode: 0o700 });
  fs.symlinkSync(target, registry); await unchangedRejected();
  expect(fs.readdirSync(target)).toEqual([]); expect(fs.existsSync(join(state, 'host-identity.json'))).toBe(false);
});

it.each(['symlink', 'hardlink'])('rejects %s registry files and preserves their authority', async kind => {
  identity(); pair();
  const path = join(registry, 'config.json'), target = join(home, 'original');
  fs.renameSync(path, target);
  if (kind === 'symlink') fs.symlinkSync(target, path); else fs.linkSync(target, path);
  await unchangedRejected();
});

it('recovers interruption after durable pending and before identity with the same selected HostID', async () => {
  const restore = faultLink('host-identity.json');
  try { await expect(initializeHostRegistry(state)).rejects.toThrow('HOST_REGISTRY_BOOTSTRAP_REJECTED'); }
  finally { restore(); }
  expect(fs.existsSync(join(state, 'host-identity.json'))).toBe(false);
  const pending = markerRecord();
  expect(pending.phase).toBe('pending');
  const actual = await initializeHostRegistry(state);
  expect(actual.hostId).toBe(pending.hostId);
  expect(fs.readFileSync(join(state, MARKER), 'utf8')).toBe(marker(actual.hostId, 'committed', pending.transaction));
});

it('recovers interruption between projects and config without overwriting an initial file', async () => {
  const restore = faultLink('config.json');
  try { await expect(initializeHostRegistry(state)).rejects.toThrow('HOST_REGISTRY_BOOTSTRAP_REJECTED'); }
  finally { restore(); }
  const originalId = fs.readFileSync(join(state, 'host-identity.json'));
  const projectInode = fs.statSync(join(registry, 'projects.json')).ino;
  expect(fs.existsSync(join(registry, 'config.json'))).toBe(false);
  await initializeHostRegistry(state);
  expect(fs.readFileSync(join(state, 'host-identity.json'))).toEqual(originalId);
  expect(fs.statSync(join(registry, 'projects.json')).ino).toBe(projectInode);
});

it('does not overwrite partial final data while recovering a pending transaction', async () => {
  const restore = faultLink('config.json');
  try { await expect(initializeHostRegistry(state)).rejects.toThrow(); } finally { restore(); }
  write(join(registry, 'config.json'), '{"agents":[],"preserve":"SYNTHETIC_PRIVATE"}');
  await unchangedRejected();
});

it('recovers a failed phase CAS and consumes pending instead of retaining replayable pending', async () => {
  const original = fs.renameSync;
  const spy = vi.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
    if (String(target).endsWith('/' + MARKER)) throw new Error('synthetic interrupted phase commit');
    return original(source, target);
  });
  syncBuiltinESMExports();
  try { await expect(initializeHostRegistry(state)).rejects.toThrow(); }
  finally { spy.mockRestore(); syncBuiltinESMExports(); }
  const id = JSON.parse(fs.readFileSync(join(state, 'host-identity.json'), 'utf8')) as { hostId: string };
  const transaction = markerRecord().transaction;
  expect(fs.readFileSync(join(state, MARKER), 'utf8')).toBe(marker(id.hostId, 'pending', transaction));
  await initializeHostRegistry(state);
  expect(fs.readFileSync(join(state, MARKER), 'utf8')).toBe(marker(id.hostId, 'committed', transaction));
  expect(fs.readdirSync(state).filter(name => name.startsWith('.registry-bootstrap-'))).toEqual([]);
});

it.each(['host-identity.json', 'home/.myagents/config.json', 'home/.myagents/projects.json'])('fails closed after committed %s loss without resetting state', async name => {
  await initializeHostRegistry(state); fs.unlinkSync(join(state, name)); await unchangedRejected();
  expect(fs.existsSync(join(state, name))).toBe(false);
});

it('fences mismatched HostID marker and malformed identity without replacing either', async () => {
  identity(); pair(); write(join(state, MARKER), marker(randomUUID(), 'pending')); await unchangedRejected();
  fs.unlinkSync(join(state, MARKER)); write(join(state, 'host-identity.json'), 'null'); await unchangedRejected();
});

it('rejects unknown initialization temporaries and public marker modes', async () => {
  const hostId = identity(); pair(); write(join(state, MARKER), marker(hostId, 'pending'));
  const temporary = join(state, '.registry-bootstrap-unknown.tmp'); write(temporary, 'preserve');
  await unchangedRejected(); fs.unlinkSync(temporary);
  fs.chmodSync(join(state, MARKER), 0o644); await unchangedRejected();
});

it('waits on the original config writer lock before resuming the pending transaction', async () => {
  fs.mkdirSync(registry, { mode: 0o700 });
  const hostId = randomUUID(); write(join(state, MARKER), marker(hostId, 'pending'));
  let release!: () => void, held!: () => void;
  const acquired = new Promise<void>(resolve => { held = resolve; });
  const blocker = withFileLock({ lockPath: join(registry, 'config.json.lock') }, async () => {
    held(); await new Promise<void>(resolve => { release = resolve; });
  });
  await acquired;
  const started = initializeHostRegistry(state);
  await new Promise(resolve => setTimeout(resolve, 60));
  expect(fs.existsSync(join(state, 'host-identity.json'))).toBe(false);
  expect(fs.existsSync(join(registry, 'projects.json'))).toBe(false);
  release(); await blocker;
  expect((await started).hostId).toBe(hostId);
});

it.each(['pending', 'identity', 'projects', 'config'])('recovers only its own %s tmp/final link publication window', async role => {
  const original = fs.unlinkSync;
  const spy = vi.spyOn(fs, 'unlinkSync').mockImplementation(path => {
    if (String(path).endsWith(`-${role}.tmp`)) throw new Error('synthetic crash before own tmp unlink');
    return original(path);
  });
  syncBuiltinESMExports();
  try { await expect(initializeHostRegistry(state)).rejects.toThrow(); }
  finally { spy.mockRestore(); syncBuiltinESMExports(); }
  const pending = markerRecord();
  const parent = ['pending', 'identity'].includes(role) ? state : registry;
  const temporary = join(parent, `.registry-bootstrap-${pending.transaction}-${role}.tmp`);
  expect(fs.statSync(temporary).nlink).toBe(2);
  const actual = await initializeHostRegistry(state);
  expect(actual.hostId).toBe(pending.hostId); expect(fs.existsSync(temporary)).toBe(false);
  expect(markerRecord().phase).toBe('committed');
});

it.each(['identity', 'projects', 'config', 'commit'])('resumes a prefix-only %s tmp solely from its bound pending transaction', async role => {
  const hostId = randomUUID(), transaction = randomUUID();
  fs.mkdirSync(registry, { mode: 0o700 }); write(join(state, MARKER), marker(hostId, 'pending', transaction));
  const initial = role === 'identity' ? JSON.stringify({ hostId, schemaVersion: 1 }, null, 2)
    : role === 'projects' ? '[]\n' : role === 'config' ? '{"agents":[]}\n' : marker(hostId, 'committed', transaction);
  const parent = ['identity', 'commit'].includes(role) ? state : registry;
  const temporary = join(parent, `.registry-bootstrap-${transaction}-${role}.tmp`);
  write(temporary, initial.slice(0, Math.max(1, Math.floor(initial.length / 2))));
  const actual = await initializeHostRegistry(state);
  expect(actual.hostId).toBe(hostId); expect(fs.existsSync(temporary)).toBe(false);
  expect(markerRecord().phase).toBe('committed');
});

it('rejects arbitrary hardlinks and a wrong-prefix fixed tmp even with a valid pending marker', async () => {
  const hostId = randomUUID(), transaction = randomUUID();
  fs.mkdirSync(registry, { mode: 0o700 }); write(join(state, MARKER), marker(hostId, 'pending', transaction));
  write(join(registry, 'projects.json'), '[]\n'); fs.linkSync(join(registry, 'projects.json'), join(home, 'unrelated'));
  await unchangedRejected(); expect(fs.existsSync(join(state, 'host-identity.json'))).toBe(false);
  fs.unlinkSync(join(home, 'unrelated'));
  write(join(state, `.registry-bootstrap-${transaction}-identity.tmp`), 'UNRELATED_AUTHORITY');
  await unchangedRejected(); expect(fs.existsSync(join(state, 'host-identity.json'))).toBe(false);
});

it.each(['old-agent', 'default/session-history'])('rejects old workspace evidence %s before publishing identity or pending', async name => {
  const target = join(state, 'workspaces', name);
  fs.mkdirSync(target, { recursive: true, mode: 0o700 }); write(join(target, 'original.json'), 'preserve');
  await unchangedRejected(); expect(fs.existsSync(join(state, 'host-identity.json'))).toBe(false);
  expect(fs.existsSync(join(state, MARKER))).toBe(false);
});

it('allows only ordinary skel files and the original empty default workspace for fresh state', async () => {
  write(join(home, '.profile'), 'ordinary fixture skel');
  fs.mkdirSync(join(state, 'workspaces', 'default'), { recursive: true, mode: 0o700 });
  expect((await initializeHostRegistry(state)).schemaVersion).toBe(1);
});

it('supports a root-owned sticky temporary ancestor without relaxing private state/home', async () => {
  fs.rmSync(state, { recursive: true, force: true });
  setup(fs.realpathSync('/tmp'));
  const actual = await initializeHostRegistry(state);
  expect(actual.schemaVersion).toBe(1);
  fs.chmodSync(home, 0o755); await unchangedRejected();
});
