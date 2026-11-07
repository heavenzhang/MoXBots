import type { WorkspaceFileService } from '@/hooks/useWorkspaceFileService';

export type BotCareDocumentKind = 'definition' | 'memory';
export interface BotCareDocumentInventory {
  paths: string[];
  missingDefinitions: string[];
  memoryDirectoryExists: boolean;
  truncated: boolean;
}

const ROOT_PATHS = ['CLAUDE.md', 'AGENTS.md', 'MEMORY.md', '.claude/rules', 'memory'];
const MAX_FILES = 200;
const MAX_DIRECTORIES = 32;
const MAX_DEPTH = 4;
const MAX_ENTRIES = 1000;
const isMemory = (path: string) => /memor(?:y|ies)|记忆/i.test(path);

/** List existing workspace files only. No file contents, shadow store or assumed template. */
export async function discoverBotCareDocuments(
  files: Pick<WorkspaceFileService, 'checkPaths' | 'dirExpand'>,
  kind: BotCareDocumentKind,
  isCurrent: () => boolean = () => true,
): Promise<BotCareDocumentInventory> {
  const checked = await files.checkPaths({ paths: ROOT_PATHS });
  const paths = new Set<string>();
  let truncated = false;
  const missingDefinitions: string[] = [];
  for (const path of ROOT_PATHS) {
    if (checked.results[path]?.error) throw new Error(`${path}: ${checked.results[path].error}`);
  }
  for (const path of ['CLAUDE.md', 'AGENTS.md']) {
    const info = checked.results[path];
    if (info?.exists && info.type === 'file') {
      if (kind === 'definition') paths.add(path);
    } else if (!info?.exists) missingDefinitions.push(path);
  }
  if (kind === 'memory' && checked.results['MEMORY.md']?.exists && checked.results['MEMORY.md'].type === 'file') paths.add('MEMORY.md');
  const queue: { path: string; depth: number; rules: boolean }[] = [];
  if (checked.results['.claude/rules']?.exists && checked.results['.claude/rules'].type === 'dir') {
    queue.push({ path: '.claude/rules', depth: 0, rules: true });
  }
  const memoryDirectoryExists = checked.results.memory?.exists === true && checked.results.memory.type === 'dir';
  if (kind === 'memory' && memoryDirectoryExists) queue.push({ path: 'memory', depth: 0, rules: false });
  let visited = 0;
  while (queue.length && isCurrent()) {
    if (visited++ >= MAX_DIRECTORIES || paths.size >= MAX_FILES) { truncated = true; break; }
    const current = queue.shift()!;
    const expanded = await files.dirExpand({ path: current.path });
    if (!isCurrent()) break;
    if (!expanded.loaded || expanded.children.length > MAX_ENTRIES) truncated = true;
    for (const child of expanded.children.slice(0, MAX_ENTRIES)) {
      // Use the requested parent and a single entry name; never trust an absolute
      // or traversing path returned by a directory listing as mutation authority.
      if (!child.name || /[/\\]/.test(child.name) || child.name === '.' || child.name === '..') continue;
      const path = `${current.path}/${child.name}`;
      if (child.type === 'file' && /\.md$/i.test(child.name) && (!current.rules || kind === 'definition' || isMemory(child.name))) {
        if (paths.size >= MAX_FILES) { truncated = true; break; }
        paths.add(path);
      } else if (child.type === 'dir' && !current.rules) {
        if (current.depth >= MAX_DEPTH) truncated = true;
        else queue.push({ path, depth: current.depth + 1, rules: false });
      }
    }
  }
  return { paths: [...paths].sort(), missingDefinitions, memoryDirectoryExists, truncated };
}

/** A note is a direct Markdown child of the existing memory directory. */
export function memoryNoteFilename(input: string): string | null {
  const name = input.trim();
  if (!name || name === '.' || name === '..' || /[/\\<>:"|?*]/.test(name) || [...name].some(char => char.charCodeAt(0) < 32) || /[. ]$/.test(name)) return null;
  return /\.md$/i.test(name) ? name : `${name}.md`;
}
