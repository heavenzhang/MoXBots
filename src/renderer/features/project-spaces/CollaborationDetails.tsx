import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SessionMetadata } from '@/api/sessionClient';
import type { Message } from '@/types/chat';
import type { ProjectSpaceSessionSnapshot } from '../../../shared/projectSpaces';
import { workspacePathsEqual } from '../../../shared/workspacePath';
import { useTaskCenterData } from '@/hooks/useTaskCenterData';
import { useSessionTaskOrchestrationContext } from '@/components/agent-status/useSessionTaskOrchestration';
import { useSessionTaskActions } from '@/components/agent-status/SessionTaskActionsContext';
import SessionTaskPanel from '@/components/agent-status/SessionTaskPanel';
import { SessionFilesPanel } from '@/components/SessionFilesButton';
import OverlayBackdrop from '@/components/OverlayBackdrop';
import { CloseIcon } from '@/components/icons';
import WorkspaceIcon from '@/components/launcher/WorkspaceIcon';
import { useCloseLayer } from '@/hooks/useCloseLayer';
import { isImeComposingEvent } from '@/utils/imeKeyboard';

export function collaborationSessions(snapshot: ProjectSpaceSessionSnapshot, sessions: readonly SessionMetadata[]) {
  const group = snapshot.collaboration;
  if (!group?.leadSessionId) return [];
  return sessions.filter(session => !session.archived && session.projectSpace?.projectId === snapshot.projectId
    && session.projectSpace.collaboration?.leadSessionId === group.leadSessionId
    && group.members.some(member => member.id === session.projectSpace?.botId)
    && workspacePathsEqual(session.agentDir, session.projectSpace.workspacePath))
    .sort((a, b) => Number(b.id === group.leadSessionId) - Number(a.id === group.leadSessionId)
      || Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt));
}
/** A nested summary is hidden while any enclosing details is closed. */
function isDialogTabStop(element: HTMLElement): boolean {
  if (element.getAttribute('tabindex') === '-1' || element.closest('[hidden], [inert]')) return false;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName !== 'DETAILS' || parent.hasAttribute('open')) continue;
    const summary = [...parent.children].find(child => child.tagName === 'SUMMARY');
    if (!summary?.contains(element)) return false;
  }
  return true;
}
interface Props {
  snapshot: ProjectSpaceSessionSnapshot; sessionId: string; messages: readonly Message[]; isActive: boolean;
  onOpenConversation?: (session: SessionMetadata) => void;
  hasMoreBefore?: boolean; onLoadOlder?: () => Promise<void>; onNavigate?: (messageId: string) => void;
}
/** Closed chats hold no additional metadata subscription or file projection. */
export default function CollaborationDetails(props: Props) {
  return <CollaborationControl key={`${props.sessionId}:${props.isActive}`} {...props} />;
}
function CollaborationControl(props: Props) {
  const { t } = useTranslation('app');
  const [open, setOpen] = useState(false);
  return <><button type="button" aria-expanded={open && props.isActive} onClick={() => setOpen(true)} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs text-[var(--ink-secondary)] hover:bg-[var(--hover-bg)]">{t('projectSpaces.collaboration')} · {props.snapshot.collaboration?.members.length}</button>
    {open && props.isActive && <CollaborationPanel {...props} onClose={() => setOpen(false)} />}</>;
}
function CollaborationPanel({ snapshot, sessionId, messages, onOpenConversation, onClose, hasMoreBefore, onLoadOlder, onNavigate }: Props & { onClose: () => void }) {
  const { t } = useTranslation('app'); const l = (key: string) => t(`projectSpaces.${key}`);
  const data = useTaskCenterData({ isActive: true });
  const tasks = useSessionTaskOrchestrationContext(); const actions = useSessionTaskActions();
  const [section, setSection] = useState<'members' | 'tasks' | 'results'>('members');
  const [limit, setLimit] = useState(30);
  const group = snapshot.collaboration!;
  const sessions = useMemo(() => collaborationSessions(snapshot, data.sessions), [snapshot, data.sessions]);
  const titleId = useId(); const panelId = useId(); const dialog = useRef<HTMLDivElement>(null);
  useCloseLayer(() => { onClose(); return true; }, 250);
  useEffect(() => { const previous = document.activeElement; dialog.current?.querySelector<HTMLButtonElement>('button')?.focus(); return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); }; }, []);
  const openSession = (session: SessionMetadata) => { onClose(); onOpenConversation?.(session); };
  const lead = sessions.find(session => session.id === group.leadSessionId);
  return <OverlayBackdrop portal className="z-[250] p-4" onClose={onClose}><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} className="m-auto max-h-[85dvh] w-[560px] max-w-full overflow-y-auto rounded-2xl border border-[var(--line-subtle)] bg-[var(--paper-elevated)] p-5 text-[var(--ink)] shadow-xl" onKeyDown={event => {
    if (isImeComposingEvent(event)) return;
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    if (event.key === 'Tab') { const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary, [tabindex="0"]') ?? [])].filter(isDialogTabStop).sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1); const first = controls[0], last = controls.at(-1); if (first && last && event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (first && last && !event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
  }}>
    <header className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 id={titleId} className="text-lg font-medium">{l('collaboration')}</h2><p className="mt-1 break-words text-xs text-[var(--ink-muted)]">{snapshot.projectName} · {l('leadBot')} {group.members.find(member => member.id === group.leadBotId)?.name}</p></div><button type="button" onClick={onClose} aria-label={l('close')} className="rounded-lg p-2 hover:bg-[var(--hover-bg)]"><CloseIcon className="h-4 w-4" /></button></header>
    {sessionId !== group.leadSessionId && (lead ? <button type="button" disabled={!onOpenConversation} className="mt-3 text-sm text-[var(--accent)]" onClick={() => openSession(lead)}>{l('leadConversation')}</button> : <p role="status" className="mt-3 text-xs text-[var(--ink-muted)]">{l('unavailableConversation')}</p>)}
    <div role="tablist" aria-label={l('collaboration')} className="my-4 flex gap-1 border-b border-[var(--line-subtle)]">{(['members', 'tasks', 'results'] as const).map((key, index, keys) => <button type="button" role="tab" id={`${panelId}-${key}`} aria-controls={panelId} aria-selected={section === key} tabIndex={section === key ? 0 : -1} key={key} onClick={() => { setSection(key); setLimit(30); }} onKeyDown={event => { const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : undefined; if (next !== undefined) { event.preventDefault(); setSection(keys[next]); document.getElementById(`${panelId}-${keys[next]}`)?.focus(); } }} className={`min-h-9 flex-1 rounded-t-lg px-3 text-sm ${section === key ? 'border-b-2 border-[var(--accent)] text-[var(--ink)]' : 'text-[var(--ink-muted)] hover:bg-[var(--hover-bg)]'}`}>{l(key)}</button>)}</div>
    <section id={panelId} role="tabpanel" aria-labelledby={`${panelId}-${section}`} tabIndex={0} className="min-h-40">
      {section === 'members' && <><ul className="space-y-4">{group.members.map(member => <li key={member.id}><div className="flex items-center gap-2"><WorkspaceIcon icon={member.icon} size={28} /><span className="min-w-0 break-words text-sm">{member.name}</span>{member.id === group.leadBotId && <span className="shrink-0 text-xs text-[var(--ink-muted)]">{l('leadBot')}</span>}</div><div className="ml-9 mt-1 space-y-1">{sessions.filter(session => session.projectSpace?.botId === member.id).slice(0, limit).map(session => <button type="button" key={session.id} disabled={!onOpenConversation || session.id === sessionId} onClick={() => openSession(session)} className="block min-h-8 max-w-full break-words text-left text-xs text-[var(--accent)] disabled:text-[var(--ink-muted)]">{session.title || l('openConversationAction')}{session.id === group.leadSessionId ? ` · ${l('leadConversation')}` : ''}</button>)}{!sessions.some(session => session.projectSpace?.botId === member.id) && <p className="text-xs text-[var(--ink-muted)]">{data.isSessionsLoading ? l('loading') : l('noMemberConversation')}</p>}</div></li>)}</ul>{data.sessionsError && <p role="alert" className="mt-3 text-xs text-[var(--warning)]">{l('readFailed')}</p>}<div className="mt-5 border-t border-[var(--line-subtle)] pt-3"><details className="text-sm"><summary className="cursor-pointer text-[var(--ink-secondary)]">{l('projectBrief')}</summary><p className="mt-3 text-xs text-[var(--ink-muted)]">{l('revisionHint')}</p><p className="mt-2 whitespace-pre-wrap break-words leading-6">{snapshot.description}</p>{snapshot.instructions && <p className="mt-3 whitespace-pre-wrap break-words leading-6">{snapshot.instructions}</p>}{snapshot.materials.map(item => <details key={item.id} className="mt-3"><summary className="cursor-pointer">{item.title}</summary><p className="mt-2 whitespace-pre-wrap break-words leading-6">{item.content}</p></details>)}{snapshot.resources.map(item => <p key={item.id} className="mt-3 break-all text-xs">{item.label} · {item.path}</p>)}</details></div></>}
      {section === 'tasks' && <><p className="mb-3 text-xs text-[var(--ink-muted)]">{l('currentConversation')}</p>{tasks?.sessionId === sessionId ? <>{!tasks.tasks.length && <p className="text-sm text-[var(--ink-secondary)]">{l('noTasks')}</p>}<SessionTaskPanel tasks={tasks.tasks} stale={tasks.stale} onRetry={tasks.retry} onSelectAgent={id => { onClose(); actions?.onInspect(id); }} /></> : <p role="status" className="text-sm text-[var(--ink-muted)]">{t('orchestration.stale')}</p>}</>}
      {section === 'results' && <><p className="mb-3 text-xs leading-5 text-[var(--ink-muted)]">{l('currentConversation')} · {l('resultsHint')}</p><SessionFilesPanel embedded id={`${panelId}-files`} messages={messages} hasMoreBefore={hasMoreBefore ?? false} onLoadOlder={onLoadOlder ?? (async () => {})} onNavigate={onNavigate ?? (() => {})} onClose={onClose} /></>}
      {section === 'members' && group.members.some(member => sessions.filter(session => session.projectSpace?.botId === member.id).length > limit) && <button type="button" onClick={() => setLimit(limit + 30)} className="mt-3 text-sm text-[var(--accent)]">{l('loadMore')}</button>}
    </section>
  </div></OverlayBackdrop>;
}
