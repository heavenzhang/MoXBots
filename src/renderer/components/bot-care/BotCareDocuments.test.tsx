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

  it('creates missing definitions through newFile and opens the existing editor without a separate save path', async () => {
    render(<BotCareDocuments agentDir="/bot-a" kind="definition" />);
    fireEvent.click(await screen.findByRole('button', { name: '创建 AGENTS.md' }));
    await screen.findByRole('textbox', { name: 'Document draft' });
    const files = mocks.services.get('/bot-a')!;
    expect(files.newFile).toHaveBeenCalledWith({ parentDir: '', name: 'AGENTS.md' });
    expect(files.readPreview).toHaveBeenCalledWith({ path: 'AGENTS.md' });
    expect(files.saveFile).not.toHaveBeenCalled();
    expect(screen.getByTestId('preview')).toHaveAttribute('data-edit', 'true');
  });

  it('creates an explicit memory note in the same workspace and reports filename collisions without overwriting or losing its name', async () => {
    const files = mocks.services.get('/bot-a')!;
    files.newFile.mockRejectedValueOnce(new Error('File already exists'));
    const ref = createRef<BotCareDocumentsRef>();
    render(<BotCareDocuments ref={ref} agentDir="/bot-a" kind="memory" />);
    const name = await screen.findByRole('textbox', { name: '记忆笔记文件名' });
    fireEvent.change(name, { target: { value: 'project-notes' } });
    fireEvent.click(screen.getByRole('button', { name: '新建记忆笔记' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('File already exists');
    expect(name).toHaveValue('project-notes');
    expect(files.newFolder).toHaveBeenCalledWith({ parentDir: '', name: 'memory' });
    expect(files.newFile).toHaveBeenCalledWith({ parentDir: 'memory', name: 'project-notes.md' });
    expect(files.saveFile).not.toHaveBeenCalled();
    expect(ref.current?.isEditing()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '新建记忆笔记' }));
    await screen.findByRole('textbox', { name: 'Document draft' });
    expect(files.newFolder).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('preview')).toHaveAttribute('data-path', 'memory/project-notes.md');
  });

  it('shows discovery failures and supports an explicit retry', async () => {
    mocks.services.get('/bot-a')!.checkPaths.mockRejectedValueOnce(new Error('Permission denied'));
    render(<BotCareDocuments agentDir="/bot-a" kind="definition" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied');
    fireEvent.click(screen.getByRole('button', { name: '刷新文件' }));
    expect(await screen.findByRole('button', { name: 'CLAUDE.md' })).toBeInTheDocument();
  });
});
