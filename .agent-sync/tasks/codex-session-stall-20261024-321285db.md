<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/session-stall-20261024 -->
<!-- git-project-sync-task:base=fda7728fa11ee0b1138e9357b2b81e680f408043 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-SESSION-OUTPUT-20261024-02: eliminate stalled streams and incomplete model recovery

## Objective

MB-SESSION-OUTPUT-20261024-02: formally fix both reported stalls and deliver through remote main and the existing desktop publisher. Treat SSE read progress, model recovery liveness and visible terminal state as separate acceptance gates. Preserve original sessions and uncertain action ledgers; no blind task replay.

## Acceptance criteria

- [x] Fragmented UTF-8/JSON SSE, comments and stacked recovery streams reach normal text/terminal with backpressure and cancellation preserved.
- [x] Pre-header network failure/unavailable backup preserves bounded primary recovery, visible countdown/reconnecting and original Stop; policy retained.
- [x] No-tool thinking-only completed results cannot bypass the empty-result error via positive token usage; normal text/tool results, compact control and Stop semantics retained.
- [x] 374 focused tests, fragmented native SDK/MCP loopback, types and targeted lint pass. Actual renderer interactions/narrow themes pass; independent source/screenshots reviewed.
- [ ] Latest main is integrated, owner-coordinated CI passes and remote main contains the exact source.
- [ ] Existing desktop publisher delivers the verified artifact and completes native user-path checks, recording version, source, digest and rollback target.

## Completed

- [x] Git destination, clean isolated worktree and remote main fda7728fa11ee0b1138e9357b2b81e680f408043 verified; observe/start/task-init PASS.
- [x] Prior controlled SSE diagnosis: original 14/24 vs isolated loop fix 24/24. Three authorized real minimal requests passed; historical exact trigger remains unproven.
- [x] New screenshot session: four ECONNRESET/502 failures before headers at 00:51:36; unavailable backup due tier policy; explicit Stop at 00:59:20. User changed model and resumed tool execution after 01:03, so preserve that active run.
- [x] Existing sole desktop owner contacted through the user's explicit deployment coordination policy. Installed version observed 0.5.19/build519.2; owner is handling frozen 0.5.20 separately.

## Verification

Source: /Users/zhangshaohua/Documents/Codex/2026-10-24/moxbots-session-stall-fix. Node24 uses the installed runtime. Matching dependency installation reused; package lock differs only in the product version. Authoritative evidence: dev-docs/session-stall/acceptance.md. Private logs/screenshots remain in workspace work/MB-SESSION-OUTPUT-20261024-02 and are not committed.

## Delivery and collaboration

Primary: 01a16933-d3bd-7593-9d06-65a7c5e33d2f, responsible for new-scene diagnosis, recovery, integration and acceptance. SSE worker owns only the two openai-bridge stream readers/tests on separate branch codex/session-sse-stall-20261024. Requested worker gpt-6-luna/medium; independently testable loop repair, no escalation. Native-only ai-yaoren-local mode, no external-model calls.

Desktop client and Sidecar are one deployment unit. Sole shared CI/build/install/release/rollback owner remains 01a12bc2-907a-7702-b6dd-788225c5dfe4. That owner assigns the next unfrozen version. This task does not independently trigger shared CI, build or install. Linux Host/cloud releases are outside this change.

## Blockers and unknowns

Historical network fragments are unavailable. New-scene primary retries were confirmed in actual logs at 15/30/60/120 second waits; the defect was unclear/mutable UI, not absence of those attempts. Real upstream ECONNRESET remains an observed external failure, not a proven unique network root cause. Prior three-call paid authorization is exhausted; no extra paid calls. Native installed acceptance and remote main/CI remain separate open gates under the publisher.

## Next step

Commit/push the reviewed source, pass remote handoff, submit exact SHA and verification to the existing sole publisher for shared CI/main integration and its next unfrozen release/native acceptance. Preserve the already frozen 0.5.20 artifact and active user Sessions.
