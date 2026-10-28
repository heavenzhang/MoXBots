<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/cloud-migration101-20261029 -->
<!-- git-project-sync-task:base=caab6ab648b434bee17930f90c4df4de87564bba -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-CLOUD-MIGRATION-101-20261029

## Objective

The human explicitly requests migration of MoXBots cloud, website and update addresses from140 to101.42.11.29, then explicitly authorizes a fresh test database and cloud signing authority instead of waiting for old backups. Old140 storage is untouched. Original101 Host local identity/keys/config and the daily Mac client must remain unchanged. New cloud account/trust is a fresh instance, not a restoration.

## Ownership and scope

Cloud/website/mobile publication:01a12b99-7b38-78b1-831f-9c60257d386a. Existing desktop/updater/combined CI/main owner:01a12bc2-907a-7702-b6dd-788225c5dfe4. No second desktop publisher. Preserve the coexisting Mox for Science routes, app, database and existing IP TLS certificate on101. No new public ports.

## Acceptance criteria

- [x] Verify canonical remote/base and isolated worktree; preserve unrelated source/artifacts.
- [x] Inventory101 resources, TLS and existing routes; choose additive `/moxbots/` and `/moxbots/admin`.
- [x] Add fixed alternate admin assets and state-bound callback allowlist, retaining original admin and authorization checks.
- [x] Add explicit local-password bootstrap opt-in for the existing confidential OIDC client, retaining browser consent.
- [x] Local service tests212 passed/0 failed/8 ignored; private bootstrap tests6 passed; strict clippy, rustfmt, JS syntax and diff checks passed.
- [ ] Independent source review, exact-source Linux CI artifact and remote main containment.
- [ ] Fresh private101 cloud/Dex deployment with backup, ownership checks and rollback; protect all unrelated routes.
- [ ] Real login, new instance trust, device/Bots Ready, renewal and recovery; no old-identity recovery claim.
- [ ] New immutable desktop/mobile builds and updater endpoint; same original updater signing key, normal TLS and full downloads/signature checks.
- [ ] Real phone history, image/file/download acceptance and TestFlight distribution; voice deferred.

## Completed

Fixed admin mount, closed callback allowlist and explicit bootstrap option are committed with regression coverage. Server switch and release acceptance remain open.

## Verification

Runbook: `dev-docs/cloud-migration-101-20261029.md`. Private receipts are under the project pointer's `output/cloud-migration-101-20261029/`; credentials, private keys, databases, logs and binaries are excluded from Git.

Initial full service test run retained its single old-link assertion failure; assertion now matches the intended alternate fallback and rejects the old AI4S admin link. Full rerun passed. The task-init gate was attempted after source edits and correctly reported dirty worktree; this record preserves the same verified base without destructive cleanup. A clean remote handoff gate must be checked after commit/push.

## Blockers and unknowns

Exact-source Linux CI artifact, independent review, remote main and actual server/phone acceptance remain pending. No missing old backup blocks the explicitly authorized fresh instance.

## Next step

Hand exact source to existing reviewers/CI owner, stage fresh private auth files on101, then publish only verified components. No production path or public website was switched at this checkpoint.
