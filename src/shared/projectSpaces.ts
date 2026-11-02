import { workspacePathsEqual } from './workspacePath';

export interface ProjectSpaceMaterial { id: string; title: string; content: string }
export interface ProjectSpaceResource { id: string; label: string; path: string }
/** Organizational project; legacy Project remains the Bot-owned workspace. */
export interface ProjectSpace {
  id: string;
  name: string;
  description: string;
  instructions: string;
  memberBotIds: string[];
  materials: ProjectSpaceMaterial[];
  resources: ProjectSpaceResource[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}
export type ProjectSpaceDraft = Pick<ProjectSpace, 'name' | 'description' | 'instructions' | 'memberBotIds' | 'materials' | 'resources'>;
/** IDs only. The server compiles the authoritative birth snapshot. */
export interface ProjectSpaceSelection { projectId: string; botId: string; projectRevision: number }
export interface ProjectSpaceSessionSnapshot {
  schemaVersion: 1;
  projectId: string;
  projectName: string;
  projectRevision: number;
  botId: string;
  botName: string;
  botIcon?: string;
  workspacePath: string;
  capturedAt: string;
  description: string;
  instructions: string;
  materials: ProjectSpaceMaterial[];
  resources: ProjectSpaceResource[];
}
export interface ProjectSpaceBotIdentity { id: string; name: string; icon?: string }
export interface ProjectSpaceWorkspace { id: string; path: string; agentId?: string; hidden?: boolean; archivedAt?: string; internal?: boolean }
export type ProjectSpaceErrorCode = 'invalid' | 'not-found' | 'archived' | 'revision-conflict' | 'bot-not-member' | 'bot-unavailable' | 'workspace-conflict' | 'immutable';
export class ProjectSpaceError extends Error {
  constructor(public readonly code: ProjectSpaceErrorCode, message: string) { super(message); this.name = 'ProjectSpaceError'; }
}
export const PROJECT_SPACE_MAX_BYTES = 32_768;
export const PROJECT_SPACE_DRAFT_MAX_BYTES = 20_000;
const invalid = (message: string): never => { throw new ProjectSpaceError('invalid', message); };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('Expected a project object');
  return value as Record<string, unknown>;
}
function text(value: unknown, key: string, max: number, required = false): string {
  if (typeof value !== 'string' || value.length > max || value.includes('\0') || required && !value.trim()) return invalid(`Invalid ${key}`);
  return required ? value.trim() : value;
}
function id(value: unknown): string { return text(value, 'id', 160, true); }
function timestamp(value: unknown): string {
  const result = text(value, 'timestamp', 40, true);
  if (!Number.isFinite(Date.parse(result))) return invalid('Invalid project timestamp');
  return result;
}
function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) return invalid('Invalid project revision');
  return value;
}
function array(value: unknown, name: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) return invalid(`Invalid ${name}`);
  return value;
}
function unique<T>(items: T[], key: (item: T) => string): T[] {
  if (new Set(items.map(key)).size !== items.length) return invalid('Duplicate project item');
  return items;
}
export function isAbsoluteProjectResourcePath(path: string): boolean {
  return /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(path) && !/[\r\n\0]/.test(path);
}
function materials(value: unknown): ProjectSpaceMaterial[] {
  return unique(array(value, 'materials', 8).map(raw => {
    const item = object(raw);
    return { id: id(item.id), title: text(item.title, 'material title', 100, true), content: text(item.content, 'material content', 4_000, true) };
  }), item => item.id);
}
function resources(value: unknown): ProjectSpaceResource[] {
  return unique(array(value, 'resources', 4).map(raw => {
    const item = object(raw); const path = text(item.path, 'resource path', 4_096, true);
    if (!isAbsoluteProjectResourcePath(path)) return invalid('Resource path must be absolute');
    return { id: id(item.id), label: text(item.label, 'resource label', 100, true), path };
  }), item => item.id);
}
function bounded<T>(value: T, maxBytes = PROJECT_SPACE_MAX_BYTES): T {
  if (new TextEncoder().encode(JSON.stringify(value)).length > maxBytes) return invalid('Project exceeds the 32 KiB limit');
  return value;
}
export function normalizeProjectSpaceDraft(raw: unknown): ProjectSpaceDraft {
  const input = object(raw);
  return bounded({
    name: text(input.name, 'project name', 100, true),
    description: text(input.description, 'project description', 2_000),
    instructions: text(input.instructions, 'project instructions', 4_000),
    memberBotIds: unique(array(input.memberBotIds, 'members', 64).map(id), item => item),
    materials: materials(input.materials), resources: resources(input.resources),
  }, PROJECT_SPACE_DRAFT_MAX_BYTES);
}
export function normalizeProjectSpace(raw: unknown): ProjectSpace {
  const input = object(raw);
  return bounded({ id: id(input.id), ...normalizeProjectSpaceDraft(input), revision: revision(input.revision),
    createdAt: timestamp(input.createdAt), updatedAt: timestamp(input.updatedAt),
    ...(input.archivedAt === undefined ? {} : { archivedAt: timestamp(input.archivedAt) }),
  });
}
/** Malformed persisted data is an error, never an empty catalog to overwrite. */
export function readProjectSpaces(raw: unknown): ProjectSpace[] {
  if (raw === undefined) return [];
  return unique(array(raw, 'project catalog', 500).map(normalizeProjectSpace), item => item.id);
}
export function parseProjectSpaceSelection(raw: unknown): ProjectSpaceSelection {
  const input = object(raw);
  return { projectId: id(input.projectId), botId: id(input.botId), projectRevision: revision(input.projectRevision) };
}
export function normalizeProjectSpaceSessionSnapshot(raw: unknown): ProjectSpaceSessionSnapshot {
  const input = object(raw);
  if (input.schemaVersion !== 1) return invalid('Unsupported project snapshot');
  const workspacePath = text(input.workspacePath, 'workspace path', 4_096, true);
  if (!isAbsoluteProjectResourcePath(workspacePath)) return invalid('Workspace path must be absolute');
  return bounded({ schemaVersion: 1, projectId: id(input.projectId), projectName: text(input.projectName, 'project name', 100, true),
    projectRevision: revision(input.projectRevision), botId: id(input.botId), botName: text(input.botName, 'Bot name', 200, true),
    ...(input.botIcon === undefined ? {} : { botIcon: text(input.botIcon, 'Bot icon', 4_096) }),
    workspacePath, capturedAt: timestamp(input.capturedAt), description: text(input.description, 'description', 2_000),
    instructions: text(input.instructions, 'instructions', 4_000), materials: materials(input.materials), resources: resources(input.resources),
  });
}
export function projectSpaceSnapshotsEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalizeProjectSpaceSessionSnapshot(left)) === JSON.stringify(normalizeProjectSpaceSessionSnapshot(right));
}
/** Existing-row saves may omit old fields, but cannot attach/reassign a project. */
export function preserveProjectSpaceSessionSnapshot(previous: unknown, proposed: unknown): ProjectSpaceSessionSnapshot | undefined {
  if (previous === undefined) {
    if (proposed !== undefined) throw new ProjectSpaceError('immutable', 'An existing conversation cannot be assigned to a project');
    return undefined;
  }
  const snapshot = normalizeProjectSpaceSessionSnapshot(previous);
  if (proposed !== undefined && !projectSpaceSnapshotsEqual(snapshot, proposed)) throw new ProjectSpaceError('immutable', 'Conversation project identity is immutable');
  return structuredClone(snapshot);
}
export function findProjectSpaceBotWorkspace<T extends ProjectSpaceWorkspace>(botId: string, workspaces: readonly T[]): T | undefined {
  // Even hidden/archived claims participate in uniqueness. Never choose an
  // apparently usable row while a different row owns the same stable Bot ID.
  const claims = workspaces.filter(item => item.agentId === botId);
  if (claims.length !== 1 || claims[0].hidden || claims[0].archivedAt || claims[0].internal) return undefined;
  return claims[0];
}
export function compileProjectSpaceSessionSnapshot(input: {
  selection: unknown; projectSpaces: unknown; bots: readonly ProjectSpaceBotIdentity[];
  workspaces: readonly ProjectSpaceWorkspace[]; workspacePath: string; capturedAt: string;
}): ProjectSpaceSessionSnapshot {
  const selection = parseProjectSpaceSelection(input.selection);
  const project = readProjectSpaces(input.projectSpaces).find(item => item.id === selection.projectId);
  if (!project) throw new ProjectSpaceError('not-found', 'Project no longer exists');
  if (project.archivedAt) throw new ProjectSpaceError('archived', 'Project is archived');
  if (project.revision !== selection.projectRevision) throw new ProjectSpaceError('revision-conflict', 'Project changed; refresh before starting a conversation');
  if (!project.memberBotIds.includes(selection.botId)) throw new ProjectSpaceError('bot-not-member', 'Bot is not a project member');
  const bots = input.bots.filter(item => item.id === selection.botId);
  const workspace = findProjectSpaceBotWorkspace(selection.botId, input.workspaces);
  if (bots.length !== 1 || !workspace) throw new ProjectSpaceError('bot-unavailable', 'Bot identity or workspace is unavailable');
  if (!workspacePathsEqual(workspace.path, input.workspacePath)) throw new ProjectSpaceError('workspace-conflict', 'Selected Bot does not own this workspace');
  return normalizeProjectSpaceSessionSnapshot({ schemaVersion: 1, projectId: project.id, projectName: project.name, projectRevision: project.revision,
    botId: bots[0].id, botName: bots[0].name, ...(bots[0].icon && bots[0].icon.length <= 4_096 ? { botIcon: bots[0].icon } : {}), workspacePath: workspace.path,
    capturedAt: input.capturedAt, description: project.description, instructions: project.instructions,
    materials: project.materials, resources: project.resources,
  });
}
export type ProjectSpaceMutation =
  | { kind: 'create'; id: string; draft: ProjectSpaceDraft; at: string }
  | { kind: 'update'; id: string; expectedRevision: number; draft: ProjectSpaceDraft; at: string }
  | { kind: 'archive'; id: string; expectedRevision: number; archived: boolean; at: string };
export function applyProjectSpaceMutation(raw: unknown, command: ProjectSpaceMutation, bots: readonly ProjectSpaceBotIdentity[]): ProjectSpace[] {
  const catalog = readProjectSpaces(raw); const index = catalog.findIndex(item => item.id === command.id); const at = timestamp(command.at);
  if (command.kind === 'create' && index !== -1) throw new ProjectSpaceError('revision-conflict', 'Project already exists');
  if (command.kind !== 'create' && index === -1) throw new ProjectSpaceError('not-found', 'Project no longer exists');
  if (command.kind !== 'create' && catalog[index].revision !== command.expectedRevision) throw new ProjectSpaceError('revision-conflict', 'Project changed in another window');
  if (command.kind === 'archive') {
    const { archivedAt: _oldArchive, ...current } = catalog[index];
    catalog[index] = normalizeProjectSpace({ ...current, revision: current.revision + 1, updatedAt: at, ...(command.archived ? { archivedAt: at } : {}) });
  } else {
    const draft = normalizeProjectSpaceDraft(command.draft);
    if (draft.memberBotIds.some(botId => bots.filter(bot => bot.id === botId).length !== 1)) throw new ProjectSpaceError('bot-unavailable', 'A selected Bot is no longer available');
    if (command.kind === 'create') catalog.push(normalizeProjectSpace({ id: command.id, ...draft, revision: 1, createdAt: at, updatedAt: at }));
    else {
      if (catalog[index].archivedAt) throw new ProjectSpaceError('archived', 'Restore the project before editing');
      catalog[index] = normalizeProjectSpace({ ...catalog[index], ...draft, revision: catalog[index].revision + 1, updatedAt: at });
    }
  }
  return catalog;
}
