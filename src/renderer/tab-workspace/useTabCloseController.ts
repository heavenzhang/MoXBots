import { useCallback, useLayoutEffect, useRef } from 'react';

import type { TabBase } from '@/tab-workspace/contracts';
import type { DetachTabResult, TabWorkspaceController } from '@/tab-workspace/useTabWorkspaceController';

export type TabCloseAdmission = 'allow' | 'blocked';

export interface TabLifecycleAdapter<TTab extends TabBase<string>, TReason extends string = string> {
  prepareClose?: (tab: TTab, reason: TReason) => TabCloseAdmission | Promise<TabCloseAdmission>;
  afterDetach?: (tab: TTab, reason: TReason) => void | Promise<void>;
}

export type TabLifecycleMap<TTab extends TabBase<string>, TReason extends string> = {
  readonly [K in TTab['view']]?: TabLifecycleAdapter<Extract<TTab, { view: K }>, TReason>;
};

interface CloseControllerOptions<
  TTab extends TabBase<string>,
  TModules extends { readonly [K in TTab['view']]: { readonly kind: K } },
  TReason extends string,
> {
  workspace: TabWorkspaceController<TTab, TModules>;
  lifecycle: TabLifecycleMap<TTab, TReason>;
  defaultReason: TReason;
  createFallback: () => TTab;
  onBeforeDetach?: (tab: TTab, reason: TReason) => void;
  /** Recheck navigation/protection after asynchronous save admission. */
  canDetach?: (tab: TTab, reason: TReason) => boolean;
  onDetached?: (result: Extract<DetachTabResult<TTab>, { kind: 'detached' }>, reason: TReason) => void;
  onCleanupError?: (tab: TTab, error: unknown) => void;
}

export function useTabCloseController<
  TTab extends TabBase<string>,
  TModules extends { readonly [K in TTab['view']]: { readonly kind: K } },
  TReason extends string,
>({
  workspace,
  lifecycle,
  defaultReason,
  createFallback,
  onBeforeDetach,
  canDetach,
  onDetached,
  onCleanupError,
}: CloseControllerOptions<TTab, TModules, TReason>) {
  const optionsRef = useRef({
    lifecycle,
    defaultReason,
    createFallback,
    onBeforeDetach,
    canDetach,
    onDetached,
    onCleanupError,
  });
  useLayoutEffect(() => {
    optionsRef.current = {
      lifecycle,
      defaultReason,
      createFallback,
      onBeforeDetach,
      canDetach,
      onDetached,
      onCleanupError,
    };
  }, [canDetach, createFallback, defaultReason, lifecycle, onBeforeDetach, onCleanupError, onDetached]);
  const inFlightRef = useRef(new Map<string, { reason: TReason; promise: Promise<boolean> }>());

  return useCallback(
    function closeTab(tabId: string, reason?: TReason): Promise<boolean> {
      const closeReason = reason ?? optionsRef.current.defaultReason;
      const inFlight = inFlightRef.current.get(tabId);
      if (inFlight) {
        if (inFlight.reason === closeReason) return inFlight.promise;
        // An explicit user close must not inherit a cancelled cache eviction.
        // Re-admit it after the original save settles, using the latest page.
        return inFlight.promise.then(closed => closed || closeTab(tabId, closeReason));
      }
      const captured = workspace.capture(tabId);
      if (!captured) return Promise.resolve(false);
      const tab = workspace.getSnapshot().tabs.find((candidate) => candidate.id === tabId);
      if (!tab) return Promise.resolve(false);
      const adapter = optionsRef.current.lifecycle[tab.view as TTab['view']] as
        | TabLifecycleAdapter<TTab, TReason>
        | undefined;
      const detach = () => {
        const live = workspace.getSnapshot().tabs.find(candidate => candidate.id === tabId);
        if (!live || optionsRef.current.canDetach?.(live, closeReason) === false) return false;
        const result = workspace.detach(captured, optionsRef.current.createFallback, (acceptedTab) =>
          optionsRef.current.onBeforeDetach?.(acceptedTab, closeReason),
        );
        if (result.kind !== 'detached') return false;
        optionsRef.current.onDetached?.(result, closeReason);
        if (adapter?.afterDetach) {
          Promise.resolve(adapter.afterDetach(result.tab, closeReason)).catch((error) =>
            optionsRef.current.onCleanupError?.(result.tab, error),
          );
        }
        return true;
      };

      const admission = adapter?.prepareClose?.(tab, closeReason) ?? 'allow';
      if (!(admission instanceof Promise)) {
        return Promise.resolve(admission === 'allow' && detach());
      }

      const pending = admission
        .then((result) => {
          return result === 'allow' && detach();
        })
        .catch((error) => {
          optionsRef.current.onCleanupError?.(tab, error);
          return false;
        })
        .finally(() => inFlightRef.current.delete(tabId));
      inFlightRef.current.set(tabId, { reason: closeReason, promise: pending });
      return pending;
    },
    [workspace],
  );
}
