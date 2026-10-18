# Controlled native C ABI caller probe

Task MOXBOTS-MOBILE-002 / mobile-full-e2e-002. This optional fixture uses the original `mox_connection_new`, `mox_connection_request`, `mox_connection_buffer_free` and `mox_connection_free` in one explicitly configured 512 KiB `std::thread` caller. The normal --ffi gate now compiles the mobile test binary with --release, matching the Rust packaging profile. --ffi-debug preserves a separate adverse unoptimized probe. Neither measures an iPhone default stack.

```sh
source /tmp/moxbots-mobile-toolchain-002.zsh
MOXBOTS_FULL_MOBILE_TARGET=/tmp/moxbots-full-e2e-build-mobile node scripts/verify-mobile-full-host-e2e.mjs --ffi
```

The same original encrypted fixture Store is exposed only through the existing C store callbacks. Its context lives through handle free. The raw handle and its local release guard remain on the caller thread; no test `unsafe Send/Sync` implementation is introduced. Owned JSON and oneshot replies cross a standard command channel. C ABI new creates its original product runtime; the orchestration runtime does not enter or block_on that runtime.

The shared existing text flow drives actual login completion, default-disabled directory, explicit revision-checked synthetic-user mount grant, actual targets, encrypted start, accepted receipt, original Session snapshot terminal, native duplicate-intent rejection and read-only receipt recovery. The sole added ffi.rs entry is cfg(test) Rust-only borrowing of the same handle's owner/runtime for the pre-existing mount fixture helpers; product ABI, closed intent surface, grants and default exposure are unchanged. The Node fixture remains text mode. Assets/default runner modes are separate gates.

The existing 130s inner and 150s outer bounds remain. Nonzero/signal/deadline cleanup records and verifies exact PID birth before signalling. Private fixture artifacts and the first runner log stay outside Git; summaries must not contain credentials or local database contents.

## To Do List

- [x] Verify authorized URL, clean assigned worktree and normal merge of root scheduling dependency 504efe57.
- [x] Implement bounded C ABI mode and source static checks.
- [ ] First actual controlled probe result and independent post-exit PID/port check.
- [ ] Primary independent source review and acceptance.

No physical phone, Keychain/Keystore, push, real ASR, production service or daily-use readiness is established by this probe. Production fixes, main integration and release are outside this worker's scope.

## First build observation

The first runner stopped before executing any fixture: Cargo's shared temporary target reused mobile-core artifacts built under the root worktree while the current direct protocol dependency came from this worktree, yielding ten same-name/different-source-path Rust type mismatches. No native caller/fixture process was started, and no product failure is inferred. Root independently reviewed the test-only facade/callback/handle ownership and will integrate the owned source into the original root worktree for the first actual probe, with a matching-source Cargo cache. No dependency, lock or protocol changes are used to suppress the mismatch. The delegated agent turn ended in a tool content-classification error; its existing runner was independently observed to terminate, rather than restarted while live.

## Primary actual probe and profile distinction

Root integrated the owned package as949e4cf9, using the root worktree and its matching-source cache. Original C ABI new succeeded on the requested512KiB caller (actual macOS stack536576bytes), but unoptimized login.start overflowed during original rustls/webpki server-certificate parsing. A trial heap-box at the C ABI entry did not resolve it and was removed. The original code and strict TLS validation remain unchanged. A failed shell edit also accidentally repeated the unchanged debug run; that failed repeat is retained separately rather than counted as useful repair. All three failure roots were independently checked: five recorded process births each absent and both service/proxy ports closed.

The product Android/iOS build script always compiles this Rust library with --release. The profile-specific gate therefore preserves the same512KiB caller, inputs, encrypted Store, real TLS/WSS, Host and assertions while compiling the mobile binary in that shipping profile; service/headless fixture binaries remain unchanged debug builds. Actual primary release C ABI passed14.15s, one original supplier call, one persisted complete Session, duplicate intent rejected and original read-only receipt restored, and handle/free completion observed. Seven process births were absent and both ports closed. Exact bounded evidence: ffi-primary-evidence.json. This does not claim debug-small-stack safety, OS Keychain/Keystore or a phone pass.

Primary strict Clippy found the test facade's large direct-owner enum variant; it is now boxed in the test only. The serialized C handle still remains exclusively on its caller thread. Final default/assets/release regressions and current-source iOS App build are tracked by the root plan. No source changes to the product C ABI request/runtime or shared cryptographic verifier were retained.

Final primary post-Clippy source reruns passed: default text11.95s, encrypted assets14.16s and release C ABI10.60s. All recorded births were independently absent and both service/proxy ports closed for each run (see JSON). Connection106 tests passed/1 explicit fixture ignored; strict Clippy -D warnings, targeted ESLint/tsc and diff-check passed. The existing Linux full-chain CI step now also executes the release C ABI gate. Actual Mac limits remain as described above; normal CI never executes the known-red --ffi-debug probe.
