<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/parallel-tool-input-20261021 -->
<!-- git-project-sync-task:base=32821e4022a63fcf9bc1d3840de9c49e52a64b38 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: Preserve parallel tool inputs through provider-to-Anthropic streaming conversion

## Objective

Preserve each parallel OpenAI Chat Completions or Responses function call's complete input and identity when translating provider streams into Anthropic content blocks. Keep tools buffered until authoritative completion, then serialize complete blocks; failed, incomplete, or unterminated streams must not expose partially assembled tool calls.

Initial scope was limited to the two stream translators and synthetic regression. Root later approved the directly required liveness extension across the bridge handler, attempt-owned model failover, body reader, and Query watchdog observer. No retry/Goal/Stop policy, ledger, runtime configuration, build, release, or shared CI changes are included.

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
- Added a private in-process per-attempt progress callback from the translators through the bridge handler. It reports only nonempty accepted text, reasoning, and tool-argument deltas; metadata, empty deltas, terminal events, conflicting IDs, and post-done arguments do not renew activity.
- The model failover callback is fenced by the exact active request lease and attempt generation. It renews the pending `ModelBodyReader` interval watchdog as well as its remaining idle budget, so safe translator buffering does not cause a false idle timeout. Stale failed-attempt callbacks cannot renew a later attempt.
- The owning Session Query subscribes to its exact active bridge token's in-process progress context only during the watchdog lifecycle. It checks token identity, current Query authority and Stop state, calls `watchdog.markActivity()` only, and unsubscribes in `finally`; token retirement clears listeners. It does not mark substantive work or grant recovery authority.
- Query authority is snapshotted at bridge resolver entry, before managed credential resolution or continuation checks can await, so a late resolver cannot adopt a newer Query's authority.
- Both streaming handlers wrap progress in a local lifecycle fence: upstream/downstream abort, empty body, protocol terminal, parse/translation error, EOF, transport error, and downstream cancel retire further notifications.
- Chat argument deltas stop renewing after a duplicate call ID appears at another index. Responses deltas stop renewing after item ID, call ID, or name conflicts (and after duplicate item/call identity); an argument delta received before late identity remains valid.
- ModelFailover's attempt-local progress callback now returns strict acceptance (`true` only for the current live attempt). The handler composes body and token Query liveness through a small helper and notifies the Query only when that exact attempt callback accepts, so stale attempt callbacks cannot renew either budget.

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
- No full SDK consumer or candidate-package acceptance was run in this worktree. Root owns independent review and publisher handoff. No formal build/release/CI action is part of this branch.

## Next step

- Root to independently recheck the real SDK consumer and review the completed token-owned liveness wiring before publisher handoff. No shared CI or release action is in this branch scope.

## Liveness regression and verification

- A real `handleStreamResponse` + `ModelFailoverController` integration fixture sends accepted tool-argument fragments every 15ms with a 60ms body-idle bound while tool blocks remain buffered until terminal. It fails when the internal callback is disabled (automatic replay blocked before `message_stop`) and passes when callbacks are connected (complete tool block and successful terminal delivered).
- Added a fake-time stale-attempt regression: a callback captured from a failed pre-header attempt cannot renew the later response's pending read; body timeout still cancels and enters the existing interruption path.
- Focused unit verification: `node node_modules/vitest/vitest.mjs run --project unit src/server/openai-bridge/model-stream-liveness.unit.test.ts src/server/openai-bridge/translate/parallel-tool-input.unit.test.ts src/server/openai-bridge/model-failover.unit.test.ts` — 3 files, 76 tests passed.
- Focused integration verification: `node node_modules/vitest/vitest.mjs run --project integration src/server/openai-bridge/model-failover-buffered-tool-progress.integration.test.ts src/server/__tests__/bridge-registry.integration.test.ts` — 2 files, 16 tests passed. Covers no-MF Responses token notification, token retirement/Stop/unsubscribe, and buffered eligible-route progress.
- `node node_modules/typescript/bin/tsc --noEmit --pretty false`, changed-file ESLint over all modified TypeScript files, and `git diff --check` — passed.
- Cancellation/identity red evidence from `recovery-fix`: the previous SHA emitted one extra progress callback after actual downstream cancel for both protocols; duplicate Chat call IDs and contradictory Responses identities also renewed the watchdog. After repair, 5 unit files passed 110 tests (including two actual-handler cancellation cases and identity conflict/late identity cases), 2 integration files passed 16 tests, with TypeScript, changed-file ESLint, and `git diff --check` passing.
- Stale-attempt red evidence from `recovery-fix`: a real `ModelFailoverController` with two attempts plus the handler's previous composition called the Query observer once from an old attempt while the request signal remained live. The strict boolean gate suppresses that notification; the regression exercises the exact composition helper with two real attempts and confirms old callback 0 notifications/current callback 1.
