import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Project } from '@/config/types';
import type { AgentConfig } from '../../../shared/types/agent';
import { findProjectSpaceBotWorkspace, type ProjectSpace, type ProjectSpaceSelection } from '../../../shared/projectSpaces';
import type { InitialMessage } from '@/types/tab';
import type { SidebarBirthReceipt, SidebarConversationLaunchResult } from '@/utils/sidebarConversationLaunch';
import OverlayBackdrop from '@/components/OverlayBackdrop';
import CustomSelect from '@/components/CustomSelect';
import WorkspaceIcon from '@/components/launcher/WorkspaceIcon';
import { CloseIcon, ComposeIcon, FolderIcon, PlusIcon } from '@/components/icons';
import { useCloseLayer } from '@/hooks/useCloseLayer';
import { isImeComposingEvent } from '@/utils/imeKeyboard';
export type ProjectConversationTarget = { kind: 'project'; selection: ProjectSpaceSelection } | { kind: 'workspace'; botId: string };
export interface ProjectConversationRequest { id: number; projectId: string; botId?: string }
interface RetainedIntent { status: 'uncertain' | 'draft'; projectId: string; projectRevision?: number; botId: string; projectName: string; botName: string; text: string; tabId?: string; birthReceipt?: SidebarBirthReceipt }
export default function ProjectConversationDialog({ open, spaces, agents, workspaces, request, onOpen, onClose, onCreateBot, onCreateProject, onViewAttempt }: {
  open: boolean; spaces: readonly ProjectSpace[]; agents: readonly AgentConfig[]; workspaces: readonly Project[];
  request?: ProjectConversationRequest | null;
  onOpen: (target: ProjectConversationTarget, message?: InitialMessage) => Promise<SidebarConversationLaunchResult>;
  onClose: () => void; onCreateBot: () => void; onCreateProject: () => void; onViewAttempt: (tabId: string) => void;
}) {
  const { t } = useTranslation('app'); const l = (key: string) => t(`projectSpaces.${key}`);
  const [screen, setScreen] = useState<'menu' | 'conversation'>('menu');
  const [projectId, setProjectId] = useState(''); const [selectedRevision, setSelectedRevision] = useState<number>();
  const [botId, setBotId] = useState(''); const [text, setText] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const pending = useRef(false);
  const [uncertain, setUncertain] = useState<RetainedIntent | null>(null); const [retained, setRetained] = useState<RetainedIntent[]>([]);
  const consumedRequest = useRef<number | undefined>(undefined); const dialog = useRef<HTMLDivElement>(null);
  const project = spaces.find(item => item.id === projectId && !item.archivedAt);
  const bot = agents.find(item => item.id === botId);
  const workspace = botId ? findProjectSpaceBotWorkspace(botId, workspaces) : undefined;
  const eligibleBots = useMemo(() => agents.filter(item => findProjectSpaceBotWorkspace(item.id, workspaces) && (!projectId || project?.memberBotIds.includes(item.id))), [agents, workspaces, project, projectId]);
  function capture(status: RetainedIntent['status'], tabId?: string): RetainedIntent {
    return { status, projectId, projectRevision: selectedRevision, botId, projectName: project?.name ?? l('noProject'), botName: bot?.name ?? l('unknownBot'), text, tabId };
  }
  function clearIntent() { setProjectId(''); setSelectedRevision(undefined); setBotId(''); setText(''); setError(''); setUncertain(null); }
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    dialog.current?.querySelector<HTMLElement>('button')?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [open]);
  useEffect(() => {
    if (!open || !request || request.id === consumedRequest.current || pending.current) return;
    consumedRequest.current = request.id;
    // An explicit new request is a separate empty intent, never a replay of the
    // retained operation. Keep an unsent draft before switching context.
    if (text.trim() && !uncertain) setRetained(previous => [...previous, capture('draft')]);
    setProjectId(request.projectId); setSelectedRevision(spaces.find(item => item.id === request.projectId)?.revision);
    setBotId(request.botId ?? ''); setText(''); setError(''); setUncertain(null); setScreen('conversation');
    // Only consume a new explicit request. Live config changes must not reset input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request?.id]);
  useCloseLayer(() => { if (!open) return false; if (!pending.current) onClose(); return true; }, 250);
  function backToMenu() {
    if (pending.current) return;
    if (uncertain) clearIntent();
    setScreen('menu');
  }
  async function submit() {
    if (pending.current || uncertain) return;
    if (!bot || !workspace || projectId && (!project || !project.memberBotIds.includes(botId))) { setError(l('selectBoth')); return; }
    if (project && project.revision !== selectedRevision) { setError(l('contextChanged')); return; }
    const target: ProjectConversationTarget = project ? { kind: 'project', selection: { projectId: project.id, botId, projectRevision: selectedRevision! } } : { kind: 'workspace', botId };
    pending.current = true; setBusy(true); setError('');
    const retainUnknown = (tabId?: string, birthReceipt?: SidebarBirthReceipt) => { const receipt = { ...capture('uncertain', tabId), birthReceipt }; setRetained(previous => [...previous, receipt]); setUncertain(receipt); setError(l('uncertain')); };
    try {
      const result = await onOpen(target, text.trim() ? { text: text.trim() } : undefined);
      if (result.status === 'opened') { clearIntent(); setScreen('menu'); onClose(); }
      else if (result.status === 'not-started') setError(l('notStarted'));
      else retainUnknown(result.tabId, result.birthReceipt);
    } catch { retainUnknown(); }
    finally { pending.current = false; setBusy(false); }
  }
  if (!open) return null;
  return <OverlayBackdrop portal className="z-[250] p-4" onClose={busy ? undefined : onClose}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="project-conversation-title" className="m-auto max-h-[90dvh] w-[520px] max-w-full overflow-y-auto rounded-2xl border border-[var(--line-subtle)] bg-[var(--paper-elevated)] p-6 text-[var(--ink)] shadow-xl" onKeyDown={event => {
      if (isImeComposingEvent(event)) return;
      if (event.key === 'Escape') { event.stopPropagation(); if (!pending.current) onClose(); }
      if (event.key === 'Tab') { const elements = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), [tabindex="0"]'); if (!elements?.length) return; const first = elements[0], last = elements[elements.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
    }}>
      <header className="mb-4 flex items-center justify-between gap-4"><h2 id="project-conversation-title" className="text-lg font-medium">{l(screen === 'menu' ? 'menu' : 'newConversation')}</h2><button type="button" disabled={busy} onClick={onClose} aria-label={l('close')} className="rounded-lg p-2 text-[var(--ink-muted)] hover:bg-[var(--hover-bg)]"><CloseIcon className="h-4 w-4" /></button></header>
      {screen === 'menu' ? <div className="space-y-3">
        {retained.length > 0 && <section aria-label={l('pendingBirths')} className="mb-4 space-y-3 rounded-xl border border-[var(--line-subtle)] p-3"><p className="text-xs text-[var(--ink-muted)]">{l('pendingBirths')}</p>{retained.map((item, index) => <details key={index} className="text-xs"><summary className="cursor-pointer break-words">{item.projectName} · {item.botName} · {l(item.status === 'draft' ? 'draft' : 'unconfirmed')}</summary><textarea aria-label={l('retainedMessage')} readOnly value={item.text} rows={3} className="mt-3 w-full resize-y rounded-lg border border-[var(--line-subtle)] bg-[var(--paper-inset)] p-2 text-sm" />{item.status === 'draft' ? <button type="button" className="mt-2 text-[var(--accent)]" onClick={() => { if (text.trim() && !uncertain) { const active = capture('draft'); setRetained(previous => [...previous.filter((_, row) => row !== index), active]); } else setRetained(previous => previous.filter((_, row) => row !== index)); setProjectId(item.projectId); setSelectedRevision(item.projectRevision); setBotId(item.botId); setText(item.text); setError(''); setUncertain(null); setScreen('conversation'); }}>{l('resumeDraft')}</button> : <><p className="mt-2 leading-5 text-[var(--warning)]">{l('uncertain')}</p>{item.tabId && <button type="button" className="mt-2 text-[var(--accent)]" onClick={() => { onViewAttempt(item.tabId!); onClose(); }}>{l('viewAttempt')}</button>}</>}</details>)}</section>}
        {[{ key: 'newConversation', hint: 'newHint', icon: ComposeIcon, action: () => setScreen('conversation') }, { key: 'newBot', hint: 'newBotHint', icon: PlusIcon, action: onCreateBot }, { key: 'newProject', hint: 'newProjectHint', icon: FolderIcon, action: onCreateProject }].map(item => <button type="button" key={item.key} aria-label={l(item.key)} onClick={item.action} className="flex w-full items-start gap-3 rounded-xl border border-[var(--line-subtle)] p-4 text-left hover:bg-[var(--hover-bg)]"><item.icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" /><span><span className="block text-sm font-medium">{l(item.key)}</span><span className="mt-1 block text-xs leading-5 text-[var(--ink-muted)]">{l(item.hint)}</span></span></button>)}
      </div> : <form onSubmit={event => { event.preventDefault(); void submit(); }} className="space-y-4">
        <p className="text-xs leading-6 text-[var(--ink-secondary)]">{l('birthHint')}</p>
        <label className="block text-xs text-[var(--ink-muted)]">{l('projectLabel')}<CustomSelect ariaLabel={l('projectLabel')} value={projectId} disabled={busy || !!uncertain} onChange={value => { setProjectId(value); setSelectedRevision(spaces.find(item => item.id === value)?.revision); setBotId(''); setError(''); }} options={[{ value: '', label: l('noProject') }, ...spaces.filter(item => !item.archivedAt).map(item => ({ value: item.id, label: item.name }))]} className="mt-1.5 w-full" size="md" /></label>
        <label className="block text-xs text-[var(--ink-muted)]">{l('botLabel')}<CustomSelect ariaLabel={l('botLabel')} value={botId} disabled={busy || !!uncertain} placeholder={l('chooseBot')} onChange={value => { setBotId(value); setError(''); }} options={eligibleBots.map(item => ({ value: item.id, label: item.name, icon: <WorkspaceIcon icon={item.icon} size={24} /> }))} className="mt-1.5 w-full" size="md" /></label>
        {project && <div className="rounded-xl border border-[var(--line-subtle)] bg-[var(--paper-inset)] px-4 py-3"><p className="text-xs font-medium">{l('projectSnapshot')}</p><p className="mt-2 break-words text-xs leading-5 text-[var(--ink-secondary)]">{project.description || project.name}</p><p className="mt-2 text-xs text-[var(--ink-muted)]">{project.materials.length} {l('materialCount')} · {project.resources.length} {l('resourceCount')}</p></div>}
        {projectId && !project && <p role="alert" className="text-xs text-[var(--warning)]">{l('projectUnavailable')}</p>}
        {!projectId && <p className="text-xs leading-5 text-[var(--ink-muted)]">{l('noProjectHint')}</p>}
        {workspace && <div className="text-xs text-[var(--ink-muted)]"><span>{l('workspaceLabel')}</span><p className="mt-1 break-all text-[var(--ink-secondary)]">{workspace.path}</p></div>}
        <label className="block text-xs text-[var(--ink-muted)]">{l('firstMessage')}<textarea value={text} disabled={busy} readOnly={!!uncertain} onChange={event => setText(event.target.value)} rows={3} placeholder={l('firstMessageHint')} className="mt-1.5 w-full resize-y rounded-lg border border-[var(--line-subtle)] bg-[var(--paper-inset)] p-3 text-sm text-[var(--ink)]" /></label>
        {error && <p role="alert" className="text-xs leading-5 text-[var(--warning)]">{error}</p>}
        {project && project.revision !== selectedRevision && !uncertain && <button type="button" className="text-xs text-[var(--accent)]" onClick={() => { setSelectedRevision(project.revision); setError(''); }}>{l('useLatest')}</button>}
        <div className="flex flex-wrap justify-end gap-2 pt-2"><button type="button" disabled={busy} onClick={backToMenu} className="compact-action text-sm">{l(uncertain ? 'keepAndBack' : 'backToNew')}</button><button type="button" disabled={busy} onClick={onClose} className="compact-action text-sm">{l('cancel')}</button>{uncertain?.tabId && <button type="button" className="compact-action text-sm" onClick={() => { onViewAttempt(uncertain.tabId!); onClose(); }}>{l('viewAttempt')}</button>}<button type="submit" disabled={busy || !!uncertain || !bot || !workspace || !!projectId && !project} className="min-h-9 rounded-lg bg-[var(--button-primary-bg)] px-4 text-sm text-[var(--button-primary-text)] disabled:opacity-40">{l(busy ? 'opening' : text.trim() ? 'sendAndOpen' : 'openConversation')}</button></div>
      </form>}
    </div>
  </OverlayBackdrop>;
}
