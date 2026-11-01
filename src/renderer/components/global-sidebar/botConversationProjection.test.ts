import { describe, expect, it } from "vitest";
import type { Project } from "@/config/types";
import type { AgentConfig } from "../../../shared/types/agent";
import type { SessionMetadata } from "@/api/sessionClient";
import type { Tab } from "@/types/tab";
import type { ProjectSpaceSessionSnapshot } from '../../../shared/projectSpaces';
import {
  botConversationProjects,
  projectBotConversations,
} from "./botConversationProjection";
const projects: Project[] = [
  {
    id: "p1",
    name: "Product",
    path: "/work/product",
    agentId: "b1",
    providerId: null,
    permissionMode: null,
  },
  {
    id: "p2",
    name: "Sales",
    path: "/work/sales",
    agentId: "b2",
    providerId: null,
    permissionMode: null,
  },
];
const agents: AgentConfig[] = [
  {
    id: "b1",
    name: "Mino",
    enabled: true,
    permissionMode: "plan",
    channels: [],
  },
  {
    id: "b2",
    name: "Analyst",
    enabled: true,
    permissionMode: "plan",
    channels: [],
  },
];
const session = (
  id: string,
  path = "/work/product",
  patch: Partial<SessionMetadata> = {},
): SessionMetadata => ({
  id,
  agentDir: path,
  title: id,
  createdAt: "2026-11-01T01:00:00Z",
  lastActiveAt: "2026-11-01T02:00:00Z",
  ...patch,
});
const project = (
  sessions: SessionMetadata[],
  extra: Partial<Parameters<typeof projectBotConversations>[0]> = {},
) =>
  projectBotConversations({ projects, agents, sessions, tabs: [], ...extra });
describe("Bot conversation projection", () => {
  function frozen(projectId: string, patch: Partial<ProjectSpaceSessionSnapshot> = {}): ProjectSpaceSessionSnapshot {
    return { schemaVersion: 1, projectId, projectName: `Frozen ${projectId}`, projectRevision: 1, botId: 'b1', botName: 'Original Bot', botIcon: 'bot:spark', workspacePath: '/work/product', capturedAt: '2026-11-02T00:00:00Z', description: '', instructions: '', materials: [], resources: [], ...patch };
  }

  it('filters logical projects sharing the same Bot and cwd without admitting legacy history', () => {
    const sessions = [session('a', undefined, { projectSpace: frozen('space-a') }), session('b', undefined, { projectSpace: frozen('space-b') }), session('legacy')];
    expect(project(sessions, { projectSpaceId: 'space-a' }).map(item => item.session.id)).toEqual(['a']);
    expect(project(sessions, { projectSpaceId: 'space-b' }).map(item => item.session.id)).toEqual(['b']);
    expect(project(sessions, { projectSpaceId: 'missing-space' })).toEqual([]);
    expect(project(sessions).map(item => item.session.id)).toEqual(['a', 'b', 'legacy']);
    expect(sessions[2].projectSpace).toBeUndefined();
  });

  it('displays the full frozen Bot and project identity after current config changes or member removal', () => {
    const original = session('a', undefined, { projectSpace: frozen('space-a') });
    const changedAgents = [{ ...agents[0], name: 'Renamed Bot', icon: 'bot:moss' }];
    const [row] = project([original], { agents: changedAgents });
    expect(row.bot).toEqual({ id: 'b1', name: 'Original Bot', icon: 'bot:spark' });
    expect(row.projectLabel).toBe('Frozen space-a');
    expect(row.projectSpaceId).toBe('space-a');
    expect(project([original], { agents: [] })[0].bot).toEqual(row.bot);
    expect(original.projectSpace?.botName).toBe('Original Bot');
  });

  it('keeps legacy rows on the existing workspace binding with no inferred logical project', () => {
    const [legacy] = project([session('legacy')], { agents: [{ ...agents[0], name: 'Current Bot', icon: 'bot:moss' }] });
    expect(legacy.bot).toMatchObject({ id: 'b1', name: 'Current Bot', icon: 'bot:moss' });
    expect(legacy.projectLabel).toBe('Product');
    expect(legacy.projectSpaceId).toBeUndefined();
  });

  it('falls back to the current icon only when the frozen snapshot has no icon', () => {
    const noIcon = session('no-icon', undefined, { projectSpace: frozen('space-a', { botIcon: undefined }) });
    const [row] = project([noIcon], { agents: [{ ...agents[0], icon: 'bot:moss' }] });
    expect(row.bot).toEqual({ id: 'b1', name: 'Original Bot', icon: 'bot:moss' });
  });
  it("joins exact workspace identity to a stable Bot and limits the project filter", () => {
    expect(
      project([session("product"), session("sales", "/work/sales")], {
        projectId: "p2",
      }).map((x) => [x.session.id, x.bot.id, x.project.id]),
    ).toEqual([["sales", "b2", "p2"]]);
  });
  it("isolates missing or ambiguous identity instead of assigning the first Bot", () => {
    expect(project([session("missing", "/unknown")])).toEqual([]);
    expect(
      project([session("ambiguous")], {
        projects: [...projects, { ...projects[0], id: "duplicate" }],
      }),
    ).toEqual([]);
    expect(project([session("missingBot")], { agents: [] })).toEqual([]);
  });
  it("keeps ordinary legacy chats visible and excludes archived/automation/maintenance work", () => {
    const result = project([
      session("legacy"),
      session("archived", undefined, { archived: true }),
      session("cron", undefined, { source: "cron" }),
      session("scheduled", undefined, {
        origin: { kind: "automation", surface: "task_run" },
      }),
      session("maintenance", undefined, {
        systemMaintenanceKind: "memory_gardener",
      }),
    ]);
    expect(result.map((x) => x.session.id)).toEqual(["legacy"]);
  });
  it("uses only matching live tabs and canonical badge counts for activity", () => {
    const tabs: Tab[] = [
      {
        id: "t1",
        view: "chat",
        title: "A",
        agentDir: "/work/product",
        sessionId: "one",
        sidecarConfigDisposition: "adopt",
        isGenerating: true,
        hasUnread: true,
      },
    ];
    const result = project([session("one"), session("two")], {
      tabs,
      badges: new Map([["one", 3]]),
    });
    expect(result.map((x) => [x.session.id, x.working, x.unread])).toEqual([
      ["one", true, 3],
      ["two", false, 0],
    ]);
  });
  it("preserves pin precedence and deterministic recency without mutating metadata", () => {
    const sessions = [
      session("old", undefined, { pinnedAt: "2026-11-01T00:00:00Z" }),
      session("new", undefined, { lastActiveAt: "2026-11-01T03:00:00Z" }),
    ];
    expect(project(sessions).map((x) => x.session.id)).toEqual(["old", "new"]);
    expect(sessions[0].id).toBe("old");
  });
  it("offers only committed Bot/project bindings for new conversation birth", () => {
    expect(botConversationProjects(projects, "b1").map((x) => x.id)).toEqual([
      "p1",
    ]);
    expect(botConversationProjects(projects, "unknown")).toEqual([]);
  });
});
