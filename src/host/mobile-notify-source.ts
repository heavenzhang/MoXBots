/** Generic pointers only. This owner never dispatches a Session operation. */
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, rename, mkdir, lstat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { LocalSourceAuthority, LocalSourceOperation } from './management-ipc';
import { z } from 'zod';
import { workspacePathsEqual } from '../shared/workspacePath';

type SourceWorker = { generation: string; sessionId: string; closing: boolean; bot?: unknown; botBootstrap?: unknown };
export function isOriginalSourceWorker(active: SourceWorker | null, target: SourceWorker, generation: string, sessionId: string, shuttingDown: boolean) {
  return active === target && target.generation === generation && target.sessionId === sessionId && !target.bot && !target.botBootstrap && !target.closing && !shuttingDown;
}
export function uniqueSourceAgent(agents: readonly { agentId: string; workspacePath: string; enabled: boolean; archived?: boolean }[], workspace: string) {
  const selected = agents.filter(a => a.enabled && !a.archived && workspacePathsEqual(a.workspacePath, workspace));
  return selected.length === 1 ? selected[0]!.agentId : null;
}
const itemSchema = z.object({
  sourceEventId: z.string().uuid(), connectionEpoch: z.string().uuid(),
  agentId: z.string().regex(/^[A-Za-z0-9._:-]{1,256}$/), sessionId: z.string().uuid(),
  workerGeneration: z.string().uuid(), observation: z.string().min(1).max(160), createdAt: z.number().int().nonnegative(),
}).strict();
export type SourceItem = z.infer<typeof itemSchema>;
const confirmedSchema = z.object({ sourceEventId: z.string().uuid(), eventId: z.string().uuid(), observationKey: z.string().regex(/^[a-f0-9]{64}$/), createdAt: z.number().int().nonnegative() }).strict();
const diskSchema = z.object({ version: z.literal(2), scope: z.string().regex(/^[a-f0-9]{64}$/), items: z.array(itemSchema).max(128), deferred: z.array(itemSchema).max(128), confirmed: z.array(confirmedSchema).max(512) }).strict();
type Disk = z.infer<typeof diskSchema>;
const ttl = 24 * 60 * 60 * 1000;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function scopeKey(a: LocalSourceAuthority) { return digest([a.local.serviceId, a.local.environment, a.local.networkId, a.local.principalId, a.local.deviceId, a.local.keyGeneration, a.accountBinding, a.managementBinding]); }
function observationKey(item: Pick<SourceItem, 'workerGeneration' | 'sessionId' | 'observation'>) { return digest([item.workerGeneration, item.sessionId, item.observation]); }

export class HostNotificationSource {
  private authority: LocalSourceAuthority | undefined;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly root: string, private readonly validate: (item: SourceItem) => Promise<boolean>, private readonly now = Date.now) { }
  capture(): LocalSourceAuthority | undefined { return this.authority ? structuredClone(this.authority) : undefined; }
  activate(a: LocalSourceAuthority) {
    if(a.accountBinding!==a.managementBinding||a.connection.serviceId!==a.local.serviceId||a.connection.networkId!==a.local.networkId)throw Error('SOURCE_SCOPE_INVALID');
    this.authority = structuredClone(a);
  }
  private sameScope(a: LocalSourceAuthority) { return !!this.authority && scopeKey(a) === scopeKey(this.authority); }
  private serial<T>(fn: () => Promise<T>): Promise<T> { const next = this.tail.then(fn); this.tail = next.catch(() => { }); return next; }
  private async path(scope: string) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const stat = await lstat(this.root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700 || stat.uid !== process.getuid?.()) throw Error('SOURCE_UNSAFE');
    return join(this.root, scope + '.json');
  }
  private async read(scope: string): Promise<Disk> {
    const path = await this.path(scope); let file;
    try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { version: 2, scope, items: [], deferred: [], confirmed: [] }; throw e; }
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 512 * 1024 || (stat.mode & 0o777) !== 0o600 || stat.uid !== process.getuid?.() || stat.nlink !== 1) throw Error('SOURCE_UNSAFE');
      const data = diskSchema.parse(JSON.parse(await file.readFile('utf8')));
      if (data.scope !== scope) throw Error('SOURCE_SCOPE');
      return data;
    } finally { await file.close(); }
  }
  private async write(data: Disk) {
    const path = await this.path(data.scope), tmp = path + '.' + randomUUID() + '.tmp';
    try {
      const file = await open(tmp, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify(data)); await file.sync(); } finally { await file.close(); }
      await rename(tmp, path);
    } catch (error) { await unlink(tmp).catch(() => {}); throw error; }
    const dir = await open(this.root, 'r'); try { await dir.sync(); } finally { await dir.close(); }
    if (JSON.stringify(await this.read(data.scope)) !== JSON.stringify(data)) throw Error('SOURCE_UNCONFIRMED');
  }
  private compact(disk: Disk) {
    disk.items = disk.items.filter(i => this.now() - i.createdAt < ttl);
    disk.deferred = disk.deferred.filter(i => this.now() - i.createdAt < ttl);
    disk.confirmed = disk.confirmed.filter(i => this.now() - i.createdAt < ttl).slice(-512);
    while (disk.items.length < 128 && disk.deferred.length) disk.items.push(disk.deferred.shift()!);
  }
  observe(a: LocalSourceAuthority, pointer: Pick<SourceItem, 'agentId' | 'sessionId' | 'workerGeneration' | 'observation'>, stillCurrent: () => boolean = () => true) {
    const captured = structuredClone(a);
    return this.serial(async () => {
      if (!this.sameScope(captured) || !stillCurrent()) return;
      const item = itemSchema.parse({ ...pointer, sourceEventId: randomUUID(), connectionEpoch: captured.connection.connectionEpoch, createdAt: this.now() });
      if (!await this.validate(item)) return;
      const disk = await this.read(scopeKey(captured)); this.compact(disk);
      const key = observationKey(item);
      if ([...disk.items, ...disk.deferred].some(i => observationKey(i) === key) || disk.confirmed.some(i => i.observationKey === key)) return;
      if (!this.sameScope(captured) || !stillCurrent()) return;
      if (disk.items.length < 128) disk.items.push(item);
      else if (disk.deferred.length < 128) disk.deferred.push(item);
      else throw Error('SOURCE_CAPACITY'); // Explicit unconfirmed observation; never mark as sent.
      await this.write(disk);
    });
  }
  request(a: LocalSourceAuthority, op: LocalSourceOperation) {
    this.activate(a);
    return this.serial(async () => {
      if (!this.sameScope(a)) throw Error('SOURCE_SCOPE_CHANGED');
      const disk = await this.read(scopeKey(a)); this.compact(disk);
      if (op.kind === 'source.ack') {
        const prior = disk.confirmed.find(i => i.sourceEventId === op.sourceEventId);
        if (prior && prior.eventId !== op.eventId) throw Error('SOURCE_ACK_MISMATCH');
        const index = disk.items.findIndex(i => i.sourceEventId === op.sourceEventId);
        if (index < 0 && !prior) throw Error('SOURCE_ACK_UNKNOWN');
        if (index >= 0) {
          const item = disk.items.splice(index, 1)[0]!;
          disk.confirmed.push({ sourceEventId: item.sourceEventId, eventId: op.eventId, observationKey: observationKey(item), createdAt: item.createdAt });
          this.compact(disk); await this.write(disk);
        }
        return { kind: 'source.ack', sourceEventId: op.sourceEventId };
      }
      for (const item of disk.items) {
        if (await this.validate(item) && this.sameScope(a)) return { kind: 'source.hint', sourceEventId: item.sourceEventId, connectionEpoch: item.connectionEpoch, agentId: item.agentId, sessionId: item.sessionId };
      }
      return { kind: 'source.empty' };
    });
  }
}
