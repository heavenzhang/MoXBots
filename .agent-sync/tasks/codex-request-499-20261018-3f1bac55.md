<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/request-499-20261018 -->
<!-- git-project-sync-task:base=311ecfd52d129bab5a1565981b7b23d66e8f46b7 -->
<!-- git-project-sync-task:status=ready-for-review -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MOXBOTS-REQUEST-499-20261018 background request liveness and safe three retries

## Objective

Fix foreground completion incorrectly cancelling valid background inference/streams. Preserve explicit stop and replay protection. Permit three bounded retries after an initial recoverable unexposed failure; never re-enqueue the task or replay delivered tools. User explicitly authorizes main delivery and arranging the next unfrozen signed repair release, without stopping/restarting/replacing the daily app or its active work. Canonical remote: https://github.com/heavenzhang/MoXBots.git. Release owner chat: 01a12bc2-907a-7702-b6dd-788225c5dfe4.

## Acceptance criteria

- [x] Normal background request and SSE survive parent completion while exact Query remains valid.
- [x] Explicit abort and retired Query/route reject late output and stop queued retries.
- [x] Initial safe availability failure gets up to three retries, with bounded cancellable backoff; failures after delivery never replay tools.
- [x] Focused paired-controller loopback regression and real SDK/native + local MCP counter pass.
- [ ] Normal CI and independent review pass; merge current main, push and verify remote main contains delivered changes.
- [ ] Unified release owner receives exact accepted main revision and queues next unfrozen repair; signed/native release is tracked separately.

## Completed

- Preceding read-only investigation independently confirmed lifecycle misclassification and locally reproduced 499 without a model call. Product implementation and focused/native fixture acceptance completed; final normal CI/main delivery pending integration. Six focused files contain 126 assertions and five actual native SDK fixture modes are accepted locally; see `dev-docs/request-499-20261018-acceptance.md`.

## Verification

- Baseline origin/main 311ecfd52 verified. Focused implementation and independent paired-controller verification are assigned to separate owners. No production or daily-client mutations authorized by the verification plan.

## Blockers and unknowns

- Native installation and production acceptance must wait for an idle, backed-up, authorized release window; publishing/queuing does not prove installation. Do not interrupt current tasks. Exact supplier failure telemetry is not available; local reason-specific regressions establish only their tested scenarios.

## Next step

- Source is ready for normal PR/CI and current-main integration. Verify the remote main contains the reviewed commit; notify the registered release owner with immutable main and acceptance evidence. Final main/publication receipts are retained under the project pointer docs/output; this ready-for-review record describes the candidate gates and does not claim installation.
