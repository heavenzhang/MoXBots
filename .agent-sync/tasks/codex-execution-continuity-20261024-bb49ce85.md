<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/execution-continuity-20261024 -->
<!-- git-project-sync-task:base=670881d8cc1b4eed2aaa66df886cdfc83f70c14f -->
<!-- git-project-sync-task:status=ready-for-review -->

# Task: Preserve execution continuity and show actual waiting state

## Objective

Task MOXBOTS-EXECUTION-CONTINUITY-20261024. Preserve one task identity, original scope, budget and evidence when the human continues the same work. Show actual model waiting/paused state and remove the fixed eight-turn completion fraction/cap. Keep the original native queue, SessionStore ledger and unknown-write protection.

## Acceptance criteria

- [x] A classified in-scope continuation preserves execution ID, objective, original start/deadline, progress, retry counters and evidence; new tasks get a new identity.
- [x] Deferred admission revalidates identity and safety guards at dispatch. Stale callbacks, Stop, expired budgets and unknown writes cannot restart or settle a new queue.
- [x] Work that continues to progress can exceed eight turns within existing safety budgets. Deadline, no-progress and rework guards still stop it.
- [x] Status card shows current model wait/pause without a fixed round denominator. Old recovery and failed/cold snapshots do not claim running/completed.
- [x] Focused unit, DOM, integration and type checks pass; review findings are resolved. UI evidence is synthetic, with production acceptance recorded separately.
- [ ] Commit and push precise source SHA, then hand off main/shared-CI/release to original desktop owner.

## Completed

- [x] Verified canonical repository, clean isolated branch from main 670881d8cc1b4eed2aaa66df886cdfc83f70c14f, release ownership and existing live task state read-only.
- [x] Assigned UI-only changes to existing execution_ui worker; primary owns shared/backend integration.
- [x] Source implementation; independent review identified two admission issues and drove guarded fixes with regressions.
- [ ] Commit, remote branch verification and main-owner intake.

## Verification

Local verification and explicit evidence limits: `dev-docs/execution-continuity-20261024/acceptance.md`; native single/rework receipts in its evidence directory; renderer DOM/browser QA in `dev-docs/session-execution-ui/acceptance.md`. Source implementation and synthetic/native-loopback validation are complete; main delivery and production acceptance belong to the original owner.

## Blockers and unknowns

No development blocker. Existing desktop/shared CI/main/release owner is 01a12bc2-907a-7702-b6dd-788225c5dfe4. Version/tag v0.5.21 and published 521.2 artifact are immutable; this source fix must enter a new owner-selected batch. No live business continuation, app install or shared CI is performed by this development task.

## Next step

Original main/shared-CI/desktop owner: fetch the remote task branch at the exact SHA supplied in the intake message, verify its task record and evidence, and integrate under existing shared CI. Verify the resulting remote-main tree, then assign the next immutable release batch and perform real installed/business-path acceptance. The development chat verifies commit/push and the remote handoff gate before sending intake; its final report carries the non-self-referential SHA and actual handoff status.
