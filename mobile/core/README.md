# MoXBots native controller core

This is a portable Rust library (`staticlib`, `cdylib`, `rlib`), not a second Agent
runtime. It imports the existing desktop `channel.rs` and `jwt.rs` by path and
uses the shared crypto/protocol crates. `session.remote` remains the existing
closed v1 protocol. No private keys, raw HTTP, provider settings, filesystem paths
or arbitrary management methods are exposed to JavaScript.

## Native boundary

The native owner serializes all calls on one queue and supplies:

- Platform HTTPS trust, configured issuer/account selection, DPoP account HTTP,
  authenticated WSS/relay and fresh relay-issued connection epochs.
- OS encrypted credential storage. PKCS8 is passed separately to `mox_mobile_new`
  and immediately wrapped in `Zeroizing`; erase the caller's input after use.
- Durable encrypted operation records. Persist the exact `prepare` record before
  `commit`; storage failure must prevent commit. Never auto-commit a recovered
  record, including after `not-found`, `unconfirmed` or a transport timeout.

`include/mox_mobile.h` defines the ABI. Rust callers can use `MobileClient::new`,
`execute(Intent)`, `feed_frame`, and `drain_frame`. Native authenticated relay
controls call `relay_credit(sequence, received_bytes)` and, after successful feed,
`take_received_credit()` to send cumulative byte acknowledgments. The corresponding
C ABI calls are `mox_mobile_credit` and `mox_mobile_received_credit`. Drain pauses
at the original protocol channel/socket queue windows; duplicate, skipped,
non-increasing or excessive grants fail closed. Buffers have explicit status
(0 success, 1 JSON error); free them once using `mox_mobile_buffer_free`. Do not
expose constructor, feed/drain, commit/recover or raw storage APIs to JS. The native
bridge projects only approved UI intents/results and handles journaling itself.

Native-only constructor JSON (camelCase):

```
issuer, local, target, channelId, localEpoch, targetEpoch,
jwks, bootstrap, localSignedPeer, targetSignedPeer, certificate, trustExpiresAt, tlsInitiator
```

`tlsInitiator` must match the validated relay Offer initiator (device ordering),
independent of the management Controller role; both TLS directions are supported.

`local`/`target` are exact protocol `DeviceScope` objects:
`serviceId`, `environment`, `networkId`, `principalId`, `deviceId`, `keyGeneration`.
`jwks` must come from the configured issuer through native verified HTTPS, never
JS or a token-selected URL. `bootstrap` and both signed peers are verified using
the original JOSE verifier. The bootstrap binds account, service, local device,
key generation, DPoP thumbprint, relay origin and CA. `certificate` is the single
local leaf PEM, matched to its signed fingerprint and supplied key. TLS verifies
the remote signed fingerprint/SAN and the encrypted ChannelHello verifies exact
network/account/device/key-generation/connection-epoch scope.

`trustExpiresAt` must be current and at most 300 seconds in the future. The handle
expires at the earliest trust/bootstrap/local-binding/target-binding deadline.
On suspend or a feed validation failure it is permanently invalid. Recovery must
obtain fresh native authorization and a new relay connection epoch, construct a
new handle and restore scoped journal records before issuing effects. Reusing an
old connection epoch with reset pair sequences is forbidden. Native owns this
lifecycle and cannot reconstruct a handle from cached JS state.

## Requests, uncertainty and output

- `{kind:"prepare",request:<RemoteSessionRequest>}` accepts only mutations and
  returns `{state:"journal-required",record:{operationId,digest,request,target,issuer}}`.
  The digest covers issuer, complete target and canonical typed request.
- Native durably persists that record, then calls
  `{kind:"commit",operationId,digest}` once. The returned `submitted` state means
  encrypted bytes were queued, never that a Host operation completed.
- `{kind:"request",request:...}` accepts only capabilities/list/get/receipt.
- `{kind:"recover",records:[...]}` atomically restores at most 128 unknown records
  before use. Cross-target, cross-issuer and duplicate/conflicting records fail.
  ABI JSON is bounded to 64 KiB; native must keep a recoverable bounded journal.
- Query original operation receipts after uncertainty. An unknown operation cannot
  be committed again on this handle; even `not-found` does not grant resend.
- `relay-ready` is supplied by the authenticated relay, after encrypted hello.
  TLS/management readiness and relay readiness are separate original channel gates.
- `feed` accepts complete AgentNet binary TLS frames and returns authenticated,
  correlated `{kind:"response",requestId,data}` or `{kind:"error",requestId,code}`
  events plus status. Unsolicited, wrong-method or wrong-scope responses fail closed.
- `suspend` invalidates authority; `status` returns readiness and unknown UUIDs.

A handle bounds its active journal to 128 operations and in-flight requests to 64.
Authenticated matching Accepted/Rejected receipts release full bodies from the
active journal and retain UUID replay tombstones (up to 4096 per authorization
epoch). Unknown/Processing/NotFound/Unconfirmed records are never evicted. The
native encrypted store must persist confirmed tombstones before pruning full
bodies, and keep unknown full records for recovery; daily confirmed operations do
not consume the 128 unknown-record budget. There is no automatic replay,
expiry-based removal or success synthesis. Native retains its durable records
independently and reconciles them on fresh authorization.
The current core has no account login UI, outer HTTP/WSS event loop, notification
provider, attachment extension or microphone/ASR implementation; these belong to
the mobile native/Host integration owners.

## Verification

Use the root pinned Rust 1.92.0 toolchain:

```
cargo test --manifest-path mobile/core/Cargo.toml --locked
cargo clippy --manifest-path mobile/core/Cargo.toml --locked --all-targets -- -D warnings
cargo build --manifest-path mobile/core/Cargo.toml --locked --release
```

Tests include original channel/JOSE tests, actual TLS controller-to-existing-Host
interoperability, signed native provisioning, account/target/key mismatches,
immutable operation UUID/digest, recovered uncertainty and ABI allowlist limits.
Host tests do not establish iPhone/Android native acceptance. Cross-builds require
Apple's iOS SDK or Android NDK and target-specific linkers; inspect the task record
for actual outcomes instead of inferring them from the crate types or installed
Rust targets.
