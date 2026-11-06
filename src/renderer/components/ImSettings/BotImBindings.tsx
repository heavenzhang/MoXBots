import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfig } from '@/hooks/useConfig';
import type { AppConfig, Project } from '@/config/types';
import type { AgentStatusMap } from '@/hooks/useAgentStatuses';
import { useAgentStatuses } from '@/hooks/useAgentStatuses';
import WorkspaceIcon from '@/components/launcher/WorkspaceIcon';
import AgentChannelsSection from '@/components/AgentSettings/sections/AgentChannelsSection';
import { resolveChannelDisplayName } from '@/utils/channelDisplayName';
import { findPromotedByPlatform } from './promotedPlugins';
import { botBindingName, getBotBindingCandidates } from './botWorkspaceSelection';

/** Read-only projection of the existing Agent/Channel owners. Management reuses
 * the original channel lifecycle, pairing and permission controls. */
export default function BotImBindings() {
  const { config, projects, refreshConfig } = useConfig();
  const { statuses, refresh } = useAgentStatuses();
  return <BotImBindingsView config={config} projects={projects} statuses={statuses} onChanged={async () => {
    await refreshConfig();
    refresh();
  }} />;
}

const PLATFORM_LABELS: Record<string, string> = { telegram: 'Telegram', feishu: '飞书', dingtalk: '钉钉' };

export function BotImBindingsView({ config, projects, statuses, onChanged }: {
  config: Pick<AppConfig, 'agents' | 'defaultWorkspacePath'>;
  projects: readonly Project[];
  statuses: AgentStatusMap;
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation('settings');
  const [expandedBot, setExpandedBot] = useState<string | null>(null);
  const targets = getBotBindingCandidates(projects, config.agents ?? [], config.defaultWorkspacePath);

  return (
    <section className="mb-8" aria-label={t('agentSettings.botRegistry.bindingsTitle')}>
      <h2 className="text-lg font-semibold text-[var(--ink)]">{t('agentSettings.botRegistry.bindingsTitle')}</h2>
      <p className="mt-2 text-sm text-[var(--ink-muted)]">{t('agentSettings.botRegistry.bindingsDescription')}</p>
      <div className="mt-4 space-y-3">
        {targets.map(target => {
          const { agent, project } = target;
          const expanded = expandedBot === agent.id;
          const status = statuses[agent.id];
          return (
            <article key={agent.id} className="min-w-0 rounded-xl border border-[var(--line)] bg-[var(--paper-elevated)] p-4">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <WorkspaceIcon icon={project.icon || agent.icon} size={24} />
                <h3 className="min-w-0 flex-1 break-words text-sm font-semibold text-[var(--ink)]">{botBindingName(target)}</h3>
                <button type="button" aria-expanded={expanded}
                  onClick={() => setExpandedBot(expanded ? null : agent.id)}
                  className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--ink)] hover:bg-[var(--paper-inset)]">
                  {t(`agentSettings.botRegistry.${expanded ? 'collapseBindings' : 'manageBindings'}`)}
                </button>
              </div>
              {agent.channels.length === 0 && (
                <p className="mt-3 text-xs text-[var(--ink-muted)]">{t('agentSettings.botRegistry.noBindings')}</p>
              )}
              <ul className="mt-3 space-y-2">
                {agent.channels.map(channel => {
                  const live = status?.channels.find(item => item.channelId === channel.id);
                  const platform = findPromotedByPlatform(channel.type)?.name
                    || PLATFORM_LABELS[channel.type]
                    || channel.openclawManifest?.name || channel.type;
                  const name = resolveChannelDisplayName(channel, live, platform);
                  return (
                    <li key={channel.id} className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1 text-xs">
                      <div className="min-w-0">
                        <p className="break-words text-[var(--ink)]">{name === platform ? platform : `${platform} · ${name}`}</p>
                        <p className="mt-0.5 text-[var(--ink-muted)]">
                          {t('agentSettings.botRegistry.pairedUsers', { count: new Set(channel.allowedUsers ?? []).size })}
                          {' · '}{t('agentSettings.botRegistry.approvedGroups', {
                            count: (channel.groupPermissions ?? []).filter(group => group.status === 'approved').length,
                          })}
                        </p>
                      </div>
                      <span className={live?.status === 'error' ? 'text-[var(--error)]' : 'text-[var(--ink-muted)]'}>
                        {t(`agentSettings.botRegistry.connection.${live?.status ?? 'unknown'}`)}
                        {!channel.enabled && ` · ${t('agentSettings.botRegistry.disabled')}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {expanded && (
                <div className="mt-4 border-t border-[var(--line)] pt-4">
                  <AgentChannelsSection agent={agent} status={status} onAgentChanged={onChanged} />
                </div>
              )}
            </article>
          );
        })}
        {targets.length === 0 && <p className="py-4 text-sm text-[var(--ink-muted)]">{t('agentSettings.botRegistry.noWorkspaceAvailable')}</p>}
      </div>
    </section>
  );
}
