import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BotCareDocuments, { type BotCareDocumentsRef } from './BotCareDocuments';

const mocks = vi.hoisted(() => ({ services: new Map<string, ReturnType<typeof makeService>>(), useFiles: vi.fn() }));
vi.mock('@/hooks/useWorkspaceFileService', () => ({
  useWorkspaceFileService: (workspace: string) => { mocks.useFiles(workspace); return mocks.services.get(workspace); },
}));
vi.mock('@/components/FilePreviewModal', async () => {
  const { useState } = await import('react');
  function Editor({ content }: { content: string }) {
    const [draft, setDraft] = useState(content);
    return <textarea aria-label="Document draft" value={draft} onChange={event => setDraft(event.target.value)} />;
  }
  return { default: (props: { path: string; content: string; workspacePath: string; isLoading: boolean; error: string | null; onClose: () => void; initialEditMode: boolean }) => <div data-testid="preview" data-workspace={props.workspacePath} data-path={props.path} data-edit={props.initialEditMode}>
    {props.isLoading ? <span>Reading document</span> : props.error ? <p role="alert">{props.error}</p> : <Editor content={props.content} />}
    <button onClick={props.onClose}>Close document</button>
  </div> };
});

function makeService(rootFile: string = 'CLAUDE.md') {
  return {
    checkPaths: vi.fn().mockResolvedValue({ results: { [rootFile]: { exists: true, type: 'file' } } }),
    dirExpand: vi.fn().mockResolvedValue({ children: [], loaded: true }),
    readPreview: vi.fn().mockImplementation(async ({ path }: { path: string }) => ({ name: path.split('/').pop(), content: `content:${path}`, size: 10 })),
    newFile: vi.fn().mockImplementation(async ({ parentDir, name }: { parentDir: string; name: string }) => ({ success: true, path: parentDir ? `${parentDir}/${name}` : name })),
    newFolder: vi.fn().mockResolvedValue({ success: true, path: 'memory' }),
    saveFile: vi.fn(),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.services.clear(); mocks.useFiles.mockClear();
  mocks.services.set('/bot-a', makeService()); mocks.services.set('/bot-b', makeService('AGENTS.md'));
});

describe('Bot care workspace documents', () => {
  it('uses the selected workspace and preserves the same open editor and draft across unexpected parent changes', async () => {
    const ref = createRef<BotCareDocumentsRef>();
    const view = render(<BotCareDocuments ref={ref} agentDir="/bot-a" kind="definition" />);
    fireEvent.click(await screen.findByRole('button', { name: 'CLAUDE.md' }));
    expect(ref.current?.isEditing()).toBe(true);
    const input = await screen.findByRole('textbox', { name: 'Document draft' });
    fireEvent.change(input, { target: { value: 'unsaved draft A' } });
    view.rerender(<BotCareDocuments ref={ref} agentDir="/bot-b" kind="memory" />);
    await waitFor(() => expect(mocks.useFiles).toHaveBeenCalledWith('/bot-b'));
    expect(screen.getByRole('textbox', { name: 'Document draft' })).toBe(input);
    expect(input).toHaveValue('unsaved draft A');
    expect(screen.getByTestId('preview')).toHaveAttribute('data-workspace', '/bot-a');
    expect(mocks.services.get('/bot-a')!.readPreview).toHaveBeenCalledWith({ path: 'CLAUDE.md' });
    expect(mocks.services.get('/bot-b')!.readPreview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Close document'));
    expect(ref.current?.isEditing()).toBe(false);
  });

  it('discards late Bot A discovery when Bot B has become selected', async () => {
    const pending = deferred<{ results: Record<string, { exists: boolean; type: string }> }>();
    mocks.services.get('/bot-a')!.checkPaths.mockReturnValue(pending.promise);
    const view = render(<BotCareDocuments agentDir="/bot-a" kind="definition" />);
    view.rerender(<BotCareDocuments agentDir="/bot-b" kind="definition" />);
    await screen.findByRole('button', { name: 'AGENTS.md' });
    await act(async () => { pending.resolve({ results: { 'CLAUDE.md': { exists: true, type: 'file' } } }); });
    expect(screen.queryByRole('button', { name: 'CLAUDE.md' })).toBeNull();
    expect(screen.getByRole('button', { name: 'AGENTS.md' })).toBeInTheDocument();
  });

  it('fences a late document read while retaining the original preview authority until close', async () => {
    const pending = deferred<{ name: string; content: string; size: number }>();
    mocks.services.get('/bot-a')!.readPreview.mockReturnValue(pending.promise);
    const ref = createRef<BotCareDocumentsRef>();
    const view = render(<BotCareDocuments ref={ref} agentDir="/bot-a" kind="definition" />);
    fireEvent.click(await screen.findByRole('button', { name: 'CLAUDE.md' }));
    view.rerender(<BotCareDocuments ref={ref} agentDir="/bot-b" kind="definition" />);
    await act(async () => { pending.resolve({ name: 'CLAUDE.md', content: 'late content A', size: 14 }); });
    expect(await screen.findByText('工作区已切换，请关闭此预览后重新打开。')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('late content A')).toBeNull();
    expect(screen.getByTestId('preview')).toHaveAttribute('data-workspace', '/bot-a');
    expect(ref.current?.isEditing()).toBe(true);
  });

  it('opens a missing definition as memory-only draft and creates the full content only after explicit save', async () => {
    const files = mocks.services.get('/bot-a')!;
    render(<BotCareDocuments agentDir="/bot-a" kind="definition" />);
    fireEvent.click(await screen.findByRole('button', { name: '创建 AGENTS.md' }));
    const input = screen.getByRole('textbox', { name: '文档内容（Markdown）' });
    expect(screen.getByRole('button', { name: '保存并创建' })).toBeDisabled();
    expect(files.newFile).not.toHaveBeenCalled();
    expect(files.readPreview).not.toHaveBeenCalled();
    const content = '\ufeff# Agent definition\r\nUse these instructions.\r\n';
    fireEvent.change(input, { target: { value: content } });
    // A browser textarea normalizes CRLF; exact submitted value remains the
    // editor's content without a blank-file creation / saveFile round trip.
    const submitted = (input as HTMLTextAreaElement).value;
    fireEvent.click(screen.getByRole('button', { name: '保存并创建' }));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: '文档内容（Markdown）' })).toBeNull());
    expect(files.newFile).toHaveBeenCalledExactlyOnceWith({ parentDir: '', name: 'AGENTS.md', content: submitted });
    expect(submitted).toContain('Use these instructions.');
    expect(files.saveFile).not.toHaveBeenCalled();
    expect(files.readPreview).not.toHaveBeenCalled();
  });

  it('cancels an AGENTS draft without leaving an empty file that would shadow existing CLAUDE instructions', async () => {
    const files = mocks.services.get('/bot-a')!;
    const ref = createRef<BotCareDocumentsRef>();
    render(<BotCareDocuments ref={ref} agentDir="/bot-a" kind="definition" />);
    fireEvent.click(await screen.findByRole('button', { name: '创建 AGENTS.md' }));
    fireEvent.change(screen.getByRole('textbox', { name: '文档内容（Markdown）' }), { target: { value: '# Unsaved replacement' } });
    expect(ref.current?.isEditing()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(ref.current?.isEditing()).toBe(false);
    expect(files.newFile).not.toHaveBeenCalled();
    expect(files.newFolder).not.toHaveBeenCalled();
    expect(files.saveFile).not.toHaveBeenCalled();
    expect(files.readPreview).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'CLAUDE.md' })).toBeInTheDocument();
  });

  it('does not create a memory directory or file when its draft is cancelled', async () => {
    const files = mocks.services.get('/bot-a')!;
    render(<BotCareDocuments agentDir="/bot-a" kind="memory" />);
    fireEvent.change(await screen.findByRole('textbox', { name: '记忆笔记文件名' }), { target: { value: 'project-notes' } });
    fireEvent.click(screen.getByRole('button', { name: '新建记忆笔记' }));
    fireEvent.change(screen.getByRole('textbox', { name: '文档内容（Markdown）' }), { target: { value: '# Unsaved memory' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: '文档内容（Markdown）' })).toBeNull();
    expect(files.newFolder).not.toHaveBeenCalled();
    expect(files.newFile).not.toHaveBeenCalled();
  });

  it('preserves a colliding memory draft and retries exclusive creation without overwriting', async () => {
    const files = mocks.services.get('/bot-a')!;
    files.newFile.mockRejectedValueOnce(new Error('File already exists'));
    const ref = createRef<BotCareDocumentsRef>();
    render(<BotCareDocuments ref={ref} agentDir="/bot-a" kind="memory" />);
    fireEvent.change(await screen.findByRole('textbox', { name: '记忆笔记文件名' }), { target: { value: 'project-notes' } });
    fireEvent.click(screen.getByRole('button', { name: '新建记忆笔记' }));
    const input = screen.getByRole('textbox', { name: '文档内容（Markdown）' });
    fireEvent.change(input, { target: { value: '# Retained memory\nDetails stay here.\n' } });
    fireEvent.click(screen.getByRole('button', { name: '保存并创建' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('File already exists');
    expect(input).toHaveValue('# Retained memory\nDetails stay here.\n');
    expect(files.newFile).toHaveBeenCalledWith({ parentDir: 'memory', name: 'project-notes.md', content: '# Retained memory\nDetails stay here.\n' });
    expect(files.saveFile).not.toHaveBeenCalled();
    expect(ref.current?.isEditing()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '保存并创建' }));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: '文档内容（Markdown）' })).toBeNull());
    expect(files.newFolder).toHaveBeenCalledExactlyOnceWith({ parentDir: '', name: 'memory' });
    expect(ref.current?.isEditing()).toBe(false);
  });

  it('keeps a draft bound to its original workspace if parent props change before save', async () => {
    const view = render(<BotCareDocuments agentDir="/bot-a" kind="definition" />);
    fireEvent.click(await screen.findByRole('button', { name: '创建 AGENTS.md' }));
    const input = screen.getByRole('textbox', { name: '文档内容（Markdown）' });
    fireEvent.change(input, { target: { value: '# Original Bot A draft' } });
    view.rerender(<BotCareDocuments agentDir="/bot-b" kind="definition" />);
    expect(screen.getByRole('textbox', { name: '文档内容（Markdown）' })).toBe(input);
    expect(input).toHaveValue('# Original Bot A draft');
    expect(screen.getByText('/bot-a')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保存并创建' }));
    await waitFor(() => expect(mocks.services.get('/bot-a')!.newFile).toHaveBeenCalledWith({ parentDir: '', name: 'AGENTS.md', content: '# Original Bot A draft' }));
    expect(mocks.services.get('/bot-b')!.newFile).not.toHaveBeenCalled();
    expect(mocks.services.get('/bot-b')!.saveFile).not.toHaveBeenCalled();
  });

  it('permits an already-created memory directory only after checking that it is a directory', async () => {
    const files = mocks.services.get('/bot-a')!;
    files.newFolder.mockRejectedValueOnce(new Error('Directory already exists'));
    render(<BotCareDocuments agentDir="/bot-a" kind="memory" />);
    fireEvent.change(await screen.findByRole('textbox', { name: '记忆笔记文件名' }), { target: { value: 'race-note.md' } });
    fireEvent.click(screen.getByRole('button', { name: '新建记忆笔记' }));
    files.checkPaths.mockResolvedValue({ results: { memory: { exists: true, type: 'dir' } } });
    fireEvent.change(screen.getByRole('textbox', { name: '文档内容（Markdown）' }), { target: { value: '# Complete note' } });
    fireEvent.click(screen.getByRole('button', { name: '保存并创建' }));
    await waitFor(() => expect(files.newFile).toHaveBeenCalledWith({ parentDir: 'memory', name: 'race-note.md', content: '# Complete note' }));
    expect(files.checkPaths).toHaveBeenCalledWith({ paths: ['memory'] });
  });

  it('keeps the memory draft if a conflicting path is a file rather than a directory', async () => {
    const files = mocks.services.get('/bot-a')!;
    files.newFolder.mockRejectedValueOnce(new Error('Path already exists'));
    render(<BotCareDocuments agentDir="/bot-a" kind="memory" />);
    fireEvent.change(await screen.findByRole('textbox', { name: '记忆笔记文件名' }), { target: { value: 'my-note' } });
    fireEvent.click(screen.getByRole('button', { name: '新建记忆笔记' }));
    files.checkPaths.mockResolvedValue({ results: { memory: { exists: true, type: 'file' } } });
    fireEvent.change(screen.getByRole('textbox', { name: '文档内容（Markdown）' }), { target: { value: '# Keep this draft' } });
    fireEvent.click(screen.getByRole('button', { name: '保存并创建' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Path already exists');
    expect(files.newFile).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: '文档内容（Markdown）' })).toHaveValue('# Keep this draft');
  });

  it('blocks cancel, Escape and repeated saves while atomic creation is pending', async () => {
    const pending = deferred<{ success: boolean; path: string }>();
    const files = mocks.services.get('/bot-a')!;
    files.newFile.mockReturnValueOnce(pending.promise);
    const ref = createRef<BotCareDocumentsRef>();
    render(<BotCareDocuments ref={ref} agentDir="/bot-a" kind="definition" />);
    fireEvent.click(await screen.findByRole('button', { name: '创建 AGENTS.md' }));
    fireEvent.change(screen.getByRole('textbox', { name: '文档内容（Markdown）' }), { target: { value: '# Complete definition' } });
    fireEvent.click(screen.getByRole('button', { name: '保存并创建' }));
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(screen.getByRole('textbox', { name: '文档内容（Markdown）' })).toHaveValue('# Complete definition');
    expect(ref.current?.isEditing()).toBe(true);
    expect(files.newFile).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve({ success: true, path: 'AGENTS.md' }); });
    expect(screen.queryByRole('textbox', { name: '文档内容（Markdown）' })).toBeNull();
    expect(ref.current?.isEditing()).toBe(false);
  });

  it('shows discovery failures and supports an explicit retry', async () => {
    mocks.services.get('/bot-a')!.checkPaths.mockRejectedValueOnce(new Error('Permission denied'));
    render(<BotCareDocuments agentDir="/bot-a" kind="definition" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied');
    fireEvent.click(screen.getByRole('button', { name: '刷新文件' }));
    expect(await screen.findByRole('button', { name: 'CLAUDE.md' })).toBeInTheDocument();
  });
});
