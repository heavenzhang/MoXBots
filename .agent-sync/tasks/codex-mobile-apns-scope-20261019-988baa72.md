<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-apns-scope-20261019 -->
<!-- git-project-sync-task:base=a6e9f9c9b43603b647090827f4851ea4366f8766 -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-MOBILE-APNS-001: match the push provider to its actual key environment

## Objective and scope

Continue the original MOXBOTS-MOBILE-002 internal-trial goal. The installed iPhone has a development push entitlement, while the provider previously advertised both APNs environments whenever any APNs key was configured. Apple now supports environment- and topic-specific keys. A sandbox-scoped key must not make production registration appear available.

Reuse the existing optional provider, endpoint Store, source proof, AuthStore/DeviceStore, outbox and fixed Apple HTTPS origins. No new identity, execution owner, route or provider relay. Source scope: mobile_notification_delivery.rs and the existing notification runbook only, plus this task record/shared plan. No app/native-library inputs change; no phone reinstall is required for this source-only preparation.

## To Do List and completion criteria

- [x] Verify the user-confirmed Git URL, canonical main and clean isolated worktree; preserve all existing builds and identities.
- [x] Add strict sandbox/production/both scope, retaining legacy omitted-field behavior.
- [x] Restrict actual provider construction/endpoint admission; permit production-only configuration without FCM.
- [x] Add synthetic runtime/router registration regression and malformed-scope cases; document a matching internal-app configuration.
- [x] Run focused/full owned-service tests, strict Clippy and fmt; review actual combined changes.
- [ ] Commit/push, green CI and normal remote-main integration; verify remote ancestry.
- [ ] Real APNs credential acceptance, service publication, physical device delivery, background/tap/cold-start and approval recovery remain unaccepted.

## Verification

Final-source full service regression: 198 passed, 0 failed, 8 ignored, four test threads, 329.76s. Both new environment tests pass inside that full run; strict all-target Clippy and crate fmt pass. Logs remain outside Git at /tmp/moxbots-mobile-apns-scope-{service-tests,clippy,fmt}.log. Ignored manual fixtures/real-Dex opt-in are not counted as acceptance; the existing CI explicitly runs its real Dex step.

The provider tests use newly generated synthetic keys in private temporary files, the original service/Auth/Device/endpoint owners and real Axum registration requests; they do not send to Apple or capture audio. Root reviewed the final diff and independently verified results. Reused one bounded read-only unit (requested gpt-6-luna/medium; actual model/usage/cost unknown) found no blocking scope/startup/HTTP-admission/documentation issue. It did not run tests. No external model calls. Ordinary exact-head CI and main delivery remain required.

## Dependencies and real-state boundaries

The original password service source929b984e is already published by the sole cloud owner, with controlled existing-QA password/PKCE/principal/network/revocation acceptance. The actual iPhone's admin login/persistence/session list remains pending user input/device availability. This patch is not part of that running source. Notifications are currently unconfigured in production; no APNs key path has been verified, and the user confirmed no existing Firebase project. Do not infer that no key exists anywhere, create keys/projects, or enable providers from a sample configuration.

The existing cloud publication owner remains01a12b99-7b38-78b1-831f-9c60257d386a. Root owns this code/CI/main delivery, not production writes. Later real activation requires resolved authorized credentials/configuration and that owner's serialized backup/rollback window. No cloud, Host101, daily Mac or physical-phone mutation in this task. Full original goal remains open for real attachments, speech, notification/authorization recovery and daily-use acceptance.

## Next step

Normally commit/push, obtain exact-head CI and main delivery, then hand off the precise source separately from credential activation and physical-device acceptance. Do not re-run accepted local tests without a new change/failure/concern.
