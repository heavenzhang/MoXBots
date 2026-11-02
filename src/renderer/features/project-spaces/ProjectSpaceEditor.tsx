import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import OverlayBackdrop from '@/components/OverlayBackdrop';
import WorkspaceIcon from '@/components/launcher/WorkspaceIcon';
import { CloseIcon, PlusIcon } from '@/components/icons';
import { useCloseLayer } from '@/hooks/useCloseLayer';
import { isImeComposingEvent } from '@/utils/imeKeyboard';
import { PROJECT_SPACE_DRAFT_MAX_BYTES, normalizeProjectSpaceDraft, type ProjectSpace, type ProjectSpaceDraft, type ProjectSpaceBotIdentity } from '../../../shared/projectSpaces';
import { projectSpaceDraft, projectSpaceErrorText } from './projectSpaceUi';
export default function ProjectSpaceEditor({ project, bots, onSave, onClose, onReload }: {
  project?: ProjectSpace; bots: readonly ProjectSpaceBotIdentity[];
  onSave: (draft: ProjectSpaceDraft, expectedRevision?: number) => Promise<ProjectSpace>;
  onClose: () => void;
  onReload?: () => Promise<ProjectSpace>;
}) {
  const { t } = useTranslation('app'); const l = (key: string) => t(`projectSpaces.${key}`);
  const [draft, setDraft] = useState(() => projectSpaceDraft(project));
  const [baseRevision, setBaseRevision] = useState(project?.revision);
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<ProjectSpace | null>(null);
  const [busy, setBusy] = useState(false); const pending = useRef(false);
  const [error, setError] = useState(''); const ref = useRef<HTMLDivElement>(null);
  const capacity = new TextEncoder().encode(JSON.stringify(draft)).length;
  const field = 'mt-1.5 w-full rounded-lg border border-[var(--line-subtle)] bg-[var(--paper-inset)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--focus-border)]';
  useEffect(() => { const previous = document.activeElement; ref.current?.querySelector<HTMLInputElement>('input')?.focus(); return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); }; }, []);
  useCloseLayer(() => { if (!pending.current) onClose(); return true; }, 260);
  async function save() {
    if (pending.current) return;
    setError(''); pending.current = true; setBusy(true);
    try { const value = normalizeProjectSpaceDraft(draft); await onSave(value, baseRevision); onClose(); }
    catch (cause) { setError(projectSpaceErrorText(cause, t)); setConflict(cause instanceof Error && 'code' in cause && cause.code === 'revision-conflict'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <OverlayBackdrop portal className="z-[260] p-4" onClose={busy ? undefined : onClose}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="project-editor-title" className="m-auto flex max-h-[90dvh] w-[680px] max-w-full flex-col rounded-2xl border border-[var(--line-subtle)] bg-[var(--paper-elevated)] text-[var(--ink)] shadow-xl" onKeyDown={event => {
      if (isImeComposingEvent(event)) { if (event.key === 'Enter') event.preventDefault(); return; }
      if (event.key === 'Escape') { event.stopPropagation(); if (!pending.current) onClose(); }
      if (event.key === 'Tab') { const elements = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)'); if (!elements?.length) return; const first = elements[0], last = elements[elements.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
    }}>
      <header className="flex items-center justify-between border-b border-[var(--line-subtle)] px-6 py-4"><h2 id="project-editor-title" className="text-lg font-medium">{l(project ? 'editProject' : 'newProject')}</h2><button type="button" disabled={busy} onClick={onClose} aria-label={l('close')} className="rounded-lg p-2 hover:bg-[var(--hover-bg)]"><CloseIcon className="h-4 w-4" /></button></header>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset disabled={busy} className="min-h-0 space-y-5 overflow-y-auto px-6 py-5 disabled:opacity-60">
          <label className="block text-xs text-[var(--ink-secondary)]">{l('name')}<input className={field} value={draft.name} maxLength={100} required placeholder={l('nameHint')} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="block text-xs text-[var(--ink-secondary)]">{l('description')}<textarea className={`${field} resize-y`} value={draft.description} maxLength={2000} rows={2} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
          <label className="block text-xs text-[var(--ink-secondary)]">{l('instructions')}<textarea className={`${field} resize-y`} value={draft.instructions} maxLength={4000} rows={3} placeholder={l('instructionsHint')} onChange={e => setDraft({ ...draft, instructions: e.target.value })} /></label>
          <section><h3 className="text-sm font-medium">{l('members')}</h3><p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">{l('memberHint')}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">{bots.map(bot => <label key={bot.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--line-subtle)] p-3 hover:bg-[var(--hover-bg)]"><input type="checkbox" checked={draft.memberBotIds.includes(bot.id)} onChange={event => setDraft({ ...draft, memberBotIds: event.target.checked ? [...draft.memberBotIds, bot.id] : draft.memberBotIds.filter(id => id !== bot.id) })} /><WorkspaceIcon icon={bot.icon} size={28} /><span className="min-w-0 truncate text-sm">{bot.name}</span></label>)}</div>
            {!bots.length && <p className="mt-2 text-xs text-[var(--ink-muted)]">{l('emptyMemberChoice')}</p>}
            {draft.memberBotIds.filter(id => !bots.some(bot => bot.id === id)).map(id => <label key={id} className="mt-2 flex gap-2 text-xs text-[var(--warning)]"><input type="checkbox" checked onChange={() => setDraft({ ...draft, memberBotIds: draft.memberBotIds.filter(value => value !== id) })} />{l('unavailableBot')}</label>)}
          </section>
          <section><h3 className="text-sm font-medium">{l('materials')}</h3><p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">{l('materialsHint')}</p>
            <div className="mt-3 space-y-3">{draft.materials.map((item, index) => <div key={item.id} className="rounded-xl border border-[var(--line-subtle)] p-3"><label className="block text-xs text-[var(--ink-muted)]">{l('materialTitle')} {index + 1}<input className={field} maxLength={100} value={item.title} onChange={e => setDraft({ ...draft, materials: draft.materials.map(value => value.id === item.id ? { ...value, title: e.target.value } : value) })} /></label><label className="mt-3 block text-xs text-[var(--ink-muted)]">{l('materialContent')} {index + 1}<textarea className={`${field} resize-y`} rows={3} maxLength={4000} value={item.content} onChange={e => setDraft({ ...draft, materials: draft.materials.map(value => value.id === item.id ? { ...value, content: e.target.value } : value) })} /></label><button type="button" className="mt-2 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]" onClick={() => setDraft({ ...draft, materials: draft.materials.filter(value => value.id !== item.id) })}>{l('removeMaterial')}</button></div>)}</div>
            <button type="button" disabled={draft.materials.length >= 8} className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--accent)] disabled:opacity-40" onClick={() => setDraft({ ...draft, materials: [...draft.materials, { id: crypto.randomUUID(), title: '', content: '' }] })}><PlusIcon className="h-3.5 w-3.5" />{l('addMaterial')}</button>
          </section>
          <section><h3 className="text-sm font-medium">{l('references')}</h3><div className="mt-3 space-y-3">{draft.resources.map((item, index) => <div key={item.id} className="rounded-xl border border-[var(--line-subtle)] p-3"><label className="block text-xs text-[var(--ink-muted)]">{l('resourceLabel')} {index + 1}<input className={field} maxLength={100} value={item.label} onChange={e => setDraft({ ...draft, resources: draft.resources.map(value => value.id === item.id ? { ...value, label: e.target.value } : value) })} /></label><label className="mt-3 block text-xs text-[var(--ink-muted)]">{l('resourcePath')} {index + 1}<input className={field} maxLength={4096} value={item.path} onChange={e => setDraft({ ...draft, resources: draft.resources.map(value => value.id === item.id ? { ...value, path: e.target.value } : value) })} /></label><button type="button" className="mt-2 text-xs text-[var(--ink-muted)]" onClick={() => setDraft({ ...draft, resources: draft.resources.filter(value => value.id !== item.id) })}>{l('removeResource')}</button></div>)}</div><button type="button" disabled={draft.resources.length >= 4} className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--accent)] disabled:opacity-40" onClick={() => setDraft({ ...draft, resources: [...draft.resources, { id: crypto.randomUUID(), label: '', path: '' }] })}><PlusIcon className="h-3.5 w-3.5" />{l('addResource')}</button></section>
          <p className="text-xs text-[var(--ink-muted)]">{l('materialsLimit')} {l('draftCapacity')} · {(capacity / 1000).toFixed(1)} KB</p>
        </fieldset>
        <footer className="max-h-[40dvh] overflow-y-auto border-t border-[var(--line-subtle)] px-6 py-4">{error && <p role="alert" className="mb-3 text-xs text-[var(--warning)]">{error}</p>}
          {conflict && onReload && <button type="button" disabled={busy} className="mb-3 text-xs text-[var(--accent)]" onClick={async () => { if (pending.current) return; pending.current = true; setBusy(true); try { setLatest(await onReload()); } catch (cause) { setError(projectSpaceErrorText(cause, t)); } finally { pending.current = false; setBusy(false); } }}>{l('reviewLatest')}</button>}
          {latest && <section className="mb-4 space-y-2 rounded-lg border border-[var(--line-subtle)] p-3 text-xs leading-5"><p className="font-medium">{l('latestVersion')} · {latest.name}</p><p className="whitespace-pre-wrap break-words">{latest.description}</p><p className="whitespace-pre-wrap break-words">{latest.instructions}</p><p>{l('members')}: {latest.memberBotIds.map(id => bots.find(bot => bot.id === id)?.name ?? l('unavailableBot')).join(' · ')}</p>{latest.materials.map(item => <details key={item.id}><summary>{item.title}</summary><p className="whitespace-pre-wrap break-words">{item.content}</p></details>)}{latest.resources.map(item => <p key={item.id} className="break-all">{item.label} · {item.path}</p>)}<p>{l('keepDraftHint')}</p><button type="button" disabled={!!latest.archivedAt} className="text-[var(--accent)] disabled:opacity-40" onClick={() => { setBaseRevision(latest.revision); setLatest(null); setConflict(false); setError(''); }}>{l('confirmDraft')}</button></section>}
          <div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={onClose} className="compact-action text-sm">{l('cancel')}</button><button type="submit" disabled={busy || conflict || !draft.name.trim() || capacity > PROJECT_SPACE_DRAFT_MAX_BYTES} className="min-h-9 rounded-lg bg-[var(--button-primary-bg)] px-4 text-sm text-[var(--button-primary-text)] disabled:opacity-40">{l(busy ? 'saving' : project ? 'save' : 'create')}</button></div></footer>
      </form>
    </div>
  </OverlayBackdrop>;
}
