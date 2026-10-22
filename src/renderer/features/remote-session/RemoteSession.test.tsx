import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  registry: {
    connections: [
      {
        id: "owned:test",
        removing: false,
        snapshot: {
          state: "ready",
          principalId: "p",
          networkId: "n",
          authGeneration: 4,
        },
      },
    ],
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/features/agent-network/store", () => ({
  useAgentNetworkRegistry: () => mocks.registry,
}));
vi.mock("@/api/remoteSession", () => ({
  remoteSessionRequest: mocks.request,
  remoteAccountMatches: () =>
    mocks.registry.connections[0].snapshot.principalId === "p",
  remoteErrorCode: (error: { code: string }) => error.code,
}));
vi.mock("@/components/Markdown", () => ({
  default: ({ children }: { children: string }) => <p>{children}</p>,
}));
vi.mock("react-virtuoso", () => import("../../../test/ConversationVirtuoso"));
vi.mock("@/config/useConfigData", () => ({useConfigData: () => ({config: {}})}));
vi.mock("@/context/ImagePreviewContext", () => ({useImagePreview: () => ({openPreview: vi.fn()})}));
import RemoteSession from "./RemoteSession";
import { clearRemoteDrafts } from "./drafts";
import type { RemoteSessionTab } from "./tabContract";
const scope = {
  serviceId: "service",
  environment: "test",
  principalId: "p",
  networkId: "n",
  deviceId: "d",
  keyGeneration: 2,
};
const tab: RemoteSessionTab = {
  id: "tab-remote",
  view: "remote-session",
  title: "Remote Agent",
  locator: {
    connectionId: "owned:test",
    principalId: "p",
    networkId: "n",
    deviceId: "d",
    authGeneration: 4,
  },
  agentId: "a",
  agentName: "Agent A",
  deviceName: "Host D",
  sessionId: null,
  targetScope: null,
};
const snapshot = {
  kind: "snapshot",
  agentId: "a",
  sessionId: "s",
  generation: "generation",
  turnId: "turn",
  revision: "1",
  state: "waiting_user_action",
  title: "Remote task",
  runtime: "builtin",
  model: "model",
  terminal: null,
  messages: [
    {
      id: "message",
      role: "assistant",
      timestamp: "",
      content: "Remote result",
      truncated: false,
      tools: [],
    },
  ],
  interactions: [
    {
      requestId: "permission-1",
      generation: "generation",
      turnId: "turn",
      interaction: "permission",
      title: "Write report",
      description: "Remote write",
      actionable: true,
      questions: [],
    },
  ],
  hasMoreBefore: false,
  nextBefore: null,
};
const binding = { onOpen: vi.fn(), onBound: vi.fn() };
beforeEach(() => {
  clearRemoteDrafts();
  localStorage.clear();
  vi.clearAllMocks();
  Object.assign(mocks.registry.connections[0].snapshot, {
    state: "ready",
    principalId: "p",
    authGeneration: 4,
  });
  mocks.request.mockImplementation(async (_locator, _scope, request) => ({
    scope,
    data:
      request.kind === "capabilities"
        ? {
            kind: "capabilities",
            version: 1,
            agentId: "a",
            runtime: "builtin",
            maxActiveSessions: 1,
            liveUpdates: "snapshot",
          }
        : request.kind === "list"
          ? {
              kind: "list",
              agentId: "a",
              items: [],
              hasMore: false,
              nextBefore: null,
            }
          : request.kind === "get"
            ? snapshot
            : {
                kind: "receipt",
                agentId: "a",
                sessionId: "s",
                operationId: request.operationId,
                status: "accepted",
                code: null,
              },
  }));
});
afterEach(cleanup);
it("opens a draft without local session owner and binds only an accepted remote receipt", async () => {
  const view = render(<RemoteSession tab={tab} isActive binding={binding} />);
  await screen.findByText("remoteSession.empty");
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Start a task" },
  });
  fireEvent.click(screen.getByRole("button", { name: "remoteSession.send" }));
  await waitFor(() =>
    expect(binding.onBound).toHaveBeenCalledWith(tab.id, "s", scope, "Agent A"),
  );
  expect(
    mocks.request.mock.calls.filter((call) => call[2].kind === "start"),
  ).toHaveLength(1);
  expect(
    mocks.request.mock.calls.find((call) => call[2].kind === "start")?.[2].text,
  ).toBe("Start a task");
  view.unmount();
  expect(mocks.request.mock.calls.some((call) => call[2].kind === "stop")).toBe(
    false,
  );
});
it.each([
  ['REMOTE_PROVIDER_UNAVAILABLE', 'providerUnavailable'],
  ['REMOTE_SESSION_ADMISSION_REJECTED', 'admissionRejected'],
  ['REMOTE_SESSION_DISPATCH_REJECTED', 'dispatchRejected'],
])("shows %s as a refusal, preserves draft across refresh and does not resend", async (code, key) => {
  const base = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation(async (...args) => args[2].kind === 'start'
    ? { scope, data: { kind: 'receipt', agentId: 'a', sessionId: 's', operationId: args[2].operationId, status: 'rejected', code } }
    : base(...args));
  render(<RemoteSession tab={tab} isActive binding={binding} />);
  await screen.findByText('remoteSession.empty');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep the original task' } });
  fireEvent.click(screen.getByRole('button', { name: 'remoteSession.send' }));
  await screen.findByText(`remoteSession.${key}`);
  expect(screen.queryByText('remoteSession.failed')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveValue('Keep the original task');
  const count = mocks.request.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'remoteSession.refresh' }));
  await waitFor(() => expect(mocks.request.mock.calls.length).toBeGreaterThan(count));
  expect(mocks.request.mock.calls.filter(call => call[2].kind === 'start')).toHaveLength(1);
  expect(screen.getByRole('textbox')).toHaveValue('Keep the original task');
  expect(binding.onBound).not.toHaveBeenCalled();
});
it("retains uncertain operation ID, suppresses duplicate sends and checks receipt without resending", async () => {
  const base = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation(async (...args) => {
    if (args[2].kind === "start") throw { code: "REMOTE_SESSION_UNCONFIRMED" };
    if (args[2].kind === "receipt")
      return {
        scope,
        data: {
          kind: "receipt",
          operationId: args[2].operationId,
          agentId: "a",
          sessionId: null,
          status: "not-found",
          code: null,
        },
      };
    return base(...args);
  });
  render(<RemoteSession tab={tab} isActive binding={binding} />);
  await screen.findByText("remoteSession.empty");
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Keep this draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "remoteSession.send" }));
  await screen.findByText("remoteSession.unconfirmed");
  expect(
    screen.getByRole("button", { name: "remoteSession.send" }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "remoteSession.checkReceipt" }),
  );
  await waitFor(() =>
    expect(
      mocks.request.mock.calls.some((call) => call[2].kind === "receipt"),
    ).toBe(true),
  );
  expect(
    mocks.request.mock.calls.filter((call) => call[2].kind === "start"),
  ).toHaveLength(1);
  expect(binding.onBound).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox")).toHaveValue("Keep this draft");
});
it("binds exact pending interaction and stop identities; normal send never approves", async () => {
  render(
    <RemoteSession
      tab={{ ...tab, sessionId: "s", targetScope: scope }}
      isActive
      binding={binding}
    />,
  );
  await screen.findByText("Remote result");
  fireEvent.click(
    screen.getByRole("button", { name: "remoteSession.allowOnce" }),
  );
  await waitFor(() =>
    expect(
      mocks.request.mock.calls.some((call) => call[2].kind === "respond"),
    ).toBe(true),
  );
  expect(
    mocks.request.mock.calls.find((call) => call[2].kind === "respond")?.[2],
  ).toMatchObject({
    generation: "generation",
    turnId: "turn",
    requestId: "permission-1",
    interaction: "permission",
    approved: true,
  });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "remoteSession.stop" }),
    ).not.toBeDisabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "remoteSession.stop" }));
  await waitFor(() =>
    expect(
      mocks.request.mock.calls.some((call) => call[2].kind === "stop"),
    ).toBe(true),
  );
  expect(
    mocks.request.mock.calls.find((call) => call[2].kind === "stop")?.[2],
  ).toMatchObject({ generation: "generation", turnId: "turn", sessionId: "s" });
});
it("removes messages, composer and approval controls immediately on account change", async () => {
  const view = render(
    <RemoteSession
      tab={{ ...tab, sessionId: "s", targetScope: scope }}
      isActive
      binding={binding}
    />,
  );
  await screen.findByText("Remote result");
  mocks.registry.connections[0].snapshot.principalId = "another-account";
  view.rerender(
    <RemoteSession
      tab={{ ...tab, sessionId: "s", targetScope: scope }}
      isActive
      binding={binding}
    />,
  );
  expect(screen.queryByText("Remote result")).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByText("remoteSession.allowOnce")).toBeNull();
  expect(screen.getByText("remoteSession.accountChanged")).toBeInTheDocument();
});
it("does not poll hidden tabs or offline targets", async () => {
  const view = render(
    <RemoteSession tab={tab} isActive={false} binding={binding} />,
  );
  expect(mocks.request).not.toHaveBeenCalled();
  mocks.registry.connections[0].snapshot.state = "disconnected";
  view.rerender(<RemoteSession tab={tab} isActive binding={binding} />);
  expect(mocks.request).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "remoteSession.send" }),
  ).toBeDisabled();
});
it("blocks approval of truncated details but permits exact-target denial", async () => {
  const base = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation(async (...args) =>
    args[2].kind === "get"
      ? {
          scope,
          data: {
            ...snapshot,
            interactions: [{ ...snapshot.interactions[0], actionable: false }],
          },
        }
      : base(...args),
  );
  render(
    <RemoteSession
      tab={{ ...tab, sessionId: "s", targetScope: scope }}
      isActive
      binding={binding}
    />,
  );
  await screen.findByText("Remote result");
  expect(
    screen.getByRole("button", { name: "remoteSession.allowOnce" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "remoteSession.deny" }));
  await waitFor(() =>
    expect(
      mocks.request.mock.calls.some((call) => call[2].kind === "respond"),
    ).toBe(true),
  );
  expect(
    mocks.request.mock.calls.find((call) => call[2].kind === "respond")?.[2]
      .approved,
  ).toBe(false);
});
it("submits question answers by the original answerKey instead of rendered question text", async () => {
  const base = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation(async (...args) =>
    args[2].kind === "get"
      ? {
          scope,
          data: {
            ...snapshot,
            interactions: [
              {
                requestId: "question-1",
                generation: "generation",
                turnId: "turn",
                interaction: "question",
                title: "Choose",
                description: "Choose destination",
                actionable: true,
                questions: [
                  {
                    answerKey: "original-question-id",
                    question: "Where?",
                    options: ["Remote"],
                    multiSelect: false,
                  },
                ],
              },
            ],
          },
        }
      : base(...args),
  );
  render(
    <RemoteSession
      tab={{ ...tab, sessionId: "s", targetScope: scope }}
      isActive
      binding={binding}
    />,
  );
  await screen.findByText("Where?");
  expect(
    screen.getByRole("button", { name: "remoteSession.submitAnswers" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: "Remote" }));
  fireEvent.click(
    screen.getByRole("button", { name: "remoteSession.submitAnswers" }),
  );
  await waitFor(() =>
    expect(
      mocks.request.mock.calls.some((call) => call[2].kind === "respond"),
    ).toBe(true),
  );
  expect(
    mocks.request.mock.calls.find((call) => call[2].kind === "respond")?.[2],
  ).toMatchObject({
    requestId: "question-1",
    interaction: "question",
    answers: { "original-question-id": "Remote" },
    approved: true,
  });
});
it("preserves previously loaded older messages while replacing the latest page by message ID", async () => {
  const base = mocks.request.getMockImplementation()!;
  let revision = "1";
  mocks.request.mockImplementation(async (...args) => {
    const request = args[2];
    if (request.kind !== "get") return base(...args);
    return {
      scope,
      data: request.before
        ? {
            ...snapshot,
            revision,
            interactions: [],
            messages: [
              ...snapshot.messages,
              {
                ...snapshot.messages[0],
                id: "older",
                content: "Earlier result",
              },
            ],
            hasMoreBefore: request.before !== "repeat",
            nextBefore: request.before === "repeat" ? null : "repeat",
          }
        : {
            ...snapshot,
            revision,
            interactions: [],
            messages: [
              {
                ...snapshot.messages[0],
                content:
                  revision === "1" ? "Remote result" : "Updated remote result",
              },
            ],
            hasMoreBefore: true,
            nextBefore: "message",
          },
    };
  });
  render(
    <RemoteSession
      tab={{ ...tab, sessionId: "s", targetScope: scope }}
      isActive
      binding={binding}
    />,
  );
  await screen.findByText("Remote result");
  fireEvent.click(screen.getByRole("button", { name: "remoteSession.older" }));
  await screen.findByText("Earlier result");
  // A repeated/overlapping cursor page adds no duplicate rows or phantom prepend.
  fireEvent.click(screen.getByRole("button", { name: "remoteSession.older" }));
  await waitFor(() => expect(screen.queryByRole("button", {name:"remoteSession.older"})).toBeNull());
  expect(screen.getAllByText("Earlier result")).toHaveLength(1);
  expect(screen.getAllByText("Remote result")).toHaveLength(1);
  revision = "2";
  fireEvent.click(
    screen.getByRole("button", { name: "remoteSession.refresh" }),
  );
  await screen.findByText("Updated remote result");
  expect(screen.getAllByText("Earlier result")).toHaveLength(1);
  expect(screen.queryByText("Remote result")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "remoteSession.older" }),
  ).toBeNull();
});
it("recovers the original operation ID after closing and remounting, without storing prompt text or resending", async () => {
  const base = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation(async (...args) => {
    if (args[2].kind === "start") throw { code: "REMOTE_SESSION_UNCONFIRMED" };
    if (args[2].kind === "receipt")
      return {
        scope,
        data: {
          kind: "receipt",
          operationId: args[2].operationId,
          agentId: "a",
          sessionId: null,
          status: "not-found",
          code: null,
        },
      };
    return base(...args);
  });
  const view = render(<RemoteSession tab={tab} isActive binding={binding} />);
  await screen.findByText("remoteSession.empty");
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Never persist this private prompt" },
  });
  fireEvent.click(screen.getByRole("button", { name: "remoteSession.send" }));
  await screen.findByText("remoteSession.unconfirmed");
  const operationId = mocks.request.mock.calls.find(
    (call) => call[2].kind === "start",
  )![2].operationId;
  const stored = localStorage.getItem(localStorage.key(0)!);
  expect(stored).toContain(operationId);
  expect(stored).not.toContain("Never persist");
  view.unmount();
  clearRemoteDrafts();
  const reopened = render(
    <RemoteSession tab={tab} isActive binding={binding} />,
  );
  await waitFor(() =>
    expect(
      mocks.request.mock.calls.some(
        (call) =>
          call[2].kind === "receipt" && call[2].operationId === operationId,
      ),
    ).toBe(true),
  );
  expect(
    screen.getByRole("button", { name: "remoteSession.send" }),
  ).toBeDisabled();
  expect(screen.getByRole("textbox")).toHaveValue("");
  expect(
    mocks.request.mock.calls.filter((call) => call[2].kind === "start"),
  ).toHaveLength(1);
  reopened.unmount();
});
it("fails closed on a corrupted operation record after reload", async () => {
  const { remoteTabIdentity } = await import("./tabContract");
  localStorage.setItem(
    "moxbots.remoteSession.operation.v1:" +
      encodeURIComponent(remoteTabIdentity(tab)),
    "{damaged",
  );
  clearRemoteDrafts();
  render(<RemoteSession tab={tab} isActive binding={binding} />);
  await screen.findByText("remoteSession.operationUnknown");
  expect(
    screen.getByRole("button", { name: "remoteSession.send" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "remoteSession.checkReceipt" }),
  ).toBeDisabled();
  expect(
    mocks.request.mock.calls.some((call) =>
      ["start", "send", "respond", "stop"].includes(call[2].kind),
    ),
  ).toBe(false);
});
it("does not invoke any write if durable operation ID storage fails", async () => {
  render(<RemoteSession tab={tab} isActive binding={binding} />);
  await screen.findByText("remoteSession.empty");
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "A task" },
  });
  const failure = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new Error("quota");
    });
  fireEvent.click(screen.getByRole("button", { name: "remoteSession.send" }));
  await screen.findByText("remoteSession.operationUnknown");
  expect(
    mocks.request.mock.calls.some((call) =>
      ["start", "send", "respond", "stop"].includes(call[2].kind),
    ),
  ).toBe(false);
  expect(
    screen.getByRole("button", { name: "remoteSession.send" }),
  ).toBeDisabled();
  failure.mockRestore();
});
it("keeps a restored tab locked until the delayed network registry supplies its original account", async () => {
  const connection = mocks.registry.connections[0];
  mocks.registry.connections = [];
  const restored = { ...tab, sessionId: "s", targetScope: scope };
  const view = render(
    <RemoteSession tab={restored} isActive binding={binding} />,
  );
  expect(
    screen.getByText("remoteSession.connectionPending"),
  ).toBeInTheDocument();
  expect(screen.queryByText("remoteSession.accountChanged")).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(mocks.request).not.toHaveBeenCalled();
  mocks.registry.connections = [
    {
      ...connection,
      snapshot: {
        ...connection.snapshot,
        principalId: null,
        networkId: null,
        state: "connecting",
        authGeneration: 0,
      },
    } as unknown as typeof connection,
  ];
  view.rerender(<RemoteSession tab={restored} isActive binding={binding} />);
  expect(
    screen.getByText("remoteSession.connectionPending"),
  ).toBeInTheDocument();
  expect(mocks.request).not.toHaveBeenCalled();
  mocks.registry.connections = [
    {
      ...connection,
      snapshot: {
        ...connection.snapshot,
        state: "ready",
        principalId: "p",
        networkId: "n",
        authGeneration: 9,
      },
    },
  ];
  view.rerender(<RemoteSession tab={restored} isActive binding={binding} />);
  await screen.findByText("Remote result");
  expect(mocks.request.mock.calls[0][0].authGeneration).toBe(9);
  expect(screen.queryByText("remoteSession.connectionPending")).toBeNull();
});
it("replaces the latest session list so a deleted first-page session does not reappear", async () => {
  const base = mocks.request.getMockImplementation()!;
  let deleted = false;
  mocks.request.mockImplementation(async (...args) =>
    args[2].kind === "list"
      ? {
          scope,
          data: {
            kind: "list",
            agentId: "a",
            items: deleted
              ? []
              : [
                  {
                    sessionId: "session-a",
                    title: "Session A",
                    preview: "A preview",
                    runtime: "builtin",
                    updatedAt: "",
                  },
                ],
            hasMore: false,
            nextBefore: null,
          },
        }
      : base(...args),
  );
  const view = render(<RemoteSession tab={tab} isActive binding={binding} />);
  await screen.findByText("Session A");
  deleted = true;
  view.rerender(<RemoteSession tab={tab} isActive={false} binding={binding} />);
  view.rerender(<RemoteSession tab={tab} isActive binding={binding} />);
  await screen.findByText("remoteSession.empty");
  expect(screen.queryByText("Session A")).toBeNull();
  expect(screen.queryByText("remoteSession.cachedHistory")).toBeNull();
});
it("keeps fetched list tail as labelled cache across ordinary polling and clears it on manual refresh", async () => {
  const base = mocks.request.getMockImplementation()!;
  let baselineTitle = "Session A";
  mocks.request.mockImplementation(async (...args) => {
    if (args[2].kind !== "list") return base(...args);
    return {
      scope,
      data: {
        kind: "list",
        agentId: "a",
        items: [
          {
            sessionId: args[2].before ? "session-b" : "session-a",
            title: args[2].before ? "Older Session B" : baselineTitle,
            preview: "",
            runtime: "builtin",
            updatedAt: "",
          },
        ],
        hasMore: !args[2].before,
        nextBefore: args[2].before ? null : "session-a",
      },
    };
  });
  const view = render(<RemoteSession tab={tab} isActive binding={binding} />);
  await screen.findByText("Session A");
  fireEvent.click(
    screen.getByRole("button", { name: "remoteSession.moreSessions" }),
  );
  await screen.findByText("Older Session B");
  expect(screen.getByText("remoteSession.cachedHistory")).toBeInTheDocument();
  baselineTitle = "Updated Session A";
  view.rerender(<RemoteSession tab={tab} isActive={false} binding={binding} />);
  view.rerender(<RemoteSession tab={tab} isActive binding={binding} />);
  await screen.findByText("Updated Session A");
  expect(screen.getByText("Older Session B")).toBeInTheDocument();
  expect(screen.getByText("remoteSession.cachedHistory")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "remoteSession.moreSessions" }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "remoteSession.refresh" }),
  );
  await waitFor(() => expect(screen.queryByText("Older Session B")).toBeNull());
  expect(screen.queryByText("remoteSession.cachedHistory")).toBeNull();
  expect(
    await screen.findByRole("button", { name: "remoteSession.moreSessions" }),
  ).toBeInTheDocument();
});

it('shows tool results through shared disclosure as canonical text without local file actions', async () => {
  const base = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation(async (...args) => {
    const response = await base(...args);
    if (args[2].kind !== 'get') return response;
    return { ...response, data: { ...snapshot, interactions: [], messages: [{
      ...snapshot.messages[0], content: '', tools: [
        { id:'read', name:'Read', status:'complete', summary:'first line\nsecond line' },
        { id:'error', name:'Bash', status:'error', summary:'failed command' },
        { id:'running', name:'Grep', status:'running', summary:'' },
      ],
    }] } };
  });
  render(<RemoteSession tab={{ ...tab, sessionId:'s', targetScope:scope }} isActive binding={binding} />);
  await waitFor(() => expect(document.querySelectorAll('[data-process-row]')).toHaveLength(3));
  const read = document.querySelector('[data-message-id="message"] button[aria-expanded]') as HTMLButtonElement;
  expect(read.getAttribute('aria-expanded')).toBe('false');
  expect(document.querySelector('pre')).toBeNull();
  fireEvent.click(read);
  expect(read.getAttribute('aria-expanded')).toBe('true');
  expect(document.querySelector('pre')?.textContent).toBe('first line\nsecond line');
  expect(screen.queryByText('filePath', {exact:false})).toBeNull();
  expect(screen.queryByRole('link')).toBeNull();
  fireEvent.click(read);
  expect(document.querySelector('pre')).toBeNull();
  expect(document.querySelectorAll('[data-process-row="running"]')).toHaveLength(1);
  expect(document.querySelectorAll('[data-process-row="failed"]')).toHaveLength(1);
  expect(mocks.request.mock.calls.every(call=>['capabilities','get'].includes(call[2].kind))).toBe(true);
});
