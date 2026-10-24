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
  expect(updated).toBe(source);
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

it("retains completed tool blocks while real assistant text grows, and replaces changed tool outcomes", async () => {
  const { reconcileRemoteMessages } = await import("./transcriptPresentation");
  const source = [{ id: "live", role: "assistant" as const, content: "Part one", timestamp: "", truncated: false,
    tools: Array.from({ length: 120 }, (_, i) => ({ id: `t${i}`, name: "Read", status: "complete" as const, summary: `Result ${i}` })) }];
  const [first] = presentRemoteTranscript(source, "partial");
  const next = structuredClone(source);
  next[0].content += " and part two";
  const shared = reconcileRemoteMessages(next, source);
  const [second] = presentRemoteTranscript(shared, "partial");
  expect(shared[0]).not.toBe(source[0]);
  expect(shared[0].tools).toBe(source[0].tools);
  if (typeof first.content === "string" || typeof second.content === "string") throw new Error("Expected assistant blocks");
  expect(second.content[0]).toEqual({ type: "text", text: "Part one and part two" });
  expect(second.content.slice(1).every((block, i) => block === first.content[i + 1])).toBe(true);
  const failed = structuredClone(shared);
  failed[0].tools[119] = { ...failed[0].tools[119], summary: "Updated result" };
  const [third] = presentRemoteTranscript(reconcileRemoteMessages(failed, shared), "partial");
  if (typeof third.content === "string") throw new Error("Expected assistant blocks");
  expect(third.content[119]).toBe(second.content[119]);
  expect(third.content[120]).not.toBe(second.content[120]);
  expect(third.content[120].tool?.result).toBe("Updated result");
});

it("scopes cached tool block identities to their message", () => {
  const tool = { id: "tool", name: "Read", status: "complete" as const, summary: "Result" };
  const messages = ["first", "second"].map((id) => ({
    id, role: "assistant" as const, content: "", timestamp: "", truncated: false, tools: [tool],
  }));
  const [first, second] = presentRemoteTranscript(messages, "partial");
  if (typeof first.content === "string" || typeof second.content === "string") throw new Error("Expected assistant blocks");
  expect(first.content[0].id).toBe("first:tool");
  expect(second.content[0].id).toBe("second:tool");
  expect(second.content[0]).not.toBe(first.content[0]);
});
