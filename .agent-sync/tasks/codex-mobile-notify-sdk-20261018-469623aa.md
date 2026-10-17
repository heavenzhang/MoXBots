<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-notify-sdk-20261018 -->
<!-- git-project-sync-task:base=9269dd8c52c423a180bfba366c8f0434a90db005 -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-MOBILE-NOTIFY-SDK — scoped native notification registration and safe open

## Objective

Implement native notification registration/state/revocation and read-only event
opening. Own connection src/Cargo files and the approved narrow OwnedClient HTTP
adapter only. Root owns Expo/native UI, permission/token acquisition, service/core
integration, provider delivery, main, builds and production. No new executor,
notification WSS, crypto/protocol/vendor change or real credential access.

## Acceptance criteria

- [x] Explicit remote https://github.com/heavenzhang/MoXBots.git, actual canonical main 9269dd8c and clean isolated worktree verified; start/task-init PASS. Normal merge of root 1f8262cb was a fast-forward dependency integration. Root should select only the subsequent owned source commit.
- [x] Closed intents: notification.register/refresh {version:1,provider,token}, notification.status/disable {version:1}, notification.open {version:1,eventId}. installationId is native-only and rejected from JS. Providers are fcm/apns-sandbox/apns-production; token is 1–4096 UTF-8 bytes and rejects controls. eventId is canonical UUID. Raw unknown/duplicate fields remain rejected.
- [x] Stable installation UUID lives in native OS records, serialized across handles in-process and readback-confirmed before use. It survives logout. Endpoint record scope includes configured issuer, service/environment/network/principal/login device and digest of full security metadata (cosmetic instance name excluded). Original native account record format is unchanged. No push token, bearer, key, provider credentials or cloud pointer is persisted by this feature.
- [x] Register persists a token-free unconfirmed reservation before HTTP; the same installation/provider can explicitly recover/rotate a token. Enabled is returned only after strict HTTP response and exact native record readback. Status validates loaded/restored account and record binding, does not project endpoint/device/installation IDs, and never converts expired account to fake disabled.
- [x] Automatic notification.refresh only rotates an already-enabled endpoint under the current loaded complete native scope and same provider. It cannot restore an account from disk, create an installation/reservation for missing/disabled/unconfirmed state, or re-enable after a queued disable or same-principal new-login scope change. Explicit register retains user-driven enable/recovery semantics.
- [x] Disable persists unconfirmed before DELETE; failure retains endpoint for explicit retry and reports a stable error. Disabled requires no registration or a confirmed revocation plus durable local state. Provider switches first revoke the known prior registration rather than silently orphaning it.
- [x] Logout attempts bounded 5-second notification revocation, always continues original AuthStore logout and local account clear, clears current account endpoint state, preserves installation UUID and returns remote uncertainty honestly. The configured origin is revalidated even for expired-bearer logout; disk metadata cannot select a foreign bearer recipient.
- [x] Open is read-only redeem → existing fresh targets.list flow → current native catalog target/identity/Agent match. Session and pointer fields are strictly validated. No automatic Host/session mutation, no new channel/outer owner, no seen ledger, no consumption reservation. Same-event explicit retries/reopening remain permitted; existing operation UUID/journal owns mutations.
- [x] Original OwnedClient pinned TLS/no redirects/no automatic retry/sensitive bearer/strict no-store bounded HTTP reused through fixed routes only. Notification request and response bodies are each bounded to 8 KiB. Unmounted plain 404 maps to MOBILE_NOTIFICATIONS_UNAVAILABLE before optional-route JSON/cache-header handling, never enabled.
- [x] Full locked connection suite: 104 passed, no ignored/filtered; final all-targets clippy -D warnings and git diff --check PASS.
- [ ] Root native/API integration and real provider permission/token/delivery/background/open acceptance, service source authorization, main/release delivery remain unproven.

## Completed

New notifications.rs owns only this native record lifecycle and safe projections.
The targets.list branch was extracted unchanged to refresh_targets so event
opening must use the existing fresh directory authority rather than a cloud
pointer or local cached selection. No notification execution/session API was
introduced. Replies are exactly {kind:'notification',state:'disabled'|'enabled'|
'unconfirmed',provider:enum|null,errorCode:uppercase|null} and
{kind:'notification-open',targetId,identityKey,agentId,sessionId}; errors use the
existing closed error envelope.

## Verification

- `cargo test --manifest-path mobile/connection/Cargo.toml --locked --lib`: **104 passed**, 0 failed/ignored/filtered, final run 1.09s. Complete synthetic log: `/tmp/moxbots-mobile-notify-sdk-20261018-tests.log`.
- `cargo clippy --manifest-path mobile/connection/Cargo.toml --locked --all-targets -- -D warnings`: PASS. Build artifacts reused via per-command CARGO_TARGET_DIR; no cargo clean or global configuration.
- Real loopback pinned TLS HTTP plus native C callback records verify register/token rotation, actual cold discovery + authenticated account restoration, restart state, cross-account isolation, pre-HTTP reservation, post-HTTP write loss/readback, expiry/cancellation/forged logout origin, missing service, strict response limits/no-store/no redirect/no retry, enabled-only automatic refresh, late callback after disable, missing/unconfirmed no-HTTP behavior, same-principal login-scope changes, revoke failure with same-endpoint explicit retry, logout continuing through notification failure, fresh-directory failure rejecting stale pointers, safe explicit event retry, and target/Agent/account revocation mapping. No real push delivery tested.
- No app/native module changes, package installation, real OS credential reads, model calls, Gradle/Xcode, live account mutations or production actions.

## Frozen reader closure evidence

The approved owned_login.rs adapter is outside the reader closure. The actual
compute function enumerates only rust-toolchain.toml, src-tauri/agent-network-crypto,
src-tauri/agent-network-protocol and vendor/agent-network-protocol. None changed.
The worker and root trees both compute
`13adb414091cb5b6b2d17440c9535d904b5c50e45a4a49ada8236335d60927b9`.
Both differ from the existing release lock's `d653fc71...`; this baseline mismatch
is an unknown owned by root's reader packaging/CI review, not a repaired pin or
validated reader release. Machine-readable comparison:
`/tmp/moxbots-mobile-notify-sdk-20261018-reader-closure.log`.
Exact compute invocation used from this worktree:

```sh
node --input-type=module -e 'import{computeSourceInputSha256}from"./scripts/prepare-moxbot-credential-reader.mjs";process.stdout.write(computeSourceInputSha256(process.cwd())+"\n")'
```

The same exported function was also invoked with the absolute root worktree
`/Users/zhangshaohua/Documents/Codex/2026-10-18/moxbots-mobile-002` and yielded the
same digest. No frozen source or reader lock/artifact was modified.

## Blockers and unknowns

Parent was notified of a server/core recovery gap in this dependency baseline:
revoke_endpoint currently treats a repeated DELETE after prior revocation as
NotFound/401. SDK never interprets 401 as disabled. Service/core must safely
acknowledge an already-revoked endpoint only under the exact current authority,
so a lost DELETE ACK or local confirmation can be explicitly retried. Native tests
model this safe intended retry contract; the service/core implementation and its
real-store regression belong to root/server worker.

The service adapter remains optional/unmounted by this SDK change. Real source
ownership and provider delivery gates are still open. Logs under /tmp are local
reproduction evidence, not durable Git artifacts. Requested versus runtime model,
token usage and monetary cost remain unknown.

## Next step

Root integrates only the owned SDK source commit, confirms idempotent authorized
DELETE/no-store service semantics, rebuilds native archives and accepts Expo token
permission/status/open UI against authorized actual devices. Retain the actual
provider/source/production gates until those paths are proven.
