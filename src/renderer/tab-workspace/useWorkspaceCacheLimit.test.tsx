import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Tab } from '@/types/tab';
import { builtinTabModules, builtinTabWorkspacePolicy } from './builtinComposition';
import { useTabWorkspaceController } from './useTabWorkspaceController';
import { useTabCloseController, type TabCloseAdmission } from './useTabCloseController';
import { useWorkspaceCacheLimit } from './useWorkspaceCacheLimit';

const page = (id: string): Tab => ({ id, view: 'launcher', title: id });
function setup({ prepare = vi.fn(async (_tab: Tab): Promise<TabCloseAdmission> => 'allow'), protectedIds = new Set<string>(), limit = 2 }: { prepare?: (tab: Tab) => Promise<TabCloseAdmission>; protectedIds?: Set<string>; limit?: number } = {}) {
  const cleanup = vi.fn();
  const blocked = vi.fn();
  const hook = renderHook(() => {
    const workspace = useTabWorkspaceController<Tab, typeof builtinTabModules>({
      modules: builtinTabModules, initialTabs: [page('oldest'), page('middle')],
      initialActiveTabId: 'middle', maxTabs: limit + 1, createId: () => 'newest',
      isLastTabProtected: builtinTabWorkspacePolicy.isLastTabProtected,
    });
    const close = useTabCloseController<Tab, typeof builtinTabModules, 'user' | 'cache'>({ workspace: workspace.controller,
      lifecycle: { launcher: { prepareClose: prepare, afterDetach: cleanup } },
      defaultReason: 'cache', createFallback: () => page('fallback'),
      canDetach: (tab, reason) => reason === 'user' || (workspace.controller.getSnapshot().tabs.length > limit && workspace.controller.getSnapshot().activeTabId !== tab.id && !protectedIds.has(tab.id)),
    });
    useWorkspaceCacheLimit({ ...workspace, getSnapshot: workspace.controller.getSnapshot,
      limit, canEvict: tab => !protectedIds.has(tab.id), close, onBlocked: blocked });
    return { ...workspace, close };
  });
  return { hook, prepare, cleanup, blocked };
}

describe('bounded workspace FIFO cache', () => {
  it('evicts by original opening order even after refocusing, and reopens an evicted page', async () => {
    const { hook, cleanup } = setup();
    act(() => {
      hook.result.current.controller.focus('oldest');
      hook.result.current.controller.append(page('newest'));
    });
    await waitFor(() => expect(hook.result.current.state.tabs.map(tab => tab.id)).toEqual(['middle', 'newest']));
    expect(cleanup).toHaveBeenCalledTimes(1);
    act(() => { hook.result.current.controller.append(page('oldest')); });
    await waitFor(() => expect(hook.result.current.state.tabs.map(tab => tab.id)).toEqual(['newest', 'oldest']));
    expect(hook.result.current.state.activeTabId).toBe('oldest');
  });

  it('waits for save, admits only one extra page, and cancels closing a page the user returned to', async () => {
    let settle!: (value: TabCloseAdmission) => void;
    const prepare = vi.fn((_tab: Tab) => new Promise<TabCloseAdmission>(resolve => { settle = resolve; }));
    const { hook, cleanup } = setup({ prepare });
    act(() => { hook.result.current.controller.append(page('newest')); });
    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    expect(hook.result.current.state.tabs).toHaveLength(3);
    expect(cleanup).not.toHaveBeenCalled();
    act(() => {
      expect(hook.result.current.controller.append(page('overflow')).kind).toBe('rejected');
      hook.result.current.controller.focus('oldest');
    });
    await act(async () => { settle('allow'); await Promise.resolve(); });
    expect(hook.result.current.state.tabs.some(tab => tab.id === 'oldest')).toBe(true);
    expect(cleanup).not.toHaveBeenCalled();
    // The next inactive page is tried, never the now-active one.
    expect(prepare.mock.calls[1]?.[0]).toMatchObject({ id: 'middle' });
    await act(async () => { settle('allow'); });
    expect(hook.result.current.state.tabs).toHaveLength(2);
  });

  it('retains protected drafts and skips a failed save without deleting it', async () => {
    const prepare = vi.fn(async (tab: Tab): Promise<TabCloseAdmission> => tab.id === 'oldest' ? 'blocked' : 'allow');
    const { hook, cleanup } = setup({ prepare });
    act(() => { hook.result.current.controller.append(page('newest')); });
    await waitFor(() => expect(hook.result.current.state.tabs.map(tab => tab.id)).toEqual(['oldest', 'newest']));
    expect(cleanup.mock.calls[0]?.[0]).toMatchObject({ id: 'middle' });
  });

  it('preserves an explicit close made while automatic saving is in flight', async () => {
    let settle!: (value: TabCloseAdmission) => void;
    const prepare = vi.fn(async (_tab: Tab): Promise<TabCloseAdmission> => 'allow')
      .mockImplementationOnce(() => new Promise(resolve => { settle = resolve; }));
    const { hook, cleanup } = setup({ prepare });
    act(() => { hook.result.current.controller.append(page('newest')); });
    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    let closed!: Promise<boolean>;
    act(() => {
      hook.result.current.controller.focus('oldest');
      closed = hook.result.current.close('oldest', 'user');
    });
    await act(async () => { settle('allow'); await closed; });
    expect(await closed).toBe(true);
    expect(hook.result.current.state.tabs.some(tab => tab.id === 'oldest')).toBe(false);
    expect(cleanup.mock.calls.some(([tab, reason]) => tab.id === 'oldest' && reason === 'user')).toBe(true);
  });

  it('reports all-protected capacity without unmounting any page or growing without limit', async () => {
    const { hook, blocked, prepare } = setup({ protectedIds: new Set(['oldest', 'middle']) });
    act(() => { hook.result.current.controller.append(page('newest')); });
    await waitFor(() => expect(blocked).toHaveBeenCalledTimes(1));
    expect(prepare).not.toHaveBeenCalled();
    expect(hook.result.current.state.tabs).toHaveLength(3);
    act(() => { expect(hook.result.current.controller.append(page('overflow')).kind).toBe('rejected'); });
  });

  it('does not evict an extra page after another close already freed capacity during saving', async () => {
    let settle!: (value: TabCloseAdmission) => void;
    const prepare = vi.fn(async (_tab: Tab): Promise<TabCloseAdmission> => 'allow')
      .mockImplementationOnce(() => new Promise(resolve => { settle = resolve; }));
    const { hook, cleanup } = setup({ prepare });
    act(() => { hook.result.current.controller.append(page('newest')); });
    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    await act(async () => { await hook.result.current.close('middle', 'user'); });
    await act(async () => { settle('allow'); });
    expect(hook.result.current.state.tabs.map(tab => tab.id)).toEqual(['oldest', 'newest']);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('keeps a page whose interaction guard becomes protected while editor saving is pending', async () => {
    let settle!: (value: TabCloseAdmission) => void;
    const protectedIds = new Set<string>();
    const prepare = vi.fn(async (_tab: Tab): Promise<TabCloseAdmission> => 'allow')
      .mockImplementationOnce(() => new Promise(resolve => { settle = resolve; }));
    const { hook, cleanup } = setup({ prepare, protectedIds });
    act(() => { hook.result.current.controller.append(page('newest')); });
    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    protectedIds.add('oldest');
    await act(async () => { settle('allow'); });
    expect(hook.result.current.state.tabs.map(tab => tab.id)).toEqual(['oldest', 'newest']);
    expect(cleanup.mock.calls[0]?.[0]).toMatchObject({ id: 'middle' });
  });
});
