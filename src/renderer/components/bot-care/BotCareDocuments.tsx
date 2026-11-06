import { forwardRef, lazy, Suspense, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceFileService } from '@/hooks/useWorkspaceFileService';
import { discoverBotCareDocuments, memoryNoteFilename, type BotCareDocumentInventory, type BotCareDocumentKind } from './documentInventory';

const FilePreviewModal = lazy(() => import('@/components/FilePreviewModal'));

export interface BotCareDocumentsRef { isEditing(): boolean }
interface Props { agentDir: string; kind: BotCareDocumentKind }
interface Preview {
  workspacePath: string;
  path: string;
  name: string;
  content: string;
  size: number;
  isLoading: boolean;
  error: string | null;
  initialEditMode: boolean;
}
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

const BotCareDocuments = forwardRef<BotCareDocumentsRef, Props>(function BotCareDocuments({ agentDir, kind }, ref) {
  const { t } = useTranslation('app');
  const files = useWorkspaceFileService(agentDir);
  const [inventory, setInventory] = useState<BotCareDocumentInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [creating, setCreating] = useState(false);
  const [noteName, setNoteName] = useState('');
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  const identity = useRef({ agentDir, kind });
  const mounted = useRef(true);
  const locked = useRef(false);
  const request = useRef(0);
  // Invalidate before effects run so a late A response cannot commit during B's render.
  if (identity.current.agentDir !== agentDir || identity.current.kind !== kind) {
    identity.current = { agentDir, kind };
    generation.current += 1;
  }
  useImperativeHandle(ref, () => ({ isEditing: () => locked.current }), []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; request.current += 1; }; }, []);
  useEffect(() => {
    const version = ++generation.current;
    const current = () => mounted.current && generation.current === version;
    setLoading(true);
    setError(null);
    setInventory(null);
    void discoverBotCareDocuments(files, kind, current).then(result => {
      if (current()) setInventory(result);
    }).catch(reason => {
      if (current()) setError(message(reason));
    }).finally(() => { if (current()) setLoading(false); });
  }, [agentDir, files, kind, refresh]);

  useEffect(() => { setNoteName(''); }, [agentDir, kind]);

  const openFile = useCallback(async (path: string, initialEditMode = false) => {
    if (locked.current) return;
    locked.current = true;
    const token = ++request.current;
    const version = generation.current;
    const name = path.split('/').pop() || path;
    setPreview({ workspacePath: agentDir, path, name, content: '', size: 0, isLoading: true, error: null, initialEditMode });
    try {
      const result = await files.readPreview({ path });
      if (!mounted.current || request.current !== token) return;
      // An unexpected parent switch retains the old preview, bound to its original
      // workspace. It must not replace that editor with a different Bot's content.
      if (generation.current !== version) {
        setPreview(old => old && ({ ...old, isLoading: false, error: t('botCare.docs.contextChanged', { defaultValue: '工作区已切换，请关闭此预览后重新打开。' }) }));
        return;
      }
      setPreview(old => old && ({ ...old, ...result, isLoading: false }));
    } catch (reason) {
      if (mounted.current && request.current === token) setPreview(old => old && ({ ...old, isLoading: false, error: message(reason) }));
    }
  }, [agentDir, files, t]);

  const createFile = useCallback(async (definition?: string) => {
    if (locked.current || !inventory) return;
    const name = definition || memoryNoteFilename(noteName);
    if (!name) { setError(t('botCare.docs.invalidName', { defaultValue: '请输入有效的笔记文件名，不能包含路径。' })); return; }
    const version = generation.current;
    const current = () => mounted.current && generation.current === version;
    locked.current = true;
    setCreating(true);
    setError(null);
    let handedToPreview = false;
    try {
      if (!definition && !inventory.memoryDirectoryExists) {
        const folder = await files.newFolder({ parentDir: '', name: 'memory' });
        if (!folder.success) throw new Error(t('botCare.docs.createFailed', { defaultValue: '创建失败，请刷新后重试。' }));
        if (!current()) return;
        setInventory(old => old && ({ ...old, memoryDirectoryExists: true }));
      }
      const created = await files.newFile({ parentDir: definition ? '' : 'memory', name });
      if (!created.success) throw new Error(t('botCare.docs.createFailed', { defaultValue: '创建失败，请刷新后重试。' }));
      if (!current()) return;
      // newFile owns exclusive creation; all subsequent saves stay in the normal
      // editor with its baseline, conflict handling and draft preservation.
      locked.current = false;
      handedToPreview = true;
      await openFile(created.path, true);
      if (current()) { setNoteName(''); setRefresh(value => value + 1); }
    } catch (reason) {
      if (current()) setError(message(reason));
    } finally {
      if (mounted.current) {
        setCreating(false);
        if (!handedToPreview) locked.current = false;
      }
    }
  }, [files, inventory, noteName, openFile, t]);

  const closePreview = useCallback(() => {
    request.current += 1;
    locked.current = false;
    setPreview(null);
    setRefresh(value => value + 1);
  }, []);

  return <section className="mx-auto max-w-3xl space-y-4 p-6" aria-label={t(kind === 'definition' ? 'botCare.docs.definitionTitle' : 'botCare.docs.memoryTitle', { defaultValue: kind === 'definition' ? '定义文档' : '记忆文档' })}>
    <p className="text-sm text-[var(--ink-muted)]">{t('botCare.docs.description', { defaultValue: '直接查看和编辑此 Bot 工作区中的真实文件。' })}</p>
    <p className="rounded-lg bg-[var(--paper-inset)] px-4 py-3 text-sm leading-relaxed text-[var(--ink-muted)]">{t(kind === 'definition' ? 'botCare.docs.definitionHint' : 'botCare.docs.memoryHint')}</p>
    <button type="button" disabled={loading || creating || !!preview} onClick={() => setRefresh(value => value + 1)} className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-50">{t('botCare.docs.refresh', { defaultValue: '刷新文件' })}</button>
    {loading && <p role="status">{t('botCare.docs.loading', { defaultValue: '正在查找文档…' })}</p>}
    {error && <p role="alert" className="text-sm text-[var(--error)]">{error}</p>}
    {!loading && inventory && <>
      {inventory.paths.length === 0 && <p className="text-sm text-[var(--ink-muted)]">{t('botCare.docs.empty', { defaultValue: '此工作区尚未发现相关 Markdown 文档。' })}</p>}
      <ul className="space-y-2">{inventory.paths.map(path => <li key={path}><button type="button" disabled={creating || !!preview} onClick={() => { void openFile(path); }} className="w-full rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-left text-sm hover:bg-[var(--paper-inset)] disabled:opacity-50">{path}</button></li>)}</ul>
      {inventory.truncated && <p role="status" className="text-sm text-[var(--ink-muted)]">{t('botCare.docs.truncated', { defaultValue: '文件较多，当前仅显示部分文档。' })}</p>}
      {kind === 'definition' && inventory.missingDefinitions.map(path => <button key={path} type="button" disabled={creating || !!preview} onClick={() => { void createFile(path); }} className="mr-2 rounded-lg border border-[var(--line)] px-3 py-2 text-sm disabled:opacity-50">{t('botCare.docs.createDefinition', { defaultValue: '创建 {{path}}', path })}</button>)}
      {kind === 'memory' && <form onSubmit={event => { event.preventDefault(); void createFile(); }} className="flex flex-wrap gap-2">
        <input aria-label={t('botCare.docs.noteName', { defaultValue: '记忆笔记文件名' })} placeholder={t('botCare.docs.notePlaceholder', { defaultValue: '例如：项目经验.md' })} value={noteName} disabled={creating || !!preview} onChange={event => setNoteName(event.target.value)} className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-sm" />
        <button type="submit" disabled={creating || !!preview} className="rounded-lg bg-[var(--button-primary-bg)] px-3 py-2 text-sm text-[var(--button-primary-text)] disabled:opacity-50">{t('botCare.docs.createNote', { defaultValue: '新建记忆笔记' })}</button>
      </form>}
    </>}
    {preview && <Suspense fallback={<p role="status">{t('botCare.docs.opening', { defaultValue: '正在打开编辑器…' })}</p>}>
      <FilePreviewModal {...preview} workspacePath={preview.workspacePath} onClose={closePreview} onRenamed={(path, name) => setPreview(old => old && ({ ...old, path, name }))} />
    </Suspense>}
  </section>;
});
export default BotCareDocuments;
