<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/remote-session-state-projection-20261024 -->
<!-- git-project-sync-task:base=6c30c2f94f76589a9856c20bc368ec0ee5479678 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-REMOTE-SYNC-20261023: project remote session activity onto closed wire state

## Objective

Continue `MB-REMOTE-SYNC-20261023` after a real Air `session state` read
returned `TARGET_PROJECTION_INVALID` both before and after the human reported
updating Air to 0.5.19. The original controlled Session text remains readable.
Fix the target's read-only wire projection without changing the protocol,
Session owner, local progress, authorization, or any existing business Session.

## Acceptance criteria

- [x] Reproduce rejection with the real fixed protocol schema and the local
  activity shape including progress/execution details.
- [x] Preserve idle/running/waiting_user_action while emitting only the closed
  wire fields; retain ownership and invalid-state rejection.
- [x] Focused regression, typecheck, affected lint and fixed-protocol checks.
- [ ] Sole desktop owner accepts the immutable branch head, runs shared CI,
  normally integrates main and verifies remote inclusion.
- [ ] New unfrozen candidate is built/published by that owner; actual Air
  runtime is updated under its normal maintenance window.
- [ ] Read the same controlled Session successfully and complete real D1-D8.

## Completed

- Target `session.state` now explicitly projects `sessionId` and `state` from
  the original `readSessionActivity` owner. Local progress/execution details
  stay local; the vendored 1.2.0 contract remains strict and unchanged.
- Regression tests cover all three valid states with real derived progress,
  exclusion of local task details, workspace ownership and invalid states.
- Scope and evidence boundary: `dev-docs/remote-sync-20261023/state-projection-fix.md`.

## Verification

- Red: target suite has 3 expected failures, each `unrecognized_keys` at
  `result`, with the pre-fix implementation (6 existing/guard cases pass).
- Green: unit target/source/session-observation suites, 3 files, 31 passed.
- `tsc --noEmit`: PASS.
- ESLint on target implementation/test with zero warnings: PASS.
- Test classification: PASS; 453 server tests classified.
- Fixed AgentNet 1.2.0 archive check: PASS, SHA256
  `240dc3b654ab221db2904ba41dcf68d61d04492d6b3a10c370c59609c926720a`.
- Logs are external in the original task's
  `work/MB-REMOTE-SYNC-20261023/state-projection-*.log`; no user transcript,
  credential, installed App or generated package is committed here.

## Blockers and unknowns

- Desktop macOS/updater and combined CI/main sole owner remains
  `01a12bc2-907a-7702-b6dd-788225c5dfe4`,
  “MoxBots桌面端统一打包负责人”, under the user's continuing delivery authorization.
- This development chat does not trigger PR/shared CI, allocate a version,
  rebuild, install, restart, promote or take a GUI lease. Published 519.2 and
  the owner's subsequent frozen 520.1 artifact stay unchanged.
- Pushes to `codex/` branches do not trigger `Test` (push filter is main/dev);
  opening the PR and main integration belong to the sole CI owner.
- Air 0.5.19 is a human report; its exact build/executable was not independently
  read. The local deterministic defect is proven, but the actual Air error is
  not closed until the corrected target runs and the same read passes.
- Original controlled test Session is preserved externally. Do not start,
  send, Stop or replay it to validate this source-only repair.

## Next step

Sole owner reviews this branch's immutable head and selects the next unfrozen
candidate/CI sequence. After verified main delivery and publication, reconcile
actual device versions and only read the original test Session before the
remaining D1-D8 GUI checks under the original lease/maintenance boundaries.
