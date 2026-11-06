import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGetJson } from '@/api/apiFetch';
import { useWorkspaceFileService } from '@/hooks/useWorkspaceFileService';
import { discoverBotCareDocuments } from './documentInventory';
import type { SkillItem } from '../../../shared/skillsTypes';

type Check = { name: string; state: 'pass' | 'attention' | 'error'; detail: string };

/** Read-only diagnostics: never launches a conversation or executes a Skill. */
export default function BotCareChecks({ agentDir }: { agentDir: string }) {
  const { t } = useTranslation('app');
  const files = useWorkspaceFileService(agentDir);
  const [results, setResults] = useState<Check[]>([]);
  const [running, setRunning] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => () => { generation.current += 1; }, [agentDir]);
  const run = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const request = ++generation.current;
    setRunning(true);
    setResults([]);
    const jobs: Array<Promise<Check>> = [
      (async () => {
        const found = await discoverBotCareDocuments(files, 'definition', () => request === generation.current);
        return { name: 'definitions', state: found.paths.length && !found.truncated ? 'pass' : 'attention', detail: found.paths.join(' · ') || t('botCare.checks.noDefinitions') };
      })(),
      (async () => {
        const response = await apiGetJson<{ success: boolean; skills: SkillItem[]; integrityIssues?: unknown[]; error?: string }>(
          `/api/project-capabilities?agentDir=${encodeURIComponent(agentDir)}`,
        );
        if (!response.success || !Array.isArray(response.skills)) throw new Error(response.error || t('botCare.checks.loadFailed'));
        const enabled = response.skills.filter(skill => skill.enabled !== false).length;
        const issues = response.integrityIssues?.length ?? 0;
        return { name: 'skills', state: issues || !enabled ? 'attention' : 'pass', detail: t('botCare.checks.skillCount', { count: enabled, issues }) };
      })(),
      (async () => {
        const found = await discoverBotCareDocuments(files, 'memory', () => request === generation.current);
        return { name: 'memory', state: found.paths.length && !found.truncated ? 'pass' : 'attention', detail: found.paths.join(' · ') || t('botCare.checks.noMemory') };
      })(),
    ];
    const settled = await Promise.allSettled(jobs);
    if (request !== generation.current) return;
    const names = ['definitions', 'skills', 'memory'];
    setResults(settled.map((result, index) => result.status === 'fulfilled' ? result.value : {
      name: names[index], state: 'error', detail: result.reason instanceof Error ? result.reason.message : t('botCare.checks.loadFailed'),
    }));
    inFlight.current = false;
    setRunning(false);
  };
  return <section className="mx-auto max-w-3xl p-6">
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper-elevated)] p-6">
      <p className="text-xs font-medium text-[var(--accent)]">{t('botCare.checks.readOnly')}</p>
      <h3 className="mt-2 text-xl font-semibold">{t('botCare.checks.title')}</h3>
      <p className="mt-3 text-sm leading-relaxed text-[var(--ink-muted)]">{t('botCare.checks.description')}</p>
      <button type="button" disabled={running} onClick={() => { void run(); }} className="mt-5 rounded-lg bg-[var(--button-primary-bg)] px-4 py-2 text-sm font-medium text-[var(--button-primary-text)] disabled:opacity-50">
        {t(running ? 'botCare.checks.running' : 'botCare.checks.run')}
      </button>
    </div>
    <div className="mt-5 space-y-3" aria-live="polite" aria-busy={running}>
      {results.map(result => <div key={result.name} className="rounded-xl border border-[var(--line)] bg-[var(--paper-elevated)] p-4">
        <div className="flex items-center justify-between gap-3"><h4 className="text-sm font-medium">{t(`botCare.checks.${result.name}`)}</h4>
          <span className="text-xs text-[var(--ink-muted)]">{t(`botCare.checks.${result.state}`)}</span></div>
        <p className="mt-2 break-words text-sm text-[var(--ink-muted)]">{result.detail}</p>
      </div>)}
    </div>
    <p className="mt-5 text-sm leading-relaxed text-[var(--ink-muted)]">{t('botCare.checks.boundary')}</p>
  </section>;
}
