<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-sdk-002-20261018 -->
<!-- git-project-sync-task:base=5f9df60445fdb3b5a4271c28eeecbbcc7f6fa1f0 -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-MOBILE-002 — portable encrypted controller core

## Objective and ownership

Current SDK worker owns `mobile/core/**` and this task record. Parent owns native
bridges, login/transport integration, Host extensions, final integration and release.
No production operations or push/main merge performed by this worker. Shared native
crypto key adapter from parent c795947a is locally cherry-picked as 3e0c6f9c.

## Acceptance criteria / To Do

- [x] Independent Rust 1.92 core produces staticlib/cdylib/rlib; no desktop OS store.
- [x] Reuse exact shared crypto, JOSE verifier and encrypted Channel implementation.
- [x] Scoped native provisioning, exact v1 remote-session types and strict ABI allowlist.
- [x] Prepare/durable-native-journal/commit boundary and UNKNOWN receipt-only recovery.
- [x] Actual encrypted controller-to-existing-Host-channel interoperability tests.
- [x] Wrong account/issuer/service/device/key generation, target/replay and closed intent tests.
- [x] Final focused ABI tests, clippy -D warnings and macOS host release build.
- [ ] Android cross-build/link and real device tests; NDK license authorization pending parent.
- [ ] iOS cross-build/link and real device tests; Apple iOS SDK not currently available.
- [ ] Integrated native login/WSS/SessionEngine/notification/file/voice acceptance (parent).
- [ ] Main / remote delivery and production release (parent; outside worker authority).

## Implemented

`mobile/core/include/mox_mobile.h` is the native ABI contract; buffers include status,
length and owned data. `src/agent_network.rs` adapts a native pinned trust snapshot to
the original JWT verifier and imports original channel by path. `src/lib.rs` verifies
bootstrap/DPoP/local and target binding/certificates, enforces immutable scoped journal
records, and matches authenticated responses to exact request scope/method. `src/ffi.rs`
provides bounded native-only ABI, sanitized errors and owned-buffer disposal.

Native must prove secure durable writes before commit and supply authenticated issuer
trust; constructor/commit/feed/recover are never JavaScript APIs. Every new handle
requires a fresh authenticated relay connection epoch. Trust expires within 300 seconds
and at earlier credential deadlines; suspend/invalid feed permanently ends handle.
No HTTP/WSS/login/attachment/ASR/notification implementation is claimed by this crate.
No fake completion, automatic resend, or protocol changes to existing v1.

## Verification

- `cargo test --manifest-path mobile/core/Cargo.toml --locked --no-fail-fast`: 22 passed
  before final extra ABI/scope checks (latest final run will follow).
- Tests use synthetic keys and real TLS between the SDK and existing Host channel,
  plus original replay/nonce/role/hello/JOSE regression suite. No external services.
- Final focused run after relay-credit follow-up: 25 tests passed; clippy all-targets
  with -D warnings passed. macOS host release build passed before credit follow-up;
  incremental final release build is running.
- `cargo check --manifest-path mobile/core/Cargo.toml --locked --target aarch64-apple-ios`:
  failed at ring C build because `xcrun` cannot locate `iphoneos` SDK. This is a real
  environment failure, not successful native portability validation.
- Initial clippy diagnosed shared original channel constructor arity; import preserves
  original signatures using same targeted allowance as headless-network.

## Blockers and next step

Parent integrates this local branch/commit and connects native account/WSS owner.
Worker finishes final command outcomes and appends follow-up record. Android license
prompt needs the user's answer; Apple SDK absence prevents native iOS validation.
Local only — not synchronized to remote; parent is sole integration/push owner.

## Relay flow-control follow-up

Connection integration identified the outer cumulative credit policy, separate from
TLS channel sequence enforcement. Core now exposes native-only `relay_credit` and
`take_received_credit` (and C equivalents), validates original strict credit sequence
and cumulative byte constraints, and withholds drain at protocol channel/socket
windows. Duplicate/oversized grants close the handle. Actual feed bytes are credited
only after successful validation. Focused window/duplicate/release tests passed.
