import { describe, expect, it } from 'vitest';
import type { Message, ToolUseSimple } from '@/types/chat';
import { deriveConversationFiles } from './conversationFiles';

const message = (id: string, content: Message['content'], role: Message['role'] = 'assistant'): Message => ({ id, role, content, timestamp: new Date(0) });
const write = (path: string, extra: Partial<ToolUseSimple> = {}): Message['content'] => [{
  type: 'tool_use', tool: { id: 'write', name: 'Write', input: { file_path: path, content: 'report' }, result: 'saved', ...extra } as ToolUseSimple,
}];

describe('conversation file records', () => {
  it('deduplicates successful edits and assistant links, newest first, without declaring acceptance', () => {
    const files = deriveConversationFiles([
      message('write', write('/workspace/销售 周报.docx')),
      message('final', '[报告](%E9%94%80%E5%94%AE%20%E5%91%A8%E6%8A%A5.docx) [细节](details.md#L5)'),
    ], '/workspace');
    expect(files.map(file => [file.displayPath, file.messageId, file.status])).toEqual([
      ['details.md', 'final', 'linked'], ['销售 周报.docx', 'final', 'edited'],
    ]);
    expect(files[0].target).toEqual({ scope: 'workspace', path: 'details.md', initialLineNumber: 5 });
  });

  it('does not turn user inputs, thinking, logs, failed or unfinished writes into file records', () => {
    const content: Message['content'] = [
      { type: 'thinking', thinking: '[secret](secret.txt)' },
      { type: 'tool_use', tool: { id: 'bash', name: 'Bash', input: {}, result: '[log](log.txt)' } as ToolUseSimple },
    ];
    const files = deriveConversationFiles([
      message('input', '[input](input.txt)', 'user'),
      message('internal', content),
      message('failed', write('/workspace/failed.txt', { isError: true })),
      message('pending', write('/workspace/pending.txt', { isLoading: true })),
      message('stopped', write('/workspace/stopped.txt', { isStopped: true })),
      { ...message('notice', '[notice](notice.txt)'), presentationNotice: 'history bounded' },
    ], '/workspace');
    expect(files).toEqual([]);
  });

  it('parses real markdown references while ignoring examples in code and external or unsafe schemes', () => {
    const files = deriveConversationFiles([message('m', [
      '```md\n[fake](fake.txt)\n```',
      '`[inline](inline.txt)`',
      '[结果][doc]\n\n[doc]: <report final.pdf>',
      '[web](https://example.com/report.pdf) [unsafe](javascript:alert) [anchor](#title)',
    ].join('\n\n'))], '/workspace');
    expect(files.map(file => file.displayPath)).toEqual(['report final.pdf']);
  });

  it('uses one identity for Windows absolute and workspace-relative links', () => {
    const files = deriveConversationFiles([
      message('a', '[A](<C:/Work/REPORT.pdf>)'), message('b', '[B](report.pdf)'),
    ], 'C:\\Work');
    expect(files).toHaveLength(1);
    expect(files[0].messageId).toBe('b');
  });

  it('retires a renamed source and preserves a later deleted record even when prose links it again', () => {
    const patch = (id: string, kind: string, path: string, movePath?: string) => message(id, [{
      type: 'tool_use', tool: { id, name: 'fileChange', input: {}, result: 'done', display: {
        kind: 'file_patch', version: 1, source: 'codex', summary: { files: 1, added: 0, removed: 0 },
        changes: [{ path, kind, ...(movePath ? { movePath } : {}), added: 0, removed: 0, view: { kind: 'unified-diff' } }],
      } } as ToolUseSimple,
    }]);
    const files = deriveConversationFiles([
      message('old', write('/workspace/old.md')), patch('rename', 'update', 'old.md', 'new.md'),
      patch('remove', 'delete', 'new.md'), message('link', '[previous file](new.md)'),
    ], '/workspace');
    expect(files.map(file => [file.displayPath, file.status])).toEqual([['new.md', 'deleted']]);
  });

  it('retires same-message and subsequent old links, but allows a proven recreation', () => {
    const renamed: Message['content'] = [
      { type: 'text', text: '[old](old.md)' },
      { type: 'tool_use', tool: { id: 'rename', name: 'fileChange', input: {}, result: 'done', display: {
        kind: 'file_patch', version: 1, source: 'codex', summary: { files: 1, added: 0, removed: 0 },
        changes: [{ path: 'old.md', movePath: 'new.md', kind: 'update', added: 0, removed: 0, view: { kind: 'unified-diff' } }],
      } } as ToolUseSimple },
      { type: 'text', text: '[old again](old.md)' },
    ];
    const history = [message('rename', renamed), message('later', '[old once more](old.md)')];
    expect(deriveConversationFiles(history, '/workspace').map(file => file.displayPath)).toEqual(['new.md']);
    expect(deriveConversationFiles([...history, message('recreate', write('/workspace/old.md'))], '/workspace').map(file => file.displayPath)).toEqual(['old.md', 'new.md']);
  });

  it('invalidates cached links when the same source object changes', () => {
    const m = message('m', '[before](before.pdf)');
    expect(deriveConversationFiles([m], '/workspace')[0].displayPath).toBe('before.pdf');
    m.content = '[after](after.pdf)';
    expect(deriveConversationFiles([m], '/workspace')[0].displayPath).toBe('after.pdf');
  });

  it('keeps files from same basename in different folders separate and uses no cross-call state', () => {
    const files = deriveConversationFiles([message('m', '[one](one/report.pdf) [two](two/report.pdf)')], '/workspace');
    expect(files).toHaveLength(2);
    expect(deriveConversationFiles([], '/other')).toEqual([]);
  });
});
