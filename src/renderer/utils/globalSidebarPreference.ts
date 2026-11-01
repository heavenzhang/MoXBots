import { normalizeWorkspacePathIdentity } from '../../shared/workspacePath';
import {
  DEFAULT_SIDEBAR_ORGANIZATION,
  parseSidebarOrganization,
  type SidebarOrganization,
} from './sidebarOrganization';

export const GLOBAL_SIDEBAR_PREFERENCE_KEY = 'myagents.globalSidebar.v1';
export const LEGACY_AUTOMATION_HISTORY_KEY =
  'myagents.launcher.showAutomationHistorySessions';

export const GLOBAL_SIDEBAR_DEFAULT_WIDTH = 256;
export const GLOBAL_SIDEBAR_MIN_WIDTH = 220;
export const GLOBAL_SIDEBAR_MAX_WIDTH = 420;

export function clampGlobalSidebarWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return GLOBAL_SIDEBAR_DEFAULT_WIDTH;
  return Math.min(GLOBAL_SIDEBAR_MAX_WIDTH, Math.max(GLOBAL_SIDEBAR_MIN_WIDTH, Math.round(value)));
}

export type GlobalSidebarPreferredMode = 'expanded' | 'rail';

export interface GlobalSidebarPreferenceV1 {
  version: 1;
  preferredMode: GlobalSidebarPreferredMode;
  expandedWidth: number;
  expandedWorkspaceKeys: string[];
  /** Stable fallback order; explicit drag orders and pin priority still apply. */
  projectOrder: string[];
  hasSeededDefaultExpansion: boolean;
  showAutomationSessions: boolean;
  sessionView: 'all' | 'favorites' | 'archived';
  resourceView: 'conversations' | 'projects' | 'history';
  organization: SidebarOrganization;
}

export const DEFAULT_GLOBAL_SIDEBAR_PREFERENCE: GlobalSidebarPreferenceV1 = {
  version: 1,
  preferredMode: 'expanded',
  expandedWidth: GLOBAL_SIDEBAR_DEFAULT_WIDTH,
  expandedWorkspaceKeys: [],
  projectOrder: [],
  hasSeededDefaultExpansion: false,
  showAutomationSessions: false,
  sessionView: 'all',
  resourceView: 'conversations',
  organization: DEFAULT_SIDEBAR_ORGANIZATION,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeWorkspaceKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const keys = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== 'string' || candidate.trim() === '') continue;
    keys.add(normalizeWorkspacePathIdentity(candidate));
  }
  return [...keys];
}

export function parseGlobalSidebarPreference(
  value: unknown,
): GlobalSidebarPreferenceV1 | null {
  if (!isRecord(value) || value.version !== 1) return null;
  if (value.preferredMode !== 'expanded' && value.preferredMode !== 'rail')
    return null;
  if (typeof value.hasSeededDefaultExpansion !== 'boolean') return null;

  return {
    version: 1,
    preferredMode: value.preferredMode,
    expandedWidth: clampGlobalSidebarWidth(value.expandedWidth),
    expandedWorkspaceKeys: normalizeWorkspaceKeys(value.expandedWorkspaceKeys),
    projectOrder: Array.isArray(value.projectOrder)
      ? [...new Set(value.projectOrder.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))]
      : [],
    hasSeededDefaultExpansion: value.hasSeededDefaultExpansion,
    showAutomationSessions:
      typeof value.showAutomationSessions === 'boolean'
        ? value.showAutomationSessions
        : false,
    sessionView:
      value.sessionView === 'favorites' || value.sessionView === 'archived'
        ? value.sessionView
        : 'all',
    resourceView: value.resourceView === 'projects' || value.resourceView === 'history' ? value.resourceView : 'conversations',
    organization: parseSidebarOrganization(value.organization),
  };
}

export function loadGlobalSidebarPreference(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): GlobalSidebarPreferenceV1 {
  const raw = storage.getItem(GLOBAL_SIDEBAR_PREFERENCE_KEY);
  if (raw) {
    try {
      const parsed = parseGlobalSidebarPreference(JSON.parse(raw));
      if (parsed) return parsed;
      console.warn('[GlobalSidebar] Ignoring unsupported sidebar preference');
    } catch (error) {
      console.warn(
        '[GlobalSidebar] Ignoring malformed sidebar preference:',
        error,
      );
    }
  }

  const legacyAutomation = storage.getItem(LEGACY_AUTOMATION_HISTORY_KEY);
  const migrated: GlobalSidebarPreferenceV1 = {
    ...DEFAULT_GLOBAL_SIDEBAR_PREFERENCE,
    showAutomationSessions: legacyAutomation === 'true',
  };
  try {
    storage.setItem(GLOBAL_SIDEBAR_PREFERENCE_KEY, JSON.stringify(migrated));
    if (legacyAutomation !== null)
      storage.removeItem(LEGACY_AUTOMATION_HISTORY_KEY);
  } catch (error) {
    console.warn(
      '[GlobalSidebar] Failed to persist migrated sidebar preference:',
      error,
    );
  }
  return migrated;
}

export function saveGlobalSidebarPreference(
  storage: Pick<Storage, 'setItem'>,
  preference: GlobalSidebarPreferenceV1,
): boolean {
  try {
    storage.setItem(GLOBAL_SIDEBAR_PREFERENCE_KEY, JSON.stringify(preference));
    return true;
  } catch (error) {
    console.warn(
      '[GlobalSidebar] Failed to persist sidebar preference:',
      error,
    );
    return false;
  }
}

export function seedDefaultWorkspaceExpansion(
  preference: GlobalSidebarPreferenceV1,
  defaultWorkspacePath: string | null | undefined,
  validWorkspacePaths: readonly string[],
): GlobalSidebarPreferenceV1 {
  if (preference.hasSeededDefaultExpansion || !defaultWorkspacePath)
    return preference;
  const defaultKey = normalizeWorkspacePathIdentity(defaultWorkspacePath);
  const validKeys = new Set(
    validWorkspacePaths.map(normalizeWorkspacePathIdentity),
  );
  if (!validKeys.has(defaultKey)) return preference;
  return {
    ...preference,
    expandedWorkspaceKeys: [
      ...new Set([...preference.expandedWorkspaceKeys, defaultKey]),
    ],
    hasSeededDefaultExpansion: true,
  };
}

export function pruneRemovedWorkspaceKeys(
  preference: GlobalSidebarPreferenceV1,
  validWorkspacePaths: readonly string[],
): GlobalSidebarPreferenceV1 {
  const validKeys = new Set(
    validWorkspacePaths.map(normalizeWorkspacePathIdentity),
  );
  const expandedWorkspaceKeys = preference.expandedWorkspaceKeys.filter((key) =>
    validKeys.has(key),
  );
  if (expandedWorkspaceKeys.length === preference.expandedWorkspaceKeys.length)
    return preference;
  return { ...preference, expandedWorkspaceKeys };
}

export function resolveGlobalSidebarMode(
  preferredMode: GlobalSidebarPreferredMode,
  forceRail: boolean,
): GlobalSidebarPreferredMode {
  return forceRail ? 'rail' : preferredMode;
}

/** Capture the first visible order, retain existing positions, append new projects. */
export function reconcileSidebarProjectOrder(
  preference: GlobalSidebarPreferenceV1,
  projectIds: readonly string[],
): GlobalSidebarPreferenceV1 {
  const validIds = new Set(projectIds);
  const retained = preference.projectOrder.filter((id) => validIds.has(id));
  const seen = new Set(retained);
  const projectOrder = [...retained, ...projectIds.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  })];
  if (projectOrder.length === preference.projectOrder.length
    && projectOrder.every((id, index) => id === preference.projectOrder[index])) return preference;
  return { ...preference, projectOrder };
}
