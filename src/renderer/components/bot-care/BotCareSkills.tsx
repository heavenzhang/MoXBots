import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SkillsCommandsList, { type SkillsCommandsListRef } from '@/components/SkillsCommandsList';
import SkillDetailPanel, { type SkillDetailPanelRef } from '@/components/SkillDetailPanel';
import CommandDetailPanel, { type CommandDetailPanelRef } from '@/components/CommandDetailPanel';
import { useToast } from '@/components/Toast';
import { CUSTOM_EVENTS } from '../../../shared/constants';

export interface BotCareSkillsRef { isEditing: () => boolean }
type Selection = { kind: 'skill' | 'command'; name: string; scope: 'user' | 'project'; isNew?: boolean };

export default forwardRef<BotCareSkillsRef, { agentDir: string }>(function BotCareSkills({ agentDir }, ref) {
  const { t } = useTranslation('app');
  const toast = useToast();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [revision, setRevision] = useState(0);
  const listRef = useRef<SkillsCommandsListRef>(null);
  const skillRef = useRef<SkillDetailPanelRef>(null);
  const commandRef = useRef<CommandDetailPanelRef>(null);
  const isEditing = useCallback(() => !!(listRef.current?.isEditing() || skillRef.current?.isEditing() || commandRef.current?.isEditing()), []);
  useImperativeHandle(ref, () => ({ isEditing }), [isEditing]);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener(CUSTOM_EVENTS.PROJECT_CAPABILITIES_CHANGED, refresh);
    return () => window.removeEventListener(CUSTOM_EVENTS.PROJECT_CAPABILITIES_CHANGED, refresh);
  }, []);
  const back = () => {
    if (isEditing()) { toast.warning(t('botCare.finishEditing')); return; }
    setSelection(null);
  };
  const saved = (close?: boolean) => {
    if (close) setSelection(null);
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.PROJECT_CAPABILITIES_CHANGED));
  };
  return <div className="flex h-full min-h-0 flex-col">
    <div className="border-b border-[var(--line)] px-6 py-4 text-sm text-[var(--ink-muted)]">
      {selection && <button type="button" className="mb-2 block text-[var(--accent)]" onClick={back}>{t('botCare.backToSkills')}</button>}
      {t(selection?.scope === 'user' ? 'botCare.sharedSkillWarning' : 'botCare.skillsHint')}
    </div>
    <div className="min-h-0 flex-1 overflow-auto">
      {!selection ? <SkillsCommandsList ref={listRef} scope="project" agentDir={agentDir} refreshKey={revision}
        onSelectSkill={(name, scope, isNew) => setSelection({ kind: 'skill', name, scope, isNew })}
        onSelectCommand={(name, scope) => setSelection({ kind: 'command', name, scope })} />
        : selection.kind === 'skill' ? <SkillDetailPanel ref={skillRef} name={selection.name} scope={selection.scope}
          agentDir={agentDir} startInEditMode={selection.isNew} onBack={back} onSaved={saved} onDeleted={() => saved(true)} />
          : <CommandDetailPanel ref={commandRef} name={selection.name} scope={selection.scope}
            agentDir={agentDir} onBack={back} onSaved={saved} onDeleted={() => saved(true)} />}
    </div>
  </div>;
});
