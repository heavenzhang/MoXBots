# Controlled native C ABI caller probe

Task MOXBOTS-MOBILE-002 / mobile-full-e2e-002. This optional fixture uses the original `mox_connection_new`, `mox_connection_request`, `mox_connection_buffer_free` and `mox_connection_free` in one explicitly configured 512 KiB `std::thread` caller. It is an adverse desktop debug-build probe, not a measurement of an iPhone default stack.

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
