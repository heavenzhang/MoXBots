import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import CustomSelect from '../../components/CustomSelect';
import type { AppConfig } from '../../../shared/config-types';
import {
  AUTO_TIERS,
  autoModelKey,
  isAutoRoutingEnabled,
  parseAutoModelKey,
  parseAutoRoutingSettings,
  type AutoModelRef,
  type AutoRoutingSettings as Settings,
  type AutoTier,
} from '../../../shared/autoRoute';

/** One row of `route tiers`, as the sidecar reports it. */
export interface AutoRouteTierRow extends AutoModelRef {
  modelName?: string;
  source?: string;
}

export interface AutoRouteTiersView {
  enabled: boolean;
  classifier: (AutoModelRef & { chosenBy?: 'user' | 'auto' }) | null;
  tiers: Record<AutoTier, AutoRouteTierRow[]>;
}

/**
 * Settings card for auto model routing: on/off, three ordered tiers the user
 * can reorder or move models between, and the classifier pick. No rules.
 */
export function AutoRoutingSettings({ value, updateConfig, loadTiers, providerNames }: {
  value: unknown;
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
  /** Reads the effective tier table (`/api/admin/route/tiers`). */
  loadTiers: () => Promise<AutoRouteTiersView>;
  providerNames?: Readonly<Record<string, string>>;
}) {
  const { t } = useTranslation('settings');
  const hintId = useId();
  const settings = parseAutoRoutingSettings(value);
  const enabled = isAutoRoutingEnabled(settings);
  const [view, setView] = useState<AutoRouteTiersView | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const saving = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setView(await loadTiers());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [loadTiers]);
  // Tiers follow the provider catalog and this card's own saves.
  const settingsKey = JSON.stringify(value ?? null);
  useEffect(() => { void refresh(); }, [refresh, settingsKey]);

  const save = async (next: Settings) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(false);
    try { await updateConfig({ autoRouting: next }); }
    catch { setError(true); }
    finally { saving.current = false; setBusy(false); }
  };

  const label = (ref: AutoModelRef & { modelName?: string }) => {
    const provider = providerNames?.[ref.providerId] ?? ref.providerId;
    return `${provider} · ${ref.modelName ?? ref.model}`;
  };

  const moveUp = (tier: AutoTier, index: number) => {
    const keys = (view?.tiers[tier] ?? []).map(autoModelKey);
    if (index <= 0 || index >= keys.length) return;
    [keys[index - 1], keys[index]] = [keys[index], keys[index - 1]];
    void save({ ...settings, tierOrder: { ...settings.tierOrder, [tier]: keys } });
  };

  const moveTier = (row: AutoModelRef, tier: AutoTier) => {
    void save({ ...settings, tierOverrides: { ...settings.tierOverrides, [autoModelKey(row)]: tier } });
  };

  const allModels = AUTO_TIERS.flatMap(tier => view?.tiers[tier] ?? []);
  const classifier = view?.classifier ?? null;
  const classifierValue = settings.classifier ? autoModelKey(settings.classifier) : '';

  return <section aria-label={t('autoRouting.title')} className="min-w-0 rounded-xl border border-[var(--line)] bg-[var(--paper-elevated)] p-5">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-base font-medium text-[var(--ink)]">{t('autoRouting.title')}</h3>
        <p id={hintId} className="mt-2 text-sm text-[var(--ink-muted)]">{t('autoRouting.description')}</p>
      </div>
      <button type="button" role="switch" aria-label={t('autoRouting.enable')} aria-checked={enabled}
        aria-describedby={hintId} disabled={busy}
        onClick={() => void save({ ...settings, enabled: !enabled })}
        className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60 ${enabled ? 'bg-[var(--accent)]' : 'bg-[var(--line-strong)]'}`}>
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-[var(--toggle-thumb)] shadow transition-transform motion-reduce:transition-none ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>

    {loadFailed && <p role="alert" className="mt-4 text-xs text-[var(--error)]">{t('autoRouting.loadFailed')}</p>}
    {view && allModels.length === 0 && <p className="mt-4 text-xs text-[var(--ink-muted)]">{t('autoRouting.empty')}</p>}

    {view && allModels.length > 0 && <div className="mt-4 grid grid-cols-3 gap-3">
      {AUTO_TIERS.map(tier => {
        const rows = view.tiers[tier] ?? [];
        const tierIndex = AUTO_TIERS.indexOf(tier);
        return <div key={tier} role="group" aria-label={t(`autoRouting.tiers.${tier}`)} className="min-w-0 rounded-lg border border-[var(--line)] p-3">
          <p className="text-sm font-medium text-[var(--ink-secondary)]">{t(`autoRouting.tiers.${tier}`)}</p>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{t(`autoRouting.tierHints.${tier}`)}</p>
          {rows.length === 0 && <p className="mt-2 text-xs text-[var(--ink-muted)]">{t('autoRouting.tierEmpty')}</p>}
          <ol className="mt-2 space-y-1">
            {rows.map((row, index) => <li key={autoModelKey(row)} className="flex min-w-0 items-center gap-1 text-sm text-[var(--ink)]">
              <span className="min-w-0 flex-1 truncate" title={label(row)}>{label(row)}</span>
              <button type="button" disabled={busy || index === 0}
                aria-label={t('autoRouting.moveUp', { model: label(row) })}
                onClick={() => moveUp(tier, index)}
                className="rounded px-1 text-xs text-[var(--ink-muted)] hover:bg-[var(--hover-bg)] disabled:opacity-40">↑</button>
              <button type="button" disabled={busy || tierIndex === 0}
                aria-label={t('autoRouting.moveFaster', { model: label(row) })}
                onClick={() => moveTier(row, AUTO_TIERS[tierIndex - 1])}
                className="rounded px-1 text-xs text-[var(--ink-muted)] hover:bg-[var(--hover-bg)] disabled:opacity-40">←</button>
              <button type="button" disabled={busy || tierIndex === AUTO_TIERS.length - 1}
                aria-label={t('autoRouting.moveStronger', { model: label(row) })}
                onClick={() => moveTier(row, AUTO_TIERS[tierIndex + 1])}
                className="rounded px-1 text-xs text-[var(--ink-muted)] hover:bg-[var(--hover-bg)] disabled:opacity-40">→</button>
            </li>)}
          </ol>
        </div>;
      })}
    </div>}

    {view && allModels.length > 0 && <div className="mt-4 grid gap-2">
      <p className="text-sm text-[var(--ink-secondary)]">
        {classifier
          ? t(classifier.chosenBy === 'user' ? 'autoRouting.classifierUser' : 'autoRouting.classifierAuto', { model: label(allModels.find(row => autoModelKey(row) === autoModelKey(classifier)) ?? classifier) })
          : t('autoRouting.classifierNone')}
      </p>
      <CustomSelect ariaLabel={t('autoRouting.classifier')} size="md" disabled={busy} value={classifierValue}
        options={[
          { value: '', label: t('autoRouting.classifierAutoOption') },
          ...allModels.map(row => ({ value: autoModelKey(row), label: label(row) })),
        ]}
        onChange={key => {
          const ref = key ? parseAutoModelKey(key) : null;
          const { classifier: _previous, ...rest } = settings;
          void save(ref ? { ...rest, classifier: ref } : rest);
        }} />
      <p className="text-xs text-[var(--ink-muted)]">{t('autoRouting.privacy')}</p>
    </div>}

    <div className="mt-3 min-h-5 text-xs" aria-live="polite">
      {busy && <p role="status" className="text-[var(--ink-muted)]">{t('autoRouting.saving')}</p>}
      {error && <p role="alert" className="text-[var(--error)]">{t('autoRouting.saveFailed')}</p>}
    </div>
  </section>;
}
