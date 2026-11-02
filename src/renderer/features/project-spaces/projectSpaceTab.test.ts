import { describe, expect, it } from 'vitest';
import { projectSpaceTabModule as module } from './tabModule';

describe('Project Space tab identity', () => {
  it('reuses only the same stable project ID, even when names match', () => {
    const first = module.open.create({ projectSpaceId: 'a', title: 'Shared name' }, { id: 'tab-a' });
    const second = module.open.create({ projectSpaceId: 'b', title: 'Shared name' }, { id: 'tab-b' });
    expect(module.identity(first)).toBe('a');
    expect(module.open.findExisting([first, second], { projectSpaceId: 'a', title: 'Renamed A' })).toBe(first);
    expect(module.open.findExisting([first], { projectSpaceId: 'b', title: 'Shared name' })).toBeUndefined();
    expect(module.open.reopen(first, { projectSpaceId: 'a', title: 'Renamed A' })).toEqual({ ...first, title: 'Renamed A' });
    expect(first.title).toBe('Shared name');
  });

  it('creates a display-only project tab without a Session or workspace execution identity', () => {
    const tab = module.open.create({ projectSpaceId: 'a', title: 'Project A' }, { id: 'tab-a' });
    expect(tab).toEqual({ id: 'tab-a', view: 'projectspace', title: 'Project A', projectSpaceId: 'a' });
    expect(module.chrome(tab)).toEqual({ title: 'Project A' });
    expect(module.initialMount()).toBe('deferred-content');
  });
});
