import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readSkillFolderEntry } from './folder-source';

const roots: string[] = [];
function workspace() { const root = mkdtempSync(join(tmpdir(), 'bot-care-skill-')); roots.push(root); return root; }
afterEach(() => { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); });
describe('Skill folder entry admission', () => {
  it('reads a regular entry and leaves its source unchanged', () => {
    const root = workspace(); const content = '---\nname: review\n---\nReview a draft.';
    writeFileSync(join(root, 'SKILL.md'), content);
    expect(readSkillFolderEntry(root)).toBe(content);
    expect(readFileSync(join(root, 'SKILL.md'), 'utf8')).toBe(content);
  });
  it.skipIf(process.platform === 'win32')('rejects a link to an external file which the importer would omit', () => {
    const root = workspace(); const external = join(workspace(), 'external.md');
    writeFileSync(external, 'external instructions'); symlinkSync(external, join(root, 'SKILL.md'));
    expect(() => readSkillFolderEntry(root)).toThrow('regular file');
    expect(readFileSync(external, 'utf8')).toBe('external instructions');
  });
  it('rejects directories and missing entries', () => {
    const root = workspace(); expect(() => readSkillFolderEntry(root)).toThrow('regular file');
    mkdirSync(join(root, 'SKILL.md')); expect(() => readSkillFolderEntry(root)).toThrow('regular file');
  });
});
