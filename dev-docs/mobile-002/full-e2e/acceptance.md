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
