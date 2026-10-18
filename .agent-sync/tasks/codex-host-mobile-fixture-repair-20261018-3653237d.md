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
- [x] Normally merge reviewed combined input23ccbded83f2b6db8042c5e6be33b74c670b4809 after this task record.
- [x] Build first, real main bootstrap under original lock/private state without management/provider/model; await actual Ready, normal exit0, then original operator and complete existing fixture path. Retain identity bytes and existing behavior assertions.
- [x] Run all three local actual synthetic fixture cases and scoped lint/diff checks; full noEmit remains running with no result as of commit.
- [x] Prepare explicit-file commit/push handoff; root performs exact Linux CI and main integration.

## Implementation

Only the two original verification scripts change. Bundling precedes operator setup. The original main first starts with the existing Linux flock argv (or local macOS fixture fallback), isolated state/HOME, no management socket, provider-key environment or supplier listener. Its real Ready plus the original doctor /host/status Unix contract prove unconfigured/no Session; exact empty registry bytes are read, then SIGTERM must exit0 without a signal. Only then does the unchanged original operator configure synthetic data. Identity bytes and operator registry bytes must survive the full main startup; loopback also checks identity bytes after its existing recovery restart. All original positive/negative/byte assertions, process-group cleanup and Ready timeouts remain.

## Verification

- git-project-sync start and task-init on canonical baa1: PASS; task16cbb9540 then normal no-ff merge of exact23cc at6c009d901.
- Two changed scripts ESLint: PASS. git diff --check: PASS.
- Actual local Node24.21.0 interactions: PASS119.400s, synthetic loopback supplierCalls6; original native permissions/tool artifact bytes/exact stop and new bootstrap/identity/registry checks passed. Evidence remains private at ~/.mox-host-interactions-DdB8dq/evidence.jsonl.
- Actual local large-image loopback: PASS85.666s; 5,883,258-byte image, original supplier observed image, durable Session/bytes and restart recovery passed. Evidence private at ~/.mox-original-host-VbOO0I/evidence.jsonl.
- Actual local plain-attachment loopback: PASS62.887s;40-byte attachment, original durable Session/bytes, retry no replay and restart source/receipt recovery passed. Evidence private at ~/.mox-original-host-H89sRz/evidence.jsonl.
- Full noEmit types started before host load contention was reported; still running/no output at commit, result unknown. No repeated or new compilation/test run is required locally; root will verify exact Ubuntu CI. All three actual fixture cases exited0. Host load is not treated as a product failure and no test timeout increased.
- Initial observation attempt launched a separate doctor CLI with a2s process lifetime and timed out locally; replaced by direct doctor-owned /host/status contract with2s request timeout/8192B bound. No Ready deadline or product behavior was relaxed.


Actual local old fixture command: Node24.21.0 --import tsx scripts/verify-mobile-original-host-interactions.ts; FAIL FIXTURE_HOST_EXITED, supplierCalls0. Read only fixed error from its private diagnostic. No actual account, external model or daily Mac app used.

## Blockers and unknowns

macOS local fixture tests do not prove Linux flock, hosted CI, real browser enrollment/renewal/reboot, or production. Product candidate23 remains unchanged. These states remain with root.

## Next step

Root reviews the immutable worker head, reruns the exact Ubuntu headless CI combination, and owns PR/main integration. Product candidate23 source is unchanged (delta from23cc is only these two fixture scripts and this task). No external model was called; actual model identity and usage are unknown.
