import { describe, expect, it } from 'vitest';
import type { ContentBlock } from '@/types/chat';
import { buildProcessPhases, getProcessOutcome, type ProcessEntry } from './processPresentation';
import { executionEvidence, groupProcessResults, processPhaseResult, processResultLabel } from './processResults';

function edit(id: string, path: string, patch: Record<string, unknown> = {}): ContentBlock {
  return { type: 'tool_use', tool: { id, name: 'Edit', input: {}, streamIndex: 0, parsedInput: { file_path: path, old_string: 'old', new_string: 'new' }, result: 'updated', ...patch } } as ContentBlock;
}
const entry = (block: ContentBlock, index: number): ProcessEntry => ({ block, index, outcome: getProcessOutcome(block, true) });
const t = (key: string, options?: Record<string, unknown>) => `${key}:${JSON.stringify(options ?? {})}`;
describe('result-first execution projection', () => {
  it('groups only adjacent successful updates to the same full path', () => {
    const entries = [edit('a', '/a/x.ts'), edit('b', '/a/x.ts'), edit('c', '/b/x.ts'), edit('d', '/a/x.ts', { isError: true }), edit('e', '/a/x.ts')].map(entry);
    expect(groupProcessResults(entries).map(group => group.entries.length)).toEqual([2, 1, 1, 1]);
    expect(groupProcessResults(entries).flatMap(group => group.entries)).toEqual(entries);
  });
  it('reports unique files, never the last edit as a phase total or an invented net diff', () => {
    const phase = buildProcessPhases([edit('a', '/a.ts'), edit('b', '/a.ts')], false)[0];
    expect(processPhaseResult(phase, t)).toBe('process.result.file:{"target":"a.ts"}');
    expect(processPhaseResult(phase, t)).not.toMatch(/[+−-]\d/);
  });
  it('shows up to two concrete file milestones and a count for the remaining distinct files', () => {
    const phase = buildProcessPhases([
      edit('a', '/src/a.ts'), edit('b', '/src/b.ts'), edit('c', '/src/c.ts'), edit('d', '/src/d.ts'),
    ], false)[0];
    expect(processPhaseResult(phase, t)).toBe(
      'process.result.file:{"target":"a.ts"} · process.result.file:{"target":"b.ts"} · process.result.moreMilestones:{"count":2}',
    );
  });
  it('keeps returned check output factual and does not synthesize successful checks', () => {
    const blocks = [
      { type: 'tool_use', tool: { id: 'check1', name: 'Bash', input: {}, parsedInput: { command: 'npm test' }, result: '8 passed', resultMeta: { exitCode: 0 }, streamIndex: 0 } } as ContentBlock,
      { type: 'tool_use', tool: { id: 'check2', name: 'Bash', input: {}, parsedInput: { command: 'npm run typecheck' }, result: 'TypeScript clean', resultMeta: { exitCode: 0 }, streamIndex: 1 } } as ContentBlock,
      { type: 'tool_use', tool: { id: 'check3', name: 'Bash', input: {}, parsedInput: { command: 'npx vitest' }, result: '6 passed', resultMeta: { exitCode: 0 }, streamIndex: 2 } } as ContentBlock,
    ];
    const phase = buildProcessPhases(blocks, false)[0];
    expect(processPhaseResult(phase, t)).toBe(
      '8 passed · TypeScript clean · process.result.moreMilestones:{"count":1}',
    );
  });
  it('does not hide a live result behind earlier successful changes', () => {
    const phase = buildProcessPhases([edit('a', '/a.ts'), edit('b', '/a.ts', { isLoading: true, result: undefined })], true)[0];
    expect(processPhaseResult(phase, t)).toContain('process.work.change');
  });
  it('does not classify arbitrary descriptions or output as a passed check', () => {
    const blocks = [edit('a', '/a.ts'), { type: 'tool_use', tool: { id: 'cmd', name: 'Bash', input: {}, parsedInput: { command: 'echo test passed', description: 'npm test' }, result: '24 passed', resultMeta: { exitCode: 0 }, streamIndex: 0 } } as ContentBlock];
    expect(executionEvidence(blocks)).toMatchObject({ checksReturned: 0, checksFailed: 0 });
    expect(processResultLabel(entry(blocks[0], 0), t)).not.toMatch(/Edit|Bash/);
  });
});
