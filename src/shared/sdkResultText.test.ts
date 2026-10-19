import { expect, it } from "vitest";
import { unwrapSdkResult } from "./sdkResultText";
it.each([
  [
    JSON.stringify({ stdout: "ok", stderr: "warning" }),
    "ok\n\n[stderr]\nwarning",
  ],
  [
    JSON.stringify({ type: "text", file: { content: "first\nsecond" } }),
    "first\nsecond",
  ],
  [JSON.stringify({ mode: "content", content: "match" }), "match"],
  ['{"stdout":"partial', '{"stdout":"partial'],
  ['{"unknown":true}', '{"unknown":true}'],
  ["plain text", "plain text"],
])(
  "unwraps recognized envelopes and retains other text: %s",
  (input, expected) => {
    expect(unwrapSdkResult(input)).toBe(expected);
  },
);
