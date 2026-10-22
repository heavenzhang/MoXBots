import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ConfirmDialog from '../../components/ConfirmDialog';
import CustomSelect from '../../components/CustomSelect';
import type { AppConfig } from '../../../shared/config-types';
import {
  AUTO_TIERS,
  autoModelKey,
  isAutoRoutingEnabled,
  parseAutoModelKey,
  parseAutoRoutingSettings,
  type AutoModelRef,
  type AutoRouteManagedModel,
  type AutoRoutingModifier,
  type AutoRoutingSettings as Settings,
  type AutoTier,
  type AutoTierSource,
} from '../../../shared/autoRoute';

/** One row of `route tiers`, as the sidecar reports it. */
export interface AutoRouteTierRow extends AutoModelRef {
  modelName?: string;
  providerName?: string;
  source?: AutoTierSource;
  available?: boolean;
  unavailableReason?: AutoRouteManagedModel['unavailableReason'];
}

export interface AutoRouteTiersView {
  enabled: boolean;
  classifier: (AutoModelRef & { chosenBy?: 'user' | 'auto'; available?: boolean; unavailableReason?: string }) | null;
  tiers: Record<AutoTier, AutoRouteTierRow[]>;
  /** Complete provider directory, including excluded, paused and unavailable models. */
  models?: AutoRouteManagedModel[];
}

type Filter = 'all' | AutoTier | 'paused' | 'unavailable';

/** Settings card for automatic routing and its explicitly managed candidate pool. */
export function AutoRoutingSettings({ value, updateConfig, loadTiers, providerNames, modifySettings, onOpenProviders, specifiedBackup }: {
  value: unknown;
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
  /** Reads effective tier and complete model directory. */
  loadTiers: () => Promise<AutoRouteTiersView>;
  providerNames?: Readonly<Record<string, string>>;
  /** Applies a pure modifier to the latest settings under the config writer lock. */
  modifySettings?: (modify: AutoRoutingModifier) => Promise<void>;
  onOpenProviders?: (providerId?: string) => void;
  specifiedBackup?: AutoModelRef;
}) {
  const { t } = useTranslation('settings');
  const hintId = useId();
  const settings = parseAutoRoutingSettings(value);
  const enabled = isAutoRoutingEnabled(settings);
  const [view, setView] = useState<AutoRouteTiersView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [undoConflict, setUndoConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const [query, setQuery] = useState('');
  const [addQuery, setAddQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addSelected, setAddSelected] = useState<Set<string>>(() => new Set());
  const [addTier, setAddTier] = useState<AutoTier>('balanced');
  const [confirm, setConfirm] = useState<null | { mode: 'exclude' | 'pause' | 'restore' | 'follow'; keys: string[] }>(null);
  const [undoState, setUndoState] = useState<null | { label: string; expected: Partial<Settings>; previous: Partial<Settings> }>(null);
  const saving = useRef(false);
  const requestId = useRef(0);
  const searchId = useId();

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const next = await loadTiers();
      if (id === requestId.current) { setView(next); setLoadFailed(false); }
    } catch {
      if (id === requestId.current) setLoadFailed(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [loadTiers]);
  const settingsKey = JSON.stringify(value ?? null);
  useEffect(() => {
    void refresh();
    return () => { requestId.current += 1; };
  }, [refresh, settingsKey]);

  const models = useMemo<AutoRouteManagedModel[]>(() => {
    if (view?.models) return view.models;
    // Existing test fixtures and callers can still provide only the legacy tier table.
    return AUTO_TIERS.flatMap(tier => (view?.tiers[tier] ?? []).map(row => ({
      providerId: row.providerId,
      model: row.model,
      modelName: row.modelName,
      providerName: row.providerName ?? providerNames?.[row.providerId] ?? row.providerId,
      tier,
      source: row.source ?? 'default',
      inPool: true,
      enabled: true,
      available: row.available !== false,
      unavailableReason: row.unavailableReason,
    })));
  }, [view, providerNames]);
  const catalog = useMemo(() => {
    const seen = new Set<string>();
    return models.filter(model => { const key = autoModelKey(model); if (seen.has(key)) return false; seen.add(key); return true; });
  }, [models]);
  const active = catalog.filter(model => model.inPool && model.enabled && model.available);
  const allKeys = new Set(active.map(autoModelKey));
  const classifier = view?.classifier ?? null;
  const classifierKey = settings.classifier ? autoModelKey(settings.classifier) : '';
  const classifierUnavailable = Boolean(settings.classifier && (!allKeys.has(classifierKey) || !classifier || classifier.available === false || autoModelKey(classifier) !== classifierKey));
  const backupModel = specifiedBackup && catalog.find(model => autoModelKey(model) === autoModelKey(specifiedBackup));

  const name = (model: AutoModelRef & { modelName?: string; providerName?: string }) => model.modelName?.trim() || model.model;
  const provider = (model: AutoModelRef & { providerName?: string }) => model.providerName || providerNames?.[model.providerId] || model.providerId;
  const label = (model: AutoModelRef & { modelName?: string; providerName?: string }) => `${provider(model)} · ${name(model)}`;
  const sourceLabel = (source: AutoTierSource) => t(`autoRouting.sources.${source}`);
  const canManage = !loading && !loadFailed && !busy;
  const commit = async (modifier: AutoRoutingModifier, fallback?: Settings, undo?: { label: string; expected: Partial<Settings>; previous: Partial<Settings> }): Promise<boolean> => {
    if (saving.current) return false;
    saving.current = true;
    setBusy(true); setError(false); setUndoConflict(false); setSaved(false); setUndoState(null);
    try {
      if (modifySettings) await modifySettings(modifier);
      else await updateConfig({ autoRouting: fallback ?? modifier(settings) });
      setSaved(true);
      if (undo) setUndoState(undo);
      return true;
    } catch (caught) {
      if (caught instanceof Error && caught.message === 'undo-conflict') setUndoConflict(true);
      else setError(true);
      return false;
    }
    finally { saving.current = false; setBusy(false); }
  };
  const savePatch = (patch: Partial<Settings>, remove: (keyof Settings)[] = []) => {
    const fallback = { ...settings, ...patch } as Settings;
    if (patch.tierOrder) fallback.tierOrder = { ...settings.tierOrder, ...patch.tierOrder };
    if (patch.tierOverrides) fallback.tierOverrides = { ...settings.tierOverrides, ...patch.tierOverrides };
    for (const key of remove) delete (fallback as Record<string, unknown>)[key];
    const changed = [...new Set([...Object.keys(patch), ...remove])] as (keyof Settings)[];
    const undo = { label: 'setting', expected: Object.fromEntries(changed.map(key => [key, fallback[key]])), previous: Object.fromEntries(changed.map(key => [key, settings[key]])) };
    void commit(current => {
      const next = { ...current, ...patch } as Settings;
      if (patch.tierOrder) next.tierOrder = { ...current.tierOrder, ...patch.tierOrder };
      if (patch.tierOverrides) next.tierOverrides = { ...current.tierOverrides, ...patch.tierOverrides };
      for (const key of remove) delete (next as Record<string, unknown>)[key];
      return next;
    }, fallback, undo);
  };
  const beginMembershipAction = (mode: 'exclude' | 'pause' | 'restore' | 'follow', keys: string[]) => setConfirm({ mode, keys });
  const applyMembershipAction = async () => {
    if (!confirm) return;
    const { mode, keys } = confirm;
    const modifier: AutoRoutingModifier = current => {
      if (mode === 'follow') {
        const next: Settings = { ...current };
        delete next.pool;
        return next;
      }
      const seeded = current.pool === undefined
        ? Object.fromEntries(catalog.filter(model => model.inPool).map(model => [autoModelKey(model), { enabled: model.enabled }]))
        : { ...current.pool };
      for (const key of keys) {
        if (mode === 'restore') seeded[key] = { enabled: true };
        else if (mode === 'pause') seeded[key] = { enabled: false };
        else delete seeded[key];
      }
      const next: Settings = { ...current, pool: seeded };
      if ((mode === 'exclude' || mode === 'pause') && current.classifier && keys.includes(autoModelKey(current.classifier))) delete next.classifier;
      return next;
    };
    const fallback = modifier(settings);
    const changed = ['pool', 'classifier'] as (keyof Settings)[];
    const success = await commit(modifier, fallback, { label: 'pool', expected: Object.fromEntries(changed.map(key => [key, fallback[key]])), previous: Object.fromEntries(changed.map(key => [key, settings[key]])) });
    if (success) { setSelected(new Set()); setConfirm(null); }
  };
  const toggleSet = (setter: typeof setSelected, source: Set<string>, key: string) => {
    const next = new Set(source); if (next.has(key)) next.delete(key); else next.add(key); setter(next);
  };
  const visible = catalog.filter(model => {
    const matchesQuery = `${model.model} ${name(model)} ${provider(model)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    const matchesFilter = filter === 'all' ? model.inPool && model.enabled && model.available
      : filter === 'unavailable' ? model.inPool && !model.available
      : filter === 'paused' ? model.inPool && !model.enabled
        : model.inPool && model.enabled && model.available && model.tier === filter;
    return matchesQuery && matchesFilter;
  }).sort((left, right) => {
    const tierDelta = AUTO_TIERS.indexOf(left.tier) - AUTO_TIERS.indexOf(right.tier);
    if (tierDelta) return tierDelta;
    const rows = view?.tiers[left.tier] ?? [];
    const order = new Map(rows.map((row, index) => [autoModelKey(row), index]));
    return (order.get(autoModelKey(left)) ?? Number.MAX_SAFE_INTEGER) - (order.get(autoModelKey(right)) ?? Number.MAX_SAFE_INTEGER);
  });
  const visibleKeys = visible.map(autoModelKey);
  const visibleSelected = [...selected].filter(key => visibleKeys.includes(key));
  const addModels = catalog.filter(model => !model.inPool);
  const visibleAddModels = addModels.filter(model => `${model.model} ${name(model)} ${provider(model)}`.toLocaleLowerCase().includes(addQuery.trim().toLocaleLowerCase()));
  const toggleVisible = () => setSelected(current => visibleKeys.every(key => current.has(key))
    ? new Set([...current].filter(key => !visibleKeys.includes(key))) : new Set([...current, ...visibleKeys]));
  const moveOrder = (model: AutoRouteManagedModel, delta: -1 | 1) => {
    const effectiveKeys = (view?.tiers[model.tier] ?? []).filter(row => active.some(item => autoModelKey(item) === autoModelKey(row))).map(autoModelKey);
    const modifier: AutoRoutingModifier = current => {
      const previousOrder = current.tierOrder?.[model.tier] ?? [];
      const keys = [...new Set([...previousOrder.filter(key => effectiveKeys.includes(key)), ...effectiveKeys])];
      const otherKeys = previousOrder.filter(key => !effectiveKeys.includes(key));
      const index = keys.indexOf(autoModelKey(model));
      if (index < 0 || index + delta < 0 || index + delta >= keys.length) return current;
      [keys[index], keys[index + delta]] = [keys[index + delta], keys[index]];
      return { ...current, tierOrder: { ...current.tierOrder, [model.tier]: [...keys, ...otherKeys] } };
    };
    const fallbackKeys = [...effectiveKeys];
    const otherFallbackKeys = (settings.tierOrder?.[model.tier] ?? []).filter(key => !effectiveKeys.includes(key));
    const index = fallbackKeys.indexOf(autoModelKey(model));
    if (index < 0 || index + delta < 0 || index + delta >= fallbackKeys.length) return;
    [fallbackKeys[index], fallbackKeys[index + delta]] = [fallbackKeys[index + delta], fallbackKeys[index]];
    const fallback: Settings = { ...settings, tierOrder: { ...settings.tierOrder, [model.tier]: [...fallbackKeys, ...otherFallbackKeys] } };
    void commit(modifier, fallback, { label: 'order', expected: { tierOrder: fallback.tierOrder }, previous: { tierOrder: settings.tierOrder } });
  };
  const changeTier = (model: AutoRouteManagedModel, tier: AutoTier) => savePatch({ tierOverrides: { [autoModelKey(model)]: tier } });
  const undo = () => {
    if (!undoState) return;
    const keys = Object.keys(undoState.expected) as (keyof Settings)[];
    const modifier: AutoRoutingModifier = current => {
      if (!keys.every(key => JSON.stringify(current[key]) === JSON.stringify(undoState.expected[key]))) throw new Error('undo-conflict');
      const next = { ...current };
      keys.forEach(key => {
        const prior = undoState.previous[key];
        if (prior === undefined) delete (next as Record<string, unknown>)[key];
        else (next as Record<string, unknown>)[key] = prior;
      });
      return next;
    };
    void commit(modifier);
    setUndoState(null);
  };

  return <section aria-label={t('autoRouting.title')} className="min-w-0 rounded-xl border border-[var(--line)] bg-[var(--paper-elevated)] p-4 sm:p-5">
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-base font-medium text-[var(--ink)]">{t('autoRouting.title')}</h3>
        <p id={hintId} className="mt-1.5 text-sm text-[var(--ink-muted)]">{t('autoRouting.description')}</p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">{t('autoRouting.nextTurn')} · {settings.pool === undefined ? t('autoRouting.poolAutomatic') : t('autoRouting.poolManual')}</p>
      </div>
      <button type="button" role="switch" aria-label={t('autoRouting.enable')} aria-checked={enabled} aria-describedby={hintId} disabled={busy || loading || loadFailed}
        onClick={() => savePatch({ enabled: !enabled })}
        className={`relative mt-1 h-8 w-12 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-60 ${enabled ? 'bg-[var(--accent)]' : 'bg-[var(--line-strong)]'}`}>
        <span className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-[var(--toggle-thumb)] shadow transition-transform motion-reduce:transition-none ${enabled ? 'translate-x-4' : ''}`} />
      </button>
    </div>

    <div className="mt-2 flex min-h-8 flex-wrap items-center gap-2 text-xs" aria-live="polite">
      {busy && <p role="status" className="text-[var(--ink-muted)]">{t('autoRouting.saving')}</p>}
      {saved && <><p role="status" className="text-[var(--ink-muted)]">{t('autoRouting.saved')}</p>{undoState && <button type="button" className="min-h-8 px-2 text-[var(--accent)] underline" onClick={undo}>{t('autoRouting.undo')}</button>}</>}
      {undoConflict && <p role="alert" className="text-[var(--error)]">{t('autoRouting.undoConflict')}</p>}
      {error && <p role="alert" className="text-[var(--error)]">{t('autoRouting.saveFailed')}</p>}
    </div>

    {loading && <p role="status" className="mt-4 text-xs text-[var(--ink-muted)]">{t('autoRouting.loading')}</p>}
    {loadFailed && <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[var(--error)]"><p role="alert">{t('autoRouting.loadFailed')}</p><button className="min-h-8 px-2 underline" type="button" onClick={() => void refresh()}>{t('autoRouting.retry')}</button></div>}
    {view && !loadFailed && <>
      {specifiedBackup && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-[var(--paper-inset)] p-3 text-xs text-[var(--ink-secondary)]" id="automatic-pool-backup-note">
        <span className="min-w-0 break-words">{t('autoRouting.backupNote', { model: backupModel ? label(backupModel) : `${specifiedBackup.providerId} · ${specifiedBackup.model}` })}</span>
        <button type="button" className="min-h-8 shrink-0 px-2 text-[var(--accent)] underline" onClick={() => document.getElementById('model-failover-settings')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{t('autoRouting.manageBackup')}</button>
      </div>}
      {settings.classifier && classifierUnavailable && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--error)]"><p role="alert">{t('autoRouting.classifierUnavailable', { model: label(settings.classifier) })}</p><button type="button" disabled={!canManage} className="min-h-8 px-2 underline" onClick={() => savePatch({}, ['classifier'])}>{t('autoRouting.restoreAutoClassifier')}</button></div>}

      <div className="mt-4 grid grid-cols-3 gap-2" aria-label={t('autoRouting.tierSummary')}>
        {AUTO_TIERS.map(tier => <div key={tier} className="min-w-0 rounded-lg border border-[var(--line)] px-2 py-2 text-center">
          <p className="text-xs text-[var(--ink-muted)]">{t(`autoRouting.tiers.${tier}`)}</p><p className="text-sm font-medium text-[var(--ink)]">{active.filter(model => model.tier === tier).length}</p>
        </div>)}
      </div>
      <p className="mt-2 text-xs text-[var(--ink-muted)]">{t('autoRouting.priorityHint')}</p>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-48"><label htmlFor={searchId} className="sr-only">{t('autoRouting.search')}</label><input id={searchId} value={query} onChange={event => { setQuery(event.target.value); setSelected(new Set()); }} placeholder={t('autoRouting.search')} className="min-h-9 w-full min-w-0 rounded-md border border-[var(--line)] bg-[var(--paper)] px-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]" /></div>
        <CustomSelect ariaLabel={t('autoRouting.filter')} size="sm" value={filter} disabled={!canManage} onChange={next => { setFilter(next as Filter); setSelected(new Set()); }} options={(['all', ...AUTO_TIERS, 'paused', 'unavailable'] as Filter[]).map(item => ({
          value: item,
          label: item === 'all' ? t('autoRouting.filters.all') : item === 'paused' ? t('autoRouting.filters.paused') : item === 'unavailable' ? t('autoRouting.filters.unavailable') : t(`autoRouting.tiers.${item}`),
        }))} />
        <button type="button" disabled={!canManage} className="min-h-9 rounded-md bg-[var(--button-primary-bg)] px-3 text-sm font-medium text-[var(--button-primary-text)] disabled:opacity-50" onClick={() => { setAddOpen(!addOpen); setAddSelected(new Set()); setAddQuery(''); }}>{addOpen ? t('autoRouting.cancelAdd') : t('autoRouting.addModels')}</button>
      </div>

      {addOpen && <div className="mt-3 rounded-lg border border-[var(--line)] p-3">
        <div className="flex flex-wrap items-center gap-2"><p className="min-w-0 flex-1 text-sm font-medium text-[var(--ink)]">{t('autoRouting.addHeading')}</p><CustomSelect ariaLabel={t('autoRouting.addTier')} size="sm" value={addTier} options={AUTO_TIERS.map(tier => ({ value: tier, label: t(`autoRouting.tiers.${tier}`) }))} onChange={tier => setAddTier(tier as AutoTier)} /></div>
        <div className="mt-2"><label htmlFor={`${searchId}-add`} className="sr-only">{t('autoRouting.searchAdd')}</label><input id={`${searchId}-add`} value={addQuery} onChange={event => { setAddQuery(event.target.value); setAddSelected(new Set()); }} placeholder={t('autoRouting.searchAdd')} className="min-h-9 w-full min-w-0 rounded-md border border-[var(--line)] bg-[var(--paper)] px-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]" /></div>
        <div className="mt-2 max-h-48 overflow-y-auto">{visibleAddModels.map(model => <label key={autoModelKey(model)} className="flex min-h-8 min-w-0 items-center gap-2 border-b border-[var(--line)] py-2 text-sm">
          <span className="flex min-h-8 min-w-8 shrink-0 items-center justify-center"><input type="checkbox" checked={addSelected.has(autoModelKey(model))} disabled={!canManage || !model.available || model.unavailableReason === 'not-chat'} onChange={() => toggleSet(setAddSelected, addSelected, autoModelKey(model))} /></span>
          <span className="min-w-0 flex-1"><span className="block min-w-0 break-all text-[var(--ink)]">{name(model)}</span><span className="block break-all text-xs text-[var(--ink-muted)]">{provider(model)} · {model.model}</span></span>
          {(!model.available || model.unavailableReason === 'not-chat') && <span className="text-xs text-[var(--ink-muted)]">{t('autoRouting.unavailable')}</span>}
        </label>)}</div>
        {addModels.length === 0 ? <p className="py-2 text-xs text-[var(--ink-muted)]">{t('autoRouting.addEmpty')}</p> : visibleAddModels.length === 0 && <p className="py-2 text-xs text-[var(--ink-muted)]">{t('autoRouting.noAddMatches')}</p>}
        <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={!canManage || addSelected.size === 0} className="min-h-8 rounded-md bg-[var(--button-primary-bg)] px-3 text-sm text-[var(--button-primary-text)] disabled:opacity-50" onClick={async () => {
          const keys = [...addSelected];
          const modifier: AutoRoutingModifier = current => {
            const pool = current.pool === undefined ? Object.fromEntries(catalog.filter(model => model.inPool).map(model => [autoModelKey(model), { enabled: model.enabled }])) : { ...current.pool };
            keys.forEach(key => { pool[key] = { enabled: true }; });
            const tierOverrides = { ...current.tierOverrides }; keys.forEach(key => { tierOverrides[key] = addTier; });
            return { ...current, pool, tierOverrides };
          };
          const fallback = modifier(settings);
          const success = await commit(modifier, fallback, { label: 'pool', expected: { pool: fallback.pool, tierOverrides: fallback.tierOverrides }, previous: { pool: settings.pool, tierOverrides: settings.tierOverrides } });
          if (success) { setAddOpen(false); setAddSelected(new Set()); setAddQuery(''); }
        }}>{t('autoRouting.addSelected', { count: addSelected.size })}</button><button type="button" disabled={!canManage} className="min-h-8 px-2 text-sm text-[var(--accent)] underline" onClick={() => onOpenProviders?.()}>{t('autoRouting.openProviders')}</button></div>
      </div>}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <label className="flex min-h-8 items-center gap-2"><span className="flex min-h-8 min-w-8 items-center justify-center"><input type="checkbox" disabled={!canManage || visible.length === 0} checked={visible.length > 0 && visibleKeys.every(key => selected.has(key))} onChange={toggleVisible} /></span>{t('autoRouting.selectVisible', { count: visible.length })}</label>
        {visibleSelected.length > 0 && <><span className="text-[var(--ink-muted)]">{t('autoRouting.selected', { count: visibleSelected.length })}</span><button type="button" disabled={!canManage} className="min-h-8 px-2 underline" onClick={() => beginMembershipAction('pause', visibleSelected)}>{t('autoRouting.pauseSelected')}</button><button type="button" disabled={!canManage} className="min-h-8 px-2 underline" onClick={() => beginMembershipAction('restore', visibleSelected)}>{t('autoRouting.resumeSelected')}</button><button type="button" disabled={!canManage} className="min-h-8 px-2 text-[var(--error)] underline" onClick={() => beginMembershipAction('exclude', visibleSelected)}>{t('autoRouting.removeSelected')}</button></>}
      </div>
      <div role="list" className="mt-1 max-h-[min(55vh,36rem)] overflow-y-auto rounded-lg border border-[var(--line)]">
        {visible.length === 0 ? <p className="p-4 text-sm text-[var(--ink-muted)]">{catalog.length === 0 ? t('autoRouting.empty') : t('autoRouting.noMatches')}</p> : visible.map(model => {
          const key = autoModelKey(model);
          const order = (view.tiers[model.tier] ?? []).filter(row => active.some(item => autoModelKey(item) === autoModelKey(row)));
          const index = order.findIndex(row => autoModelKey(row) === key);
          const unavailable = !model.available;
          return <div role="listitem" key={key} className="flex min-w-0 flex-col gap-2 border-b border-[var(--line)] p-2.5 last:border-b-0 sm:flex-row sm:items-start">
            <label className="flex min-h-8 min-w-0 flex-1 items-start gap-2">
              <span className="flex min-h-8 min-w-8 shrink-0 items-center justify-center"><input aria-label={t('autoRouting.selectModel', { model: label(model) })} type="checkbox" disabled={!canManage} checked={selected.has(key)} onChange={() => toggleSet(setSelected, selected, key)} /></span>
              <span className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2 break-words text-sm font-medium text-[var(--ink)]"><span>{name(model)}</span>{index === 0 && !unavailable && model.enabled && <span className="shrink-0 rounded bg-[var(--paper-inset)] px-1.5 py-0.5 text-xs font-normal text-[var(--ink-muted)]">{t('autoRouting.firstPriority')}</span>}</div>
              <div className="min-w-0 break-all text-xs text-[var(--ink-muted)]">{provider(model)} · {model.model}</div>
              {model.source && <div className="mt-0.5 break-words text-xs text-[var(--ink-muted)]">{t('autoRouting.source')}: {sourceLabel(model.source)}</div>}
              {(unavailable || !model.enabled) && <div className="mt-1 text-xs text-[var(--error)]">{unavailable ? t(`autoRouting.unavailableReasons.${model.unavailableReason ?? 'model-unavailable'}`) : t('autoRouting.paused')}</div>}
              </span>
            </label>
            <div className="flex max-w-full flex-wrap justify-start gap-1 sm:shrink-0 sm:justify-end">
              {model.available && model.inPool && model.enabled && <CustomSelect ariaLabel={t('autoRouting.setTier', { model: label(model) })} className="w-28 max-w-full" size="sm" value={model.tier} disabled={!canManage} onChange={tier => changeTier(model, tier as AutoTier)} options={AUTO_TIERS.map(tier => ({ value: tier, label: t(`autoRouting.tiers.${tier}`) }))} />}
              {model.available && model.inPool && model.enabled && <button type="button" aria-label={t('autoRouting.moveUp', { model: label(model) })} title={t('autoRouting.moveUp', { model: label(model) })} disabled={!canManage || index <= 0} onClick={() => moveOrder(model, -1)} className="min-h-8 min-w-8 rounded border border-[var(--line)] text-sm text-[var(--ink-secondary)] disabled:opacity-40">↑</button>}
              {model.available && model.inPool && model.enabled && <button type="button" aria-label={t('autoRouting.moveDown', { model: label(model) })} title={t('autoRouting.moveDown', { model: label(model) })} disabled={!canManage || index < 0 || index >= order.length - 1} onClick={() => moveOrder(model, 1)} className="min-h-8 min-w-8 rounded border border-[var(--line)] text-sm text-[var(--ink-secondary)] disabled:opacity-40">↓</button>}
              {model.inPool && <button type="button" disabled={!canManage} className="min-h-8 rounded px-2 text-xs text-[var(--ink-secondary)] underline" onClick={() => beginMembershipAction(model.enabled ? 'pause' : 'restore', [key])}>{model.enabled ? t('autoRouting.pause') : t('autoRouting.resume')}</button>}
              {unavailable && <button type="button" disabled={!canManage} className="min-h-8 px-2 text-xs text-[var(--accent)] underline" onClick={() => onOpenProviders?.(model.providerId)}>{t('autoRouting.fixProvider')}</button>}
              {model.inPool && <button type="button" disabled={!canManage} className="min-h-8 rounded px-2 text-xs text-[var(--error)] underline" onClick={() => beginMembershipAction('exclude', [key])}>{t('autoRouting.remove')}</button>}
            </div>
          </div>;
        })}
      </div>

      {active.length > 0 && <div className="mt-4 grid min-w-0 grid-cols-1 gap-2" id="auto-routing-classifier">
        <p className="text-sm text-[var(--ink-secondary)]">{classifier ? t(classifier.chosenBy === 'user' ? 'autoRouting.classifierUserCompact' : 'autoRouting.classifierAutoCompact') : t('autoRouting.classifierNone')}</p>
        <CustomSelect className="min-w-0 max-w-full" ariaLabel={t('autoRouting.classifier')} size="md" disabled={!canManage} value={classifierUnavailable ? '' : classifierKey}
          options={[{ value: '', label: !settings.classifier && classifier && classifier.available !== false
            ? t('autoRouting.classifierAutoOptionWithModel', { model: label(active.find(model => autoModelKey(model) === autoModelKey(classifier)) ?? classifier) })
            : t('autoRouting.classifierAutoOption') }, ...active.map(model => ({ value: autoModelKey(model), label: label(model) }))]}
          onChange={key => { const ref = key ? parseAutoModelKey(key) : null; savePatch(ref ? { classifier: ref } : {}, ref ? [] : ['classifier']); }} />
        <p className="text-xs text-[var(--ink-muted)]">{t('autoRouting.privacy')}</p>
      </div>}

      <details className="mt-4 rounded-lg border border-[var(--line)] p-3"><summary className="min-h-8 cursor-pointer text-sm text-[var(--ink-secondary)]">{t('autoRouting.advanced')}</summary><div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={!canManage || !settings.tierOverrides} className="min-h-8 px-2 text-xs underline disabled:opacity-50" onClick={() => savePatch({}, ['tierOverrides'])}>{t('autoRouting.restoreDefaultTiers')}</button>
        <button type="button" disabled={!canManage || !settings.tierOrder} className="min-h-8 px-2 text-xs underline disabled:opacity-50" onClick={() => savePatch({}, ['tierOrder'])}>{t('autoRouting.restoreDefaultOrder')}</button>
        <button type="button" disabled={!canManage || settings.pool === undefined} className="min-h-8 px-2 text-xs text-[var(--error)] underline disabled:opacity-50" onClick={() => beginMembershipAction('follow', [])}>{t('autoRouting.restorePool')}</button>
      </div><p className="mt-2 text-xs text-[var(--ink-muted)]">{t('autoRouting.restorePoolHint')}</p></details>
    </>}

    {confirm && <ConfirmDialog modal loading={busy} title={t(`autoRouting.confirm.${confirm.mode}.title`)} message={t(`autoRouting.confirm.${confirm.mode}.message`, { count: confirm.mode === 'follow' ? catalog.filter(model => model.available).length : confirm.keys.length })} confirmText={t('autoRouting.confirm.action')} confirmVariant={confirm.mode === 'exclude' || confirm.mode === 'follow' ? 'danger' : 'primary'} onCancel={() => setConfirm(null)} onConfirm={applyMembershipAction} />}
  </section>;
}
