<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/upstream-native-20261025 -->
<!-- git-project-sync-task:base=848e333455c7045534bf51a951a19b6945c6aa1a -->
<!-- git-project-sync-task:status=in-progress -->

# MB-UPSTREAM-FIXES-20261025 — native event and quit lifecycle

## Objective

Port upstream `dacc8c01f289fe076413fa273c412e63cef3804d` and `2f00a16b9307c0a5c1efc5e69a1447f2c992b296` into the supplied MoXBots repository. Repair event callback/descriptor cleanup across registration races and route native macOS quit into the existing cancellable shutdown owner. Preserve MoXBots navigation, model management, recovery, updater, recording and exact process-tree cleanup.

## Acceptance criteria and To Do

- [x] Verify supplied repository, base and isolated branch; run start/task-init.
- [x] Pair exact JS API 2.11.1 repair with vendored Tauri 2.11.2, with provenance and deterministic red/green tests.
- [x] Pair Tao 0.35.3 and tauri-runtime-wry 2.11.4 native request projection; verify narrow vendor changes.
- [x] Preserve existing product ExitRequested handler and process/recording/update owners byte-for-byte.
- [x] Run 31 script/provenance tests and existing 13 abort-helper tests; targeted lint and classification.
- [x] Run isolated native red/green quit (6/6 patched) and patched event burst fixtures (all 9 checkpoints zero retained callbacks/descriptors/tables).
- [x] Record validation, remaining integration requirements and local commit.
- [ ] Main integration / shared CI / production native acceptance — parent and existing desktop owner only; outside this worker's execution scope.

## Completed

Exact paired upstream dependency repairs are present. Product lib.rs and tauriListen.ts changes are comments only. Package scripts and lock contain necessary integration hooks and exact API pin; the integration owner must preserve its other concurrent changes. No formal version change.

## Verification

Evidence and detailed commands: `dev-docs/upstream-native-20261025/acceptance.md` and `source-invariants.json`. Local ignored logs are in the same directory. `start` and `task-init` passed with explicit `--remote https://github.com/heavenzhang/MoXBots.git`.

## Blockers and unknowns

Product build/install/restart, shared CI, main/push and production acceptance are not authorized for this worker. No original app, credentials or user state are touched. Native fixtures use isolated identifiers and incognito windows. Parent must add `vendor/tauri/**` to shared ESLint ignores and integrate the shared specification paragraphs documented in acceptance.md.

## Deployment request

Affected deployment unit: desktop/macOS/updater; sole existing owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`. Required for eventual product effect, queued through parent. No schema/data/permission change; all dependency halves must ship together. Current installed/published versions stay unchanged. The branch is local only and must not be described as remote synchronized.

## Next step

Parent: review the local commit and reconcile package hooks, shared ESLint ignore and specification additions from acceptance.md before integrating and running combined gates.
