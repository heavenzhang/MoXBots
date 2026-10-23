<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/session-sse-stall-20261024 -->
<!-- git-project-sync-task:base=fda7728fa11ee0b1138e9357b2b81e680f408043 -->
<!-- git-project-sync-task:status=completed -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MB-SESSION-OUTPUT-20261024-02: drain fragmented SSE recovery streams

## Objective

Keep downstream SSE reads live when upstream chunks contain only comments or incomplete records, while preserving event framing, protocol terminal behavior, cancellation, body idle bounds, backpressure, and recovery/ledger safeguards. Scope is limited to the two bridge stream owners and focused tests.

## Acceptance criteria

- Both `ModelFailoverController` and `ContextRecoveryController` drain repeatedly until they can enqueue a complete frame, reach protocol terminal/EOF, or fail/cancel.
- Every pending SSE body read is bounded by the existing body idle watchdog; comments and partial records do not renew model progress.
- Regression tests exercise fragmented UTF-8 JSON, comments, stacked owners, cancellation, terminal without socket EOF, backpressure, and body idle timeout.
- Focused tests, typecheck, and lint pass; only owned files are committed.

## Completed

- Changed both SSE `pull` implementations to continue reading through zero-frame parser results. Model failover uses its existing `ModelBodyReader`; context recovery now also uses that watchdog for SSE, renews it only for semantic model progress, and preserves unbounded behavior for non-SSE bodies.
- Kept protocol `message_stop` handling immediate, before transport EOF; downstream output remains one pull at a time, and existing cancel/error/recovery paths are retained.
- Added model failover unit coverage for fragmented UTF-8 after comments, idle timeout during comment-only input, and consumer cancellation during a partial record. Added loopback integration coverage for UTF-8 fragmentation and comments through stacked failover and context recovery.

## Verification

- Node runtime: `/Applications/MoXBots.app/Contents/Resources/nodejs/bin/node` v24.20.0; dependencies use the existing `node_modules` symlink to the matching installation.
- `node node_modules/vitest/vitest.mjs run --project unit src/server/openai-bridge/model-stream-liveness.unit.test.ts src/server/openai-bridge/context-recovery.unit.test.ts --project integration src/server/openai-bridge/context-recovery.integration.test.ts` — 3 files, 114 tests passed.
- Focused ESLint passed for the two source files and two edited test files.
- `git diff --check` passed.
- Full `/Applications/MoXBots.app/Contents/Resources/nodejs/bin/node node_modules/typescript/bin/tsc --noEmit` — passed.
- Repeated focused Vitest run after final adjustment — 3 files, 114 tests passed; focused ESLint and `git diff --check` in the same sequential command also passed.

## Blockers and unknowns

- No real-provider request, production action, shared CI, GUI, push, or PR was run. Prior provider budget remains exhausted. This deterministic fix does not uniquely prove the historical session trigger.

## Next step

- Commit exactly the four source/test files plus this task record with Conventional Commits subject and a non-empty explanatory body; report the SHA and leave mainline integration to the parent task owner.
