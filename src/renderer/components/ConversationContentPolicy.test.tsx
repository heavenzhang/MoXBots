import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConversationContentContext } from "@/context/ConversationContentContext";
import { presentRemoteTranscript } from "@/features/remote-session/transcriptPresentation";
import Message from "./Message";
import ToolUse from "./ToolUse";
vi.mock("@/context/ImagePreviewContext", () => ({
  useImagePreview: () => ({ openPreview: vi.fn() }),
}));
vi.mock("@/components/WidgetRenderer", () => ({
  default: () => <div data-testid="unsafe-widget" />,
}));
afterEach(cleanup);
it("uses ordinary message/process UI while remote text cannot enable local cards or actions", () => {
  const [message] = presentRemoteTranscript(
    [
      {
        id: "m",
        role: "assistant",
        timestamp: "",
        truncated: false,
        content:
          "[secret](/Users/private/secret.txt) ![image](file:///secret.png)\n\n<widget>unsafe</widget>",
        tools: [
          {
            id: "t",
            name: "Write",
            status: "complete",
            summary: '{"content":"JSON document","filePath":"/local/file"}',
          },
        ],
      },
    ],
    "partial",
  );
  render(
    <ConversationContentContext.Provider value="remote">
      <Message message={message} />
    </ConversationContentContext.Provider>,
  );
  expect(document.querySelector('[data-role="assistant"]')).toBeTruthy();
  expect(document.querySelector("[data-process-group]")).toBeTruthy();
  expect(document.querySelector('[data-process-row="succeeded"]')).toBeTruthy();
  expect(screen.queryByTestId("unsafe-widget")).toBeNull();
  expect(document.querySelector("a,img,iframe,audio,video")).toBeNull();
  // Only read-only clipboard and disclosure actions are present, never export/retry/fork/file actions.
  expect(
    screen.queryByRole("button", {
      name: /导出|Export|重试|Retry|重新生成|Fork|分支|文件操作/i,
    }),
  ).toBeNull();
  const disclosure = document.querySelector(
    "[data-process-row] button[aria-expanded]",
  )!;
  const output = '{"content":"JSON document","filePath":"/local/file"}';
  // Remote results are visible by default. Both disclosure states retain the
  // same text-only policy instead of turning JSON paths into local actions.
  expect(disclosure.getAttribute("aria-expanded")).toBe("true");
  expect(document.querySelector("pre")?.textContent).toBe(output);
  fireEvent.click(disclosure);
  expect(disclosure.getAttribute("aria-expanded")).toBe("false");
  expect(document.querySelector("pre")).toBeNull();
  fireEvent.click(disclosure);
  expect(disclosure.getAttribute("aria-expanded")).toBe("true");
  expect(document.querySelector("pre")?.textContent).toBe(output);
  expect(document.querySelector("a,img,iframe")).toBeNull();
});
it("canonical tool text never dispatches a local cron or file renderer", () => {
  const output =
    '{"ok":true,"taskId":"do-not-open-local-task","content":"keep verbatim"}';
  render(
    <ToolUse
      tool={{
        id: "t",
        name: "mcp__cron-tools__create",
        input: {},
        streamIndex: 0,
        result: output,
        presentation: { kind: "text", status: "complete" },
      }}
    />,
  );
  expect(document.querySelector("pre")?.textContent).toBe(output);
  expect(screen.queryByRole("button")).toBeNull();
});
