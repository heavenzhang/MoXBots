// Read-only runtime projection. Completion disclosure is local presentation state.
import { memo, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { ChevronDownIcon, ChevronRightIcon } from "@/components/icons";

import {
  TodoCompletedIcon,
  TodoInProgressIcon,
  TodoPendingIcon,
} from "./icons";
import type { TodoItem } from "./types";

function TodoRow({ todo }: { todo: TodoItem }) {
  const { t } = useTranslation("app");
  const isCompleted = todo.status === "completed";
  const isInProgress = todo.status === "in_progress";
  const status = isCompleted
    ? "completed"
    : isInProgress
      ? "inProgress"
      : "pending";

  return (
    <li
      className={`flex items-start gap-2 rounded-md px-2 py-2 ${isInProgress ? "bg-[var(--accent)]/8" : ""}`}
    >
      <span className="mt-0.5 shrink-0" aria-hidden>
        {isCompleted ? (
          <TodoCompletedIcon />
        ) : isInProgress ? (
          <TodoInProgressIcon />
        ) : (
          <TodoPendingIcon />
        )}
      </span>
      <span className="sr-only">{t(`agentStatus.${status}`)}: </span>
      <span
        className={`min-w-0 flex-1 break-words text-sm leading-5 select-text [overflow-wrap:anywhere] ${
          isCompleted
            ? "text-[var(--ink-secondary)]"
            : isInProgress
              ? "font-medium text-[var(--ink)]"
              : "text-[var(--ink-secondary)]"
        }`}
      >
        {isInProgress ? todo.activeForm || todo.content : todo.content}
      </span>
    </li>
  );
}

const MemoTodoRow = memo(TodoRow);

const TodoSection = memo(function TodoSection({
  todos,
}: {
  todos: TodoItem[];
}) {
  const { t } = useTranslation("app");
  const [showCompleted, setShowCompleted] = useState(false);
  const completedId = useId();
  if (todos.length === 0) return null;
  const active = todos.filter((todo) => todo.status === "in_progress");
  const pending = todos.filter((todo) => todo.status === "pending");
  const completed = todos.filter((todo) => todo.status === "completed");

  return (
    <section aria-label={t("agentStatus.todos")} className="px-2 py-2">
      <ul className="m-0 list-none space-y-0.5 p-0">
        {[...active, ...pending].map((todo) => (
          <MemoTodoRow key={todo.key} todo={todo} />
        ))}
      </ul>
      {completed.length > 0 && (
        <div
          className={
            active.length + pending.length > 0
              ? "mt-2 border-t border-[var(--line-subtle)] pt-1"
              : ""
          }
        >
          <button
            type="button"
            aria-expanded={showCompleted}
            aria-controls={completedId}
            onClick={() => setShowCompleted((value) => !value)}
            className="flex min-h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-xs text-[var(--ink-secondary)] transition-colors hover:bg-[var(--paper-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-border)]"
          >
            {showCompleted ? (
              <ChevronDownIcon aria-hidden className="size-3.5" />
            ) : (
              <ChevronRightIcon aria-hidden className="size-3.5" />
            )}
            {t("agentStatus.completedCount", { count: completed.length })}
          </button>
          <ul
            id={completedId}
            hidden={!showCompleted}
            className="m-0 list-none space-y-0.5 p-0"
          >
            {showCompleted &&
              completed.map((todo) => (
                <MemoTodoRow key={todo.key} todo={todo} />
              ))}
          </ul>
        </div>
      )}
    </section>
  );
});

export default TodoSection;
