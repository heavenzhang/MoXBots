import { expect, it } from "vitest";
import { presentRemoteTranscript } from "./transcriptPresentation";
import { getProcessOutcome } from "@/utils/processPresentation";
import { processFilePaths } from "@/utils/processResults";
it("projects remote observations without local inputs, attachments or executable metadata", () => {
  const raw = {
    id: "m",
    role: "assistant" as const,
    timestamp: "2026-10-20T00:00:00Z",
    content: "text",
    truncated: true,
    attachments: [{ savedPath: "/local/secret" }],
    sdkUuid: "local-id",
    asyncQuestions: { id: "unsafe" },
    tools: [
      {
        id: "t",
        name: "Write",
        status: "running" as const,
        summary: '{"content":"JSON file"}',
        input: { file_path: "/local/secret" },
      },
    ],
  };
  const [message] = presentRemoteTranscript([raw], "Partial history");
  expect(message.presentationNotice).toBe("Partial history");
  expect(message).not.toHaveProperty("attachments");
  expect(message).not.toHaveProperty("sdkUuid");
  const blocks = typeof message.content === "string" ? [] : message.content;
  expect(blocks[0]).toEqual({ type: "text", text: "text" });
  expect(blocks[1].tool?.input).toEqual({});
  expect(blocks[1].tool?.result).toBe('{"content":"JSON file"}');
  expect(getProcessOutcome(blocks[1], false)).toBe("running");
  expect(
    processFilePaths({ block: blocks[1], index: 0, outcome: "succeeded" }),
  ).toEqual([]);
});
it("retains unchanged message identities through parsed snapshots and changed-tail updates", async () => {
  const { reconcileRemoteMessages } = await import("./transcriptPresentation");
  const source = [
    {
      id: "a",
      role: "assistant" as const,
      content: "stable history",
      timestamp: "",
      truncated: false,
      tools: [],
    },
    {
      id: "b",
      role: "assistant" as const,
      content: "tail",
      timestamp: "",
      truncated: false,
      tools: [],
    },
  ];
  const first = presentRemoteTranscript(source, "partial");
  const updated = reconcileRemoteMessages(
    JSON.parse(JSON.stringify(source)),
    source,
  );
  const second = presentRemoteTranscript(updated, "partial");
  expect(second[0]).toBe(first[0]);
  expect(second[1]).toBe(first[1]);
  const tail = reconcileRemoteMessages(
    [{ ...source[0] }, { ...source[1], content: "new tail" }],
    updated,
  );
  const third = presentRemoteTranscript(tail, "partial");
  expect(third[0]).toBe(first[0]);
  expect(third[1]).not.toBe(first[1]);
  expect(third[0].timestampKnown).toBe(false);
});
