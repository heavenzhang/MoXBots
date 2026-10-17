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

## Completed

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
- Final focused run after relay-credit follow-up: 27 tests passed; clippy all-targets
  with -D warnings passed. final macOS host release build passed, including all crate types.
- `cargo check --manifest-path mobile/core/Cargo.toml --locked --target aarch64-apple-ios`:
  failed at ring C build because `xcrun` cannot locate `iphoneos` SDK. This is a real
  environment failure, not successful native portability validation.
- Initial clippy diagnosed shared original channel constructor arity; import preserves
  original signatures using same targeted allowance as headless-network.

## Blockers and unknowns

Parent integrates this local branch/commit and connects native account/WSS owner.
Final worker test, lint, release and dynamic C ABI checks passed; native gates remain open. Android license
prompt needs the user's answer; Apple SDK absence prevents native iOS validation.
Local only — not synchronized to remote; parent is sole integration/push owner.

## Relay flow-control follow-up

Connection integration identified the outer cumulative credit policy, separate from
TLS channel sequence enforcement. Core now exposes native-only `relay_credit` and
`take_received_credit` (and C equivalents), validates original strict credit sequence
and cumulative byte constraints, and withholds drain at protocol channel/socket
windows. Duplicate/oversized grants close the handle. Actual feed bytes are credited
only after successful validation. Focused window/duplicate/release tests passed.

## Final worker acceptance

- 27/27 Rust tests passed; clippy `--all-targets -- -D warnings` passed; release build passed.
- Release dylib loaded through actual C ABI using ctypes: 8 exports present, 24-byte
  buffer layout, sanitized constructor failure and owned-buffer free passed.
- Native config `tlsInitiator` must reflect the validated Offer initiator, independent
  of Controller management role. Dedicated deterministic responder TLS test passed.
- iOS actual cross-check failed solely at missing `iphoneos` SDK; Android NDK license
  authorization remains with parent. Neither platform native SDK acceptance is claimed.
- No remote push, main integration or production release performed by worker.

## Confirmed receipt and capacity boundary

Authenticated matching Accepted/Rejected receipts clear operation bodies from the
active 128-record journal and retain bounded UUID tombstones (4096 per auth epoch).
The UI unknown list now reflects actual uncertain operations. Tombstones continue
to block resend of a confirmed UUID; NotFound/Unconfirmed/Processing never grant
replay or remove unknown records. Actual encrypted NotFound→explicit receipt query→
Accepted test and full 128-record capacity recovery test passed. Connection owner
confirmed persistent native markers survive key rotation/new handles and prune only
confirmed full bodies; unknown full records remain on disk. Final 27 tests, clippy
and host release passed after this change.

## Next step

Continue MOXBOTS-MOBILE-002 versioned asset extension in this branch. Parent owns
remote publication needed by the resume gate; worker does not push or merge.
New ownership: mobile/core, mobile/asset-store, remote_assets.rs plus necessary
management codec additions, shared remoteAssets.ts and parity fixtures/tests.
Original session.remote v1 and outer vendored public protocol remain unchanged.
Pure store receives authenticated native scope; parent wires actual Host/runtime.
Android NDK is now authorized and installing/being validated by parent; historical
license blocker above is resolved. iOS SDK/system-admin setup remains parent-owned.

## Asset extension — contract and encrypted controller

- Resume gate passed against remote bdae87ac and verified canonical URL/base.
- Added closed owned method session.assets.v1, versioned bounded request/result
  types and Rust/Zod shared valid/invalid fixtures. Public vendored network and
  original remote_session.rs / remoteSession.ts remain unchanged.
- Assets uses a separate native profile/channel, authenticated capabilities
  before data, one Agent binding and typed request/result correlation. File bytes
  and labels are redacted from new protocol Debug projections.
- Core 29 tests passed, including encrypted 24KiB asset RPC and foreign-agent
  response closure. Management codec 26 tests passed; focused new+legacy Vitest
  fixtures passed with existing Zod 4.1.12 dependencies. No Host path claimed.
- Store implementation/tests are staged separately next; native integration is
  still parent-owned. Android native rebuild with this extension is not yet run.

## Asset extension — native scoped storage

- Added standalone mobile/asset-store with capability-relative no-follow I/O and
  process-shared filesystem reservation lock. Native AssetScope is never RPC input.
- Real durable sequential chunks, exact duplicates, restart hash validation and
  unacknowledged-tail truncation; finish validates exact size and full SHA256.
- Scoped 8-active/160MiB and global 1GiB bounds, bounded metadata counts, explicit
  TTL/cancel cleanup, cancelled-crash retained-byte accounting, ready leases, and
  trusted output-owner artifact copying/list/read. No executor or transcript scan.
- Ten real TempDir tests passed and clippy all-targets -D warnings passed.
- Remaining platform gates: Linux/Windows native filesystem acceptance, actual Host
  dispatcher/session admission, UI/native upload and preview, and Android/iOS fresh
  extension builds. Worker does not claim these from pure store or TLS fixtures.
- Parent must keep output registration rooted in the real transcript owner and
  retain ready leases through SessionEngine attachment admission/consumption.

## Asset extension — final parity check

Final required-nextBefore-nullability fixture fixed a Rust Option default that
would accept an omitted field rejected by Zod. New+legacy Vitest fixtures passed;
management codec 26, core 29 and asset store 10 tests all passed on final sources.
Protocol/core/store strict clippy passed. Final Rust linking explicitly selected
previously installed CommandLineTools for macOS because the newly active Xcode
SDK license prompt blocks default tools; no unlicensed Xcode/iOS SDK was used.
Parent retains the system license flow and actual Android/iOS/Host integration.

## Combined owner — actual relay constraint correction

The actual relay replaces an existing WSS for the same device (relay_controller.rs
hello connection ownership) and rejects a second same-pair channel with
CHANNEL_PAIR_EXISTS (relay_recovery_tests.rs actual_same_pair_open_race...). This
supersedes the earlier separate-channel asset proposal; no cloud behavior changes.

- [x] Resume gate passed against d8899836 after authorized SDK feature-branch push.
- [x] Native-only profile combined permits exactly the original two closed methods;
  default Session and explicit Assets restrictions remain intact.
- [x] One MobileClient/Channel/PairSequences/pending map/credit lifecycle is retained
  across mixed methods; no second socket or identity is created by SDK changes.
- [x] Core binds a single Agent on first valid session/asset/recovered record;
  mixed/foreign recovery is atomic and fails without journal/binding mutation.
- [x] Actual TLS tests cover capabilities→upload→session read→journalled mutation→
  asset continuation, reversed mixed responses, continuous original peer sequence
  acceptance, cross-Agent/profile rejection, and receipt-only recovered effects.
- [x] Core 32 tests, all-targets clippy -D warnings and release build passed on
  existing CLT macOS tools. No iOS SDK license acceptance or build was attempted.
- [ ] Parent native connection/actual relay single-owner integration and native
  platform acceptance remain outside this worker's claim.

Connection owner was informed: choose profile combined at construction, restore
only that Agent's unknown journal BEFORE any RPC/capabilities, then keep the same
SDK and outer connection epoch throughout. No public DTO or v1 wire edits.
