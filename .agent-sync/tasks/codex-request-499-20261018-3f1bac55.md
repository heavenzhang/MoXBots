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
- [x] Normal CI and independent review pass; current-main integration and remote ancestry/tree verified for642e/mainfe82002e.
- [x] Unified release owner received acceptedmain and included it in the next unfrozen0512 union; signed/native release is tracked separately.

## Completed

- Preceding read-only investigation independently confirmed lifecycle misclassification and locally reproduced 499 without a model call. Product implementation and focused/native fixture acceptance completed; final normalCI/source main delivered642e/mainfe82002e; signed/native publication remains separately pending. Six focused files contain 126 assertions and five actual native SDK fixture modes are accepted locally; see `dev-docs/request-499-20261018-acceptance.md`.

## Verification

- Baseline origin/main 311ecfd52 verified. Focused implementation and independent paired-controller verification are assigned to separate owners. No production or daily-client mutations authorized by the verification plan.

## Blockers and unknowns

- Native installation and production acceptance must wait for an idle, backed-up, authorized release window; publishing/queuing does not prove installation. Do not interrupt current tasks. Exact supplier failure telemetry is not available; local reason-specific regressions establish only their tested scenarios.

## Next step

- Source/main delivery is verified. Unified publisher completes final0512 unionCI/main, freeze/build/sign/native/publication gates; do not claim the installed daily client contains this feature. Final immutable source/main receipt below and private pointer preserve the integration transfer.

## Final source/main handoff by authorized integrator

Original owner completed combined source642e28206658dfd1f643304aa7a9609c1388d5e0 and normalCI39145233968 (nine applicable successes, conditional iOS skip), then its chat became notLoaded/interrupted and two coordination sends failed. Human explicitly transferred ordinary PR144 merge/remote verification to unified publisher. Root normally merged as mainfe82002ede98dd7e3f839fc45a36525efa2452cf at2026-10-18T16:55:13Z, fetched and verified source ancestry and exact CI/main tree848bc2c127ad1ebe97fecd2a3e4e2b1509d80e31. Native install/production remain open; next unfrozen0512 publisher is integrating this acceptedmain with141 throughPR143 and must pass final combination gates before freeze. No daily application action.
