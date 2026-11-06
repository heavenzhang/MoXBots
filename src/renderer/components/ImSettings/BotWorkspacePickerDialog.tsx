import { CloseIcon } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import OverlayBackdrop from '@/components/OverlayBackdrop';
import WorkspaceIcon from '@/components/launcher/WorkspaceIcon';
import type { AgentConfig } from '../../../shared/types/agent';
import type { Project } from '@/config/types';
import { useCloseLayer } from '@/hooks/useCloseLayer';
import { botBindingName, getBotBindingCandidates } from './botWorkspaceSelection';

interface BotWorkspacePickerDialogProps {
  projects: readonly Project[];
  agents: readonly AgentConfig[];
  defaultWorkspacePath?: string;
  onSelect: (project: Project) => void;
  onClose: () => void;
}

export default function BotWorkspacePickerDialog({
  projects,
  agents,
  defaultWorkspacePath,
  onSelect,
  onClose,
}: BotWorkspacePickerDialogProps) {
  const { t } = useTranslation('settings');
  const candidates = getBotBindingCandidates(projects, agents, defaultWorkspacePath);
  useCloseLayer(() => {
    onClose();
    return true;
  }, 210);

  return (
    <OverlayBackdrop onClose={onClose} className="z-[210]">
      <div className="w-[min(92vw,26rem)] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--paper)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--ink)]">
              {t('agentSettings.botRegistry.selectWorkspaceTitle')}
            </h3>
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
              {t('agentSettings.botRegistry.selectWorkspaceDescription')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('agentSettings.botRegistry.cancel')}
            className="rounded-lg p-1.5 text-[var(--ink-muted)] hover:bg-[var(--paper-inset)] hover:text-[var(--ink)]"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {candidates.map(target => (
            <button
              type="button"
              key={target.agent.id}
              onClick={() => onSelect(target.project)}
              className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left hover:bg-[var(--paper-inset)]"
            >
              <WorkspaceIcon icon={target.project.icon || target.agent.icon} size={24} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--ink)]">{botBindingName(target)}</span>
                <span className="block text-xs text-[var(--ink-muted)]">
                  {t('agentSettings.botRegistry.bindingCount', { count: target.agent.channels.length })}
                </span>
              </span>
            </button>
          ))}
          {candidates.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-[var(--ink-muted)]">
              {t('agentSettings.botRegistry.noWorkspaceAvailable')}
            </p>
          )}
        </div>
      </div>
    </OverlayBackdrop>
  );
}
