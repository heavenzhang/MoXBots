import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import { ensureChatOwner, type ChatOwnerFlight } from "./ensureChatOwner";

const metadata = {
  id: "session-real",
  agentDir: "/workspace",
  title: "Chat",
  createdAt: "",
  lastActiveAt: "",
};

function Harness({
  pending = true,
  fail = false,
  failAdoption = false,
  mode = "manual",
}: {
  pending?: boolean;
  fail?: boolean;
  failAdoption?: boolean;
  mode?: string;
}) {
  const [status, setStatus] = useState("idle");
  const sessionRef = {
    current: pending ? "pending-session" : "session-existing",
  };
  const submittedSessionId = pending ? "pending-session" : "session-existing";
  const flight = useRef<ChatOwnerFlight | null>(null);
  const adopted = useRef<{
    pendingSessionId: string;
    owner: { sessionId: string; workspacePath?: string };
  } | null>(null);
  const [materializeCount, setMaterializeCount] = useState(0);
  const materialize = vi.fn(async (_pendingSessionId: string) => {
    setMaterializeCount((count) => count + 1);
    if (fail) throw new Error("materialize failed");
    return { sessionId: "session-real", metadata };
  });
  const adopt = vi.fn(async (id: string) => {
    if (failAdoption) return false;
    sessionRef.current = id;
    return true;
  });
  const send = vi.fn(async (id: string, text: string) => {
    setStatus(
      `sent:${id}:${text}:materialize:${materializeCount + (pending ? 1 : 0)}`,
    );
  });
  const submit = async () => {
    try {
      const ensure = () =>
        ensureChatOwner({
          expectedSessionId: submittedSessionId,
          currentSessionId: sessionRef,
          flight,
          adopted,
          isPendingSessionId: (id) => id.startsWith("pending-"),
          workspacePath: "/workspace",
          materialize: async (pendingSessionId) =>
            materialize(pendingSessionId),
          adopt,
          setSessionMeta: vi.fn(),
        });
      const startScheduledTask = async () => {
        // Mirrors the Goal start branch: it invokes Chat's owner callback before
        // returning to handleSendMessage, which then performs its ordinary send.
        await ensure();
      };
      if (mode === "goal") await startScheduledTask();
      const owner = await ensureChatOwner({
        expectedSessionId: submittedSessionId,
        currentSessionId: sessionRef,
        flight,
        adopted,
        isPendingSessionId: (id) => id.startsWith("pending-"),
        workspacePath: "/workspace",
        materialize: async (pendingSessionId) => materialize(pendingSessionId),
        adopt,
        setSessionMeta: vi.fn(),
      });
      await send(owner.sessionId, "draft text");
    } catch {
      setStatus("failed"); /* keep the composer draft available for retry */
    }
  };
  return (
    <>
      <input aria-label="draft" defaultValue="draft text" />
      <button onClick={() => void submit()}>
        {mode === "launcher"
          ? "Launcher send"
          : mode === "goal"
            ? "Start Goal and send"
            : "Send"}
      </button>
      <output>{status}</output>
    </>
  );
}

describe("Chat first-send owner materialization", () => {
  it.each(["manual", "launcher"] as const)(
    "%s first send adopts the real id before sending",
    async (mode) => {
      render(<Harness mode={mode} />);
      fireEvent.click(screen.getByRole("button"));
      await waitFor(() =>
        expect(
          screen.getByText("sent:session-real:draft text:materialize:1"),
        ).toBeInTheDocument(),
      );
    },
  );

  it("keeps an already-owned session on the direct send path", async () => {
    render(<Harness pending={false} fail />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(
        screen.getByText("sent:session-existing:draft text:materialize:0"),
      ).toBeInTheDocument(),
    );
  });

  it("does not send or clear the draft when materialization fails", async () => {
    render(<Harness fail />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "draft" })).toHaveValue(
        "draft text",
      ),
    );
    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  it("does not send when adoption is refused", async () => {
    render(<Harness failAdoption />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("failed")).toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "draft" })).toHaveValue(
      "draft text",
    );
  });

  it("reuses Goal startup materialization for its first chat query", async () => {
    render(<Harness mode="goal" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Start Goal and send" }),
    );
    await waitFor(() =>
      expect(
        screen.getByText("sent:session-real:draft text:materialize:1"),
      ).toBeInTheDocument(),
    );
  });
});
