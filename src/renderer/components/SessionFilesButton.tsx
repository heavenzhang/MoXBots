import { useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DocumentIcon } from '@/components/icons';
import { FileIcon } from '@/components/file-icon';
import { Popover } from '@/components/ui/Popover';
import { useFileAction } from '@/context/FileActionContext';
import { deriveConversationFiles } from '@/utils/conversationFiles';
import type { Message } from '@/types/chat';

interface Props {
  messages: readonly Message[];
  hasMoreBefore: boolean;
  onLoadOlder: () => Promise<void>;
  onNavigate: (messageId: string) => void;
}

/** Keyed by Chat's Session. Closed panels do no transcript parsing or file IO. */
export function SessionFilesButton({ active, ...props }: Props & { active: boolean }) {
  // Cached Chat tabs stay mounted. The portal and its disclosure state must
  // retire when their page is hidden, even if the Session itself is unchanged.
  return active ? <SessionFilesTrigger {...props} /> : null;
}

function SessionFilesTrigger(props: Props) {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = () => { setOpen(false); anchorRef.current?.focus(); };
  return <>
    <button ref={anchorRef} type="button" aria-label={t('sessionFiles.title')} title={t('sessionFiles.title')}
      aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(value => !value)}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--ink-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--focus-border)]">
      <DocumentIcon aria-hidden className="size-4" />
    </button>
    <Popover open={open} onClose={close} anchorRef={anchorRef} placement="bottom-end"
      className="w-[min(420px,calc(100vw-24px))]">
      {open && <SessionFilesPanel {...props} id={id} onClose={close} />}
    </Popover>
  </>;
}

export function SessionFilesPanel({ messages, hasMoreBefore, onLoadOlder, onNavigate, id, onClose, embedded = false }: Props & { id: string; onClose: () => void; embedded?: boolean }) {
  const { t } = useTranslation('chat');
  const { t: appT } = useTranslation('app');
  const fileAction = useFileAction();
  const files = useMemo(() => deriveConversationFiles(messages, fileAction?.workspacePath ?? null), [messages, fileAction?.workspacePath]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const loadButtonRef = useRef<HTMLButtonElement>(null);
  const visible = files.filter(file => file.displayPath.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const loadOlder = async () => {
    if (loading) return;
    const loadingButton = loadButtonRef.current;
    const restoreLoadFocus = document.activeElement === loadingButton;
    setLoading(true); setFailed(false);
    try {
      await onLoadOlder();
      // The last page removes this button. Keep keyboard users in the panel,
      // but never take focus back from a user already reading or typing.
      if (restoreLoadFocus && (document.activeElement === loadingButton || document.activeElement === document.body)) searchRef.current?.focus();
    } catch { setFailed(true); }
    finally { setLoading(false); }
  };
  return <section id={id} role={embedded ? "region" : "dialog"} aria-label={t('sessionFiles.title')} className="min-w-0">
    <div className="border-b border-[var(--line)] p-3">
      <h2 className="text-sm font-medium text-[var(--ink)]">{t('sessionFiles.title')}</h2>
      <input ref={searchRef} autoFocus={!embedded} type="search" aria-label={t('sessionFiles.search')} placeholder={t('sessionFiles.search')}
        value={query} onChange={event => setQuery(event.target.value)}
        className="mt-2 w-full rounded-md border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-sm text-[var(--ink)] outline-offset-2 focus-visible:outline-[var(--focus-border)]" />
    </div>
    <ul className="m-0 max-h-[min(360px,45vh)] list-none overflow-y-auto overscroll-contain p-1">
      {visible.map(file => <li key={file.identity} className="flex min-w-0 items-center gap-1 rounded-md px-1 hover:bg-[var(--paper-hover)]">
        <button type="button" disabled={!fileAction || file.status === 'deleted'} title={file.displayPath}
          onClick={() => { onClose(); fileAction?.openFileTarget(file.target, { displayPath: file.displayPath }); }}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-2 text-left focus-visible:outline-2 focus-visible:outline-[var(--focus-border)] disabled:opacity-50">
          <FileIcon name={file.displayPath.split(/[\\/]/).pop() ?? file.displayPath} size="dense" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-[var(--ink)]">{file.displayPath.split(/[\\/]/).pop()}</span>
            <span className="block truncate text-xs text-[var(--ink-muted)]">{file.displayPath}</span>
            <span className="block text-xs text-[var(--ink-secondary)]">{file.status === 'linked' ? t('sessionFiles.linked') : appT(`message.turnFileEdits.status.${file.status}`)}</span>
          </span>
        </button>
        <button type="button" onClick={() => { onClose(); onNavigate(file.messageId); }}
          aria-label={t('sessionFiles.sourceFor', { file: file.displayPath })}
          className="shrink-0 rounded-md px-2 py-2 text-xs text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--focus-border)]">{t('sessionFiles.source')}</button>
      </li>)}
      {!visible.length && <li className="p-4 text-sm text-[var(--ink-secondary)]">{t(query.trim() ? 'sessionFiles.noMatch' : 'sessionFiles.empty')}</li>}
    </ul>
    <div className="border-t border-[var(--line)] px-3 py-2 text-xs text-[var(--ink-muted)]">
      <p>{t('sessionFiles.boundary')}</p>
      {hasMoreBefore && <button ref={loadButtonRef} type="button" disabled={loading} onClick={() => void loadOlder()}
        className="mt-2 min-h-8 rounded-md text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--focus-border)] disabled:opacity-50">{t(loading ? 'sessionFiles.loading' : 'sessionFiles.loadOlder')}</button>}
      {failed && <p role="alert" className="mt-1 text-[var(--error)]">{t('sessionFiles.loadFailed')}</p>}
    </div>
  </section>;
}
