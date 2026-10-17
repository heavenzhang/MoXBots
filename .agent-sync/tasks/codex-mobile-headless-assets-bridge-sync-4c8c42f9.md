<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-headless-assets-bridge-sync -->
<!-- git-project-sync-task:base=400b746a4841bab8e4b99d8f83479fd54925c205 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: Linux Headless bounded asset and mobile bridge

## Objective

Add a bounded private Unix IPC bridge for existing `session.assets.v1` and `session.mobile.v1`. Reuse the Rust `mobile/asset-store`, original Host Session lifecycle/worker/SessionEngine, and `createRemoteReceiptOwner`. Do not add public methods, second executor/ledger, shared paths, permission expansion, service changes, or deployment.

## Acceptance criteria

- Closed internal IPC envelope and 24 KiB byte chunks; no public method/frame changes or caller paths.
- Scope derives from verified TLS/account/peer/local/binding state; account/revocation gates remain active.
- Uploads stage privately before original receipt/admission; lost outcomes never replay.
- Outputs list/read only through original Host session owner with opaque IDs, generation checks, and scoped AssetStore imports.
- New-chat and existing-session sends preserve original receipt and worker lifecycle.
- Focused codec, fake-owner Unix loopback, admission/unknown-recovery, ownership tests; Rust/TypeScript checks; separate real split-UID status.

## Completed

- This branch began at verified canonical `main` SHA `400b746a4841bab8e4b99d8f83479fd54925c205`; `project-sync observe`, `start`, and `task-init` passed before integration.
- Parent integration foundation was incorporated by normal merge commit `f9e7fa1d`.
- Owned implementation commit: `25a6c7b1` (`feat(headless): bridge scoped assets and mobile sessions`). It adds private internal dispatch, streaming AssetStore import, Host staging and worker-local artifact sources, existing Host mobile `start`/`send` receipt paths, and dormant-session owner recovery.
- Rust uses the same store and Host uses the same session worker and receipt owner. Unknown IPC outcomes stay unresolved and are never resent.
- Review follow-up in the current worktree fixes standard UUID admission, initializes the Host staging root for text-only sends, preserves existing-session recovery via `ensureOwnerWorker`, leaves post-begin `mobile.send` failures unresolved, reuses the Desktop same-provider/runtime model catalog, and routes suggestions through the exact session worker with revision fencing.
- Worker output reads use one owner-opened fd and bounded chunk reads with pre/post stat checks; Rust performs the final full-file hash during streaming import. Host staging reaps only its own immediate UUID/data directories, at most 32 per initialization.

## Verification

- `node_modules/.bin/tsc --noEmit --pretty false` — passed after review fixes.
- Focused unit Vitest — 11/11 passed (closed Host IPC envelope, staging/retry/expiry/text-only startup/orphan cleanup, start ordering/model binding/duplicate/unknown behavior).
- Headless worker + mobile owner + fake-owner Unix socket loopback integrations — 22/22 passed. The worker test verifies a standards-compliant UUID reaches the worker execution authorization gate, and the exact worker handles suggestions safely when no assistant anchor exists.
- Existing Host owner/session regressions (`host-remote-session`, `mobile-owner`, `mobile-receipts`, `assets`) — 13/13 passed after the model-helper extraction.
- Headless Rust library tests — 181/181 passed.
- AssetStore Rust library tests — 11/11 passed on Darwin after directory-fsync fix.
- Linux CI previously showed `ASSET_IO_FAILED` on directory sync: cap-std's cloned Linux directory descriptor may be `O_PATH`. Implementation reopens the anchored dir read-only before `sync_all`; a Linux CI rerun is still required to confirm.

## Blockers and unknowns

- Real split-UID Host/network service interop has not been exercised; fake-owner Unix loopback uses the local test UID. No service, production account, provider invocation, or deployed runtime was touched.
- Linux CI verification of directory fsync remains open because the current local host is Darwin.
- This branch carries a normal merge from the parent integration SHA before the owned implementation commit; the canonical start gate passed before integration.

## Next step

Push the committed task branch and run `project-sync handoff`; request owner review and Linux CI for the directory-fsync fix. Keep true split-UID runtime status explicit.
