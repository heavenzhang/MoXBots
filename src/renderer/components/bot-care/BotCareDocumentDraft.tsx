import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import OverlayBackdrop from '@/components/OverlayBackdrop';
import { useCloseLayer } from '@/hooks/useCloseLayer';
import { dismissTopmost } from '@/utils/closeLayer';
import { isImeComposingEvent } from '@/utils/imeKeyboard';

interface Props {
  path: string;
  workspacePath: string;
  onSave: (content: string) => Promise<void>;
  onSaved: () => void;
  onCancel: () => void;
}

/** An unsaved creation intent only. The workspace file remains the sole storage. */
export default function BotCareDocumentDraft({ path, workspacePath, onSave, onSaved, onCancel }: Props) {
  const { t } = useTranslation('app');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const dialog = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const cancel = () => { if (!busy.current) onCancel(); };
  useCloseLayer(() => { cancel(); return true; }, 210);
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    input.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isImeComposingEvent(event)) return;
      if (event.key === 'Escape') { event.preventDefault(); dismissTopmost(); return; }
      if (event.key === 'Tab' && busy.current) { event.preventDefault(); return; }
      if (event.key !== 'Tab' || !dialog.current?.contains(document.activeElement)) return;
      const controls = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled])')];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      mounted.current = false;
      document.removeEventListener('keydown', keydown);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const save = async () => {
    if (busy.current || !content.trim()) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(content);
      if (mounted.current) onSaved();
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  return <OverlayBackdrop portal className="z-[210] p-4 sm:p-8" onClose={cancel}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="bot-care-draft-title" aria-busy={saving}
      className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5 text-[var(--ink)] shadow-2xl sm:p-6">
      <h3 id="bot-care-draft-title" className="break-all text-lg font-semibold">{t('botCare.docs.draftTitle', { defaultValue: '新建文档：{{path}}', path })}</h3>
      <p className="mt-2 text-sm text-[var(--ink-muted)]">{t('botCare.docs.draftDescription', { defaultValue: '填写内容并保存后才会创建文件；取消不会写入。' })}</p>
      <p className="mt-2 truncate text-xs text-[var(--ink-muted)]" title={workspacePath}>{workspacePath}</p>
      <textarea ref={input} aria-label={t('botCare.docs.draftContent', { defaultValue: '文档内容（Markdown）' })}
        value={content} onChange={event => setContent(event.target.value)} disabled={saving} rows={16}
        className="mt-4 min-h-32 flex-1 resize-y rounded-xl border border-[var(--line)] bg-[var(--paper-inset)] p-4 font-mono text-sm outline-none focus:border-[var(--accent)] disabled:opacity-60" />
      {error && <p role="alert" className="mt-3 break-words text-sm text-[var(--error)]">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" disabled={saving} onClick={cancel} className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-50">{t('botCare.docs.cancelDraft', { defaultValue: '取消' })}</button>
        <button type="button" disabled={saving || !content.trim()} onClick={() => { void save(); }} className="rounded-lg bg-[var(--button-primary-bg)] px-4 py-2 text-sm text-[var(--button-primary-text)] disabled:opacity-50">{t(saving ? 'botCare.docs.savingDraft' : 'botCare.docs.saveDraft', { defaultValue: saving ? '正在保存…' : '保存并创建' })}</button>
      </div>
    </div>
  </OverlayBackdrop>;
}
