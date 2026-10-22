import {
  memo,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDownIcon,
  TargetIcon,
  PauseIcon,
  PlayIcon,
} from "@/components/icons";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import {
  getGoalStatusPresentation,
  type GoalRuntimeStatusBarProps,
} from "../goal/GoalStatusBar";
import { useSubagentViews } from "./useSubagentViews";
import { useAgentStatusState } from "./useAgentStatusState";
import SubagentActivityPanel from "./SubagentActivityPanel";
import SessionTaskPanel from "./SessionTaskPanel";
import { useSessionTaskOrchestration } from "./useSessionTaskOrchestration";
import { OrchestrationPlanCard } from "./OrchestrationPlanCard";
import type { SessionPlanTarget } from "../../../shared/sessionPlanConfirmation";
import SubagentSection from "./SubagentSection";
import BackgroundTaskDialog, { findTaskTool } from "./BackgroundTaskDialog";
import { isSubagentContainerTool } from "@/components/tools/subagentActivity";
import type { SubagentStatus } from "./types";
import type { Message } from "@/types/chat";
import type { SessionGoal } from "@/types/sessionGoal";

export interface AgentActivityControls {
  onDiscussPlan?: (target: SessionPlanTarget, draft: string) => void;
  containerRef: RefObject<HTMLElement | null>;
  onJumpToTool: (id: string) => void;
  onSelectSubagent: (id: string) => void;
}
type Props = Omit<GoalRuntimeStatusBarProps, "goal" | "mode"> & {
  goal?: SessionGoal | null;
  activity?: AgentActivityControls;
};
type Detail = "goal" | "todos" | "agents";
const EMPTY: Message[] = [];
const buttonClass =
  "compact-action shrink-0 gap-1 rounded-md px-2 text-xs text-[var(--ink-secondary)] hover:bg-[var(--paper-hover)] focus-visible:outline-2 focus-visible:outline-[var(--focus-border)]";

/** Presentation only: one disclosure owner, original transcript and Goal authorities. */
export default memo(function ExecutionStatusBar({
  goal,
  activity,
  isExecuting = false,
  executionNumber,
  onEdit,
  onPause,
  onResume,
  onCancel,
  onDismiss,
}: Props) {
  const { t } = useTranslation("app");
  const { t: taskT } = useTranslation("task");
  const { views, tab } = useSubagentViews();
  const sessionId = tab?.sessionId ?? null;
  const messages = activity ? (tab?.messages ?? EMPTY) : EMPTY;
  const state = useAgentStatusState(
    messages,
    activity ? tab?.agentPlanTodos : null,
    sessionId,
    tab?.streamingMessage?.id ?? null,
  );
  const orchestration = useSessionTaskOrchestration(state.todos);
  const tasks = activity ? orchestration.tasks : [];
  const [disclosure, setDisclosure] = useState<{
    sessionId: string | null;
    detail: Detail;
  } | null>(null);
  const [selected, setSelected] = useState<{
    sessionId: string | null;
    task: SubagentStatus;
  } | null>(null);
  const triggers = useRef<Partial<Record<Detail, HTMLButtonElement | null>>>(
    {},
  );
  const id = useId();
  const background = activity
    ? state.subagents.filter((agent) => {
        const tool = findTaskTool(messages, agent.id);
        return tool
          ? !isSubagentContainerTool(tool.name)
          : agent.agentType === "local_bash";
      })
    : [];
  const agents = activity ? views : [];
  const hasAgents = Boolean(
    activity && (agents.length || background.length || tab?.hasMoreBefore),
  );
  const todosActive = tasks.some((task) => task.phase !== "completed");
  const [todoLingerSession, setTodoLingerSession] = useState<string | null>(
    null,
  );
  const turnIsLive =
    tab?.sessionState === "starting" ||
    tab?.sessionState === "running" ||
    tab?.sessionState === "stopping";
  useEffect(() => {
    if (tab?.isSessionLoading) return;
    if (todosActive && turnIsLive) {
      const frame = requestAnimationFrame(() =>
        setTodoLingerSession(sessionId),
      );
      return () => cancelAnimationFrame(frame);
    }
    if (!todosActive) {
      const timer = setTimeout(() => setTodoLingerSession(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [sessionId, tab?.isSessionLoading, todosActive, turnIsLive]);
  // Completed-only cold history stays quiet. When Goal/agents already keep the
  // bar visible, its completed Todo count remains available for review.
  const hasTodos =
    tasks.length > 0 &&
    (todosActive ||
      Boolean(goal) ||
      hasAgents ||
      (todoLingerSession !== null && todoLingerSession === sessionId));
  const detail = disclosure?.sessionId === sessionId ? disclosure.detail : null;
  // A removed data section must not leave an orphaned disclosure.
  const shown =
    detail === "goal"
      ? Boolean(goal)
      : detail === "todos"
        ? hasTodos || hasAgents
        : detail === "agents"
          ? hasAgents
          : false;
  const presentation = goal
    ? getGoalStatusPresentation(goal, isExecuting, executionNumber, taskT)
    : null;
  const completed = tasks.filter(task => task.phase === "completed").length;
  const running = tasks.filter(task => task.phase === "running").length;
  const awaitingReview = tasks.filter(task => task.phase === "awaiting_review").length;
  const toggle = (next: Detail) =>
    setDisclosure(
      shown && next === detail ? null : { sessionId, detail: next },
    );
  const selectedTask = selected?.sessionId === sessionId ? selected.task : null;
  const summaryButton = (
    section: Detail,
    label: React.ReactNode,
    color?: string,
  ) => (
    <button
      type="button"
      ref={(element) => {
        triggers.current[section] = element;
      }}
      aria-expanded={shown && detail === section}
      aria-controls={`${id}-${section}`}
      onClick={() => toggle(section)}
      className={`${buttonClass} ${shown && detail === section ? "bg-[var(--paper-hover)]" : ""}`}
      style={color ? { color } : undefined}
    >
      {label}
      <ChevronDownIcon
        aria-hidden
        className={`size-3 shrink-0 ${shown && detail === section ? "rotate-180" : ""}`}
      />
    </button>
  );
  if (tab?.isSessionLoading && !goal) return null;
  if (!goal && !hasTodos && !hasAgents && !selectedTask && !orchestration.proposal) return null;
  return (
    <>
      {orchestration.proposal && <div className="mb-2 min-w-0">
        <OrchestrationPlanCard proposal={orchestration.proposal}
          planSupport={orchestration.planSupport}
          containerRef={activity?.containerRef}
          startStatus={orchestration.planStart}
          onConfirm={orchestration.confirmPlan} onRequestRevision={orchestration.requestPlanRevision}
          onDiscuss={target => activity?.onDiscussPlan?.(target, t("orchestrationPlan.discussionDraft", { objective: orchestration.proposal!.content.objective }))} />
        {orchestration.stale && <p role="status" className="mt-1 text-xs text-[var(--warning)]">{t("orchestration.stale")} <button type="button" onClick={orchestration.retry} className="underline">{t("orchestration.retry")}</button></p>}
      </div>}
      {selectedTask && activity && (
        <BackgroundTaskDialog
          subagent={
            background.find((agent) => agent.id === selectedTask.id) ??
            selectedTask
          }
          sessionId={sessionId}
          messages={messages}
          onClose={() => setSelected(null)}
          onJumpToTool={activity.onJumpToTool}
        />
      )}
      {(goal || hasTodos || hasAgents) && (
        <section
          data-execution-status
          onKeyDown={(event) => {
            if (
              !shown ||
              event.key !== "Escape" ||
              event.nativeEvent.isComposing
            )
              return;
            event.stopPropagation();
            setDisclosure(null);
            if (detail) triggers.current[detail === "agents" ? "todos" : detail]?.focus();
          }}
          className="mb-2 min-w-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--paper-elevated)] text-[var(--ink)]"
        >
          <div className="flex min-h-10 min-w-0 items-center gap-1 px-1.5 py-1">
            <div
              className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain"
              aria-label={t("executionStatus.summary")}
            >
              {presentation &&
                summaryButton(
                  "goal",
                  <>
                    <TargetIcon aria-hidden className="size-3.5 shrink-0" />
                    <span className="whitespace-nowrap">
                      {presentation.title}
                    </span>
                    <span className="hidden max-w-40 truncate text-[var(--ink-secondary)] sm:inline-block">
                      {presentation.detail}
                    </span>
                  </>,
                  presentation.color,
                )}
              {(hasTodos || hasAgents) && summaryButton(
                "todos",
                <span className="whitespace-nowrap tabular-nums">
                  {t("orchestration.title")} {completed}/{tasks.length}
                  {running > 0 && ` · ${t("orchestration.running", { count: running })}`}
                  {awaitingReview > 0 && ` · ${t("orchestration.awaiting", { count: awaitingReview })}`}
                  {orchestration.stale && ` · ${t("orchestration.syncPending")}`}
                </span>,
              )}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              {goal?.status === "active" && onPause && (
                <button type="button" className={buttonClass} onClick={onPause}>
                  <PauseIcon aria-hidden className="size-3.5" />
                  {taskT("cron.statusBar.pauseGoalButton")}
                </button>
              )}
              {goal?.status === "paused" && onResume && (
                <button
                  type="button"
                  className={buttonClass}
                  onClick={onResume}
                >
                  <PlayIcon aria-hidden className="size-3.5" />
                  {taskT("cron.statusBar.resumeGoalButton")}
                </button>
              )}
              {goal && (
                <DropdownMenu
                  size="md"
                  sections={[
                    {
                      items:
                        !presentation?.terminal && onEdit
                          ? [
                              {
                                label: taskT("cron.statusBar.goalEditTitle"),
                                onClick: onEdit,
                              },
                            ]
                          : [],
                    },
                    {
                      items:
                        !presentation?.terminal && onCancel
                          ? [
                              {
                                label: taskT("cron.statusBar.cancelGoalButton"),
                                onClick: onCancel,
                                danger: true,
                              },
                            ]
                          : presentation?.terminal && onDismiss
                            ? [
                                {
                                  label: taskT(
                                    "cron.statusBar.dismissGoalTitle",
                                  ),
                                  onClick: onDismiss,
                                },
                              ]
                            : [],
                    },
                  ]}
                />
              )}
            </div>
          </div>
          {shown && (
            <div
              id={`${id}-${detail}`}
              role="region"
              aria-label={t(`executionStatus.${detail}`)}
              tabIndex={0}
              className="max-h-[min(280px,38vh)] overflow-y-auto overscroll-contain border-t border-[var(--line-subtle)] focus-visible:outline-2 focus-visible:outline-[var(--focus-border)]"
            >
              {detail === "goal" && goal && presentation && (
                <div className="space-y-2 p-3">
                  <p className="break-words text-sm leading-5 select-text [overflow-wrap:anywhere]">
                    {goal.objective}
                  </p>
                  <p className="break-words text-xs text-[var(--ink-secondary)] [overflow-wrap:anywhere]">
                    {presentation.detail}
                  </p>
                </div>
              )}
              {detail === "todos" && (
                <SessionTaskPanel key={sessionId} tasks={tasks} stale={orchestration.stale} onRetry={orchestration.retry}
                  onSelectAgent={id => activity?.onSelectSubagent(id)} onHistory={() => setDisclosure({ sessionId, detail: "agents" })} />
              )}
              {detail === "agents" && activity && (
                <>
                  <SubagentActivityPanel
                    detailsOnly
                    onSelect={activity.onSelectSubagent}
                  />
                  <SubagentSection
                    subagents={background}
                    containerRef={activity.containerRef}
                    onJumpToTool={activity.onJumpToTool}
                    onOpenTask={(task) => setSelected({ sessionId, task })}
                  />
                </>
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
});
