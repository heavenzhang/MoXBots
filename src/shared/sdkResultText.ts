/**
 * Unwrap SDK tool result JSON wrappers into displayable plain text.
 *
 * The SDK wraps tool results in JSON with metadata:
 *   Bash:  {"stdout":"...","stderr":"...","interrupted":false}
 *   Read:  {"type":"text","file":{"filePath":"...","content":"..."}}
 *   Grep:  {"mode":"content","numFiles":0,"filenames":[],"content":"1142:function..."}
 *   Glob:  {"mode":"files_with_matches","filenames":["a.ts","b.ts"],"content":"a.ts\nb.ts"}
 *
 * This extracts the meaningful text and unescapes \n so it renders properly.
 * Falls back to the original string if it's not recognized JSON.
 */
export function unwrapSdkResult(result: string): string {
  const trimmed = result.trimStart();
  if (!trimmed.startsWith("{")) return result;
  try {
    const parsed = JSON.parse(trimmed);

    // Bash format: {"stdout":"...","stderr":"..."}
    if ("stdout" in parsed && typeof parsed.stdout === "string") {
      let output = parsed.stdout;
      if (parsed.stderr && typeof parsed.stderr === "string") {
        output += (output ? "\n\n" : "") + "[stderr]\n" + parsed.stderr;
      }
      return output || "(no output)";
    }

    // Read format: {"type":"text","file":{"filePath":"...","content":"..."}}
    if (parsed.type === "text" && typeof parsed.file?.content === "string") {
      return parsed.file.content;
    }

    // Grep/Glob format: {"mode":"...","content":"..."}
    if ("content" in parsed && typeof parsed.content === "string") {
      return parsed.content;
    }

    // Unknown JSON — return as-is (let specialized components handle it)
    return result;
  } catch {
    return result;
  }
}
