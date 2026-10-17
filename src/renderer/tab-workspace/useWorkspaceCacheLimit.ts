import { useEffect, useLayoutEffect, useRef } from 'react';

import type { TabBase } from './contracts';
import type { TabWorkspaceState } from './workspaceState';

interface CacheOptions<TTab extends TabBase<string>> {
  state: TabWorkspaceState<TTab>;
  getSnapshot: () => TabWorkspaceState<TTab>;
  limit: number;
  canEvict: (tab: TTab) => boolean;
  close: (tabId: string) => Promise<boolean>;
  onBlocked: () => void;
}

/** The workspace remains the sole page owner. Save/close admission is serial;
 * the shell admits only one extra page while the oldest page is being saved. */
export function useWorkspaceCacheLimit<TTab extends TabBase<string>>(options: CacheOptions<TTab>) {
  const latest = useRef(options);
  useLayoutEffect(() => { latest.current = options; });
  const draining = useRef(false);
  useEffect(() => {
    if (draining.current || options.state.tabs.length <= options.limit) return;
    draining.current = true;
    void (async () => {
      const attempted = new Set<string>();
      while (true) {
        const current = latest.current;
        const snapshot = current.getSnapshot();
        if (snapshot.tabs.length <= current.limit) return;
        // No MRU refresh on focus: array order is the original opening order.
        const candidate = snapshot.tabs.find(tab => tab.id !== snapshot.activeTabId
          && !attempted.has(tab.id) && current.canEvict(tab));
        if (!candidate) { current.onBlocked(); return; }
        attempted.add(candidate.id);
        await current.close(candidate.id);
      }
    })().catch(() => latest.current.onBlocked()).finally(() => { draining.current = false; });
  }, [options.state, options.limit]);
}
