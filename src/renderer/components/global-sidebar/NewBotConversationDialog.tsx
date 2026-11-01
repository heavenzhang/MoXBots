import CustomSelect from "@/components/CustomSelect";
import OverlayBackdrop from "@/components/OverlayBackdrop";
import { isImeComposingEvent } from "@/utils/imeKeyboard";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { useTranslation } from "react-i18next";
import type { Project } from "@/config/types";
import type { AgentConfig } from "../../../shared/types/agent";
import type { InitialMessage } from "@/types/tab";
import { CloseIcon, ComposeIcon, PlusIcon } from "@/components/icons";
import WorkspaceIcon from "@/components/launcher/WorkspaceIcon";
import { useCloseLayer } from "@/hooks/useCloseLayer";
import { botConversationProjects } from "./botConversationProjection";

/** Explicit birth intent. It never changes the identity of an existing Session. */
export default function NewBotConversationDialog({
  projects,
  agents,
  onOpen,
  onClose,
  onCreateBot,
}: {
  projects: readonly Project[];
  agents: readonly AgentConfig[];
  onOpen: (project: Project, message?: InitialMessage) => Promise<boolean>;
  onClose: () => void;
  onCreateBot: () => void;
}) {
  const { t } = useTranslation("app");
  const dialog = useRef<HTMLDivElement>(null),
    pending = useRef(false);
  const [screen, setScreen] = useState<"menu" | "conversation">("menu");
  const [botId, setBotId] = useState(""),
    [projectId, setProjectId] = useState("");
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const available = useMemo(
    () => botConversationProjects(projects, botId),
    [projects, botId],
  );
  const bots = agents.filter((agent) =>
    projects.some((project) => project.agentId === agent.id),
  );
  const selected = agents.find((agent) => agent.id === botId);
  useEffect(() => {
    const origin = document.activeElement;
    dialog.current?.querySelector<HTMLElement>("button")?.focus();
    return () => {
      if (origin instanceof HTMLElement && origin.isConnected) origin.focus();
    };
  }, []);
  useCloseLayer(() => {
    if (pending.current) return true;
    onClose();
    return true;
  }, 250);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current) return;
    const project = available.find((project) => project.id === projectId);
    // Revalidate against the current config after edits/removals in another surface.
    if (!project || !selected) {
      setError(t("botExperience.selectBoth"));
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const opened = await onOpen(
        project,
        text.trim() ? { text: text.trim() } : undefined,
      );
      if (opened) onClose();
      else setError(t("botExperience.openFailed"));
    } catch {
      setError(t("botExperience.openFailed"));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <OverlayBackdrop
      portal
      className="z-[250] p-4"
      onClose={busy ? undefined : onClose}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-bot-conversation-title"
        onKeyDown={(event) => {
          if (isImeComposingEvent(event)) return;
          if (event.key === "Escape") {
            event.stopPropagation();
            if (!pending.current) onClose();
          }
          if (event.key === "Tab") {
            const nodes = dialog.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), [tabindex="0"]',
            );
            if (!nodes?.length) return;
            const first = nodes[0],
              last = nodes[nodes.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
        className="relative m-auto max-h-[85dvh] w-[480px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-2xl border border-[var(--line-subtle)] bg-[var(--paper-elevated)] p-6 text-[var(--ink)] shadow-xl backdrop:bg-black/40"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label={t("botExperience.close")}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--hover-bg)] disabled:opacity-40"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
        <h2
          id="new-bot-conversation-title"
          className="pr-8 text-lg font-medium"
        >
          {t(
            screen === "menu"
              ? "botExperience.new"
              : "botExperience.newConversation",
          )}
        </h2>
        {screen === "menu" ? (
          <div className="mt-5 space-y-2">
            <button
              type="button"
              aria-label={t("botExperience.newConversation")}
              onClick={() => setScreen("conversation")}
              className="flex w-full items-center gap-3 rounded-lg border border-[var(--line-subtle)] p-4 text-left hover:bg-[var(--hover-bg)]"
            >
              <ComposeIcon className="h-5 w-5 shrink-0 text-[var(--accent)]" />
              <span>
                <strong className="block text-sm font-medium">
                  {t("botExperience.newConversation")}
                </strong>
                <span className="text-xs text-[var(--ink-muted)]">
                  {t("botExperience.newConversationHint")}
                </span>
              </span>
            </button>
            <button
              type="button"
              aria-label={t("botExperience.newBot")}
              onClick={onCreateBot}
              className="flex w-full items-center gap-3 rounded-lg border border-[var(--line-subtle)] p-4 text-left hover:bg-[var(--hover-bg)]"
            >
              <PlusIcon className="h-5 w-5 shrink-0 text-[var(--accent)]" />
              <span>
                <strong className="block text-sm font-medium">
                  {t("botExperience.newBot")}
                </strong>
                <span className="text-xs text-[var(--ink-muted)]">
                  {t("botExperience.newBotHint")}
                </span>
              </span>
            </button>
          </div>
        ) : (
          <form
            onSubmit={(event) => void submit(event)}
            className="mt-5 space-y-4"
          >
            <p className="text-xs leading-6 text-[var(--ink-secondary)]">
              {t("botExperience.birthBoundary")}
            </p>
            <label className="block text-xs text-[var(--ink-muted)]">
              {t("botExperience.botLabel")}
              <CustomSelect
                ariaLabel={t("botExperience.botLabel")}
                value={botId}
                disabled={busy}
                placeholder={t("botExperience.chooseBot")}
                size="md"
                className="mt-1.5 w-full"
                onChange={(id) => {
                  setBotId(id);
                  setProjectId(
                    botConversationProjects(projects, id)[0]?.id || "",
                  );
                  setError("");
                }}
                options={bots.map((bot) => ({
                  value: bot.id,
                  label: bot.name,
                  icon: <WorkspaceIcon icon={bot.icon} size={22} />,
                }))}
              />
            </label>
            <label className="block text-xs text-[var(--ink-muted)]">
              {t("botExperience.projectLabel")}
              <CustomSelect
                ariaLabel={t("botExperience.projectLabel")}
                value={projectId}
                disabled={busy || !botId}
                placeholder={t("botExperience.chooseProject")}
                size="md"
                className="mt-1.5 w-full"
                onChange={setProjectId}
                options={available.map((project) => ({
                  value: project.id,
                  label: project.displayName || project.name,
                }))}
              />
            </label>
            {selected && (
              <div className="flex items-center gap-2 text-xs text-[var(--ink-secondary)]">
                <WorkspaceIcon icon={selected.icon} size={24} />
                {selected.name}
                <span className="text-[var(--ink-muted)]">
                  ·{" "}
                  {available.find((project) => project.id === projectId)?.path}
                </span>
              </div>
            )}
            <label className="block text-xs text-[var(--ink-muted)]">
              {t("botExperience.firstMessage")}
              <textarea
                value={text}
                disabled={busy}
                onChange={(event) => setText(event.target.value)}
                rows={3}
                placeholder={t("botExperience.firstMessageHint")}
                className="mt-1.5 w-full resize-y rounded-lg border border-[var(--line-subtle)] bg-[var(--paper-inset)] p-3 text-sm text-[var(--ink)]"
              />
            </label>
            {error && (
              <p role="alert" className="text-xs text-[var(--warning)]">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="compact-action text-sm"
              >
                {t("botExperience.cancel")}
              </button>
              <button
                type="submit"
                disabled={busy || !botId || !projectId}
                className="min-h-9 rounded-lg bg-[var(--button-primary-bg)] px-4 text-sm text-[var(--button-primary-text)] disabled:opacity-40"
              >
                {t(
                  busy
                    ? "botExperience.opening"
                    : text.trim()
                      ? "botExperience.sendAndOpen"
                      : "botExperience.openConversation",
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </OverlayBackdrop>
  );
}
