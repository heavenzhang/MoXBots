import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n";
import type { Project } from "@/config/types";
import type { AgentConfig } from "../../../shared/types/agent";
import type { SessionMetadata } from "@/api/sessionClient";
import type { ProjectSpace } from "../../../shared/projectSpaces";
import BotConversationNavigation from "./BotConversationNavigation";

const bot: AgentConfig = {
  id: "bot",
  name: "Mino",
  icon: "bot:spark",
  enabled: true,
  permissionMode: "plan",
  channels: [],
};
const secondBot: AgentConfig = { ...bot, id: "other", name: "Reader" };
const workspace: Project = {
  id: "workspace",
  name: "Product",
  path: "/demo/product",
  agentId: bot.id,
  permissionMode: null,
  providerId: null,
};
const otherWorkspace: Project = {
  ...workspace,
  id: "other-workspace",
  path: "/demo/reader",
  agentId: secondBot.id,
};
const at = "2026-11-02T00:00:00Z";
const space = (id: string): ProjectSpace => ({
  id,
  name: `Project ${id}`,
  description: "",
  instructions: "",
  memberBotIds: [bot.id],
  materials: [],
  resources: [],
  revision: 1,
  createdAt: at,
  updatedAt: at,
});
const session = (
  id: string,
  patch: Partial<SessionMetadata> = {},
): SessionMetadata => ({
  id,
  title: `Subject ${id}`,
  agentDir: workspace.path,
  createdAt: at,
  lastActiveAt: at,
  lastMessagePreview: "Continue the previous task with the same instructions",
  ...patch,
});
const fixed = (projectId: string) => ({
  schemaVersion: 1 as const,
  projectId,
  projectName: `Project ${projectId}`,
  projectRevision: 1,
  botId: bot.id,
  botName: bot.name,
  workspacePath: workspace.path,
  capturedAt: at,
  description: "",
  instructions: "",
  materials: [],
  resources: [],
});
function setup(
  sessions: SessionMetadata[],
  extra: Partial<Parameters<typeof BotConversationNavigation>[0]> = {},
) {
  const onOpenSession = vi.fn(),
    onCreateProject = vi.fn(),
    onCreateBot = vi.fn(),
    refresh = vi.fn();
  const props = {
    view: "conversations" as const,
    projects: [workspace, otherWorkspace],
    agents: [bot, secondBot],
    spaces: [space("A"), space("B")],
    data: {
      sessions,
      isSessionsLoading: false,
      workspaceSessionStates: new Map(),
      sessionsError: null,
      refresh,
    },
    tabs: [],
    onOpenSession,
    onOpenProject: vi.fn(),
    onNewConversation: vi.fn(),
    onCreateBot,
    onCreateProject,
    onManageHistory: vi.fn(),
    renderSessionMenu: () => null,
    onMenuOpenChange: vi.fn(),
    ...extra,
  };
  const result = render(<BotConversationNavigation {...props} />);
  return {
    ...result,
    props,
    onOpenSession,
    onCreateProject,
    onCreateBot,
    refresh,
  };
}

describe("Bot conversation sidebar usability", () => {
  const openFilter = () => fireEvent.click(screen.getByRole('button', { name: i18n.t('app:botExperience.filterConversations') }));

  it('offers only Bots with visible conversations, preserving their configured identities', () => {
    setup([session('real'), session('archived', { agentDir: otherWorkspace.path, archived: true })]);
    openFilter();
    expect(screen.getByRole('button', { name: 'Bot · Mino' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bot · Reader' })).toBeNull();
    expect(screen.getByRole('button', { name: i18n.t('app:botExperience.newBot') })).toBeTruthy();
  });

  it('disambiguates same-name Bots and opens the original Session and workspace', () => {
    const other = session('reader', { agentDir: otherWorkspace.path });
    const { onOpenSession } = setup([session('mino'), other], {
      agents: [bot, { ...secondBot, name: bot.name }],
      projects: [workspace, { ...otherWorkspace, name: 'Research' }],
    });
    openFilter();
    fireEvent.click(screen.getByRole('button', { name: 'Bot · Mino · Research' }));
    expect(screen.queryByText('Subject mino')).toBeNull();
    fireEvent.click(screen.getByText('Subject reader'));
    expect(onOpenSession).toHaveBeenCalledWith(other, expect.objectContaining({ id: otherWorkspace.id }));
  });

  it('keeps two same-name frozen identities in the same workspace distinct', () => {
    const old = session('old', { projectSpace: { ...fixed('A'), botId: 'former-bot' } });
    const current = session('current', { projectSpace: fixed('B') });
    const { onOpenSession } = setup([old, current]);
    openFilter();
    fireEvent.click(screen.getByRole('button', { name: 'Bot · Mino · /demo/product · former-bot' }));
    expect(screen.queryByText('Subject current')).toBeNull();
    fireEvent.click(screen.getByText('Subject old'));
    expect(onOpenSession).toHaveBeenCalledWith(old, workspace);
  });

  it('does not expand a selected Bot to all conversations after its final row is archived', () => {
    const current = session('last');
    const other = session('other', { agentDir: otherWorkspace.path });
    const { props, rerender } = setup([current, other]);
    openFilter();
    fireEvent.click(screen.getByRole('button', { name: 'Bot · Mino' }));
    rerender(<BotConversationNavigation {...props} data={{ ...props.data, sessions: [{ ...current, archived: true }, other] }} />);
    expect(screen.queryByText('Subject other')).toBeNull();
    expect(screen.getByText(i18n.t('app:botExperience.noConversations'))).toBeTruthy();
  });

  it('settles passive workspace reads even when the unused full-index flag is still initially loading', () => {
    setup([session('loaded')], { data: {
      sessions: [session('loaded')], isSessionsLoading: true, sessionsError: null, refresh: vi.fn(),
      workspaceSessionStates: new Map([workspace, otherWorkspace].map(project => [project.path, { isLoading: false, error: null }])),
    } });
    expect(screen.queryByText(i18n.t('app:botExperience.loading'))).toBeNull();
    expect(screen.queryByText(i18n.t('app:botExperience.refreshing'))).toBeNull();
    expect(screen.getByText('Subject loaded')).toBeTruthy();
  });

  it('keeps unrelated workspace failures and loading out of the selected Bot view', () => {
    setup([session('loaded')], { data: {
      sessions: [session('loaded')], isSessionsLoading: true, sessionsError: 'older global failure', refresh: vi.fn(),
      workspaceSessionStates: new Map([
        [workspace.path, { isLoading: false, error: null }],
        [otherWorkspace.path, { isLoading: true, error: 'other workspace failure' }],
      ]),
    } });
    openFilter();
    fireEvent.click(screen.getByRole('button', { name: 'Bot · Mino' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('uses the frozen Bot workspace for loading even after its configured identity changes', () => {
    setup([session('frozen', { projectSpace: fixed('A') })], {
      agents: [secondBot], projects: [{ ...workspace, agentId: secondBot.id }],
      data: {
        sessions: [session('frozen', { projectSpace: fixed('A') })], isSessionsLoading: false, sessionsError: null, refresh: vi.fn(),
        workspaceSessionStates: new Map([[workspace.path, { isLoading: true, error: null }]]),
      },
    });
    openFilter();
    fireEvent.click(screen.getByRole('button', { name: 'Bot · Mino' }));
    expect(screen.getByText(i18n.t('app:botExperience.refreshing'))).toBeTruthy();
    expect(screen.getByText('Subject frozen')).toBeTruthy();
  });

  it('distinguishes background updates from the first read without blocking cached rows', () => {
    const { props, rerender } = setup([], { data: {
      sessions: [], isSessionsLoading: true, sessionsError: null, refresh: vi.fn(),
      workspaceSessionStates: new Map([[workspace.path, { isLoading: true, error: null }]]),
    } });
    expect(screen.getByText(i18n.t('app:botExperience.loading'))).toBeTruthy();
    rerender(<BotConversationNavigation {...props} data={{ ...props.data, sessions: [session('cached')] }} />);
    expect(screen.getByText(i18n.t('app:botExperience.refreshing'))).toBeTruthy();
    expect(screen.queryByText(i18n.t('app:botExperience.loading'))).toBeNull();
    expect(screen.getByText('Subject cached')).toBeTruthy();
  });

  it("uses distinct conversation subjects as primary labels despite identical Bots and continuation messages", () => {
    const sessions = [session("release"), session("research")];
    const before = structuredClone(sessions);
    const { container, onOpenSession } = setup(sessions);
    const rows = container.querySelectorAll("[data-conversation-id]");
    expect(
      [...rows].map((row) => row.querySelector("strong")?.textContent),
    ).toEqual(["Subject release", "Subject research"]);
    expect(screen.queryByText(sessions[0].lastMessagePreview!)).toBeNull();
    expect(rows[0].getAttribute("title")).toContain(
      sessions[0].lastMessagePreview,
    );
    fireEvent.click(rows[1]);
    expect(onOpenSession).toHaveBeenCalledExactlyOnceWith(
      sessions[1],
      workspace,
    );
    expect(sessions).toEqual(before);
  });

  it("gives a pinned unread session one visible home and keeps its unread count", () => {
    const { container } = setup(
      [
        session("pinned", { pinnedAt: at }),
        session("unread"),
        session("recent"),
      ],
      {
        badges: new Map([
          ["pinned", 3],
          ["unread", 1],
        ]),
      },
    );
    const pinned = screen.getByRole("region", {
      name: i18n.t("app:botExperience.pinned"),
    });
    const unread = screen.getByRole("region", {
      name: i18n.t("app:botExperience.unreadSection"),
    });
    expect(within(pinned).getByText("Subject pinned")).toBeTruthy();
    expect(
      within(pinned).getByLabelText(
        i18n.t("app:botExperience.unread", { count: 3 }),
      ),
    ).toBeTruthy();
    expect(within(unread).queryByText("Subject pinned")).toBeNull();
    expect(container.querySelectorAll("[data-conversation-id]")).toHaveLength(
      3,
    );
  });

  it("filters a stable Bot across project A, project B and its legacy history without changing any context", () => {
    const sessions = [
      session("a", { projectSpace: fixed("A") }),
      session("b", { projectSpace: fixed("B") }),
      session("legacy"),
      session("other", { agentDir: otherWorkspace.path }),
    ];
    const original = structuredClone(sessions);
    const { container, onOpenSession } = setup(sessions);
    fireEvent.click(
      screen.getByRole("button", {
        name: i18n.t("app:botExperience.filterConversations"),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Bot · Mino" }));
    expect(
      [...container.querySelectorAll("[data-conversation-id]")].map((row) =>
        row.getAttribute("data-conversation-id"),
      ),
    ).toEqual(["a", "b", "legacy"]);
    fireEvent.click(screen.getByText("Subject b"));
    expect(onOpenSession).toHaveBeenLastCalledWith(sessions[1], workspace);
    fireEvent.click(
      screen.getByRole("button", {
        name: i18n.t("app:botExperience.filterConversations"),
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: i18n.t("app:botExperience.projectFilterOption", {
          name: "Project A",
        }),
      }),
    );
    expect(
      [...container.querySelectorAll("[data-conversation-id]")].map((row) =>
        row.getAttribute("data-conversation-id"),
      ),
    ).toEqual(["a"]);
    expect(sessions).toEqual(original);
  });

  it("keeps a removed Bot with frozen history available to filter", () => {
    setup([session("frozen", { projectSpace: fixed("A") })], { agents: [] });
    fireEvent.click(
      screen.getByRole("button", {
        name: i18n.t("app:botExperience.filterConversations"),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Bot · Mino" }));
    expect(screen.getByText("Subject frozen")).toBeTruthy();
  });

  it("shows working and unread independently and preserves the active session marker", () => {
    const tab = {
      id: "tab",
      view: "chat" as const,
      title: "Subject current",
      agentDir: workspace.path,
      sessionId: "current",
      sidecarConfigDisposition: "adopt" as const,
      isGenerating: true,
      hasUnread: true,
    };
    const { container } = setup([session("current")], {
      tabs: [tab],
      activeTab: tab,
    });
    expect(
      container.querySelector('[aria-current="page"] [role="status"]')
        ?.textContent,
    ).toBe(i18n.t("app:botExperience.working"));
    expect(
      screen.getByLabelText(i18n.t("app:botExperience.unread", { count: 1 })),
    ).toBeTruthy();
  });

  it("retains readable loaded rows on a partial read error and retries the existing read owner", () => {
    const refresh = vi.fn();
    setup([session("loaded")], {
      data: {
        sessions: [session("loaded")],
        isSessionsLoading: false,
        workspaceSessionStates: new Map(),
        sessionsError: "unavailable",
        refresh,
      },
    });
    expect(screen.getByText("Subject loaded")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("app:botExperience.retry") }),
    );
    expect(refresh).toHaveBeenCalledWith("sessions", { force: true });
  });

  it("has a single new-project action in an empty project view and keeps new-Bot creation separate", () => {
    const { onCreateProject, onCreateBot } = setup([], {
      view: "projects",
      spaces: [],
    });
    const projectActions = screen.getAllByRole("button", {
      name: i18n.t("app:projectSpaces.newProject"),
    });
    expect(projectActions).toHaveLength(1);
    fireEvent.click(projectActions[0]);
    expect(onCreateProject).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("app:botExperience.newBot") }),
    );
    expect(onCreateBot).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])("restores focus to the same conversation after pinned=%s changes its section", pinned => {
    const current = session("move", pinned ? { pinnedAt: at } : {});
    const { container, props, rerender } = setup([current, session("other")]);
    const original = container.querySelector<HTMLButtonElement>('[data-conversation-row="move"] [data-conversation-menu-trigger]')!;
    original.focus();
    rerender(<BotConversationNavigation {...props} data={{ ...props.data, sessions: [{ ...current, pinnedAt: pinned ? undefined : at }, session("other")] }} />);
    const replacement = container.querySelector<HTMLButtonElement>('[data-conversation-row="move"] [data-conversation-menu-trigger]')!;
    expect(original.isConnected).toBe(false);
    expect(replacement).toHaveFocus();
  });

  it("restores a stable history entry after archiving the focused conversation", () => {
    const current = session("archive");
    const { container, props, rerender } = setup([current]);
    container.querySelector<HTMLButtonElement>("[data-conversation-menu-trigger]")!.focus();
    rerender(<BotConversationNavigation {...props} data={{ ...props.data, sessions: [{ ...current, archived: true }] }} />);
    expect(container.querySelector("[data-conversation-id]")).toBeNull();
    expect(screen.getByRole("button", { name: i18n.t("app:botExperience.manageHistory") })).toHaveFocus();
  });

  it("does not steal focus from another control when a conversation disappears", () => {
    const current = session("archive");
    const { container, props, rerender } = setup([current]);
    container.querySelector<HTMLButtonElement>("[data-conversation-menu-trigger]")!.focus();
    const outside = document.createElement("button"); document.body.append(outside); outside.focus();
    rerender(<BotConversationNavigation {...props} data={{ ...props.data, sessions: [{ ...current, archived: true }] }} />);
    expect(outside).toHaveFocus(); outside.remove();
  });

});
