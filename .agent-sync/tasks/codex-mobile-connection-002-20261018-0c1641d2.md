<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-connection-002-20261018 -->
<!-- git-project-sync-task:base=54456225412e892a6ad15704cdf6dc4acffce8e1 -->
<!-- git-project-sync-task:status=review-ready -->

# MOXBOTS-MOBILE-002 — Native account and relay connection owner

## Objective and scope

Implement only `mobile/connection/**`: actual owned account PKCE/session validation, account-scoped device identity and enrollment, HTTPS directory, verified WSS control connection and shared mobile SDK session transport. Parent owns native OS storage, UI, Host extensions, integration/main and releases. No real credentials, account mutations, production deployment or external dispatch occurred in this worker.

## Acceptance and status

- [x] Read project map/plan, vendored sync skill, task record and source; parent-confirmed start/task-init gates PASS for explicit repository https://github.com/heavenzhang/MoXBots.git.
- [x] Original account/login/identity/JWT/transport/policy/admission modules reused without policy fork; unavailable official account adapter cannot capture desktop credentials.
- [x] Native C ABI and bounded generic encrypted-store callbacks; key conflict/readback protection; closed JS intent and safe reply projections.
- [x] Real HTTPS PKCE + validated session + persisted account, per-account/device identity, consumed enrollment grant, original hello/catalog/policy/ready handshake and same-account directory.
- [x] SDK inner TLS/controller with validated relay direction, native durable prepare/commit, bounded UNKNOWN journal and confirmed markers, fresh approval snapshot and scoped receipt lookup.
- [x] Foreground connection suspension preserves remote Host execution; unknown operations never automatically resent.
- [x] Original parity and native owner tests, credential-free loopback HTTP, actual pinned TLS WSS upgrade and foreign-CA rejection.
- [x] Raw C JSON validates original typed DTOs before normalization, preserving duplicate/unknown-field rejection; same-device/agent opaque catalog IDs survive refresh, removed targets are revoked, and directory snapshots close their unpumped idle WSS epoch.
- [ ] Parent independent integration review, iOS/Android target build and true native OS store acceptance.
- [ ] Authorized real account/device/Host session acceptance; not proven by synthetic tests.
- [ ] Parent remote main integration/push and release, outside this worker's authority.

## Dependencies

Parent shared crypto native-store feature commit c795947a (local cherry-pick eeb9d704). SDK commits f7d36a40, 043bcfc1, d9c48fa1, a120276d were cherry-picked locally only to compile and validate; parent should integrate those from the SDK worker and cherry-pick only this worker's own connection commit. Link only the connection static archive; it includes its core dependency. Header: `mobile/connection/include/mox_connection.h`.

## Verification and limitations

`cargo test --manifest-path mobile/connection/Cargo.toml --locked --lib`: 66 passed. `cargo clippy --manifest-path mobile/connection/Cargo.toml --locked --all-targets -- -D warnings`: passed. C header syntax checked with clang. README records source ownership, callback contracts, limits and real-device gates. No package installation, real user login/enrollment, model call, live Host effect, main merge, push or deployment was performed. Requested versus runtime-confirmed model/time/token usage remains unknown.

## Next step

Parent cherry-picks the connection commit after accepted SDK dependencies, reruns locked tests, checks Swift/JNI bindings against the header, and completes native build and authorized device acceptance before claiming a usable installed mobile app.
