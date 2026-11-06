import { describe, expect, it, vi } from 'vitest';
import { discoverBotCareDocuments, memoryNoteFilename } from './documentInventory';

const file = (name: string) => ({ id: name, name, path: name, type: 'file' as const });
const dir = (name: string) => ({ id: name, name, path: name, type: 'dir' as const });
const exists = (type: 'file' | 'dir') => ({ exists: true, type });

describe('Bot care document discovery', () => {
  const service = () => ({
    checkPaths: vi.fn().mockResolvedValue({ results: {
      'CLAUDE.md': exists('file'), 'AGENTS.md': exists('file'),
      '.claude/rules': exists('dir'), memory: exists('dir'),
    } }),
    dirExpand: vi.fn().mockImplementation(async ({ path }: { path: string }) => ({ loaded: true, children: ({
      '.claude/rules': [file('identity.md'), file('27-memories.md'), file('notes.txt')],
      memory: [dir('topics'), dir('daily'), file('principles.md')],
      'memory/topics': [file('client.md')],
      'memory/daily': [file('2026-11-07.md')],
    } as Record<string, ReturnType<typeof file | typeof dir>[]>)[path] || [] })),
  });

  it('finds actual root definitions and every direct rule without assuming a template', async () => {
    const files = service();
    const result = await discoverBotCareDocuments(files, 'definition');
    expect(result.paths).toEqual(['.claude/rules/27-memories.md', '.claude/rules/identity.md', 'AGENTS.md', 'CLAUDE.md']);
    expect(files.dirExpand).toHaveBeenCalledTimes(1);
    expect(files.dirExpand).toHaveBeenCalledWith({ path: '.claude/rules' });
  });

  it('finds named memory rules plus daily/topic Markdown without inventing 04-MEMORY', async () => {
    const result = await discoverBotCareDocuments(service(), 'memory');
    expect(result.paths).toEqual(['.claude/rules/27-memories.md', 'memory/daily/2026-11-07.md', 'memory/principles.md', 'memory/topics/client.md']);
    expect(result.paths.some(path => path.includes('04-MEMORY'))).toBe(false);
  });

  it('reports genuinely missing definitions and a genuinely empty memory list', async () => {
    const files = { checkPaths: vi.fn().mockResolvedValue({ results: {} }), dirExpand: vi.fn() };
    expect(await discoverBotCareDocuments(files, 'memory')).toEqual({ paths: [], missingDefinitions: ['CLAUDE.md', 'AGENTS.md'], memoryDirectoryExists: false, truncated: false });
    expect(files.dirExpand).not.toHaveBeenCalled();
  });

  it('caps directory traversal and reports incomplete enumeration', async () => {
    const files = service();
    files.dirExpand.mockImplementation(async ({ path }: { path: string }) => ({ loaded: true, children: path === 'memory' ? Array.from({ length: 100 }, (_, i) => dir(`topic-${i}`)) : [] }));
    expect((await discoverBotCareDocuments(files, 'memory')).truncated).toBe(true);
    expect(files.dirExpand.mock.calls.length).toBeLessThanOrEqual(32);
  });

  it('surfaces access failures rather than claiming files are absent', async () => {
    const files = service();
    files.checkPaths.mockResolvedValue({ results: { memory: { exists: false, type: 'dir', error: 'Access denied' } } });
    await expect(discoverBotCareDocuments(files, 'memory')).rejects.toThrow('Access denied');
  });

  it.each(['../draft', 'a/b', 'a\\b', '.', '', 'invalid?', 'trailing.', 'line\nbreak'])('rejects unsafe note filename %j', name => {
    expect(memoryNoteFilename(name)).toBeNull();
  });
  it('preserves a chosen Markdown filename and adds the extension once', () => {
    expect(memoryNoteFilename('项目经验')).toBe('项目经验.md');
    expect(memoryNoteFilename('note.MD')).toBe('note.MD');
  });
});
