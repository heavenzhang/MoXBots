# Original mobile WSS / Host source combination

Task: MOXBOTS-MOBILE-002; bounded package `mobile-full-e2e-002`.
Dependency: parent mobile integration b217a4da8736bd336dbaf0ad368aec5030d2aa46.
This package does not own the parent implementation or any deployment.

## Execute

Use Node24 and Rust toolchain matching the committed locks, with dependencies
already installed. This test binds only dynamically allocated 127.0.0.1 ports.

```sh
node scripts/verify-mobile-full-host-e2e.mjs
```

The runner builds three original crate **test binaries** using `cargo test
--locked --lib --no-run --message-format=json`, then executes the explicit ignored
`runtime::full_host_e2e_test::original_mobile_wss_host_chain` case. The default test
pool never starts these subprocess fixtures. Optional `MOXBOTS_FULL_SERVICE_TARGET`,
`MOXBOTS_FULL_HOST_TARGET`, `MOXBOTS_FULL_MOBILE_TARGET` can reuse approved local
Cargo caches; they do not select different source or artifacts. The runner gets
actual executable paths from Cargo's compiler-artifact messages.

## Actual boundaries

- Service uses original AuthStore, IdentityService, NetworkService,
  RelayController and the production `assemble_feature_routes` composition.
  Its sole auth substitution is explicit synthetic same-account SSO: original
  AuthStore issues random account sessions after single-consumption PKCE and
  device matching. It does not handcraft JWTs/bearers, enroll devices directly,
  publish catalogs, sign peer bindings, or inject Session/receipt/terminal data.
- Test-generated public CA is pinned by both original clients. A TLS proxy
  forwards bytes bidirectionally to the original local Axum router, including
  actual WebSocket upgrade/frames. Inner TLS, DPoP, original certificate
  enrollment, current device binding and peer-binding verification stay enabled.
- Headless fixture calls original Connection discover/start/wait and original
  management authorize, then the existing `bind_source_fixture` and private
  connector run_context. It substitutes only random KEK provisioning and the
  **single Unix UID topology**. Production `run_owned` same-UID rejection remains
  unchanged; real distinct Host/network service users are an open gate.
- Mobile fixture uses original MobileConnection and a temporary encrypted
  SecureStore implementation backed by original EncryptedIdentityStore. No
  JavaScript bridge or phone Keychain/Keystore is claimed.
- Node fixture configures the original local operator/config/credential owners,
  runs original main → worker → installed native SDK, and supplies deterministic
  local model HTTP output. No second Session executor, raw credential snapshot,
  synthetic transcript or success receipt is created.
- Private root is a new `.mxe-<random>` directory under the current HOME, mode
  0700; account/credential/log files are private. The short path is intentional:
  the original Host credential owner rejects world-writable ancestors, and Unix
  socket paths are bounded. No existing HOME/config is used as a fixture state.
  Original status projection is pre-provisioned 0640 per its writer contract,
  inside the private 0700 root. Process PID/PGID/birth are recorded; only owned
  children/verified descendants are cleaned. Private roots remain for diagnosis.

## Evidence at dependency b217

- Three crate `--locked --no-run` compilations passed, with no lock/dependency
  or production protocol changes (mobile 38.65s cold, service 25.35s, Host 16.28s).
- Original `run_owned` rejects same-UID fixture with
  `HOST_MANAGEMENT_IPC_IDENTITY_INVALID`, as required by its production contract.
- After using the existing explicit same-UID test adapter, actual Host relay
  reaches ready. Mobile account login, original identity/enrollment and real WSS
  succeed. The actual `targets.list` returns:

```json
{"hasMore":false,"items":[],"kind":"targets"}
```

- The first business-path assertion fails explicitly with
  `ORIGINAL_HOST_AGENT_NOT_DISCOVERABLE`. Owning source is
  `headless-network/src/connector.rs::empty_catalog`, uploaded by original
  `connect`; mobile `list_targets` only accepts actual enabled agent metadata.
  The fixture must remain red until the production owner legitimately publishes
  the original Host registry. Injecting a catalog or target would invalidate it.
- Local raw evidence: `/tmp/moxbots-full-e2e-catalog-red2.log`; logs and synthetic
  account state remain in the per-run private root printed by the runner. No
  secret/raw fixture state is committed. Earlier environment setup failures
  (long temporary Unix socket path, writable `/tmp` credential ancestor, missing
  no-store, missing pre-provisioned status) were fixed in fixture setup only.

## Open acceptance

Actual first encrypted start/receipt/original terminal, continue/attachment
round-trip and no duplicate execution require a legitimate Host catalog first.
Live original permission/stop/artifact integration is not yet exercised by this
package. iOS/Android installation and daily use, real SSO, OS credential stores,
real two-service-UID isolation, background push, fresh authorization recovery,
real speech and production/signing all remain separate open gates.

### Red-run cleanup and fixture checks

After the empty-directory failure reached its terminal result, birth-recorded
service PID 23286, Node fixture 23290, connector 23328 and original Host 23319
were reread with `ps`; all had exited. The original Host's recorded descendant
set also reread exited. Loopback public port 53377 and original service port
53379 had no `LISTEN` entry when checked with `lsof`. No worker or SDK native
process was created in this red run because no mobile business start occurred.
Node helper syntax, runner syntax, targeted ESLint and `git diff --check` pass.

### Original identity owner / outer-timeout hardening

The helper now boots original main once without management enabled, waits for
its ready state, reads original `/host/status.hostId`, stops that exact Host,
configures the original encrypted credential owner while the Host is stopped,
then boots original main with management and checks the same persisted ID.
There is no direct fixture write to `host-identity.json`. Private keys, device
certificates and peer bindings are always generated/verified by original owners.
The bootstrap creates no Session and is not another executor.

A dedicated `scripts/fixtures/mobile-full-e2e-tsconfig.json` extends root and
includes all `src/**/*` plus this fixture; check with:

```sh
node node_modules/typescript/bin/tsc -p scripts/fixtures/mobile-full-e2e-tsconfig.json --noEmit
```

The business-start assertion now follows original asynchronous semantics:
query the original mobile receipt until accepted, verify original terminal and
supplier text, repeat the same original operation and require one supplier call.
This downstream part remains **unexecuted** until a legitimate target exists.

The outer runner now records the actual child group birth and captures the
private fixture root. On its own deadline it validates root owner/mode/canonical
path, writes the original Node stop signal and gives cleanup a grace period;
then only exact recorded PID/group birth matches can receive TERM/KILL. This
covers a Rust process terminated before `Children::drop` could run.

An explicit negative cleanup check exercises that case:

```sh
MOXBOTS_FULL_TIMEOUT_CHECK=1 node scripts/verify-mobile-full-host-e2e.mjs
```

It intentionally pauses the test after real Headless ready and uses a 10-second
outer deadline (normal remains 150 seconds; inner remains 130 seconds). Expected
result is nonzero/SIGTERM, never a passing business-chain assertion. Local run
printed `explicit-timeout-cleanup-fixture-ready` and the expected SIGTERM. Exact
recorded service 28500, Node 28502, connector 28532, bootstrap Host 28519 and
runtime Host 28522 were reread as exited, as were their recorded descendants;
public 58313 and service 58314 had no LISTEN. Normal owner-created-identity red
was also reproduced separately, with exact processes 28260/28262/28291 and
bootstrap/runtime Hosts 28287/28289 exited and ports 58077/58078 closed. No SDK
native process had started because the target-directory gate was still red.
Raw private diagnostics: `/tmp/moxbots-full-e2e-owner-identity-red4.log` and
`/tmp/moxbots-full-e2e-outer-timeout.log`.
The final dedicated full-source TypeScript check exited 0 with no diagnostics;
ESLint and runner syntax also exited 0 after the identity/timeout changes.

### Rust formatting and lint gates

All three new Rust fixture files pass direct `rustfmt --check` for their crate
editions. `cargo clippy --locked --tests -- -D warnings` passes for mobile
connection (16.98s) and AgentNet service (9.82s). The same strict whole-headless
command still fails only the two documented parent baseline
`clippy::too_many_arguments` findings in original
`owned_login::raw_request_with_limits` and `connector::handle_management_events`.
No production lint suppression was added. The actual existing headless CI gate
`cargo clippy --locked --all-targets -- -D clippy::disallowed_methods
-D clippy::disallowed_macros` passes (4.78s), retaining those two baseline warnings.

### After accepted catalog dependency `6e26946b`

A normal dependency merge includes root's accepted original Host catalog wiring;
none of that dependency implementation belongs to this package. Actual native
Devices/Agents reads now find the original Host Agent with remote mount
`enabled=false`, `enableRevision=0`, `membershipRevision=1`. The unmodified native
`targets.list` still returns empty. The separate default-disabled red is retained
at `/tmp/moxbots-full-e2e-actual-disabled-mount.log` and can be requested with
`MOXBOTS_FULL_KEEP_MOUNT_DISABLED=1 node scripts/verify-mobile-full-host-e2e.mjs`.
It is an intentional nonzero negative case, not a passing business assertion.

The test now explicitly models the authorized synthetic human account granting
remote exposure through the existing admitted native transport. It strictly
matches actual network/principal/device/localAgent, reads both original
revisions, calls the original PATCH Mount endpoint with a new mutationId, and
repeats the same mutation to verify its original idempotent receipt. Original
account.ensure_current guards run before/after. It never writes metadata DBs,
injects targets/catalogs, or changes production defaults. Only afterward does
unmodified `targets.list` discover the original online Agent. The application's
closed JS intent surface still has no mount-setting action: real user onboarding
and explicit exposure authorization remain a product gate, not a test pass.

The first actual `mobile.start` then fails during inner channel opening with
`MOBILE_CHANNEL_CHANGED`. Approved temporary cfg(test) logs (removed afterward,
not committed) pinpointed original `ChannelClosed` at mobile PeerConnection open,
then original headless `pairs.feed_management` error `NETWORK_TLS_FAILED`.
The original relay normalizes peer Close to its own fixed reason; no binding JWT,
key, raw control frame or whole Debug value was logged. Source inspection shows
core builds TlsIdentity from a required single leaf while original identity
owner builds leaf + issuing CA + pinned root. Root owns repair and verification;
this package does not relax TLS, peer binding or scope checks.

Raw local logs: `/tmp/moxbots-full-e2e-first-business.log` and
`/tmp/moxbots-full-e2e-headless-close-diagnostic.log`. Default-disabled run exact
processes 36760/36763/36825 plus original Hosts 36780/36810 exited, ports
63635/63636 closed. First business run 37296/37298/37317 plus Hosts 37313/37315
exited, ports 64060/64065 closed. Diagnostic runs' recorded births also reread
exited (39028/39030/39050/39036/39044, 39717/39719/39747/39743/39745,
40188/40199/40213/40207/40209), all six original public/service ports had no
LISTEN. No Session worker/SDK child had started because inner TLS had failed.

## Primary certificate-chain integration — 2026-10-18

The actual first business attempt failed in original Host `pairs.feed_management`
with `NETWORK_TLS_FAILED`: the original identity owner had already validated and
retained leaf + issuing CA + root, but the mobile core constructor received only
the leaf. The old provisioning fixture signed leaves directly with the root and
did not reproduce the service's issuing hierarchy.

MobileConnection now passes the original verified three DER certificates to the
native-only core constructor. Core requires exactly three bounded certificates,
exact signed leaf and pinned bootstrap root, and retains the existing private-key,
fingerprint, SAN, TLS1.3 and encrypted ChannelHello checks. Only the bootstrap root
is trusted; the intermediate is presented as part of the chain. Frozen shared
crypto/protocol/reader inputs are unchanged. The provisioning fixture now uses a
real issuing CA and checks missing, extra, changed leaf/root, duplicate, empty and
oversized chain failures. Primary core42 tests and strict Clippy passed; bounded
independent source review found no trust-boundary defect.

Primary full-chain readback under a private umask first exposed a fixture-only
status provisioning error: mode0640 was masked to0600. The fixture now applies
its original exact0640 contract explicitly inside the private0700 root. No
production status check changed. That failed run cleaned its recorded children.
The next actual full-chain run passed target discovery and channel opening but
failed later with `MOBILE_CHANNEL_CLOSED` while waiting for a business response;
this is **not full-chain acceptance**, and its next source error remains to be
located. Evidence `/tmp/moxbots-mobile-full-e2e-primary-chain-green-attempt.log`;
core evidence `/tmp/moxbots-mobile-full-chain-core-{regression,clippy}.log`.

These production Rust changes invalidate the earlier Android/iOS native input
digest for current-source acceptance. Previously saved binaries remain labelled
historical build checkpoints; fresh cross-platform native builds are required.

### Post-chain actual request boundary

After normal dependency merge `0935cf8a`, the actual chain reaches inner mTLS and
management readiness. First business response still fails
`MOBILE_CHANNEL_CLOSED`. Approved temporary cfg(test) static-code diagnostics
pinpoint original management-local-operation `HOST_MANAGEMENT_UNCONFIRMED`, not
TLS feed/drain failure. Root identified original internal IPC request/response
`request_id` snake_case against Node's required `requestId`, followed by a second
raw RemoteMobileResult / ResponseResult projection mismatch. Root owns both
production repairs; no guard, protocol or Node contract was relaxed here.
Evidence: `/tmp/moxbots-full-e2e-post-tls-diagnostic.log`. Diagnostic hunks were
removed. Exact process births 44328/44333/44392/44377/44383 reread exited and
public54862/service54865 had no LISTEN. No Session worker/SDK had started.


## Primary full-chain acceptance — 2026-10-18

The next actual boundary was two mismatched internal contracts. Rust internal
request/response structs used `request_id`, while original Node strictly requires
`requestId` and closed the socket. They now use the original camelCase contract.
The successful raw Node `RemoteMobileResult` also needs strict parsing and the
original `ResponseResult::RemoteMobile` wrapper; it was incorrectly parsed as an
already wrapped result. Both corrections preserve closed fields, request ID,
authority, Unix peer credentials and current account checks. A real private Unix
socket regression verifies the Node-shaped exchange and rejects snake_case.
Independent bounded source review accepted both changes.

Primary explicitly ran the complete original chain successfully in11.02s:
actual AuthStore/identity/enrollment, pinned public TLS/WSS, original peer mTLS
and management Ready, original strict Host registry, default-disabled mount,
explicit synthetic-user original revision API authorization, original mobile
start and accepted receipt, original Node/worker/native SDK, original complete
Session snapshot and persisted SessionStore. The controlled supplier executed
exactly once. Native correctly rejects a repeated business intent with
`MOBILE_RECEIPT_REQUIRED`; the fixture now checks that guard and queries the
original receipt instead of expecting the SDK to replay a known operation. This
is a correction to the fixture contract, with no relaxation of product journal
behavior. Host-side duplicate recovery was tested separately by the original
Host admission regression.

Primary reread the actual fixture result: one supplier call, one persisted
Session matching the accepted receipt. Nine recorded service/Host/worker/SDK
PIDs had exited; public/service ports57398/57402 had no listener. The bounded
redacted summary is `primary-evidence.json`; raw successful log remains private
at `/tmp/moxbots-mobile-full-e2e-primary-accepted.log` and its per-run0700 root.
Core42, connection105 (one explicit case ignored in the default pool), ten real
IPC tests and normal headless regressions passed. Core/connection strict Clippy
and existing headless redlines passed (the same two baseline warnings remain).
The explicit full-chain case now also runs in the existing Linux headless CI
job; the next pushed revision still needs its actual Linux result.

This closes controlled initial text execution through the complete native Rust
network path. It does not close dynamic catalog refresh, application onboarding
for mount authorization, deployed real SSO/provider, native picker/upload/preview,
WSS approval/stop/attachments, phone OS credentials, real two-service-user Host
isolation, APNs/FCM, physical speech, signing or main delivery. Test-only same-UID
and synthetic-login substitutions remain explicitly documented above.
