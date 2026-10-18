<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/host-mobile-fixture-repair-20261018 -->
<!-- git-project-sync-task:base=baa1a637f40b56b7ff64d4f7e8473a87b6bf8c47 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-HOST-MOBILE-FIXTURE-BOOTSTRAP-20261018

## Objective

Repair only the original Host mobile loopback/interactions fixture lifecycle against the accepted registry-bootstrap source. Canonical Git URL: https://github.com/heavenzhang/MoXBots.git. Root owns integration/CI/acceptance; this worker does not dispatch, merge to main, deploy, seed identity/registry, or change product behavior.

## Acceptance criteria and To Do

- [x] Read actual Linux job117699680297: operator configured, then Host exited, supplierCalls0; no product error in CI console.
- [x] Reproduce original fixture locally against23cc: private diagnostic contains fixed HOST_REGISTRY_BOOTSTRAP_REJECTED, no supplier call.
- [x] Start compliant new branch from canonical baa1; start gate PASS. Prior clean23cc attempt rejected stale_start_base and is preserved, not used as a successful gate.
- [ ] Normally merge reviewed combined input23ccbded83f2b6db8042c5e6be33b74c670b4809 after this task record.
- [ ] Build first, real main bootstrap under original lock/private state without management/provider/model; await actual Ready, normal exit0, then original operator and complete existing fixture path. Retain identity bytes and existing behavior assertions.
- [ ] Run local actual synthetic fixture cases and focused static checks; record limits.
- [ ] Commit/push explicit files and verify handoff; root performs exact Linux CI and main integration.

## Verification

Actual local old fixture command: Node24.21.0 --import tsx scripts/verify-mobile-original-host-interactions.ts; FAIL FIXTURE_HOST_EXITED, supplierCalls0. Read only fixed error from its private diagnostic. No actual account, external model or daily Mac app used.

## Blockers and unknowns

macOS local fixture tests do not prove Linux flock, hosted CI, real browser enrollment/renewal/reboot, or production. Product candidate23 remains unchanged. These states remain with root.

## Next step

Merge exact23cc normally, then repair only the two fixture scripts and run actual local loopback paths.
