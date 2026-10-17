<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-connection-002-20261018 -->
<!-- git-project-sync-task:base=54456225412e892a6ad15704cdf6dc4acffce8e1 -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-MOBILE-002 — Native account and relay connection owner

## Objective and scope

Implement only `mobile/connection/**`: actual owned account PKCE/session validation, account-scoped device identity and enrollment, HTTPS directory, verified WSS control connection and shared mobile SDK session transport. Parent owns native OS storage, UI, Host extensions, integration/main and releases. No real credentials, account mutations, production deployment or external dispatch occurred in this worker.

## Acceptance criteria

- [x] Read project map/plan, vendored sync skill, task record and source; parent-confirmed start/task-init gates PASS for explicit repository https://github.com/heavenzhang/MoXBots.git.
- [x] Original account/login/identity/JWT/transport/policy/admission modules reused without policy fork; unavailable official account adapter cannot capture desktop credentials.
- [x] Native C ABI and bounded generic encrypted-store callbacks; key conflict/readback protection; closed JS intent and safe reply projections.
- [x] Real HTTPS PKCE + validated session + persisted account, per-account/device identity, consumed enrollment grant, original hello/catalog/policy/ready handshake and same-account directory.
- [x] SDK inner TLS/controller with validated relay direction, native durable prepare/commit, bounded UNKNOWN journal and confirmed markers, fresh approval snapshot and scoped receipt lookup.
- [x] Foreground connection suspension preserves remote Host execution; unknown operations never automatically resent.
- [x] Original parity and native owner tests, credential-free loopback HTTP, actual pinned TLS WSS upgrade and foreign-CA rejection.
- [x] Raw C JSON validates original typed DTOs before normalization, preserving duplicate/unknown-field rejection; same-device/agent opaque catalog IDs survive refresh, removed targets are revoked, and metadata-only directory snapshots close their unpumped idle WSS epoch.
- [ ] Parent independent integration review, iOS/Android target build and true native OS store acceptance.
- [ ] Authorized real account/device/Host session acceptance; not proven by synthetic tests.
- [ ] Parent remote main integration/push and release, outside this worker's authority.

## Completed

Native account/session stage delivered in 9213d172 + 2cbb86a1 and pushed by parent. This stage adds versioned assets through ONE retained combined channel; parent owns native pickers, file IO, Host dispatch, UI and production. Parent revised the separate-transport proposal after source inspection proved one outer/device and one channel/pair. Existing session DTOs remain unchanged.

- [x] One retained combined outer/TLS/SDK owner, asset capabilities negotiation, exact account/target/agent/epoch fence; routine directory refresh preserves a healthy owner.
- [x] Whole asset RPC bounded to 8 seconds, one 24-KiB chunk, 64-KiB TLS payload/256-KiB credit bound, explicit status recovery after ambiguous upload effects.
- [x] Suspend/logout/policy/transport invalidation, closed raw asset intents and regression verification; original crypto-ready relay announcement restored.

## Dependencies

Parent shared crypto native-store feature commit c795947a (local cherry-pick eeb9d704). SDK commits f7d36a40, 043bcfc1, d9c48fa1, a120276d were cherry-picked locally only to compile and validate; parent should integrate those from the SDK worker and cherry-pick only this worker's own connection commit. Link only the connection static archive; it includes its core dependency. Header: `mobile/connection/include/mox_connection.h`. Asset dependencies: bdae87ac, 93f03803, d8899836 and b13b4ae0 were cherry-picked as approved shared dependencies; do not duplicate their changes when integrating this worker's final commit.

## Verification

`cargo test --manifest-path mobile/connection/Cargo.toml --locked --lib`: 72 passed. `cargo clippy --manifest-path mobile/connection/Cargo.toml --locked --all-targets -- -D warnings`: passed. Shared core locked tests independently rerun: 32 passed, including real encrypted interleaving. Cargo.lock contains only rustls-platform-verifier 0.6.2 and Android verifier artifact 0.1.1. C header ABI is unchanged. README records source ownership, callback contracts, limits and real-device gates. No package installation, real user login/enrollment, model call, live Host effect, main merge, push or deployment was performed. Requested versus runtime-confirmed model/time/token usage remains unknown.

## Blockers and unknowns

Actual device/Host acceptance remains parent-owned. Resume gate PASS at parent-pushed eeb6691b after correcting the earlier task record headings/status. Full native owned-account → actual relay → actual Host file transfer is not proven by the synthetic HTTP/WSS and SDK TLS tests. The earlier native session implementation omitted the required crypto-ready channel announcement; this stage corrects it, and the old source must not be packaged as a validated mobile connection. Xcode license was not accepted by this worker; per-command CLT selection was used without changing global configuration.

## Next step

Parent cherry-picks only the final owned connection commit after the accepted combined SDK dependencies, rebuilds the actual Android/iOS native library, integrates bounded native file IO, and completes authorized real account/Host acceptance.
