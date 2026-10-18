// Runtime task rows open a read-only status/log dialog. Original-message
// navigation remains a secondary action inside that dialog.

import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SuccessIcon, XCircleIcon, StopCircleIcon, ChevronRightIcon } from '@/components/icons';

import { SubagentRunningIcon } from './icons';
import type { SubagentStatus } from './types';
import { useElapsedSeconds } from './useElapsedSeconds';

interface SubagentSectionProps {
  subagents: SubagentStatus[];
  containerRef: React.RefObject<HTMLElement | null>;
  onJumpToTool: (toolId: string) => void;
  onOpenTask?: (subagent: SubagentStatus) => void;
}

interface SubagentRowProps {
  subagent: SubagentStatus;
  onJumpToTool: (toolId: string) => void;
  onOpenTask?: (subagent: SubagentStatus) => void;
}

function SubagentRow({ subagent, onJumpToTool, onOpenTask }: SubagentRowProps) {
  const { t } = useTranslation('app');
  const elapsed = useElapsedSeconds(subagent.startedAt, subagent.finishedAt);

  const onClick = useCallback(() => {
    if (!subagent.id) return;
    if (onOpenTask) onOpenTask(subagent);
    else onJumpToTool(subagent.id);
  }, [subagent, onJumpToTool, onOpenTask]);

  // 单行紧凑布局：[●] agentType[后台] description(truncate)…  elapsed
  // Detail belongs to the dialog, including tasks without a transcript card.
  // 完整 description 走 title 属性 tooltip。
  const titleParts = [
    subagent.agentType,
    subagent.mode === 'background' ? t('agentStatus.backgroundTooltip') : null,
    subagent.description,
  ].filter(Boolean);
  const tooltip = titleParts.join(' · ');

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${t('backgroundTask.view')} · ${tooltip}`}
      aria-haspopup={onOpenTask ? 'dialog' : undefined}
      className="group flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--paper-inset)]/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
    >
      {subagent.status === 'running' ? (
        <SubagentRunningIcon />
      ) : subagent.status === 'failed' ? (
        <XCircleIcon aria-label={t('agentStatus.failed')} className="size-3.5 shrink-0 text-[var(--error)]" />
      ) : subagent.status === 'interrupted' ? (
        <StopCircleIcon aria-label={t('agentStatus.interrupted')} className="size-3.5 shrink-0 text-[var(--warning)]" />
      ) : (
        <SuccessIcon aria-label={t('agentStatus.completed')} className="size-3.5 shrink-0 text-[var(--success)]" />
      )}
      <div className="flex min-w-0 flex-1 items-baseline gap-1.5 text-xs">
        <span className="shrink-0 font-medium text-[var(--ink)]">
          {subagent.agentType}
        </span>
        {subagent.mode === 'background' && (
          <span className="shrink-0 rounded-full bg-[var(--accent)]/10 px-1.5 py-0.5 text-xs font-medium text-[var(--accent)]">
            {t('agentStatus.background')}
          </span>
        )}
        {subagent.description && (
          <span className="min-w-0 flex-1 truncate text-[var(--ink-muted)]">
            {subagent.description}
          </span>
        )}
      </div>
      {elapsed && (
        <span className="shrink-0 tabular-nums text-xs text-[var(--ink-muted)]">
          {elapsed}
        </span>
      )}
      <ChevronRightIcon className="size-3.5 shrink-0 text-[var(--ink-muted)]" />
    </button>
  );
}

const MemoSubagentRow = memo(SubagentRow);

const SubagentSection = memo(function SubagentSection({ subagents, containerRef: _containerRef, onJumpToTool, onOpenTask }: SubagentSectionProps) {
  const { t } = useTranslation('app');
  // containerRef 当前留作前向 API 兼容（onJumpToTool 已内部使用 Chat 持有的 ref），
  // 解构出来防止下游 row 重复签名。下划线前缀显式标记暂不使用——保留是为后续 row 内
  // 直接做轻量 DOM 探测（如自己探测是否已 mounted 以跳过 Virtuoso 滚动）留个口子。
  void _containerRef;
  if (subagents.length === 0) return null;
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between px-3 pb-1 pt-0.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
          {t('backgroundTask.tasks')}
        </span>
        <span className="text-xs tabular-nums text-[var(--ink-muted)]">
          {subagents.length}
        </span>
      </div>
      {/* V6: 行间分隔线（subtle，不抢视觉） */}
      <div className="divide-y divide-[var(--line-subtle)]/60">
        {subagents.map(s => (
          <MemoSubagentRow key={s.id} subagent={s} onJumpToTool={onJumpToTool} onOpenTask={onOpenTask} />
        ))}
      </div>
    </div>
  );
});

export default SubagentSection;
