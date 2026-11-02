import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../types';
import type { ProjectSpaceDraft } from '../../../shared/projectSpaces';

const state = vi.hoisted(() => ({
  disk: '',
  lock: Promise.resolve() as Promise<void>,
  writes: 0,
  failAfterWrite: null as Error | null,
  readFailure: null as Error | null,
}));

vi.mock('./appConfigService', () => ({
  loadAppConfig: vi.fn(async (): Promise<AppConfig> => {
    if (state.readFailure) throw state.readFailure;
    return JSON.parse(state.disk);
  }),
  atomicModifyConfig: vi.fn((modifier: (config: AppConfig) => AppConfig | Promise<AppConfig>) => {
    // A queued writer must read the latest persisted config AFTER acquiring
    // the lock. Serialization also detaches saved/returned objects as disk IO does.
    const operation = state.lock.then(async () => {
      const latest: AppConfig = JSON.parse(state.disk);
      const modified = await modifier(latest);
      const serialized = JSON.stringify(modified);
      state.disk = serialized;
      state.writes += 1;
      if (state.failAfterWrite) {
        const error = state.failAfterWrite; state.failAfterWrite = null; throw error;
      }
      return JSON.parse(serialized) as AppConfig;
    });
    state.lock = operation.then(() => undefined, () => undefined);
    return operation;
  }),
}));

import { loadAppConfig } from './appConfigService';
import { mutateProjectSpace } from './projectSpaceService';

const at = '2026-11-02T00:00:00.000Z';
function draft(name: string): ProjectSpaceDraft {
  return {
    name, description: `${name} description`, instructions: `Use ${name} context`,
    memberBotIds: ['bot'], materials: [], resources: [],
  };
}
function create(id: string) {
  return mutateProjectSpace({ kind: 'create', id, draft: draft(id), at });
}

describe('project space config writes through the latest-config lock', () => {
  beforeEach(() => {
    state.disk = JSON.stringify({ agents: [{ id: 'bot', name: 'Shared Bot' }], projectSpaces: [], unrelated: { keep: true } });
    state.lock = Promise.resolve();
    state.writes = 0;
    state.failAfterWrite = null; state.readFailure = null;
  });

  it('preserves both concurrent creates, updates and archives across reloads', async () => {
    const created = await Promise.all([create('a'), create('b')]);
    expect(created.map(project => [project.id, project.revision])).toEqual([['a', 1], ['b', 1]]);
    await Promise.all(['a', 'b'].map(id => mutateProjectSpace({
      kind: 'update', id, expectedRevision: 1, draft: draft(`${id} updated`), at,
    })));
    await Promise.all(['a', 'b'].map(id => mutateProjectSpace({
      kind: 'archive', id, expectedRevision: 2, archived: true, at,
    })));
    const reloaded = await loadAppConfig();
    expect(reloaded.projectSpaces?.map(project => ({ id: project.id, name: project.name, revision: project.revision, archivedAt: project.archivedAt })))
      .toEqual(['a', 'b'].map(id => ({ id, name: `${id} updated`, revision: 3, archivedAt: at })));
    expect(JSON.parse(state.disk).unrelated).toEqual({ keep: true });
    expect(reloaded.agents).toEqual([{ id: 'bot', name: 'Shared Bot' }]);
    expect(state.writes).toBe(6);
    reloaded.projectSpaces![0].name = 'local unsaved change';
    expect((await loadAppConfig()).projectSpaces![0].name).toBe('a updated');
    expect(created[0].revision).toBe(1);
  });

  it('rejects a same-project stale concurrent update without changing the winning write', async () => {
    await create('a');
    const results = await Promise.allSettled([
      mutateProjectSpace({ kind: 'update', id: 'a', expectedRevision: 1, draft: draft('winner'), at }),
      mutateProjectSpace({ kind: 'update', id: 'a', expectedRevision: 1, draft: draft('stale'), at }),
    ]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { code: 'revision-conflict' } });
    const saved = state.disk;
    await expect(mutateProjectSpace({ kind: 'archive', id: 'a', expectedRevision: 1, archived: true, at }))
      .rejects.toMatchObject({ code: 'revision-conflict' });
    expect(state.disk).toBe(saved);
    const winner = (await loadAppConfig()).projectSpaces![0];
    expect(winner).toMatchObject({ name: 'winner', revision: 2 });
    expect(winner).not.toHaveProperty('archivedAt');
    expect(state.writes).toBe(2);
    // A failed queued operation must not poison subsequent valid writes.
    await expect(create('b')).resolves.toMatchObject({ id: 'b' });
  });

  it('restores an archived saved project while preserving its fields and other projects', async () => {
    await Promise.all([create('a'), create('b')]);
    await mutateProjectSpace({ kind: 'archive', id: 'a', expectedRevision: 1, archived: true, at });
    const saved = state.disk;
    await expect(mutateProjectSpace({ kind: 'update', id: 'a', expectedRevision: 2, draft: draft('invalid edit'), at }))
      .rejects.toMatchObject({ code: 'archived' });
    expect(state.disk).toBe(saved);
    await mutateProjectSpace({ kind: 'archive', id: 'a', expectedRevision: 2, archived: false, at });
    const [a, b] = (await loadAppConfig()).projectSpaces!;
    expect(a).toMatchObject({ ...draft('a'), revision: 3 });
    expect(a.archivedAt).toBeUndefined();
    expect(b).toMatchObject({ ...draft('b'), revision: 1 });
  });

  it('rejects an unknown Bot and invalid drafts without any persisted change', async () => {
    await create('a');
    const saved = state.disk;
    await expect(mutateProjectSpace({ kind: 'create', id: 'b', draft: { ...draft('b'), memberBotIds: ['missing'] }, at }))
      .rejects.toMatchObject({ code: 'bot-unavailable' });
    await expect(mutateProjectSpace({ kind: 'update', id: 'a', expectedRevision: 1, draft: { ...draft('a'), memberBotIds: ['missing'] }, at }))
      .rejects.toMatchObject({ code: 'bot-unavailable' });
    await expect(mutateProjectSpace({ kind: 'update', id: 'a', expectedRevision: 1, draft: { ...draft('a'), materials: null } as unknown as ProjectSpaceDraft, at }))
      .rejects.toMatchObject({ code: 'invalid' });
    expect(state.disk).toBe(saved);
    expect(state.writes).toBe(1);
  });

  it('refuses to overwrite a corrupt saved catalog with an empty or replacement catalog', async () => {
    const config = JSON.parse(state.disk);
    config.projectSpaces = { malformed: true };
    state.disk = JSON.stringify(config);
    const saved = state.disk;
    await expect(create('a')).rejects.toMatchObject({ code: 'invalid' });
    expect(state.disk).toBe(saved);
    expect(state.writes).toBe(0);
  });
  it('reconciles a committed create after its acknowledgement is lost without writing a duplicate', async () => {
    state.failAfterWrite = new Error('write acknowledgement lost');
    const saved = await create('stable-intent');
    expect(saved).toMatchObject({ id: 'stable-intent', name: 'stable-intent', revision: 1 });
    expect(state.writes).toBe(1);
    expect((await loadAppConfig()).projectSpaces).toEqual([saved]);
    const persisted = state.disk;
    await expect(create('stable-intent')).resolves.toEqual(saved);
    expect(state.writes).toBe(1);
    expect(state.disk).toBe(persisted);
  });

  it('rejects a same-ID create with different content without touching the saved project', async () => {
    await create('stable-intent');
    const persisted = state.disk;
    await expect(mutateProjectSpace({ kind: 'create', id: 'stable-intent', draft: draft('different intent'), at }))
      .rejects.toMatchObject({ code: 'revision-conflict' });
    expect(state.disk).toBe(persisted);
    expect(state.writes).toBe(1);
  });

  it('preserves the original lost-acknowledgement error when the outcome cannot be read', async () => {
    const original = new Error('original acknowledgement failure');
    state.failAfterWrite = original;
    state.readFailure = new Error('subsequent disk read failed');
    await expect(create('stable-intent')).rejects.toBe(original);
    expect(state.writes).toBe(1);
    expect(JSON.parse(state.disk).projectSpaces).toHaveLength(1);
    state.readFailure = null;
    await expect(create('stable-intent')).resolves.toMatchObject({ id: 'stable-intent' });
    expect(state.writes).toBe(1);
  });

});
