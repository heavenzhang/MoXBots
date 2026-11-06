import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import OverlayBackdrop from '@/components/OverlayBackdrop';
import WorkspaceIcon from '@/components/launcher/WorkspaceIcon';
import { CloseIcon } from '@/components/icons';
import { useCloseLayer } from '@/hooks/useCloseLayer';
import { isImeComposingEvent } from '@/utils/imeKeyboard';
import { BOT_GROUP_LIMITS, botGroupConfigurationSchema, type BotGroup, type BotGroupConfiguration } from '../../../shared/botGroup';
import type { ProjectSpace } from '../../../shared/projectSpaces';
import { BotGroupSaveError } from './botGroupClient';
import { botGroupErrorText, type BotGroupChoice } from './botGroupUi';

export interface BotGroupEditorProps {
  sessionId: string;
  rootBotId: string;
  project: ProjectSpace;
  group?: BotGroup;
  choices: readonly BotGroupChoice[];
  readUnavailable?: boolean;
  onSave: (command: BotGroupConfiguration) => Promise<BotGroup>;
  onReload: () => Promise<{ group?: BotGroup; project: ProjectSpace; choices?: readonly BotGroupChoice[] }>;
  onSaved: (group: BotGroup) => void;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/** Mount with the original observer's Session/epoch key; never reuse a draft across Sessions. */
export default function BotGroupEditor({ sessionId, rootBotId, project, group, choices, readUnavailable, onSave, onReload, onSaved, onClose, returnFocusRef }: BotGroupEditorProps) {
  const { t } = useTranslation('app'); const id = useId();
  const [title, setTitle] = useState(group?.title ?? t('botGroups.defaultTitle', { project: project.name }));
  const [selected, setSelected] = useState(() => group?.members.filter(member => member.active).map(member => member.botId) ?? [rootBotId]);
  const [base, setBase] = useState({ groupRevision: group?.revision ?? 0, projectRevision: project.revision });
  const [busy, setBusy] = useState(false); const pending = useRef(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<Awaited<ReturnType<BotGroupEditorProps['onReload']>>>();
  const [uncertain, setUncertain] = useState<BotGroupConfiguration>();
  const [checkedAbsent, setCheckedAbsent] = useState(false);
  const [reloadedChoices, setReloadedChoices] = useState<readonly BotGroupChoice[]>();
  const currentChoices = reloadedChoices ?? choices;
  const alive = useRef(false); const panel = useRef<HTMLDivElement>(null);
  // WebKit mouse clicks need not focus a button. The opener supplies its ref.
  const opener = useRef(returnFocusRef?.current);
  useEffect(() => {
    alive.current = true; const previous = opener.current ?? document.activeElement;
    panel.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => { alive.current = false; if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  useCloseLayer(() => { if (!pending.current) onClose(); return true; }, 260);
  const invalidMembers = selected.length < 2 || selected.length > BOT_GROUP_LIMITS.activeMembers || !selected.includes(rootBotId)
    || selected.some(botId => !currentChoices.some(choice => choice.id === botId && !choice.unavailable));
  const canSave = !busy && !readUnavailable && !conflict && !uncertain && !invalidMembers && !!title.trim() && !project.archivedAt;
  const locked = busy || !!uncertain;
  const field = 'mt-1.5 w-full rounded-lg border border-[var(--line-subtle)] bg-[var(--paper-inset)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--focus-border)]';
  const secondary = 'rounded-lg border border-[var(--line-subtle)] px-3 py-2 text-sm hover:bg-[var(--hover-bg)] disabled:opacity-50';
  async function save(retry?: BotGroupConfiguration) {
    if (pending.current || (!retry && !canSave) || (retry && (!checkedAbsent || retry !== uncertain))) return;
    const command = retry ?? botGroupConfigurationSchema.parse({ sessionId, requestId: crypto.randomUUID(),
      expectedRevision: base.groupRevision, projectRevision: base.projectRevision, title: title.trim(), memberBotIds: selected });
    pending.current = true; setBusy(true); setError(''); setCheckedAbsent(false);
    try { const saved = await onSave(command); if (alive.current) onSaved(saved); }
    catch (cause) {
      if (!alive.current) return;
      const failure = cause instanceof BotGroupSaveError ? cause : new BotGroupSaveError('unconfirmed', 'BOT_GROUP_SAVE_UNCONFIRMED');
      setError(botGroupErrorText(failure.code, t));
      // Rejection of a later retry does not prove the first transport attempt
      // failed. Keep its identity until a receipt is observed.
      if (failure.disposition === 'unconfirmed' || (retry && failure.disposition === 'rejected')) setUncertain(command);
      else {
        setUncertain(undefined);
        setConflict(true); setLatest(undefined);
      }
    } finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  async function reload() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setCheckedAbsent(false);
    try {
      const value = await onReload();
      if (!alive.current) return;
      if (value.project.id !== project.id || (value.group && (value.group.groupId !== sessionId || value.group.rootBotId !== rootBotId || value.group.projectId !== project.id))) throw new Error('BOT_GROUP_SESSION_CHANGED');
      if (uncertain) {
        if (value.group?.receipts.some(receipt => receipt.requestId === uncertain.requestId)) { onSaved(value.group); return; }
        // Read absence is not a failed write: an in-flight request may still commit.
        // Only an explicit identical retry may follow; never edit or issue a new ID.
        setCheckedAbsent(true);
      } else setLatest(value);
    } catch (cause) {
      if (alive.current) setError(botGroupErrorText(cause instanceof Error ? cause.message : 'BOT_GROUP_READ_FAILED', t));
    } finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  return <OverlayBackdrop portal className="z-[260] p-4" onClose={busy ? undefined : onClose}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} className="m-auto flex max-h-[90dvh] w-[600px] max-w-full flex-col rounded-2xl border border-[var(--line-subtle)] bg-[var(--paper-elevated)] text-[var(--ink)] shadow-xl" onKeyDown={event => {
      if (isImeComposingEvent(event)) { if (event.key === 'Enter') event.preventDefault(); return; }
      if (event.key === 'Escape') { event.stopPropagation(); if (!pending.current) onClose(); }
      if (event.key === 'Tab') {
        const elements = Array.from(panel.current?.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input') ?? [])
          .filter(element => !element.disabled && !element.closest('fieldset[disabled]'));
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }}>
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--line-subtle)] px-5 py-4">
        <h2 id={`${id}-title`} className="text-lg font-medium">{t(group ? 'botGroups.editGroup' : 'botGroups.createGroup')}</h2>
        <button type="button" disabled={busy} onClick={onClose} aria-label={t('botGroups.close')} className="rounded-lg p-2 hover:bg-[var(--hover-bg)]"><CloseIcon className="h-4 w-4" /></button>
      </header>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={event => { event.preventDefault(); void save(); }}>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <p className="break-words text-xs text-[var(--ink-secondary)]">{t('botGroups.project', { project: project.name })}</p>
          <fieldset disabled={locked} className="min-w-0 space-y-5 disabled:opacity-60">
            <label className="block text-sm">{t('botGroups.title')}<input required maxLength={200} className={field} value={title} onChange={event => setTitle(event.target.value)} /></label>
            <div>
              <p id={`${id}-members`} className="text-sm">{t('botGroups.members', { count: selected.length, max: BOT_GROUP_LIMITS.activeMembers })}</p>
              <div role="group" aria-labelledby={`${id}-members`} className="mt-2 space-y-2">
                {currentChoices.map(choice => {
                  const checked = selected.includes(choice.id); const root = choice.id === rootBotId;
                  return <label key={choice.id} className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--line-subtle)] p-3 hover:bg-[var(--hover-bg)]">
                    <input type="checkbox" className="mt-2 shrink-0" checked={checked}
                      disabled={root || (!checked && (choice.unavailable || selected.length >= BOT_GROUP_LIMITS.activeMembers))}
                      onChange={() => setSelected(prior => checked ? prior.filter(value => value !== choice.id) : [...prior, choice.id])} />
                    <WorkspaceIcon icon={choice.icon} size={32} />
                    <span className="min-w-0 flex-1"><span className="block break-words text-sm">{choice.name}{root ? ` · ${t('botGroups.rootBot')}` : ''}</span>
                      <span className="mt-1 block break-all text-xs text-[var(--ink-muted)]">{choice.workspacePath ?? choice.id}</span>
                      {currentChoices.some(other => other.id !== choice.id && other.name === choice.name) && <span className="block break-all text-xs text-[var(--ink-muted)]">{choice.id}</span>}
                      {choice.unavailable && <span className="block text-xs text-[var(--ink-secondary)]">{t('botGroups.unavailable')}</span>}
                    </span>
                  </label>;
                })}
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">{t('botGroups.membersHint')}</p>
            </div>
          </fieldset>
          {error && (!uncertain || error !== t('botGroups.unconfirmed')) && <p role="alert" className="text-sm leading-5 text-[var(--ink-secondary)]">{error}</p>}
          {readUnavailable && <p role="status" className="text-sm leading-5 text-[var(--ink-secondary)]">{t('botGroups.readFailed')}</p>}
          {uncertain && <div className="space-y-2 rounded-lg border border-[var(--line-subtle)] p-3" role="status">
            <p className="text-sm">{t(checkedAbsent ? 'botGroups.receiptAbsent' : 'botGroups.unconfirmed')}</p>
            <button type="button" disabled={busy} className={secondary} onClick={() => void reload()}>{t('botGroups.checkSave')}</button>
            {checkedAbsent && <button type="button" disabled={busy} className={`${secondary} ml-2`} onClick={() => void save(uncertain)}>{t('botGroups.retrySame')}</button>}
          </div>}
          {conflict && !uncertain && <div className="space-y-2 rounded-lg border border-[var(--line-subtle)] p-3">
            <p className="text-sm">{t('botGroups.draftRetained')}</p>
            <button type="button" disabled={busy} className={secondary} onClick={() => void reload()}>{t('botGroups.reload')}</button>
            {latest && <div className="space-y-2 text-sm">
              <p className="break-words">{t('botGroups.latest', { title: latest.group?.title ?? t('botGroups.notCreated'), members: latest.group?.members.filter(member => member.active).map(member => member.name).join('、') ?? '—' })}</p>
              <button type="button" className={secondary} disabled={busy || !!latest.project.archivedAt} onClick={() => {
                setBase({ groupRevision: latest.group?.revision ?? 0, projectRevision: latest.project.revision });
                setReloadedChoices(latest.choices);
                setConflict(false); setLatest(undefined); setError('');
              }}>{t('botGroups.useLatestRevision')}</button>
            </div>}
          </div>}
        </div>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-[var(--line-subtle)] px-5 py-4">
          <button type="button" className={secondary} disabled={busy} onClick={onClose}>{t('botGroups.cancel')}</button>
          <button type="submit" disabled={!canSave} className="rounded-lg bg-[var(--button-primary-bg)] px-4 py-2 text-sm text-[var(--button-primary-text)] disabled:opacity-40">{t(busy ? 'botGroups.saving' : 'botGroups.save')}</button>
        </footer>
      </form>
    </div>
  </OverlayBackdrop>;
}
