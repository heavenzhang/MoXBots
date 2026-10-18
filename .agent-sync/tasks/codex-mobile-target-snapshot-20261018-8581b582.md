<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-target-snapshot-20261018 -->
<!-- git-project-sync-task:base=9269dd8c52c423a180bfba366c8f0434a90db005 -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-MOBILE-TARGET-SNAPSHOT — local artifact target lookup

## Objective

Avoid directory HTTP per local artifact status/pause/remove operation. Own only
connection runtime/FFI/tests and the two native module artifact helpers. Root owns
app TS, Provider/cache, native builds, integration/main and real-device acceptance.
No Host/backend, frozen crypto/protocol/vendor or account data changes.

## Acceptance criteria

- [x] Explicit remote https://github.com/heavenzhang/MoXBots.git verified. Actual fetched canonical main advanced from 400b to 9269dd8c; root informed. New isolated worktree start/task-init gates PASS at that current canonical SHA.
- [x] Normal dependency merge of root 82933ecd is 9a08f4db, without conflicts. Root must cherry-pick only subsequent source implementation commit, not dependency merge.
- [x] Closed parameterless targets.snapshot calls the existing saved target authority's local ensure_current and checks current active/account/trust/session binding. It never restore/connect/renews, reads disk credentials or performs HTTP. Missing registry authority returns MOBILE_TARGET_SNAPSHOT_UNAVAILABLE; invalid binding/expiry fails closed.
- [x] Snapshot projects only existing registry entries as {kind:'targets',items:[{targetId,identityKey,agentId}]}. It cannot mint a target or authorize execution. Successful normal directory queries retain the authenticated account authority; existing cancel/logout/suspend/policy/failed-directory clear paths clear both registry and authority.
- [x] Android/iOS artifact.status/pause/remove use the snapshot through currentArtifactTarget(kind); artifact.list/download/preview/share continue fresh targets.list. Existing validateTargets and presentation/scope gates remain intact.
- [x] Tests cover 20 warm local queries without client/socket creation, cold/missing-cache refusal, account/active/trust/expiry/guard changes, suspend/logout, strict raw FFI parsing and both native helper source contracts.
- [x] Parent-authorized minimal WSS fixture correction preserves actual foreign-CA rejection, adds a 15-second whole-fixture deadline and task shutdown/reap, and reuses the proven-reachable loopback listener so a generic client connection error cannot masquerade as a TLS rejection.
- [ ] Root native instrumented checks, NDK rebuild, device/Host acceptance and main/release integration remain parent-owned; not claimed here.

## Completed

The earlier artifact helper refreshed Devices/Catalog on every local status row.
Only three local metadata/cache operations now use already approved current-account
registry entries. Fresh listing, download and presentation permission checks retain
their original network path. No new cache or identity authority was introduced.

## Verification

- Locked connection lib suite: **90 passed**, 0 failed/ignored/filtered, 1.27s final run. Full reusable local log: `/tmp/moxbots-target-snapshot-20261018-tests.log` (synthetic, not a durable Git artifact).
- Connection all-targets clippy with `-D warnings`: PASS; git diff --check: PASS.
- App `npm run typecheck` and `npm run lint`: PASS using existing root dependency installation via a temporary link, removed after checks. No dependency installation/lock change.
- Initial full suite had 89 completed and the old WSS foreign-root server waiting unbounded for TCP; the process was terminated and was not counted as PASS. Isolated original WSS passed; the tightened fixture then passed in the complete 90-case run. At the stalled sample, lsof showed the valid-phase socket closed and the foreign-phase socket only LISTEN. This records observed evidence, not a proven generic root cause.
- Native helper source contracts are static checks, not native execution proof. No Gradle, Xcode, real credentials, production/model calls or runtime configuration changes performed.

## Blockers and unknowns

No implementation blocker remains. Root owns actual native builds/tests, device
acceptance and main delivery. Requested versus runtime-confirmed model, token and
monetary usage are unavailable.

## Next step

Root cherry-picks only the source implementation commit after 9a08f4db onto its
integration branch, reruns its native instrumented suite and NDK archive build,
and validates local artifact status restoration without repeated directory HTTP.
