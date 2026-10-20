<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/parallel-tool-input-20261021 -->
<!-- git-project-sync-task:base=32821e4022a63fcf9bc1d3840de9c49e52a64b38 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: Preserve parallel tool inputs through provider-to-Anthropic streaming conversion

## Objective

Preserve each parallel OpenAI Chat Completions or Responses function call's complete input and identity when translating provider streams into Anthropic content blocks. Keep tools buffered until authoritative completion, then serialize complete blocks; failed, incomplete, or unterminated streams must not expose partially assembled tool calls.

Scope is limited to the two stream translators and a synthetic unit regression file. No request-policy change, ledger change, runtime configuration, build, release, or shared CI.

## Acceptance criteria

- Interleaved, sparse-index, and late-metadata tool calls each produce one correctly indexed block with complete JSON input before its single stop.
- Text and reasoning retain their sequence around deferred tools; empty input is accepted as `{}`.
- Duplicate done events do not duplicate stops; conflicting, invalid, failed, incomplete, or EOF tool inputs do not become successful tool blocks.
- Existing usage, terminal, and stream failure tests pass.

## Completed

- Added regression coverage for four interleaved Chat calls, sparse indices, late IDs, mixed text/thinking, legal empty arguments, Responses done/item/terminal metadata, repeated done, invalid input and failure/EOF guards.
- Chat Completions now buffers tool-related segments and emits complete sequential blocks only from finalization after a valid `tool_calls` finish reason.
- Responses now reconciles arguments and identity from delta/done/output-item/terminal metadata, emits each block once only after completed terminal validation, and rejects unfinished/conflicting inputs.
- Both translators reject duplicate nonempty call IDs across provider indices before emitting any tool blocks. Responses also rejects terminal output that would remap an already observed call ID to a different index.
- Responses now requires every streamed call to match a final completed-output function item at its original index, with consistent observed item/call IDs, name, and finalized arguments; explicit unfinished item status or terminal-event/body status mismatch fails closed. Omitted optional item status remains accepted when the completed response output and arguments are authoritative.
- Chat Completions rejects nonempty choice content after `finish_reason`; usage-only trailing chunks with empty choices remain accepted.

## Verification

- Red before repair: `node node_modules/vitest/vitest.mjs run --project unit src/server/openai-bridge/translate/parallel-tool-input.unit.test.ts` failed both Chat and Responses cases, showing arguments routed to the wrong index and duplicate/misordered stops.
- Green: `node node_modules/vitest/vitest.mjs run --project unit src/server/openai-bridge/translate/parallel-tool-input.unit.test.ts src/server/openai-bridge/translate/chat-stream-semantics.unit.test.ts src/server/openai-bridge/translate/responses-semantics.unit.test.ts src/server/openai-bridge/translate/usage-streaming.unit.test.ts` — 4 files, 63 tests passed.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit --pretty false` — passed.
- Lint: `node node_modules/eslint/bin/eslint.js src/server/openai-bridge/translate/stream.ts src/server/openai-bridge/translate/stream-responses.ts src/server/openai-bridge/translate/parallel-tool-input.unit.test.ts --max-warnings=0` — passed.
- `git diff --check` — passed.
- Duplicate-identity red/green: with the new ID-uniqueness guards temporarily removed, both targeted cases failed because they emitted tool blocks; with the guards restored, the expanded 4-file suite passed 65 tests.
- Terminal-authority red/green: before the latest repair, the new missing/replaced/incomplete Responses output, `response.failed` with completed body, and post-finish Chat tool cases failed (5 failures); after repair, the expanded 4-file suite passed 72 tests.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit --pretty false` — passed after terminal-authority changes.
- ESLint and `git diff --check` — passed after terminal-authority changes.

## Blockers and unknowns

- No shared CI or formal SDK consumer probe was run in this implementation worktree. Root has run the SDK probe on the prior pushed commit; the newest terminal-authority commit still needs its independent SDK recheck.
- Root has raised a possible translated-body idle-progress interaction because arguments remain buffered until terminal; additional control comparison and an interface recommendation are pending. Do not raise timeouts, synthesize text, or count keepalives as provider progress.

## Next step

- Push this terminal-authority commit, obtain root's SDK and idle-progress review, then hand the exact reviewed SHA to the designated publisher for candidate coordination. No shared CI or release action is in this branch scope.
