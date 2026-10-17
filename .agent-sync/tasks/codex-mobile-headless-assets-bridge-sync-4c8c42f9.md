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
- Focused codec, admission/unknown-recovery, ownership tests; Rust/TypeScript checks; separate real split-UID status.

## Completed

- This branch began at verified canonical `main` SHA `400b746a4841bab8e4b99d8f83479fd54925c205`; `project-sync observe`, `start`, and `task-init` passed.
- Implementation commit from the parent-assigned integration worktree: `e36b277f` (`feat(headless): bridge scoped assets and mobile sessions`). It adds private internal dispatch, streaming AssetStore import, Host staging and worker-local artifact sources, existing Host mobile `start`/`send` receipt paths, and dormant-session owner recovery.
- Rust uses the same store and Host uses the same session worker and receipt owner. Unknown IPC outcomes stay unresolved and are never resent.

## Verification

- `node_modules/.bin/tsc --noEmit --pretty false` — passed.
- Focused unit Vitest — 9/9 passed (closed Host IPC envelope, scoped staging/retry/expiry, mobile.start order/duplicate/unknown behavior).
- Existing Host owner/session integrations — 13/13 passed (`host-remote-session`, `mobile-owner`, `mobile-receipts`, `assets`).
- Headless Rust library tests — 181/181 passed.
- AssetStore Rust library tests — 11/11 passed on Darwin after directory-fsync fix.
- Linux CI previously showed `ASSET_IO_FAILED` on directory sync: cap-std's cloned Linux directory descriptor may be `O_PATH`. Implementation reopens the anchored dir read-only before `sync_all`; a Linux CI rerun is still required to confirm.

## Blockers and unknowns

- Real split-UID Host/network service interop has not been exercised; no service, production account, provider, or deployed runtime was touched.
- Linux CI verification of directory fsync remains open because the current local host is Darwin.
- This branch carries a normal merge from the parent integration SHA before the owned implementation cherry-pick; the canonical start gate passed before integration.

## Next step

Merge the parent integration dependency commit `f9e697f5ad41e0e28077ff3e1f92c0afa008ac67` into this canonical-start branch, cherry-pick owned implementation commit `e36b277f`, update this record with final resulting SHAs and test evidence, then push and run `project-sync handoff`.
