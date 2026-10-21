import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import CustomSelect from '../../components/CustomSelect';
import type { AppConfig, Provider } from '../../../shared/config-types';
import { configuredBackupStatus, isModelFailoverProvider, modelFailoverMode, type ModelFailoverSettings as Settings } from '../../../shared/modelFailover';

const modelKey = (ref: NonNullable<Settings['backup']>) => JSON.stringify([ref.providerId, ref.modelId]);

export function ModelFailoverSettings({ value, providers, apiKeys, updateConfig, onOpenProviders }: {
  value: Settings | undefined;
  providers: readonly Provider[];
  apiKeys: Readonly<Record<string, string>>;
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
  onOpenProviders?: () => void;
}) {
  const { t } = useTranslation('settings');
  const hintId = useId();
  const [providerFilter, setProviderFilter] = useState('');
  const [keyOnly, setKeyOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const saving = useRef(false);
  const settings = value ?? { enabled: false };
  const mode = modelFailoverMode(value);
  const eligibleProviders = providers.filter(isModelFailoverProvider);
  const models = eligibleProviders.flatMap(provider => provider.models.map(model => ({
    providerId: provider.id,
    modelId: model.model,
    label: `${provider.name} · ${model.model}`,
    searchText: model.modelName,
    hasKey: Boolean(apiKeys[provider.id]?.trim()),
  })));
  const selectedKey = settings.backup ? modelKey(settings.backup) : '';
  const selected = models.find(model => modelKey(model) === selectedKey);
  const backupStatus = configuredBackupStatus(settings, providers, apiKeys);
  const modeLabel = t(`modelFailover.mode.${mode}`);
  const statusHint = t(`modelFailover.status.${backupStatus.status}`, { model: backupStatus.label ?? settings.backup?.modelId ?? '' });

  const save = async (next: Settings) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(false);
    try { await updateConfig({ modelFailover: next }); }
    catch { setError(true); }
    finally { saving.current = false; setBusy(false); }
  };

  return <section aria-label={t('modelFailover.title')} className="min-w-0 rounded-xl border border-[var(--line)] bg-[var(--paper-elevated)] p-5">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-base font-medium text-[var(--ink)]">{t('modelFailover.title')}</h3>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">{t('modelFailover.description')}</p>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">{t('modelFailover.relationship')}</p>
      </div>
    </div>
    <div className="mt-4 grid gap-2">
      <CustomSelect ariaLabel={t('modelFailover.mode.label')} size="md" disabled={busy} value={mode}
        options={(['auto', 'specified', 'off'] as const).map(option => ({ value: option, label: t(`modelFailover.mode.${option}`) }))}
        onChange={next => { if (next === 'auto' || next === 'specified' || next === 'off') void save({ ...settings, mode: next, enabled: next === 'specified' }); }} />
      <p className="text-xs text-[var(--ink-muted)]">{t('modelFailover.modeHint', { mode: modeLabel })}</p>
      {mode === 'specified' && <p id={hintId} className={`text-xs ${backupStatus.status === 'ready' ? 'text-[var(--ink-muted)]' : 'text-[var(--error)]'}`} role={backupStatus.status === 'ready' ? undefined : 'alert'}>
        {statusHint}{onOpenProviders && backupStatus.status !== 'ready' && <> <button type="button" className="underline" onClick={onOpenProviders}>{t('modelFailover.openProviders')}</button></>}
      </p>}
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-[var(--ink-secondary)]">
      <input id="model-failover-cross-tier" type="checkbox" checked={settings.allowCrossTier === true} disabled={busy || mode === 'off'}
        onChange={event => void save({ ...settings, mode, enabled: mode === 'specified', allowCrossTier: event.target.checked })} />
      <label htmlFor="model-failover-cross-tier">{t('modelFailover.allowCrossTier')}</label>
    </div>
    <div className="mt-4 grid gap-2">
      <p className="text-sm font-medium text-[var(--ink-secondary)]">{t('modelFailover.backup')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <CustomSelect ariaLabel={t('modelFailover.providerFilter')} size="toolbar" className="min-w-0 flex-1"
          value={providerFilter} onChange={setProviderFilter}
          options={[{ value: '', label: t('modelFailover.allProviders') },
            ...eligibleProviders.map(provider => ({ value: provider.id, label: provider.name }))]} />
        <label className="flex items-center gap-2 text-sm text-[var(--ink-secondary)]">
          <input type="checkbox" checked={keyOnly} onChange={event => setKeyOnly(event.target.checked)} />
          {t('modelFailover.keyOnly')}
        </label>
      </div>
      <CustomSelect ariaLabel={t('modelFailover.backup')} size="md" disabled={busy} value={selectedKey}
        search={{ placeholder: t('modelFailover.search'), emptyMessage: t('modelFailover.noMatches') }}
        options={[
          { value: '', label: t('modelFailover.none') },
          ...(settings.backup && !selected ? [{ value: modelKey(settings.backup), label: `${t('modelFailover.unavailable')} · ${settings.backup.modelId}` }] : []),
          ...models.map(model => ({ value: modelKey(model), label: model.label, searchText: model.searchText,
            hidden: (Boolean(providerFilter) && providerFilter !== model.providerId) || (keyOnly && !model.hasKey),
            suffix: <span className="text-xs text-[var(--ink-muted)]">{t(model.hasKey ? 'modelFailover.keyConfigured' : 'modelFailover.keyMissing')}</span>,
          })),
        ]}
        onChange={key => {
          const model = models.find(candidate => modelKey(candidate) === key);
          const { backup: _previous, ...rest } = settings;
          void save({ ...rest, ...(model ? { backup: { providerId: model.providerId, modelId: model.modelId } } : {}), enabled: mode === 'specified', mode });
        }} />
      <p className="text-xs text-[var(--ink-muted)]">{backupStatus.label ? t('modelFailover.selectedModel', { model: backupStatus.label }) : t('modelFailover.noSelectedModel')}</p>
      {!models.length && <p className="text-xs text-[var(--ink-muted)]">{t('modelFailover.empty')}</p>}
    </div>
    <details className="mt-4">
      <summary className="cursor-pointer text-sm text-[var(--ink-secondary)]">{t('modelFailover.details')}</summary>
      <div className="mt-2 space-y-2 text-xs text-[var(--ink-muted)]">
        <p>{t('modelFailover.scope')}</p>
        <p>{t('modelFailover.safety')}</p>
        <p>{t('modelFailover.compatibility')}</p>
      </div>
    </details>
    <div className="mt-3 min-h-5 text-xs" aria-live="polite">
      {busy && <p role="status" className="text-[var(--ink-muted)]">{t('modelFailover.saving')}</p>}
      {error && <p role="alert" className="text-[var(--error)]">{t('modelFailover.saveFailed')}</p>}
    </div>
  </section>;
}
