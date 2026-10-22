import { createContext, useContext } from 'react';
import { useTranslation } from 'react-i18next';

import Tip from '@/components/Tip';
import type { AutoRouteRecord } from '../../shared/autoRoute';

/**
 * Chat-owned actions for the route tag. Provided by Chat so Message rows keep
 * their memoized props; absent (history viewers, tests) renders a plain tag.
 */
export interface AutoRouteTagActions {
  /** Display name for a routed model, e.g. "Provider · Model". */
  modelLabel: (record: AutoRouteRecord) => string;
  /** 「换一个」: pin this Session to manual and let the user pick. */
  onChooseAnother?: () => void;
  /** 「以后这类都用它」: put this model first in its tier. */
  onPreferModel?: (record: AutoRouteRecord) => void;
}

export const AutoRouteTagContext = createContext<AutoRouteTagActions | null>(null);

export function AutoRouteTag({ record }: { record: AutoRouteRecord }) {
  const { t } = useTranslation('app');
  const actions = useContext(AutoRouteTagContext);
  const model = actions?.modelLabel(record) ?? record.model;
  const parts = [t('autoRoute.tag'), model];
  if (record.effort) parts.push(t('autoRoute.effort', { effort: record.effort }));
  const detail = [
    ...(!record.tier || record.unclassified ? [] : [t(`autoRoute.tiers.${record.tier}`)]),
    t(`autoRoute.reasons.${record.reason}`),
    t('autoRoute.latency', { ms: Math.max(0, Math.round(record.latencyMs)) }),
    ...(record.backup ? [t('autoRoute.backupCandidate', { model: actions?.modelLabel({ ...record, ...record.backup }) ?? record.backup.model })] : []),
    ...(record.backupUnavailableReason ? [t(`autoRoute.backupReasons.${record.backupUnavailableReason}`)] : []),
  ].join(' · ');

  return (
    <div data-auto-route-tag className="mr-2 mb-1 flex items-center gap-2 text-xs text-[var(--ink-muted)]">
      <Tip label={detail}>
        <span tabIndex={0} aria-label={`${parts.join(' · ')}（${detail}）`} className="cursor-default">
          {parts.join(' · ')}
        </span>
      </Tip>
      {actions?.onChooseAnother && (
        <button type="button" onClick={actions.onChooseAnother}
          className="rounded px-1 hover:bg-[var(--hover-bg)] hover:text-[var(--ink)]">
          {t('autoRoute.chooseAnother')}
        </button>
      )}
      {actions?.onPreferModel && record.tier && !record.unclassified && (
        <button type="button" onClick={() => actions.onPreferModel?.(record)}
          className="rounded px-1 hover:bg-[var(--hover-bg)] hover:text-[var(--ink)]">
          {t('autoRoute.preferModel')}
        </button>
      )}
    </div>
  );
}
