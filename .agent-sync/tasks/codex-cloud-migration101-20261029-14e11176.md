<!-- git-project-sync-task:source-digest=30d0f8eae5bba30a834949602895d52728142091f1761730194f6566fc16d624 -->
<!-- git-project-sync-task:id=7280d13c-1a3b-43de-a96e-a8606780f9b0 -->
<!-- git-project-sync-task:version=2 -->
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
- [x] Fresh private101 cloud/Dex deployed with normal TLS, backup/ownership rollback and protected unrelated routes.
- [ ] Real login, new instance trust, device/Bots Ready, renewal and recovery; no old-identity recovery claim.
- [ ] New immutable desktop/mobile builds and updater endpoint; same original updater signing key, normal TLS and full downloads/signature checks.
- [ ] Real phone history, image/file/download acceptance and TestFlight distribution; voice deferred.

## Completed

Fixed admin mount, closed callback allowlist and explicit bootstrap option are committed with regression coverage. Server switch and release acceptance remain open.

## Verification

- Source digest: `30d0f8eae5bba30a834949602895d52728142091f1761730194f6566fc16d624`; Actual101 duplicate-proxy-header repro and minimal fix: public401 plus authenticated WSS Ready and11route regression PASS. Controller regression red HOST_MANAGEMENT_RESPONSE_INVALID then green. Protocol31 and strictclippy PASS; headless225 PASS2existingignored; mobilecore42 PASS; scopedrustfmt anddiffcheck PASS. Headless strictclippy fails unchanged connector.rs handle_management_events 8/7 arguments; no suppression. Main/sharedCI/exactpatchedLinuxartifact and physicalphone/file/TestFlight remain pending solepublisher.

Runbook: `dev-docs/cloud-migration-101-20261029.md`. Private receipts are under the project pointer's `output/cloud-migration-101-20261029/`; credentials, private keys, databases, logs and binaries are excluded from Git.

Initial full service test run retained its single old-link assertion failure; assertion now matches the intended alternate fallback and rejects the old AI4S admin link. Full rerun passed. The task-init gate was attempted after source edits and correctly reported dirty worktree; this record preserves the same verified base without destructive cleanup. A clean remote handoff gate must be checked after commit/push.

## Blockers and unknowns

Exact-source Linux CI artifact, independent review, remote main and actual server/phone acceptance remain pending. No missing old backup blocks the explicitly authorized fresh instance.

## Mobile101 next immutable build

iOS/Android generated service origin and native fallbacks now point to101. The existing origin-scoped credential owners remain unchanged; old140 account records are not rewritten into new trust. iOS build6 is reserved for this new immutable artifact; build5 remains untouched. Initial pre-main-sync mobile policy78 passed. After merging775da22c main,84policy/typecheck/lint and actual Expo platform declarations passed. Both native slices/archive, original development signing/profile, CRC239 and strict signature passed. Kevin iPhone actual0.1.0/6 install/readback/launch passed; the human confirmed Kevin entered the Sessionlist. Message/file/HostReady paths and TestFlight remain separate.

## Next step

Hand exact source to existing reviewers/CI owner, stage fresh private auth files on101, then publish only verified components. No production path or public website was switched at this checkpoint.

## Deployment and phone checkpoint 2026-10-29

See `dev-docs/cloud-migration-101-20261029-acceptance.md`. Linux producer39ee13cc7 passed dedicated CI40734899841 including realDex and is running on101. Mobile producer1a6593d4d is frozen and actually installed; later receipt-only commits do not replace its artifact identity. Website33files published under /moxbots with all download entries preparing. Human explicitly deferred disabled Work browser UI. Originalmain/combinedCI/desktop/updater owner handles protected integration and new signed desktop artifact; no finished-main or TestFlight claim.

## MOXBOTS-MOBILE-REPLY-MATCH-20261029

Actual isolated101 QA found two distinct faults after the human confirmed phone login. The `/v1/` proxy duplicated `X-Forwarded-Proto`; removing only that duplicate changed public WebSocket preflight400 to expected401 and the saved-account QA Host reached real WSS/Node Ready. Original101 identity/configuration and existing services remain preserved. A separate same-account controlled peer then passed scoped Host inspection and legacy Session capabilities, while both mobile and asset capability calls failed with `HOST_MANAGEMENT_RESPONSE_INVALID`. The shared controller's response matcher has no branches for those two existing protocol families.

- [x] Preserve actual failed/positive wire evidence and fetch current main775da22c before source changes.
- [x] Add a regression that reproduces legal extension responses being rejected.
- [x] Add strict method/request/result correlation for mobile and asset DTOs; retain device, request, Agent, operation, Session and transfer bounds.
- [x] Run protocol31, headless225 (2 existing ignored), mobile core42 regressions and protocol strict clippy. Retain the existing headless strict-clippy eight-argument warning as an open baseline failure; no exemption added.
- [ ] Commit/push exact scoped source and hand off to the existing sole CI/main publisher; do not replace its frozen desktop candidate or trigger shared CI here.
- [ ] Obtain exact patched artifact, verify real wire send/history/upload/download and coordinate physical iPhone acceptance after reconnect. TestFlight and voice boundaries remain separate.

Private evidence/controlled fixtures: project pointer `output/cloud-migration-101-20261029/qa-host/`. New QA Host/controller identities belong only to the approved isolated test environment. No original Host identity, key or configuration is copied into them; no external model inference is authorized by the controlled fixture.

Scope clarification: this repair affects the headless/desktop acceptance controller. The existing mobile/core reply matcher was verified separately and its42 tests pass. Do not infer the same fault in the installed phone or reinstall it only for this repair. The phone already has human-confirmed build6 login.
